use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};

const RESERVED_WORKSPACE_SLUGS: &[&str] = &[
    "api",
    "auth",
    "login",
    "logout",
    "public",
    "s",
    "signup",
    "workspaces",
];

pub fn slugify(input: &str, fallback: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;

    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }

    while out.ends_with('-') {
        out.pop();
    }

    while out.len() > 56 {
        out.pop();
    }
    while out.ends_with('-') {
        out.pop();
    }

    if out.is_empty() {
        fallback.to_string()
    } else {
        out
    }
}

pub fn is_valid_slug(s: &str) -> bool {
    let len = s.len();
    if !(3..=64).contains(&len) {
        return false;
    }
    s.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !s.starts_with('-')
        && !s.ends_with('-')
}

pub fn normalize_workspace_slug(input: &str) -> String {
    let slug = slugify(input, "workspace");
    if RESERVED_WORKSPACE_SLUGS.contains(&slug.as_str()) {
        format!("workspace-{slug}")
    } else {
        slug
    }
}

pub async fn unique_workspace_slug<C>(db: &C, name: &str) -> Result<String, sea_orm::DbErr>
where
    C: ConnectionTrait,
{
    unique_slug(
        db,
        normalize_workspace_slug(name),
        WorkspaceSlugScope::Global,
    )
    .await
}

pub async fn unique_monitor_slug<C>(
    db: &C,
    workspace_id: uuid::Uuid,
    name: &str,
) -> Result<String, sea_orm::DbErr>
where
    C: ConnectionTrait,
{
    unique_slug(
        db,
        slugify(name, "monitor"),
        WorkspaceSlugScope::Workspace(workspace_id),
    )
    .await
}

pub async fn unique_deploy_service_slug<C>(
    db: &C,
    workspace_id: uuid::Uuid,
    name: &str,
) -> Result<String, sea_orm::DbErr>
where
    C: ConnectionTrait,
{
    unique_slug(
        db,
        slugify(name, "service"),
        WorkspaceSlugScope::DeployService(workspace_id),
    )
    .await
}

pub async fn unique_deploy_sandbox_slug<C>(
    db: &C,
    workspace_id: uuid::Uuid,
    name: &str,
) -> Result<String, sea_orm::DbErr>
where
    C: ConnectionTrait,
{
    unique_slug(
        db,
        slugify(name, "sandbox"),
        WorkspaceSlugScope::DeploySandbox(workspace_id),
    )
    .await
}

enum WorkspaceSlugScope {
    Global,
    Workspace(uuid::Uuid),
    DeployService(uuid::Uuid),
    DeploySandbox(uuid::Uuid),
}

async fn unique_slug<C>(
    db: &C,
    base: String,
    scope: WorkspaceSlugScope,
) -> Result<String, sea_orm::DbErr>
where
    C: ConnectionTrait,
{
    let mut candidate = base.clone();
    let mut n = 2;
    while slug_exists(db, &candidate, &scope).await? {
        candidate = format!("{base}-{n}");
        n += 1;
    }
    Ok(candidate)
}

async fn slug_exists<C>(
    db: &C,
    slug: &str,
    scope: &WorkspaceSlugScope,
) -> Result<bool, sea_orm::DbErr>
where
    C: ConnectionTrait,
{
    let stmt = match scope {
        WorkspaceSlugScope::Global => Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT EXISTS(SELECT 1 FROM workspaces WHERE slug = $1)",
            [slug.into()],
        ),
        WorkspaceSlugScope::Workspace(workspace_id) => Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT EXISTS(SELECT 1 FROM monitors WHERE workspace_id = $1 AND slug = $2)",
            [(*workspace_id).into(), slug.into()],
        ),
        WorkspaceSlugScope::DeployService(workspace_id) => Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT EXISTS(SELECT 1 FROM deploy_services WHERE workspace_id = $1 AND slug = $2)",
            [(*workspace_id).into(), slug.into()],
        ),
        WorkspaceSlugScope::DeploySandbox(workspace_id) => Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT EXISTS(SELECT 1 FROM deploy_sandboxes WHERE workspace_id = $1 AND slug = $2 AND deleted_at IS NULL)",
            [(*workspace_id).into(), slug.into()],
        ),
    };
    let exists = db
        .query_one(stmt)
        .await?
        .and_then(|row| row.try_get::<bool>("", "exists").ok())
        .unwrap_or(false);
    Ok(exists)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugifies_names() {
        assert_eq!(slugify("Portfolio API", "workspace"), "portfolio-api");
        assert_eq!(slugify("!!!", "workspace"), "workspace");
        assert_eq!(normalize_workspace_slug("login"), "workspace-login");
        assert!(slugify(&"a".repeat(100), "workspace").len() <= 56);
    }
}
