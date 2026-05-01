use crate::{
    auth::{require_auth, AuthContext},
    error::ApiError,
    issue_history::{record_issue_event, string_change, IssueChange},
    mcp::{decrypt_secret, encrypt_secret},
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Redirect,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, FixedOffset, Utc};
use produktive_entity::{
    github_connection, github_imported_issue, github_oauth_state, github_repository, issue, label,
    member, user,
};
use reqwest::header::{HeaderMap as ReqwestHeaderMap, HeaderValue, ACCEPT, AUTHORIZATION};
use sea_orm::{
    sea_query::{Expr, SimpleExpr},
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, QueryFilter,
    QueryOrder, Set, TryIntoModel,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const GITHUB_API_BASE: &str = "https://api.github.com";
const GITHUB_AUTH_URL: &str = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_API_VERSION: &str = "2026-03-10";
const GITHUB_SCOPE: &str = "repo";
const MIN_IMPORT_INTERVAL_MINUTES: i32 = 15;
const DEFAULT_IMPORT_INTERVAL_MINUTES: i32 = 360;
const AUTO_IMPORT_TICK_SECONDS: u64 = 60;
const IMPORT_LOCK_TTL_MINUTES: i64 = 30;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/connection", get(get_connection).delete(delete_connection))
        .route("/oauth/start", post(start_oauth))
        .route("/oauth/callback", get(oauth_callback))
        .route(
            "/repositories",
            get(list_repositories).post(create_repository),
        )
        .route(
            "/repositories/{id}",
            axum::routing::patch(update_repository).delete(delete_repository),
        )
        .route(
            "/repositories/{id}/preview",
            post(preview_repository_import),
        )
        .route("/repositories/{id}/import", post(run_repository_import))
        .route("/repository-search", get(search_repositories))
        .route("/import/preview", post(preview_import))
        .route("/import", post(run_import))
}

pub fn spawn_auto_importer(state: AppState) {
    tokio::spawn(async move {
        let mut ticker =
            tokio::time::interval(std::time::Duration::from_secs(AUTO_IMPORT_TICK_SECONDS));
        loop {
            ticker.tick().await;
            if let Err(error) = run_due_auto_imports(&state).await {
                tracing::warn!(%error, "github auto import tick failed");
            }
        }
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionResponse {
    connected: bool,
    login: Option<String>,
    scope: Option<String>,
    connected_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthStartResponse {
    url: String,
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
    state: String,
    code: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportRequest {
    owner: String,
    repo: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryRequest {
    owner: String,
    repo: String,
    auto_import_enabled: Option<bool>,
    import_interval_minutes: Option<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryPatchRequest {
    owner: Option<String>,
    repo: Option<String>,
    auto_import_enabled: Option<bool>,
    import_interval_minutes: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryListResponse {
    repositories: Vec<RepositoryResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryEnvelope {
    repository: RepositoryResponse,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryResponse {
    id: String,
    owner: String,
    repo: String,
    auto_import_enabled: bool,
    import_interval_minutes: i32,
    last_imported_at: Option<String>,
    next_import_at: Option<String>,
    last_import_status: Option<String>,
    last_import_error: Option<String>,
    last_imported_count: i32,
    last_updated_count: i32,
    last_skipped_count: i32,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportPreviewResponse {
    owner: String,
    repo: String,
    total: usize,
    new_issues: usize,
    update_issues: usize,
    skipped_pull_requests: usize,
    labels: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResponse {
    owner: String,
    repo: String,
    imported: usize,
    updated: usize,
    skipped_pull_requests: usize,
    labels: usize,
}

#[derive(Deserialize)]
struct GithubTokenResponse {
    access_token: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct GithubUserResponse {
    id: i64,
    login: String,
}

#[derive(Clone, Deserialize)]
struct GithubIssue {
    id: i64,
    number: i32,
    title: String,
    body: Option<String>,
    state: String,
    html_url: String,
    user: Option<GithubUser>,
    assignees: Vec<GithubUser>,
    labels: Vec<GithubLabel>,
    pull_request: Option<Value>,
}

#[derive(Clone, Deserialize)]
struct GithubUser {
    login: String,
}

#[derive(Clone, Deserialize)]
struct GithubLabel {
    name: String,
    color: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchRepositoriesQuery {
    q: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryOption {
    owner: String,
    repo: String,
    private: bool,
    archived: bool,
    fork: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchRepositoriesResponse {
    repositories: Vec<RepositoryOption>,
}

#[derive(Deserialize)]
struct GithubRepoOwner {
    login: String,
}

#[derive(Deserialize)]
struct GithubRepoSummary {
    name: String,
    owner: GithubRepoOwner,
    #[serde(default)]
    private: bool,
    #[serde(default)]
    archived: bool,
    #[serde(default)]
    fork: bool,
}

#[derive(Deserialize)]
struct GithubSearchEnvelope {
    items: Vec<GithubRepoSummary>,
}

async fn get_connection(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ConnectionResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let connection = find_connection(&state, &auth.organization.id).await?;
    Ok(Json(connection_response(connection)))
}

async fn delete_connection(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    github_connection::Entity::delete_many()
        .filter(github_connection::Column::OrganizationId.eq(&auth.organization.id))
        .exec(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn start_oauth(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<OAuthStartResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let client_id = github_client_id()?;
    let state_value = Uuid::new_v4().to_string();
    let code_verifier = pkce_code_verifier();
    let redirect_uri = github_redirect_uri(&state);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()));
    let mut url = reqwest::Url::parse(GITHUB_AUTH_URL)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    url.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", GITHUB_SCOPE)
        .append_pair("state", &state_value)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");

    github_oauth_state::Entity::delete_many()
        .filter(github_oauth_state::Column::OrganizationId.eq(&auth.organization.id))
        .filter(github_oauth_state::Column::CreatedById.eq(&auth.user.id))
        .exec(&state.db)
        .await?;

    let now = now();
    github_oauth_state::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id),
        created_by_id: Set(auth.user.id),
        state: Set(state_value),
        code_verifier: Set(code_verifier),
        expires_at: Set(now + Duration::minutes(10)),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok(Json(OAuthStartResponse {
        url: url.to_string(),
    }))
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<Redirect, ApiError> {
    let redirect_base = "/workspace/settings?section=github";
    if let Some(error) = query.error {
        return Ok(Redirect::to(&format!(
            "{redirect_base}&github=oauth_error&message={error}"
        )));
    }
    let code = query
        .code
        .ok_or_else(|| ApiError::BadRequest("GitHub did not return an OAuth code".to_owned()))?;
    let oauth_state = github_oauth_state::Entity::find()
        .filter(github_oauth_state::Column::State.eq(&query.state))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("GitHub OAuth state expired".to_owned()))?;
    if oauth_state.expires_at < now() {
        let _ = oauth_state.delete(&state.db).await;
        return Err(ApiError::BadRequest(
            "GitHub OAuth state expired".to_owned(),
        ));
    }

    let token = exchange_oauth_code(&state, &oauth_state, &code).await?;
    let user = github_user(&token.access_token).await?;
    store_connection(&state, &oauth_state, &token, &user).await?;
    let _ = oauth_state.delete(&state.db).await;

    Ok(Redirect::to(&format!(
        "{redirect_base}&github=oauth_connected"
    )))
}

async fn list_repositories(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<RepositoryListResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let rows = github_repository::Entity::find()
        .filter(github_repository::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_asc(github_repository::Column::Owner)
        .order_by_asc(github_repository::Column::Repo)
        .all(&state.db)
        .await?;
    Ok(Json(RepositoryListResponse {
        repositories: rows.into_iter().map(repository_response).collect(),
    }))
}

async fn create_repository(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RepositoryRequest>,
) -> Result<(StatusCode, Json<RepositoryEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let (owner, repo) = normalize_owner_repo(&payload.owner, &payload.repo)?;
    ensure_unique_repository(&state, &auth.organization.id, &owner, &repo, None).await?;
    let interval = normalize_interval(payload.import_interval_minutes)?;
    let auto_import_enabled = payload.auto_import_enabled.unwrap_or(false);
    let now = now();
    let row = github_repository::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id),
        owner: Set(owner),
        repo: Set(repo),
        auto_import_enabled: Set(auto_import_enabled),
        import_interval_minutes: Set(interval),
        last_imported_at: Set(None),
        next_import_at: Set(if auto_import_enabled { Some(now) } else { None }),
        last_import_status: Set(None),
        last_import_error: Set(None),
        last_imported_count: Set(0),
        last_updated_count: Set(0),
        last_skipped_count: Set(0),
        import_lock_token: Set(None),
        import_locked_until: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(RepositoryEnvelope {
            repository: repository_response(row),
        }),
    ))
}

async fn update_repository(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<RepositoryPatchRequest>,
) -> Result<Json<RepositoryEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let row = find_repository(&state, &auth.organization.id, &id).await?;
    let mut active = row.clone().into_active_model();
    let next_owner = payload.owner.as_deref().unwrap_or(&row.owner);
    let next_repo = payload.repo.as_deref().unwrap_or(&row.repo);
    let (owner, repo) = normalize_owner_repo(next_owner, next_repo)?;
    if owner != row.owner || repo != row.repo {
        ensure_unique_repository(&state, &auth.organization.id, &owner, &repo, Some(&id)).await?;
        active.owner = Set(owner);
        active.repo = Set(repo);
        active.last_import_status = Set(None);
        active.last_import_error = Set(None);
        active.last_imported_at = Set(None);
    }
    if let Some(interval) = payload.import_interval_minutes {
        active.import_interval_minutes = Set(normalize_interval(Some(interval))?);
    }
    if let Some(enabled) = payload.auto_import_enabled {
        active.auto_import_enabled = Set(enabled);
        active.next_import_at = Set(if enabled { Some(now()) } else { None });
    }
    active.updated_at = Set(now());
    let updated = active.update(&state.db).await?;
    Ok(Json(RepositoryEnvelope {
        repository: repository_response(updated),
    }))
}

async fn delete_repository(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let row = find_repository(&state, &auth.organization.id, &id).await?;
    row.delete(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn preview_repository_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<ImportPreviewResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let row = find_repository(&state, &auth.organization.id, &id).await?;
    preview_import_for_source(&state, &auth.organization.id, &row.owner, &row.repo).await
}

async fn run_repository_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<ImportResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let row = find_repository(&state, &auth.organization.id, &id).await?;
    let claimed = claim_repository_import(&state, &row, ImportClaimMode::Manual)
        .await?
        .ok_or_else(|| {
            ApiError::Conflict("This GitHub repository is already importing".to_owned())
        })?;
    let result = import_source(&state, &auth, &claimed.repo.owner, &claimed.repo.repo).await;
    match result {
        Ok(result) => {
            complete_repository_import(&state, claimed, Ok(&result)).await?;
            Ok(Json(result))
        }
        Err(error) => {
            let message = error.to_string();
            complete_repository_import(&state, claimed, Err(message)).await?;
            Err(error)
        }
    }
}

async fn search_repositories(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<SearchRepositoriesQuery>,
) -> Result<Json<SearchRepositoriesResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let connection = find_connection(&state, &auth.organization.id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Connect GitHub before searching".to_owned()))?;
    let token = decrypt_secret(
        &state.config.mcp_token_key(),
        &connection.access_token_ciphertext,
    )
    .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    let trimmed = params.q.as_deref().map(str::trim).unwrap_or("");

    let summaries: Vec<GithubRepoSummary> = if trimmed.is_empty() {
        github_request(&token, "/user/repos")
            .query(&[("sort", "updated"), ("per_page", "100")])
            .send()
            .await
            .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?
            .error_for_status()
            .map_err(github_reqwest_error)?
            .json::<Vec<GithubRepoSummary>>()
            .await
            .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?
    } else {
        let q = format!("{trimmed} user:{} fork:true", connection.github_login);
        github_request(&token, "/search/repositories")
            .query(&[("q", q.as_str()), ("per_page", "30")])
            .send()
            .await
            .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?
            .error_for_status()
            .map_err(github_reqwest_error)?
            .json::<GithubSearchEnvelope>()
            .await
            .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?
            .items
    };

    let repositories = summaries
        .into_iter()
        .map(|summary| RepositoryOption {
            owner: summary.owner.login,
            repo: summary.name,
            private: summary.private,
            archived: summary.archived,
            fork: summary.fork,
        })
        .collect();

    Ok(Json(SearchRepositoriesResponse { repositories }))
}

async fn preview_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ImportRequest>,
) -> Result<Json<ImportPreviewResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let (owner, repo) = normalize_repo(payload)?;
    preview_import_for_source(&state, &auth.organization.id, &owner, &repo).await
}

async fn run_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ImportRequest>,
) -> Result<Json<ImportResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth).await?;
    let (owner, repo) = normalize_repo(payload)?;
    Ok(Json(import_source(&state, &auth, &owner, &repo).await?))
}

async fn preview_import_for_source(
    state: &AppState,
    organization_id: &str,
    owner: &str,
    repo: &str,
) -> Result<Json<ImportPreviewResponse>, ApiError> {
    let token = load_access_token(state, organization_id).await?;
    let (issues, skipped_pull_requests) = fetch_repo_issues(&token, owner, repo).await?;
    let mappings = github_imported_issue::Entity::find()
        .filter(github_imported_issue::Column::OrganizationId.eq(organization_id))
        .filter(github_imported_issue::Column::Owner.eq(owner))
        .filter(github_imported_issue::Column::Repo.eq(repo))
        .all(&state.db)
        .await?;
    let existing_numbers: std::collections::HashSet<i32> = mappings
        .into_iter()
        .map(|mapping| mapping.github_issue_number)
        .collect();
    let update_issues = issues
        .iter()
        .filter(|issue| existing_numbers.contains(&issue.number))
        .count();
    Ok(Json(ImportPreviewResponse {
        owner: owner.to_owned(),
        repo: repo.to_owned(),
        total: issues.len(),
        new_issues: issues.len().saturating_sub(update_issues),
        update_issues,
        skipped_pull_requests,
        labels: unique_label_names(&issues).len(),
    }))
}

async fn import_source(
    state: &AppState,
    auth: &AuthContext,
    owner: &str,
    repo: &str,
) -> Result<ImportResponse, ApiError> {
    let token = load_access_token(state, &auth.organization.id).await?;
    let (issues, skipped_pull_requests) = fetch_repo_issues(&token, owner, repo).await?;
    let mut imported = 0;
    let mut updated = 0;
    let mut label_names = std::collections::HashSet::new();

    for github_issue in issues {
        let label_ids = labels_for_github_issue(state, auth, &github_issue).await?;
        label_names.extend(
            github_issue
                .labels
                .iter()
                .map(|label| label.name.trim().to_lowercase())
                .filter(|name| !name.is_empty()),
        );
        match import_one_issue(state, auth, owner, repo, &github_issue, &label_ids).await? {
            ImportOutcome::Created => imported += 1,
            ImportOutcome::Updated => updated += 1,
        }
    }

    Ok(ImportResponse {
        owner: owner.to_owned(),
        repo: repo.to_owned(),
        imported,
        updated,
        skipped_pull_requests,
        labels: label_names.len(),
    })
}

async fn run_due_auto_imports(state: &AppState) -> Result<(), ApiError> {
    let due = github_repository::Entity::find()
        .filter(github_repository::Column::AutoImportEnabled.eq(true))
        .filter(github_repository::Column::NextImportAt.lte(now()))
        .filter(import_lock_available_filter(now()))
        .order_by_asc(github_repository::Column::NextImportAt)
        .all(&state.db)
        .await?;
    for repo in due {
        let Some(claimed) = claim_repository_import(state, &repo, ImportClaimMode::AutoDue).await?
        else {
            tracing::info!(
                repository_id = %repo.id,
                organization_id = %repo.organization_id,
                owner = %repo.owner,
                repo = %repo.repo,
                "github auto import skipped because another worker claimed it"
            );
            continue;
        };
        let auth = match auto_import_auth(state, &repo.organization_id).await {
            Ok(auth) => auth,
            Err(error) => {
                complete_repository_import(state, claimed, Err(error.to_string())).await?;
                continue;
            }
        };
        let result = import_source(state, &auth, &claimed.repo.owner, &claimed.repo.repo).await;
        match result {
            Ok(result) => complete_repository_import(state, claimed, Ok(&result)).await?,
            Err(error) => {
                complete_repository_import(state, claimed, Err(error.to_string())).await?
            }
        }
    }
    Ok(())
}

async fn auto_import_auth(
    state: &AppState,
    organization_id: &str,
) -> Result<AuthContext, ApiError> {
    let connection = github_connection::Entity::find()
        .filter(github_connection::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Connect GitHub before importing".to_owned()))?;
    let user_id = connection
        .connected_by_id
        .ok_or_else(|| ApiError::BadRequest("GitHub connection has no owner".to_owned()))?;
    let user = user::Entity::find_by_id(&user_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    let organization = produktive_entity::organization::Entity::find_by_id(organization_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    let session = produktive_entity::session::ActiveModel {
        id: Set("github-auto-import".to_owned()),
        user_id: Set(user.id.clone()),
        active_organization_id: Set(organization.id.clone()),
        expires_at: Set(now() + Duration::minutes(5)),
        revoked_at: Set(None),
        created_at: Set(now()),
        updated_at: Set(now()),
    };
    Ok(AuthContext {
        user,
        session: session.try_into_model().map_err(|error| {
            ApiError::Internal(anyhow::anyhow!(
                "failed to create auto import context: {error}"
            ))
        })?,
        organization,
    })
}

#[derive(Clone, Copy)]
enum ImportClaimMode {
    Manual,
    AutoDue,
}

struct ClaimedRepositoryImport {
    repo: github_repository::Model,
    lock_token: String,
}

async fn claim_repository_import(
    state: &AppState,
    repo: &github_repository::Model,
    mode: ImportClaimMode,
) -> Result<Option<ClaimedRepositoryImport>, ApiError> {
    let now = now();
    let lock_token = Uuid::new_v4().to_string();
    let lock_until = now + Duration::minutes(IMPORT_LOCK_TTL_MINUTES);
    let mut update = github_repository::Entity::update_many()
        .col_expr(
            github_repository::Column::ImportLockToken,
            Expr::value(lock_token.clone()),
        )
        .col_expr(
            github_repository::Column::ImportLockedUntil,
            Expr::value(lock_until),
        )
        .col_expr(github_repository::Column::UpdatedAt, Expr::value(now))
        .filter(github_repository::Column::Id.eq(&repo.id))
        .filter(import_lock_available_filter(now));

    if matches!(mode, ImportClaimMode::AutoDue) {
        update = update
            .filter(github_repository::Column::AutoImportEnabled.eq(true))
            .filter(github_repository::Column::NextImportAt.lte(now));
    }

    let result = update.exec(&state.db).await?;
    if result.rows_affected == 0 {
        return Ok(None);
    }

    let repo = github_repository::Entity::find_by_id(&repo.id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub repository not found".to_owned()))?;

    tracing::info!(
        repository_id = %repo.id,
        organization_id = %repo.organization_id,
        owner = %repo.owner,
        repo = %repo.repo,
        lock_token = %lock_token,
        locked_until = %lock_until,
        "claimed github import"
    );

    Ok(Some(ClaimedRepositoryImport { repo, lock_token }))
}

async fn complete_repository_import(
    state: &AppState,
    claimed: ClaimedRepositoryImport,
    result: Result<&ImportResponse, String>,
) -> Result<(), ApiError> {
    let now = now();
    let repo = claimed.repo;
    let next_import_at = if repo.auto_import_enabled {
        Some(now + Duration::minutes(repo.import_interval_minutes.into()))
    } else {
        None
    };
    let mut update = github_repository::Entity::update_many()
        .col_expr(github_repository::Column::LastImportedAt, Expr::value(now))
        .col_expr(github_repository::Column::UpdatedAt, Expr::value(now))
        .col_expr(
            github_repository::Column::NextImportAt,
            Expr::value(next_import_at),
        )
        .col_expr(
            github_repository::Column::ImportLockToken,
            Expr::value(Option::<String>::None),
        )
        .col_expr(
            github_repository::Column::ImportLockedUntil,
            Expr::value(Option::<DateTime<FixedOffset>>::None),
        )
        .filter(github_repository::Column::Id.eq(&repo.id))
        .filter(github_repository::Column::ImportLockToken.eq(&claimed.lock_token));

    let status = if result.is_ok() { "success" } else { "error" };
    match result {
        Ok(result) => {
            update = update
                .col_expr(
                    github_repository::Column::LastImportStatus,
                    Expr::value("success"),
                )
                .col_expr(
                    github_repository::Column::LastImportError,
                    Expr::value(Option::<String>::None),
                )
                .col_expr(
                    github_repository::Column::LastImportedCount,
                    Expr::value(result.imported as i32),
                )
                .col_expr(
                    github_repository::Column::LastUpdatedCount,
                    Expr::value(result.updated as i32),
                )
                .col_expr(
                    github_repository::Column::LastSkippedCount,
                    Expr::value(result.skipped_pull_requests as i32),
                );
        }
        Err(error) => {
            update = update
                .col_expr(
                    github_repository::Column::LastImportStatus,
                    Expr::value("error"),
                )
                .col_expr(
                    github_repository::Column::LastImportError,
                    Expr::value(Some(error.chars().take(500).collect::<String>())),
                );
        }
    }

    let update_result = update.exec(&state.db).await?;
    if update_result.rows_affected == 0 {
        tracing::warn!(
            repository_id = %repo.id,
            organization_id = %repo.organization_id,
            owner = %repo.owner,
            repo = %repo.repo,
            lock_token = %claimed.lock_token,
            status,
            "github import completion did not match active lock"
        );
    } else {
        tracing::info!(
            repository_id = %repo.id,
            organization_id = %repo.organization_id,
            owner = %repo.owner,
            repo = %repo.repo,
            lock_token = %claimed.lock_token,
            status,
            "released github import lock"
        );
    }
    Ok(())
}

fn import_lock_available_filter(now: DateTime<FixedOffset>) -> SimpleExpr {
    github_repository::Column::ImportLockToken
        .is_null()
        .or(github_repository::Column::ImportLockedUntil.is_null())
        .or(github_repository::Column::ImportLockedUntil.lte(now))
}

#[cfg(test)]
fn import_lock_is_claimable(
    token: Option<&str>,
    locked_until: Option<DateTime<FixedOffset>>,
    now: DateTime<FixedOffset>,
) -> bool {
    token.is_none() || locked_until.map_or(true, |value| value <= now)
}

enum ImportOutcome {
    Created,
    Updated,
}

async fn import_one_issue(
    state: &AppState,
    auth: &AuthContext,
    owner: &str,
    repo: &str,
    github_issue: &GithubIssue,
    label_ids: &[String],
) -> Result<ImportOutcome, ApiError> {
    let existing_mapping = github_imported_issue::Entity::find()
        .filter(github_imported_issue::Column::OrganizationId.eq(&auth.organization.id))
        .filter(github_imported_issue::Column::Owner.eq(owner))
        .filter(github_imported_issue::Column::Repo.eq(repo))
        .filter(github_imported_issue::Column::GithubIssueNumber.eq(github_issue.number))
        .one(&state.db)
        .await?;
    let description = github_description(owner, repo, github_issue);
    let status = if github_issue.state == "closed" {
        "done"
    } else {
        "backlog"
    };

    if let Some(mapping) = existing_mapping {
        let existing_issue = issue::Entity::find_by_id(&mapping.issue_id)
            .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
            .one(&state.db)
            .await?;
        if let Some(existing_issue) = existing_issue {
            let issue_id = mapping.issue_id.clone();
            update_imported_issue(
                state,
                auth,
                existing_issue,
                github_issue,
                &description,
                status,
                label_ids,
            )
            .await?;
            touch_mapping(state, mapping, github_issue, &issue_id).await?;
            return Ok(ImportOutcome::Updated);
        }
    }

    let now = now();
    let issue = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        title: Set(github_issue.title.trim().to_owned()),
        description: Set(Some(description)),
        status: Set(status.to_owned()),
        priority: Set("medium".to_owned()),
        created_by_id: Set(Some(auth.user.id.clone())),
        assigned_to_id: Set(None),
        parent_id: Set(None),
        project_id: Set(None),
        attachments: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    crate::http::labels::replace_issue_labels(state, &issue.id, label_ids).await?;
    record_issue_event(
        state,
        &auth.organization.id,
        &issue.id,
        Some(&auth.user.id),
        "created",
        vec![
            IssueChange {
                field: "title".to_owned(),
                before: Value::Null,
                after: json!(issue.title),
            },
            IssueChange {
                field: "source".to_owned(),
                before: Value::Null,
                after: json!("github"),
            },
        ],
    )
    .await?;
    upsert_mapping(state, auth, owner, repo, github_issue, &issue.id).await?;
    Ok(ImportOutcome::Created)
}

async fn update_imported_issue(
    state: &AppState,
    auth: &AuthContext,
    existing: issue::Model,
    github_issue: &GithubIssue,
    description: &str,
    status: &str,
    label_ids: &[String],
) -> Result<(), ApiError> {
    let before = existing.clone();
    let mut changes = Vec::new();
    let mut active = existing.into_active_model();
    let title = github_issue.title.trim().to_owned();
    if let Some(change) = string_change("title", Some(&before.title), Some(&title)) {
        changes.push(change);
    }
    if let Some(change) = string_change(
        "description",
        before.description.as_deref(),
        Some(description),
    ) {
        changes.push(change);
    }
    if let Some(change) = string_change("status", Some(&before.status), Some(status)) {
        changes.push(change);
    }
    active.title = Set(title);
    active.description = Set(Some(description.to_owned()));
    active.status = Set(status.to_owned());
    active.updated_at = Set(now());
    let issue = active.update(&state.db).await?;
    crate::http::labels::replace_issue_labels(state, &issue.id, label_ids).await?;
    if !changes.is_empty() {
        record_issue_event(
            state,
            &auth.organization.id,
            &issue.id,
            Some(&auth.user.id),
            "updated",
            changes,
        )
        .await?;
    }
    Ok(())
}

async fn labels_for_github_issue(
    state: &AppState,
    auth: &AuthContext,
    github_issue: &GithubIssue,
) -> Result<Vec<String>, ApiError> {
    let mut ids = Vec::new();
    for github_label in &github_issue.labels {
        let name = github_label.name.trim();
        if name.is_empty() {
            continue;
        }
        let label = find_or_create_label(
            state,
            auth,
            name,
            github_label
                .color
                .as_deref()
                .map(github_color_to_label_color)
                .unwrap_or_else(|| "gray".to_owned()),
        )
        .await?;
        ids.push(label.id);
    }
    ids.sort();
    ids.dedup();
    Ok(ids)
}

async fn find_or_create_label(
    state: &AppState,
    auth: &AuthContext,
    name: &str,
    color: String,
) -> Result<label::Model, ApiError> {
    let name = normalize_label_name(name);
    let lowered = name.to_lowercase();
    let rows = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(&auth.organization.id))
        .filter(label::Column::ArchivedAt.is_null())
        .all(&state.db)
        .await?;
    if let Some(existing) = rows
        .into_iter()
        .find(|row| row.name.to_lowercase() == lowered)
    {
        return Ok(existing);
    }
    let now = now();
    Ok(label::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        name: Set(name),
        description: Set(Some("Imported from GitHub".to_owned())),
        color: Set(color),
        created_by_id: Set(Some(auth.user.id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?)
}

fn normalize_label_name(name: &str) -> String {
    let truncated: String = name.trim().chars().take(48).collect();
    if truncated.is_empty() {
        "github".to_owned()
    } else {
        truncated
    }
}

async fn upsert_mapping(
    state: &AppState,
    auth: &AuthContext,
    owner: &str,
    repo: &str,
    github_issue: &GithubIssue,
    issue_id: &str,
) -> Result<(), ApiError> {
    if let Some(existing) = github_imported_issue::Entity::find()
        .filter(github_imported_issue::Column::OrganizationId.eq(&auth.organization.id))
        .filter(github_imported_issue::Column::Owner.eq(owner))
        .filter(github_imported_issue::Column::Repo.eq(repo))
        .filter(github_imported_issue::Column::GithubIssueNumber.eq(github_issue.number))
        .one(&state.db)
        .await?
    {
        touch_mapping(state, existing, github_issue, issue_id).await?;
        return Ok(());
    }
    let now = now();
    github_imported_issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        issue_id: Set(issue_id.to_owned()),
        owner: Set(owner.to_owned()),
        repo: Set(repo.to_owned()),
        github_issue_id: Set(github_issue.id),
        github_issue_number: Set(github_issue.number),
        github_html_url: Set(github_issue.html_url.clone()),
        imported_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

async fn touch_mapping(
    state: &AppState,
    mapping: github_imported_issue::Model,
    github_issue: &GithubIssue,
    issue_id: &str,
) -> Result<(), ApiError> {
    let mut active = mapping.into_active_model();
    active.issue_id = Set(issue_id.to_owned());
    active.github_issue_id = Set(github_issue.id);
    active.github_html_url = Set(github_issue.html_url.clone());
    active.updated_at = Set(now());
    active.update(&state.db).await?;
    Ok(())
}

async fn exchange_oauth_code(
    state: &AppState,
    oauth_state: &github_oauth_state::Model,
    code: &str,
) -> Result<GithubTokenResponse, ApiError> {
    let client_id = github_client_id()?;
    let client_secret = github_client_secret()?;
    let response = reqwest::Client::new()
        .post(GITHUB_TOKEN_URL)
        .header(ACCEPT, "application/json")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code.to_owned()),
            ("redirect_uri", github_redirect_uri(state)),
            ("code_verifier", oauth_state.code_verifier.clone()),
        ])
        .send()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    let status = response.status();
    let token = response
        .json::<GithubTokenResponse>()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    if !status.is_success() || token.access_token.is_none() {
        let message = token
            .error_description
            .or(token.error)
            .unwrap_or_else(|| "GitHub OAuth token exchange failed".to_owned());
        return Err(ApiError::BadRequest(message));
    }
    Ok(token)
}

async fn github_user(access_token: &Option<String>) -> Result<GithubUserResponse, ApiError> {
    let token = access_token
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("GitHub token response was empty".to_owned()))?;
    github_request(token, "/user")
        .send()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?
        .error_for_status()
        .map_err(github_reqwest_error)?
        .json::<GithubUserResponse>()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

async fn fetch_repo_issues(
    token: &str,
    owner: &str,
    repo: &str,
) -> Result<(Vec<GithubIssue>, usize), ApiError> {
    let mut page = 1;
    let mut issues = Vec::new();
    let mut skipped_pull_requests = 0;
    loop {
        let path = format!("/repos/{owner}/{repo}/issues");
        let batch = github_request(token, &path)
            .query(&[
                ("state", "all"),
                ("per_page", "100"),
                ("page", &page.to_string()),
            ])
            .send()
            .await
            .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?
            .error_for_status()
            .map_err(github_reqwest_error)?
            .json::<Vec<GithubIssue>>()
            .await
            .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
        let batch_len = batch.len();
        for issue in batch {
            if issue.pull_request.is_some() {
                skipped_pull_requests += 1;
            } else {
                issues.push(issue);
            }
        }
        if batch_len < 100 {
            break;
        }
        page += 1;
    }
    Ok((issues, skipped_pull_requests))
}

fn github_request(token: &str, path: &str) -> reqwest::RequestBuilder {
    let mut headers = ReqwestHeaderMap::new();
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.github+json"),
    );
    headers.insert(
        "X-GitHub-Api-Version",
        HeaderValue::from_static(GITHUB_API_VERSION),
    );
    headers.insert("User-Agent", HeaderValue::from_static("Produktive"));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {token}"))
            .unwrap_or_else(|_| HeaderValue::from_static("Bearer invalid")),
    );
    reqwest::Client::new()
        .get(format!("{GITHUB_API_BASE}{path}"))
        .headers(headers)
}

async fn store_connection(
    state: &AppState,
    oauth_state: &github_oauth_state::Model,
    token: &GithubTokenResponse,
    user: &GithubUserResponse,
) -> Result<(), ApiError> {
    let access_token = token
        .access_token
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("GitHub token response was empty".to_owned()))?;
    let ciphertext = encrypt_secret(&state.config.mcp_token_key(), access_token)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    let now = now();
    if let Some(existing) = github_connection::Entity::find()
        .filter(github_connection::Column::OrganizationId.eq(&oauth_state.organization_id))
        .one(&state.db)
        .await?
    {
        let mut active = existing.into_active_model();
        active.connected_by_id = Set(Some(oauth_state.created_by_id.clone()));
        active.github_user_id = Set(user.id);
        active.github_login = Set(user.login.clone());
        active.access_token_ciphertext = Set(ciphertext);
        active.scope = Set(token.scope.clone());
        active.updated_at = Set(now);
        active.update(&state.db).await?;
        return Ok(());
    }
    github_connection::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(oauth_state.organization_id.clone()),
        connected_by_id: Set(Some(oauth_state.created_by_id.clone())),
        github_user_id: Set(user.id),
        github_login: Set(user.login.clone()),
        access_token_ciphertext: Set(ciphertext),
        scope: Set(token.scope.clone()),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

async fn load_access_token(state: &AppState, organization_id: &str) -> Result<String, ApiError> {
    let connection = github_connection::Entity::find()
        .filter(github_connection::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Connect GitHub before importing".to_owned()))?;
    decrypt_secret(
        &state.config.mcp_token_key(),
        &connection.access_token_ciphertext,
    )
    .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

async fn find_connection(
    state: &AppState,
    organization_id: &str,
) -> Result<Option<github_connection::Model>, ApiError> {
    Ok(github_connection::Entity::find()
        .filter(github_connection::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?)
}

async fn find_repository(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<github_repository::Model, ApiError> {
    github_repository::Entity::find_by_id(id)
        .filter(github_repository::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("GitHub repository not found".to_owned()))
}

async fn ensure_unique_repository(
    state: &AppState,
    organization_id: &str,
    owner: &str,
    repo: &str,
    exclude_id: Option<&str>,
) -> Result<(), ApiError> {
    let mut select = github_repository::Entity::find()
        .filter(github_repository::Column::OrganizationId.eq(organization_id))
        .filter(github_repository::Column::Owner.eq(owner))
        .filter(github_repository::Column::Repo.eq(repo));
    if let Some(id) = exclude_id {
        select = select.filter(github_repository::Column::Id.ne(id));
    }
    if select.one(&state.db).await?.is_some() {
        return Err(ApiError::Conflict(
            "This GitHub repository is already added".to_owned(),
        ));
    }
    Ok(())
}

fn connection_response(connection: Option<github_connection::Model>) -> ConnectionResponse {
    match connection {
        Some(connection) => ConnectionResponse {
            connected: true,
            login: Some(connection.github_login),
            scope: connection.scope,
            connected_at: Some(connection.created_at.to_rfc3339()),
        },
        None => ConnectionResponse {
            connected: false,
            login: None,
            scope: None,
            connected_at: None,
        },
    }
}

fn repository_response(row: github_repository::Model) -> RepositoryResponse {
    RepositoryResponse {
        id: row.id,
        owner: row.owner,
        repo: row.repo,
        auto_import_enabled: row.auto_import_enabled,
        import_interval_minutes: row.import_interval_minutes,
        last_imported_at: row.last_imported_at.map(|date| date.to_rfc3339()),
        next_import_at: row.next_import_at.map(|date| date.to_rfc3339()),
        last_import_status: row.last_import_status,
        last_import_error: row.last_import_error,
        last_imported_count: row.last_imported_count,
        last_updated_count: row.last_updated_count,
        last_skipped_count: row.last_skipped_count,
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    }
}

async fn require_owner(state: &AppState, auth: &AuthContext) -> Result<(), ApiError> {
    let membership = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .filter(member::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?;
    if membership.as_ref().map(|m| m.role.as_str()) != Some("owner") {
        return Err(ApiError::Forbidden(
            "Only workspace owners can manage GitHub".to_owned(),
        ));
    }
    Ok(())
}

fn github_description(owner: &str, repo: &str, issue: &GithubIssue) -> String {
    let author = issue
        .user
        .as_ref()
        .map(|user| user.login.as_str())
        .unwrap_or("unknown");
    let assignees = if issue.assignees.is_empty() {
        "none".to_owned()
    } else {
        issue
            .assignees
            .iter()
            .map(|user| user.login.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    };
    let body = issue.body.as_deref().unwrap_or("").trim();
    let mut description = format!(
        "Imported from GitHub: {owner}/{repo}#{number}\nURL: {url}\nAuthor: {author}\nAssignees: {assignees}",
        number = issue.number,
        url = issue.html_url,
    );
    if !body.is_empty() {
        description.push_str("\n\n---\n\n");
        description.push_str(body);
    }
    description
}

fn unique_label_names(issues: &[GithubIssue]) -> std::collections::HashSet<String> {
    issues
        .iter()
        .flat_map(|issue| issue.labels.iter())
        .map(|label| label.name.trim().to_lowercase())
        .filter(|name| !name.is_empty())
        .collect()
}

fn github_color_to_label_color(hex: &str) -> String {
    let hex = hex.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return "gray".to_owned();
    }
    let Ok(value) = u32::from_str_radix(hex, 16) else {
        return "gray".to_owned();
    };
    let r = ((value >> 16) & 0xff) as i32;
    let g = ((value >> 8) & 0xff) as i32;
    let b = (value & 0xff) as i32;
    let palette = [
        ("blue", (59, 130, 246)),
        ("green", (34, 197, 94)),
        ("orange", (249, 115, 22)),
        ("purple", (168, 85, 247)),
        ("pink", (236, 72, 153)),
        ("red", (239, 68, 68)),
        ("yellow", (234, 179, 8)),
        ("gray", (107, 114, 128)),
    ];
    palette
        .iter()
        .min_by_key(|(_, (pr, pg, pb))| {
            let dr = r - pr;
            let dg = g - pg;
            let db = b - pb;
            dr * dr + dg * dg + db * db
        })
        .map(|(name, _)| (*name).to_owned())
        .unwrap_or_else(|| "gray".to_owned())
}

fn normalize_repo(payload: ImportRequest) -> Result<(String, String), ApiError> {
    normalize_owner_repo(&payload.owner, &payload.repo)
}

fn normalize_owner_repo(owner: &str, repo: &str) -> Result<(String, String), ApiError> {
    let owner = owner.trim().to_lowercase();
    let repo = repo.trim().to_lowercase();
    if !valid_repo_part(&owner) || !valid_repo_part(&repo) {
        return Err(ApiError::BadRequest(
            "Use a valid GitHub owner and repository name".to_owned(),
        ));
    }
    Ok((owner, repo))
}

fn normalize_interval(value: Option<i32>) -> Result<i32, ApiError> {
    let value = value.unwrap_or(DEFAULT_IMPORT_INTERVAL_MINUTES);
    if value < MIN_IMPORT_INTERVAL_MINUTES {
        return Err(ApiError::BadRequest(format!(
            "Auto import interval must be at least {MIN_IMPORT_INTERVAL_MINUTES} minutes"
        )));
    }
    Ok(value)
}

fn valid_repo_part(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

fn github_reqwest_error(error: reqwest::Error) -> ApiError {
    if let Some(status) = error.status() {
        return match status {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                ApiError::Forbidden("GitHub rejected the connected account".to_owned())
            }
            StatusCode::NOT_FOUND => ApiError::NotFound("GitHub repository not found".to_owned()),
            StatusCode::TOO_MANY_REQUESTS => {
                ApiError::BadRequest("GitHub rate limit exceeded".to_owned())
            }
            _ => ApiError::BadRequest(format!("GitHub request failed with {status}")),
        };
    }
    ApiError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_lock_predicate_rejects_active_locks_and_allows_expired_locks() {
        let now = now();
        assert!(import_lock_is_claimable(None, None, now));
        assert!(import_lock_is_claimable(
            Some("token"),
            Some(now - Duration::minutes(1)),
            now
        ));
        assert!(!import_lock_is_claimable(
            Some("token"),
            Some(now + Duration::minutes(1)),
            now
        ));
    }

    #[test]
    fn import_lock_ttl_is_long_enough_for_crash_recovery() {
        assert_eq!(IMPORT_LOCK_TTL_MINUTES, 30);
    }
}

fn github_client_id() -> Result<String, ApiError> {
    std::env::var("GITHUB_OAUTH_CLIENT_ID")
        .map(|value| value.trim().to_owned())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::BadRequest("GitHub OAuth is not configured".to_owned()))
}

fn github_client_secret() -> Result<String, ApiError> {
    std::env::var("GITHUB_OAUTH_CLIENT_SECRET")
        .map(|value| value.trim().to_owned())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::BadRequest("GitHub OAuth is not configured".to_owned()))
}

fn github_redirect_uri(state: &AppState) -> String {
    format!("{}/api/github/oauth/callback", state.config.app_url)
}

fn pkce_code_verifier() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn now() -> DateTime<FixedOffset> {
    Utc::now().fixed_offset()
}
