use crate::{error::ApiError, state::AppState};
use resend_rs::{types::CreateEmailBaseOptions, Resend};

pub async fn send_verification_email(
    state: &AppState,
    to: &str,
    name: &str,
    token: &str,
) -> Result<(), ApiError> {
    let url = format!("{}/verify-email?token={token}", state.config.app_url);
    let html = format!(
        "<p>Hi {name},</p><p>Verify your Produktive email address to activate your workspace.</p><p><a href=\"{url}\">Verify email</a></p>"
    );
    let text = format!("Hi {name},\n\nVerify your Produktive email address:\n{url}");

    send_email(state, to, "Verify your Produktive email", html, text).await
}

pub async fn send_password_reset_email(
    state: &AppState,
    to: &str,
    name: &str,
    token: &str,
) -> Result<(), ApiError> {
    let url = format!("{}/reset-password?token={token}", state.config.app_url);
    let html = format!(
        "<p>Hi {name},</p><p>Use this link to reset your Produktive password.</p><p><a href=\"{url}\">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>"
    );
    let text = format!("Hi {name},\n\nReset your Produktive password:\n{url}\n\nIf you did not request this, you can ignore this email.");

    send_email(state, to, "Reset your Produktive password", html, text).await
}

async fn send_email(
    state: &AppState,
    to: &str,
    subject: &str,
    html: String,
    text: String,
) -> Result<(), ApiError> {
    let resend = Resend::new(&state.config.resend_api_key);
    let email = CreateEmailBaseOptions::new(&state.config.resend_from_email, [to], subject)
        .with_html(&html)
        .with_text(&text);

    resend
        .emails
        .send(email)
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error.to_string())))?;

    Ok(())
}
