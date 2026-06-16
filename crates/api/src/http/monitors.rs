use axum::{
    extract::{Path, State},
    routing::{get, patch, post},
    Extension, Json, Router,
};
use chrono::{DateTime, FixedOffset, Utc};
use entity::monitor::{self, MonitorKind};
use produktive_dsl::{self as dsl, TypeKind};
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    billing::{
        ensure_customer, load_owner_email, require_metered_feature, require_monitor_interval,
        track_feature_with_key,
    },
    error::{ApiError, ApiResult},
    middleware::Membership,
    regions::{self, MonitorRegionView},
    slug,
    state::AppState,
    target,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/{id}", patch(update).get(get_one).delete(delete))
        .route("/{id}/dsl/test", post(dsl_test))
        .route("/dsl/validate", post(dsl_validate))
}

#[derive(Deserialize, ToSchema)]
pub struct CreateMonitor {
    pub name: String,
    #[serde(default)]
    pub kind: Option<MonitorKind>,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub interval_seconds: Option<i32>,
    #[serde(default)]
    pub timeout_ms: Option<i32>,
    #[serde(default)]
    pub expected_status: Option<i32>,
    #[serde(default)]
    pub expected_body_contains: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub dsl_source: Option<String>,
    #[serde(default)]
    pub region_slugs: Option<Vec<String>>,
}

fn default_true() -> bool {
    true
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateMonitor {
    pub name: Option<String>,
    pub kind: Option<MonitorKind>,
    pub target: Option<String>,
    pub interval_seconds: Option<i32>,
    pub timeout_ms: Option<i32>,
    #[schema(value_type = Option<i32>)]
    pub expected_status: Option<Option<i32>>,
    #[schema(value_type = Option<String>)]
    pub expected_body_contains: Option<Option<String>>,
    pub enabled: Option<bool>,
    pub canvas_x: Option<i32>,
    pub canvas_y: Option<i32>,
    #[schema(value_type = Option<String>)]
    pub dsl_source: Option<Option<String>>,
    #[serde(default)]
    pub region_slugs: Option<Vec<String>>,
}

#[derive(Serialize, ToSchema)]
pub struct MonitorView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub slug: String,
    pub name: String,
    pub kind: MonitorKind,
    pub target: String,
    pub interval_seconds: i32,
    pub timeout_ms: i32,
    pub expected_status: Option<i32>,
    pub expected_body_contains: Option<String>,
    pub enabled: bool,
    pub billing_paused_at: Option<DateTime<FixedOffset>>,
    pub last_status: Option<i16>,
    pub last_latency_ms: Option<i32>,
    pub last_checked_at: Option<DateTime<FixedOffset>>,
    pub canvas_x: i32,
    pub canvas_y: i32,
    pub dsl_source: Option<String>,
    pub regions: Vec<MonitorRegionView>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(serde::Serialize, ToSchema)]
pub struct OkResponse {
    pub ok: bool,
}

#[derive(Deserialize, ToSchema)]
pub struct DslValidateBody {
    pub source: String,
}

#[derive(Serialize, ToSchema)]
pub struct DslValidateResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ast: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<DslError>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<DslDiagnostic>,
}

#[derive(Serialize, ToSchema)]
pub struct DslError {
    pub message: String,
    pub line: u32,
    pub col: u32,
}

#[derive(Serialize, ToSchema)]
pub struct DslDiagnostic {
    pub severity: String,
    pub message: String,
    pub line: u32,
    pub col: u32,
}

#[derive(Deserialize, ToSchema)]
pub struct DslTestBody {
    pub source: String,
    #[serde(default)]
    pub sample: Option<serde_json::Value>,
}

#[derive(Serialize, ToSchema)]
pub struct DslTestResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<DslOutcome>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<DslError>,
}

#[derive(Serialize, ToSchema)]
pub struct DslOutcome {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_index: Option<usize>,
}

struct ParsedDsl {
    source: String,
    doc: dsl::Document,
}

fn parse_dsl(source: &str) -> Result<ParsedDsl, ApiError> {
    let validation = dsl::parse_and_validate(source);
    if dsl::has_errors(&validation.diagnostics) {
        let message = validation
            .diagnostics
            .iter()
            .find(|d| d.is_error())
            .map(format_diagnostic)
            .unwrap_or_else(|| "dsl validation failed".to_string());
        return Err(ApiError::bad_request(message));
    }
    let Some(doc) = validation.doc else {
        return Err(ApiError::bad_request("dsl parse failed"));
    };
    Ok(ParsedDsl {
        source: source.to_string(),
        doc,
    })
}

pub async fn resolve_monitor(
    state: &AppState,
    workspace_id: Uuid,
    ident: &str,
) -> ApiResult<monitor::Model> {
    if let Ok(id) = Uuid::parse_str(ident) {
        if let Some(mon) = monitor::Entity::find_by_id(id)
            .filter(monitor::Column::WorkspaceId.eq(workspace_id))
            .one(&state.db)
            .await?
        {
            return Ok(mon);
        }
    }

    let slug = ident.trim().to_lowercase();
    if !slug::is_valid_slug(&slug) {
        return Err(ApiError::bad_request("invalid monitor"));
    }

    monitor::Entity::find()
        .filter(monitor::Column::Slug.eq(slug))
        .filter(monitor::Column::WorkspaceId.eq(workspace_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("monitor not found"))
}

async fn monitor_view(state: &AppState, m: monitor::Model) -> ApiResult<MonitorView> {
    let regions = regions::monitor_region_views(state, m.id).await?;
    Ok(MonitorView {
        id: m.id,
        workspace_id: m.workspace_id,
        slug: m.slug,
        name: m.name,
        kind: m.kind,
        target: m.target,
        interval_seconds: m.interval_seconds,
        timeout_ms: m.timeout_ms,
        expected_status: m.expected_status,
        expected_body_contains: m.expected_body_contains,
        enabled: m.enabled,
        billing_paused_at: m.billing_paused_at,
        last_status: m.last_status,
        last_latency_ms: m.last_latency_ms,
        last_checked_at: m.last_checked_at,
        canvas_x: m.canvas_x,
        canvas_y: m.canvas_y,
        dsl_source: m.dsl_source,
        regions,
        created_at: m.created_at,
        updated_at: m.updated_at,
    })
}

async fn monitor_views(state: &AppState, rows: Vec<monitor::Model>) -> ApiResult<Vec<MonitorView>> {
    let mut views = Vec::with_capacity(rows.len());
    for row in rows {
        views.push(monitor_view(state, row).await?);
    }
    Ok(views)
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/monitors",
    operation_id = "monitors_list",
    params(("wid" = Uuid, Path, description = "workspace id")),
    responses((status = 200, body = [MonitorView])),
    security(("bearerAuth" = [])),
    tag = "monitors"
)]
pub async fn list(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<MonitorView>>> {
    let rows = monitor::Entity::find()
        .filter(monitor::Column::WorkspaceId.eq(m.workspace.id))
        .all(&state.db)
        .await?;
    Ok(Json(monitor_views(&state, rows).await?))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/monitors",
    operation_id = "monitors_create",
    params(("wid" = Uuid, Path, description = "workspace id")),
    request_body = CreateMonitor,
    responses(
        (status = 200, body = MonitorView),
        (status = 400, description = "Invalid name/target/dsl"),
    ),
    security(("bearerAuth" = [])),
    tag = "monitors"
)]
pub async fn create(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Json(body): Json<CreateMonitor>,
) -> ApiResult<Json<MonitorView>> {
    if body.name.trim().is_empty() {
        return Err(ApiError::bad_request("name required"));
    }

    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;
    require_metered_feature(&state, m.workspace.id, "monitors", 1.0).await?;

    let dsl_parsed = match &body.dsl_source {
        Some(src) if !src.trim().is_empty() => Some(parse_dsl(src)?),
        _ => None,
    };

    let (kind, target_in, interval_in, timeout_in, expected_status_in, expected_body_in) =
        if let Some(parsed) = &dsl_parsed {
            let proj = dsl::project(&parsed.doc);
            let projected_kind = proj
                .kind
                .map(type_kind_to_monitor_kind)
                .or(body.kind.clone())
                .ok_or_else(|| {
                    ApiError::bad_request("monitor `type` required (in DSL or kind field)")
                })?;
            let projected_target = proj.target.or(body.target.clone()).ok_or_else(|| {
                ApiError::bad_request(
                    "monitor target required (params.config.url in DSL or target field)",
                )
            })?;
            (
                projected_kind,
                projected_target,
                proj.interval_seconds
                    .or(body.interval_seconds)
                    .unwrap_or(60),
                proj.timeout_ms
                    .or(body.timeout_ms)
                    .unwrap_or(5000)
                    .clamp(100, 60_000),
                proj.expected_status.or(body.expected_status),
                proj.expected_body_contains
                    .or(body.expected_body_contains.clone()),
            )
        } else {
            (
                body.kind
                    .clone()
                    .ok_or_else(|| ApiError::bad_request("kind required"))?,
                body.target
                    .clone()
                    .ok_or_else(|| ApiError::bad_request("target required"))?,
                body.interval_seconds.unwrap_or(60),
                body.timeout_ms.unwrap_or(5000).clamp(100, 60_000),
                body.expected_status,
                body.expected_body_contains.clone(),
            )
        };

    let target = target::validate_monitor(kind.clone(), &target_in).await?;
    require_monitor_interval(&state, m.workspace.id, interval_in).await?;
    let region_slugs = regions::normalize_requested_slugs(body.region_slugs.clone());
    if region_selection_requires_owner(&region_slugs) {
        m.require_owner()?;
    }
    regions::validate_requested_regions(&state, m.workspace.id, &kind, &region_slugs).await?;
    let monitor_slug = slug::unique_monitor_slug(&state.db, m.workspace.id, &body.name).await?;

    let monitor_id = Uuid::now_v7();
    let now = Utc::now().fixed_offset();
    let am = monitor::ActiveModel {
        id: Set(monitor_id),
        workspace_id: Set(m.workspace.id),
        slug: Set(monitor_slug),
        name: Set(body.name.trim().to_string()),
        kind: Set(kind),
        target: Set(target),
        interval_seconds: Set(interval_in),
        timeout_ms: Set(timeout_in),
        expected_status: Set(expected_status_in),
        expected_body_contains: Set(expected_body_in),
        enabled: Set(body.enabled),
        billing_paused_at: Set(None),
        last_status: Set(None),
        last_latency_ms: Set(None),
        last_checked_at: Set(None),
        canvas_x: Set(0),
        canvas_y: Set(0),
        dsl_source: Set(dsl_parsed.as_ref().map(|p| p.source.clone())),
        created_at: Set(now),
        updated_at: Set(now),
    };
    let row = am.insert(&state.db).await?;
    regions::sync_monitor_regions(
        &state,
        m.workspace.id,
        row.id,
        &row.kind,
        Some(region_slugs),
    )
    .await?;
    track_feature_with_key(
        &state,
        m.workspace.id,
        "monitors",
        1.0,
        Some(format!("monitor-create-{monitor_id}")),
    )
    .await;
    Ok(Json(monitor_view(&state, row).await?))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/monitors/{id}",
    operation_id = "monitors_get",
    params(
        ("wid" = Uuid, Path, description = "workspace id"),
        ("id" = Uuid, Path, description = "monitor id"),
    ),
    responses(
        (status = 200, body = MonitorView),
        (status = 404, description = "Monitor not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "monitors"
)]
pub async fn get_one(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, String)>,
) -> ApiResult<Json<MonitorView>> {
    let row = resolve_monitor(&state, m.workspace.id, &id).await?;
    Ok(Json(monitor_view(&state, row).await?))
}

#[utoipa::path(
    patch,
    path = "/api/workspaces/{wid}/monitors/{id}",
    operation_id = "monitors_update",
    params(
        ("wid" = Uuid, Path, description = "workspace id"),
        ("id" = Uuid, Path, description = "monitor id"),
    ),
    request_body = UpdateMonitor,
    responses(
        (status = 200, body = MonitorView),
        (status = 404, description = "Monitor not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "monitors"
)]
pub async fn update(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, String)>,
    Json(body): Json<UpdateMonitor>,
) -> ApiResult<Json<MonitorView>> {
    let existing = resolve_monitor(&state, m.workspace.id, &id).await?;

    let dsl_change = match &body.dsl_source {
        Some(Some(src)) if !src.trim().is_empty() => Some(Some(parse_dsl(src)?)),
        Some(_) => Some(None),
        None => None,
    };

    let mut next_kind = body.kind.clone().unwrap_or_else(|| existing.kind.clone());
    let mut next_target = body
        .target
        .as_deref()
        .unwrap_or(&existing.target)
        .to_string();
    let mut next_interval: Option<i32> = body.interval_seconds;
    let mut next_timeout: Option<i32> = body.timeout_ms;
    let mut next_expected_status: Option<Option<i32>> = body.expected_status;
    let mut next_expected_body: Option<Option<String>> = body.expected_body_contains;
    let mut target_or_kind_changed = body.kind.is_some() || body.target.is_some();

    if let Some(Some(parsed)) = dsl_change.as_ref() {
        let proj = dsl::project(&parsed.doc);
        if let Some(k) = proj.kind {
            let pk = type_kind_to_monitor_kind(k);
            if pk != next_kind {
                next_kind = pk;
                target_or_kind_changed = true;
            }
        }
        if let Some(t) = proj.target {
            if t != next_target {
                next_target = t;
                target_or_kind_changed = true;
            }
        }
        if let Some(i) = proj.interval_seconds {
            next_interval = Some(i);
        }
        if let Some(t) = proj.timeout_ms {
            next_timeout = Some(t);
        }
        if let Some(s) = proj.expected_status {
            next_expected_status = Some(Some(s));
        }
        if let Some(b) = proj.expected_body_contains {
            next_expected_body = Some(Some(b));
        }
    }

    let requested_region_slugs = body
        .region_slugs
        .as_ref()
        .map(|slugs| regions::normalize_requested_slugs(Some(slugs.clone())));
    if requested_region_slugs.is_some() {
        m.require_owner()?;
    }
    if let Some(slugs) = requested_region_slugs.as_ref() {
        regions::validate_requested_regions(&state, m.workspace.id, &next_kind, slugs).await?;
    } else if target_or_kind_changed {
        regions::ensure_existing_regions_support(&state, m.workspace.id, existing.id, &next_kind)
            .await?;
    }

    let mut am: monitor::ActiveModel = existing.into();
    am.updated_at = Set(Utc::now().fixed_offset());
    if let Some(v) = body.name {
        let v = v.trim();
        if v.is_empty() {
            return Err(ApiError::bad_request("name required"));
        }
        am.name = Set(v.to_string());
    }
    if target_or_kind_changed {
        let validated = target::validate_monitor(next_kind.clone(), &next_target).await?;
        am.kind = Set(next_kind);
        am.target = Set(validated);
    }
    if let Some(v) = next_interval {
        require_monitor_interval(&state, m.workspace.id, v).await?;
        am.interval_seconds = Set(v);
    }
    if let Some(v) = next_timeout {
        am.timeout_ms = Set(v.clamp(100, 60_000));
    }
    if let Some(v) = next_expected_status {
        am.expected_status = Set(v);
    }
    if let Some(v) = next_expected_body {
        am.expected_body_contains = Set(v);
    }
    if let Some(v) = body.enabled {
        am.enabled = Set(v);
    }
    if let Some(v) = body.canvas_x {
        am.canvas_x = Set(v);
    }
    if let Some(v) = body.canvas_y {
        am.canvas_y = Set(v);
    }
    if let Some(maybe_parsed) = dsl_change {
        match maybe_parsed {
            Some(parsed) => {
                am.dsl_source = Set(Some(parsed.source));
            }
            None => {
                am.dsl_source = Set(None);
            }
        }
    }
    let row = am.update(&state.db).await?;
    if let Some(slugs) = requested_region_slugs {
        regions::sync_monitor_regions(&state, m.workspace.id, row.id, &row.kind, Some(slugs))
            .await?;
    }
    Ok(Json(monitor_view(&state, row).await?))
}

fn region_selection_requires_owner(slugs: &[String]) -> bool {
    slugs.len() != 1
        || slugs
            .first()
            .is_none_or(|slug| slug != regions::DEFAULT_REGION_SLUG)
}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{wid}/monitors/{id}",
    operation_id = "monitors_delete",
    params(
        ("wid" = Uuid, Path, description = "workspace id"),
        ("id" = Uuid, Path, description = "monitor id"),
    ),
    responses(
        (status = 200, body = OkResponse),
        (status = 404, description = "Monitor not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "monitors"
)]
pub async fn delete(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, String)>,
) -> ApiResult<Json<OkResponse>> {
    let mon = resolve_monitor(&state, m.workspace.id, &id).await?;
    let res = monitor::Entity::delete_many()
        .filter(monitor::Column::Id.eq(mon.id))
        .filter(monitor::Column::WorkspaceId.eq(m.workspace.id))
        .exec(&state.db)
        .await?;
    if res.rows_affected == 0 {
        return Err(ApiError::not_found("monitor not found"));
    }
    track_feature_with_key(
        &state,
        m.workspace.id,
        "monitors",
        -1.0,
        Some(format!("monitor-delete-{}", mon.id)),
    )
    .await;
    Ok(Json(OkResponse { ok: true }))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/monitors/dsl/validate",
    params(("wid" = Uuid, Path, description = "workspace id")),
    request_body = DslValidateBody,
    responses((status = 200, body = DslValidateResponse)),
    security(("bearerAuth" = [])),
    tag = "monitors"
)]
pub async fn dsl_validate(
    State(_state): State<AppState>,
    Extension(_m): Extension<Membership>,
    Json(body): Json<DslValidateBody>,
) -> ApiResult<Json<DslValidateResponse>> {
    let validation = dsl::parse_and_validate(&body.source);
    let ok = validation.ok();
    let diagnostics = validation
        .diagnostics
        .iter()
        .map(dsl_diagnostic)
        .collect::<Vec<_>>();
    match validation.doc {
        Some(doc) => {
            let ast = match serde_json::to_value(&doc) {
                Ok(ast) => Some(ast),
                Err(e) => {
                    let mut diagnostics = diagnostics;
                    diagnostics.push(DslDiagnostic {
                        severity: "error".into(),
                        message: format!("validator could not serialize AST: {e}"),
                        line: 1,
                        col: 1,
                    });
                    return Ok(Json(DslValidateResponse {
                        ok: false,
                        ast: None,
                        error: diagnostics.iter().find(|d| d.severity == "error").map(|d| {
                            DslError {
                                message: d.message.clone(),
                                line: d.line,
                                col: d.col,
                            }
                        }),
                        diagnostics,
                    }));
                }
            };
            Ok(Json(DslValidateResponse {
                ok,
                ast,
                error: diagnostics
                    .iter()
                    .find(|d| d.severity == "error")
                    .map(|d| DslError {
                        message: d.message.clone(),
                        line: d.line,
                        col: d.col,
                    }),
                diagnostics,
            }))
        }
        None => {
            let error = diagnostics.first().map(|d| DslError {
                message: d.message.clone(),
                line: d.line,
                col: d.col,
            });
            Ok(Json(DslValidateResponse {
                ok: false,
                ast: None,
                error,
                diagnostics,
            }))
        }
    }
}

fn dsl_diagnostic(d: &dsl::Diagnostic) -> DslDiagnostic {
    DslDiagnostic {
        severity: match d.severity {
            dsl::Severity::Error => "error".into(),
            dsl::Severity::Warning => "warning".into(),
        },
        message: d.message.clone(),
        line: d.line,
        col: d.col,
    }
}

fn format_diagnostic(d: &dsl::Diagnostic) -> String {
    format!(
        "dsl {} at {}:{}: {}",
        match d.severity {
            dsl::Severity::Error => "error",
            dsl::Severity::Warning => "warning",
        },
        d.line,
        d.col,
        d.message
    )
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/monitors/{id}/dsl/test",
    params(
        ("wid" = Uuid, Path, description = "workspace id"),
        ("id" = Uuid, Path, description = "monitor id"),
    ),
    request_body = DslTestBody,
    responses((status = 200, body = DslTestResponse)),
    security(("bearerAuth" = [])),
    tag = "monitors"
)]
pub async fn dsl_test(
    State(_state): State<AppState>,
    Extension(_m): Extension<Membership>,
    Path((_wid, _id)): Path<(String, String)>,
    Json(body): Json<DslTestBody>,
) -> ApiResult<Json<DslTestResponse>> {
    let doc = match dsl::parse(&body.source) {
        Ok(d) => d,
        Err(e) => {
            return Ok(Json(DslTestResponse {
                ok: false,
                outcome: None,
                error: Some(DslError {
                    message: e.message,
                    line: e.line,
                    col: e.col,
                }),
            }));
        }
    };
    let sample = body.sample.unwrap_or_else(|| {
        serde_json::json!({
            "result": { "status": 200, "latency_ms": 120, "body": "", "headers": {} }
        })
    });
    let mut ctx = dsl::Context::new();
    if let serde_json::Value::Object(map) = sample {
        for (k, v) in map {
            ctx = ctx.put(k, v);
        }
    }
    let outcome = dsl::eval_rules(&doc.rules, &ctx).map(|o| DslOutcome {
        kind: match o.kind {
            dsl::OutcomeKind::Ok => "ok".into(),
            dsl::OutcomeKind::Warn => "warn".into(),
            dsl::OutcomeKind::Down => "down".into(),
        },
        message: o.message,
        rule_index: o.rule_index,
    });
    Ok(Json(DslTestResponse {
        ok: true,
        outcome,
        error: None,
    }))
}

fn type_kind_to_monitor_kind(k: TypeKind) -> MonitorKind {
    match k {
        TypeKind::Http => MonitorKind::Http,
        TypeKind::Tcp => MonitorKind::Tcp,
        TypeKind::Ping => MonitorKind::Ping,
        TypeKind::Postgres => MonitorKind::Postgres,
        TypeKind::Redis => MonitorKind::Redis,
        TypeKind::Ssh => MonitorKind::Ssh,
    }
}

#[cfg(test)]
mod tests {
    use super::region_selection_requires_owner;

    #[test]
    fn non_default_or_multi_region_selection_requires_owner() {
        assert!(!region_selection_requires_owner(&["eu-west".to_owned()]));
        assert!(region_selection_requires_owner(&["us-east".to_owned()]));
        assert!(region_selection_requires_owner(&[
            "eu-west".to_owned(),
            "us-east".to_owned(),
        ]));
    }
}
