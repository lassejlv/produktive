use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    pub ok: bool,
}

#[utoipa::path(
    get,
    path = "/api/health",
    responses((status = 200, body = HealthResponse)),
    tag = "system"
)]
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}
