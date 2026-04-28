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

pub async fn send_notification_email(
    state: &AppState,
    to: &str,
    recipient_name: &str,
    title: &str,
    snippet: Option<&str>,
    action_label: &str,
    action_path: &str,
) -> Result<(), ApiError> {
    let url = format!("{}{}", state.config.app_url, action_path);
    let snippet_html = snippet
        .map(|value| format!("<p style=\"color:#555\">{}</p>", html_escape(value)))
        .unwrap_or_default();
    let snippet_text = snippet
        .map(|value| format!("\n\n{value}"))
        .unwrap_or_default();
    let html = format!(
        "<p>Hi {name},</p><p><strong>{title}</strong></p>{snippet_html}<p><a href=\"{url}\">{action_label}</a></p>",
        name = html_escape(recipient_name),
        title = html_escape(title),
        action_label = html_escape(action_label),
    );
    let text = format!(
        "Hi {recipient_name},\n\n{title}{snippet_text}\n\n{action_label}: {url}"
    );

    send_email(state, to, title, html, text).await
}

pub async fn send_invitation_email(
    state: &AppState,
    to: &str,
    inviter_name: &str,
    organization_name: &str,
    token: &str,
) -> Result<(), ApiError> {
    let url = format!("{}/invite/{token}", state.config.app_url);
    let subject = format!("Join {organization_name} on Produktive");
    let html = format!(
        "<p>Hi,</p><p><strong>{inviter}</strong> invited you to join <strong>{org}</strong> on Produktive.</p><p><a href=\"{url}\">Accept invitation</a></p><p style=\"color:#888;font-size:12px\">If you weren't expecting this, you can safely ignore the email.</p>",
        inviter = html_escape(inviter_name),
        org = html_escape(organization_name),
    );
    let text = format!(
        "{inviter_name} invited you to join {organization_name} on Produktive.\n\nAccept the invitation:\n{url}\n\nIf you weren't expecting this, you can safely ignore the email."
    );

    send_email(state, to, &subject, html, text).await
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
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
