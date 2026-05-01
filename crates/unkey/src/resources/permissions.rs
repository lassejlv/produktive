use crate::client::Unkey;
use crate::error::Result;
use crate::models::{
    CreatePermissionRequest, CreateRoleRequest, Empty, ListPermissionsRequest, ListRolesRequest,
    Permission, PermissionRequest, Role, RoleRequest, UnkeyResponse,
};

/// RBAC permission and role operations.
#[derive(Debug, Clone)]
pub struct Permissions {
    client: Unkey,
}

impl Permissions {
    pub(crate) fn new(client: Unkey) -> Self {
        Self { client }
    }

    /// Creates a permission.
    pub async fn create_permission(
        &self,
        request: CreatePermissionRequest,
    ) -> Result<UnkeyResponse<Permission>> {
        self.client
            .post("permissions.createPermission", &request)
            .await
    }

    /// Deletes a permission.
    pub async fn delete_permission(
        &self,
        request: PermissionRequest,
    ) -> Result<UnkeyResponse<Empty>> {
        self.client
            .post("permissions.deletePermission", &request)
            .await
    }

    /// Fetches a permission.
    pub async fn get_permission(
        &self,
        request: PermissionRequest,
    ) -> Result<UnkeyResponse<Permission>> {
        self.client
            .post("permissions.getPermission", &request)
            .await
    }

    /// Lists permissions.
    pub async fn list_permissions(
        &self,
        request: ListPermissionsRequest,
    ) -> Result<UnkeyResponse<Vec<Permission>>> {
        self.client
            .post("permissions.listPermissions", &request)
            .await
    }

    /// Creates a role.
    pub async fn create_role(&self, request: CreateRoleRequest) -> Result<UnkeyResponse<Role>> {
        self.client.post("permissions.createRole", &request).await
    }

    /// Deletes a role.
    pub async fn delete_role(&self, request: RoleRequest) -> Result<UnkeyResponse<Empty>> {
        self.client.post("permissions.deleteRole", &request).await
    }

    /// Fetches a role.
    pub async fn get_role(&self, request: RoleRequest) -> Result<UnkeyResponse<Role>> {
        self.client.post("permissions.getRole", &request).await
    }

    /// Lists roles.
    pub async fn list_roles(&self, request: ListRolesRequest) -> Result<UnkeyResponse<Vec<Role>>> {
        self.client.post("permissions.listRoles", &request).await
    }
}
