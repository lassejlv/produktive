use crate::{auth::AuthContext, error::ApiError, state::AppState};
use produktive_entity::{member, organization_role};
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;

pub const ROLE_OWNER: &str = "owner";
pub const ROLE_ADMIN: &str = "admin";
pub const ROLE_MEMBER: &str = "member";

pub const WORKSPACE_RENAME: &str = "workspace.rename";
pub const WORKSPACE_DELETE: &str = "workspace.delete";
pub const MEMBERS_INVITE: &str = "members.invite";
pub const MEMBERS_REMOVE: &str = "members.remove";
pub const MEMBERS_ASSIGN_ROLE: &str = "members.assign_role";
pub const ROLES_MANAGE: &str = "roles.manage";
pub const ISSUES_CREATE: &str = "issues.create";
pub const ISSUES_UPDATE: &str = "issues.update";
pub const ISSUES_DELETE: &str = "issues.delete";
pub const ISSUE_STATUSES_MANAGE: &str = "issue_statuses.manage";
pub const PROJECTS_CREATE: &str = "projects.create";
pub const PROJECTS_UPDATE: &str = "projects.update";
pub const PROJECTS_DELETE: &str = "projects.delete";
pub const LABELS_CREATE: &str = "labels.create";
pub const LABELS_UPDATE: &str = "labels.update";
pub const LABELS_DELETE: &str = "labels.delete";
pub const GITHUB_MANAGE: &str = "integrations.github.manage";
pub const DISCORD_MANAGE: &str = "integrations.discord.manage";
pub const SLACK_MANAGE: &str = "integrations.slack.manage";
pub const AI_MANAGE: &str = "ai.manage";
pub const API_KEYS_MANAGE: &str = "api_keys.manage";
pub const BILLING_MANAGE: &str = "billing.manage";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionInfo {
    pub key: &'static str,
    pub label: &'static str,
    pub group: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleInfo {
    pub id: String,
    pub key: String,
    pub name: String,
    pub description: Option<String>,
    pub permissions: Vec<String>,
    pub is_system: bool,
    pub archived: bool,
}

pub fn permission_catalog() -> Vec<PermissionInfo> {
    vec![
        permission(WORKSPACE_RENAME, "Rename workspace", "Workspace"),
        permission(WORKSPACE_DELETE, "Delete workspace", "Workspace"),
        permission(MEMBERS_INVITE, "Invite members", "Members"),
        permission(MEMBERS_REMOVE, "Remove members", "Members"),
        permission(MEMBERS_ASSIGN_ROLE, "Assign member roles", "Members"),
        permission(ROLES_MANAGE, "Manage custom roles", "Members"),
        permission(ISSUES_CREATE, "Create issues", "Issues"),
        permission(ISSUES_UPDATE, "Update issues", "Issues"),
        permission(ISSUES_DELETE, "Delete issues", "Issues"),
        permission(ISSUE_STATUSES_MANAGE, "Manage issue statuses", "Issues"),
        permission(PROJECTS_CREATE, "Create projects", "Projects"),
        permission(PROJECTS_UPDATE, "Update projects", "Projects"),
        permission(PROJECTS_DELETE, "Delete projects", "Projects"),
        permission(LABELS_CREATE, "Create labels", "Labels"),
        permission(LABELS_UPDATE, "Update labels", "Labels"),
        permission(LABELS_DELETE, "Delete labels", "Labels"),
        permission(GITHUB_MANAGE, "Manage GitHub", "Integrations"),
        permission(DISCORD_MANAGE, "Manage Discord", "Integrations"),
        permission(SLACK_MANAGE, "Manage Slack", "Integrations"),
        permission(AI_MANAGE, "Manage AI and MCP servers", "AI"),
        permission(API_KEYS_MANAGE, "Manage API keys", "API"),
        permission(BILLING_MANAGE, "Manage billing", "Billing"),
    ]
}

pub fn all_permission_keys() -> Vec<String> {
    permission_catalog()
        .into_iter()
        .map(|item| item.key.to_owned())
        .collect()
}

pub fn built_in_roles() -> Vec<RoleInfo> {
    vec![
        RoleInfo {
            id: ROLE_OWNER.to_owned(),
            key: ROLE_OWNER.to_owned(),
            name: "Owner".to_owned(),
            description: Some("Full workspace access and ownership controls.".to_owned()),
            permissions: all_permission_keys(),
            is_system: true,
            archived: false,
        },
        RoleInfo {
            id: ROLE_ADMIN.to_owned(),
            key: ROLE_ADMIN.to_owned(),
            name: "Admin".to_owned(),
            description: Some("Can invite, remove, and organize workspace members.".to_owned()),
            permissions: vec![
                MEMBERS_INVITE.to_owned(),
                MEMBERS_REMOVE.to_owned(),
                MEMBERS_ASSIGN_ROLE.to_owned(),
                ISSUES_CREATE.to_owned(),
                ISSUES_UPDATE.to_owned(),
                ISSUES_DELETE.to_owned(),
                PROJECTS_CREATE.to_owned(),
                PROJECTS_UPDATE.to_owned(),
                PROJECTS_DELETE.to_owned(),
                LABELS_CREATE.to_owned(),
                LABELS_UPDATE.to_owned(),
                LABELS_DELETE.to_owned(),
            ],
            is_system: true,
            archived: false,
        },
        RoleInfo {
            id: ROLE_MEMBER.to_owned(),
            key: ROLE_MEMBER.to_owned(),
            name: "Member".to_owned(),
            description: Some("Can use the normal workspace issue and project tools.".to_owned()),
            permissions: vec![
                ISSUES_CREATE.to_owned(),
                ISSUES_UPDATE.to_owned(),
                PROJECTS_CREATE.to_owned(),
                PROJECTS_UPDATE.to_owned(),
                LABELS_CREATE.to_owned(),
                LABELS_UPDATE.to_owned(),
            ],
            is_system: true,
            archived: false,
        },
    ]
}

pub async fn list_roles(
    db: &DatabaseConnection,
    organization_id: &str,
    include_archived: bool,
) -> Result<Vec<RoleInfo>, ApiError> {
    let mut roles = built_in_roles();
    let mut query = organization_role::Entity::find()
        .filter(organization_role::Column::OrganizationId.eq(organization_id));
    if !include_archived {
        query = query.filter(organization_role::Column::ArchivedAt.is_null());
    }
    let custom_roles = query.all(db).await?;
    roles.extend(custom_roles.into_iter().map(role_response));
    Ok(roles)
}

pub async fn require_permission(
    state: &AppState,
    auth: &AuthContext,
    permission: &str,
) -> Result<(), ApiError> {
    if has_permission(&state.db, &auth.user.id, &auth.organization.id, permission).await? {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "Missing workspace permission".to_owned(),
        ))
    }
}

pub async fn has_permission(
    db: &DatabaseConnection,
    user_id: &str,
    organization_id: &str,
    permission: &str,
) -> Result<bool, ApiError> {
    let role = member_role(db, user_id, organization_id)
        .await?
        .ok_or_else(|| ApiError::Forbidden("Not a member of this workspace".to_owned()))?;
    if role == ROLE_OWNER {
        return Ok(true);
    }
    Ok(role_permissions(db, organization_id, &role)
        .await?
        .contains(permission))
}

pub async fn member_role(
    db: &DatabaseConnection,
    user_id: &str,
    organization_id: &str,
) -> Result<Option<String>, ApiError> {
    Ok(member::Entity::find()
        .filter(member::Column::UserId.eq(user_id))
        .filter(member::Column::OrganizationId.eq(organization_id))
        .one(db)
        .await?
        .map(|membership| membership.role))
}

pub async fn role_exists(
    db: &DatabaseConnection,
    organization_id: &str,
    role_key: &str,
) -> Result<bool, ApiError> {
    if built_in_role(role_key).is_some() {
        return Ok(true);
    }
    Ok(organization_role::Entity::find()
        .filter(organization_role::Column::OrganizationId.eq(organization_id))
        .filter(organization_role::Column::Key.eq(role_key))
        .filter(organization_role::Column::ArchivedAt.is_null())
        .one(db)
        .await?
        .is_some())
}

pub async fn role_permissions(
    db: &DatabaseConnection,
    organization_id: &str,
    role_key: &str,
) -> Result<HashSet<String>, ApiError> {
    if let Some(role) = built_in_role(role_key) {
        return Ok(role.permissions.into_iter().collect());
    }
    let role = organization_role::Entity::find()
        .filter(organization_role::Column::OrganizationId.eq(organization_id))
        .filter(organization_role::Column::Key.eq(role_key))
        .filter(organization_role::Column::ArchivedAt.is_null())
        .one(db)
        .await?;
    Ok(role
        .map(|role| permissions_from_json(&role.permissions))
        .unwrap_or_default())
}

pub fn is_built_in_role(role_key: &str) -> bool {
    built_in_role(role_key).is_some()
}

pub fn is_privileged_member_role(role_key: &str) -> bool {
    matches!(role_key, ROLE_OWNER | ROLE_ADMIN)
}

pub fn sanitize_permissions(input: &[String]) -> Vec<String> {
    let valid: HashSet<_> = all_permission_keys().into_iter().collect();
    let mut out = Vec::new();
    for permission in input {
        if valid.contains(permission) && !out.contains(permission) {
            out.push(permission.clone());
        }
    }
    out
}

pub fn role_response(row: organization_role::Model) -> RoleInfo {
    RoleInfo {
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        permissions: permissions_from_json(&row.permissions)
            .into_iter()
            .collect(),
        is_system: row.is_system,
        archived: row.archived_at.is_some(),
    }
}

fn built_in_role(role_key: &str) -> Option<RoleInfo> {
    built_in_roles()
        .into_iter()
        .find(|role| role.key.as_str() == role_key)
}

fn permissions_from_json(value: &Value) -> HashSet<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item.as_str())
        .map(ToOwned::to_owned)
        .collect()
}

fn permission(key: &'static str, label: &'static str, group: &'static str) -> PermissionInfo {
    PermissionInfo { key, label, group }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_owner_and_admin_are_privileged_member_roles() {
        assert!(is_privileged_member_role(ROLE_OWNER));
        assert!(is_privileged_member_role(ROLE_ADMIN));
        assert!(!is_privileged_member_role(ROLE_MEMBER));
        assert!(!is_privileged_member_role("custom-admin-like"));
    }
}
