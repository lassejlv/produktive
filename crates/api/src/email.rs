use crate::{error::ApiError, state::AppState};
use flaremail_rs::{Email, SendEmail};

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
    let text = format!("Hi {recipient_name},\n\n{title}{snippet_text}\n\n{action_label}: {url}");

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

pub async fn send_two_factor_nudge_email(
    state: &AppState,
    to: &str,
    name: &str,
    organization_name: &str,
    actor_name: &str,
) -> Result<(), ApiError> {
    let url = format!("{}/account?section=security", state.config.app_url);
    let subject = format!("Enable 2FA for {organization_name}");
    let html = format!(
        "<p>Hi {name},</p><p><strong>{actor}</strong> asked you to enable two-factor authentication for <strong>{org}</strong> on Produktive.</p><p><a href=\"{url}\">Open account security</a></p><p style=\"color:#888;font-size:12px\">Backup codes are shown when setup is complete. Store them somewhere safe.</p>",
        name = html_escape(name),
        actor = html_escape(actor_name),
        org = html_escape(organization_name),
    );
    let text = format!(
        "Hi {name},\n\n{actor_name} asked you to enable two-factor authentication for {organization_name} on Produktive.\n\nOpen account security:\n{url}\n\nBackup codes are shown when setup is complete. Store them somewhere safe."
    );

    send_email(state, to, &subject, html, text).await
}

pub async fn send_user_suspended_email(
    state: &AppState,
    to: &str,
    name: &str,
    reason: &str,
) -> Result<(), ApiError> {
    let subject = "Your Produktive account has been suspended";
    let html = format!(
        "<p>Hi {name},</p><p>Your Produktive account has been suspended.</p><p><strong>Reason:</strong> {reason}</p><p>If you believe this is a mistake, reply to this email or contact Produktive support.</p>",
        name = html_escape(name),
        reason = html_escape(reason),
    );
    let text = format!(
        "Hi {name},\n\nYour Produktive account has been suspended.\n\nReason: {reason}\n\nIf you believe this is a mistake, reply to this email or contact Produktive support."
    );

    send_email(state, to, subject, html, text).await
}

pub async fn send_organization_suspended_email(
    state: &AppState,
    to: &str,
    name: &str,
    organization_name: &str,
    reason: &str,
) -> Result<(), ApiError> {
    let subject = format!("{organization_name} has been suspended on Produktive");
    let html = format!(
        "<p>Hi {name},</p><p>Your workspace <strong>{org}</strong> has been suspended on Produktive.</p><p><strong>Reason:</strong> {reason}</p><p>Members will not be able to access this workspace, use API keys, or use MCP access while it is suspended. If you believe this is a mistake, reply to this email or contact Produktive support.</p>",
        name = html_escape(name),
        org = html_escape(organization_name),
        reason = html_escape(reason),
    );
    let text = format!(
        "Hi {name},\n\nYour workspace {organization_name} has been suspended on Produktive.\n\nReason: {reason}\n\nMembers will not be able to access this workspace, use API keys, or use MCP access while it is suspended. If you believe this is a mistake, reply to this email or contact Produktive support."
    );

    send_email(state, to, &subject, html, text).await
}

pub struct ProgressDigest<'a> {
    pub closed_count: usize,
    pub closed_titles: &'a [String],
    pub plate_count: usize,
    pub plate_titles: &'a [String],
    pub comments_posted: usize,
    pub issues_touched: usize,
}

pub async fn send_progress_digest_email(
    state: &AppState,
    to: &str,
    name: &str,
    org_name: &str,
    digest: &ProgressDigest<'_>,
    settings_url: &str,
    unsubscribe_url: &str,
) -> Result<(), ApiError> {
    let subject = format!("Your week on {}", org_name);

    let closed_html = render_section_html(
        digest.closed_count,
        digest.closed_titles,
        &format!(
            "You closed {} {} since last time",
            digest.closed_count,
            plural(digest.closed_count, "issue", "issues")
        ),
        "You haven't closed anything since last time.",
    );
    let plate_html = render_section_html(
        digest.plate_count,
        digest.plate_titles,
        &format!("Still on your plate ({} active)", digest.plate_count),
        "Nothing on your plate.",
    );

    let html = format!(
        "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;max-width:560px\">\
<p>Hi {name},</p>\
{closed_html}\
{plate_html}\
<p style=\"color:#555\">You posted <strong>{comments}</strong> {comment_word} and updated <strong>{touched}</strong> {issue_word}.</p>\
<p style=\"color:#888;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px\">\
\u{2014} <a href=\"{settings_url}\" style=\"color:#888\">Manage emails</a>\
&nbsp;\u{00b7}&nbsp;\
<a href=\"{unsubscribe_url}\" style=\"color:#888\">Unsubscribe from these</a>\
</p>\
</div>",
        name = html_escape(name),
        comments = digest.comments_posted,
        comment_word = plural(digest.comments_posted, "comment", "comments"),
        touched = digest.issues_touched,
        issue_word = plural(digest.issues_touched, "issue", "issues"),
    );

    let text = format!(
        "Hi {name},\n\n{closed}\n\n{plate}\n\nYou posted {comments} {comment_word} and updated {touched} {issue_word}.\n\n\u{2014} manage emails: {settings_url}\n\u{2014} unsubscribe from these: {unsubscribe_url}\n",
        closed = render_section_text(
            digest.closed_count,
            digest.closed_titles,
            &format!("You closed {} {} since last time:", digest.closed_count, plural(digest.closed_count, "issue", "issues")),
            "You haven't closed anything since last time.",
        ),
        plate = render_section_text(
            digest.plate_count,
            digest.plate_titles,
            &format!("Still on your plate ({} active):", digest.plate_count),
            "Nothing on your plate.",
        ),
        comments = digest.comments_posted,
        comment_word = plural(digest.comments_posted, "comment", "comments"),
        touched = digest.issues_touched,
        issue_word = plural(digest.issues_touched, "issue", "issues"),
    );

    let list_unsubscribe = format!("<{}>", unsubscribe_url);
    let headers = [
        ("List-Unsubscribe", list_unsubscribe.as_str()),
        ("List-Unsubscribe-Post", "List-Unsubscribe=One-Click"),
    ];

    send_email_with_headers(state, to, &subject, html, text, &headers).await
}

fn render_section_html(count: usize, titles: &[String], heading: &str, empty_text: &str) -> String {
    if count == 0 {
        return format!("<p style=\"color:#555\">{}</p>", html_escape(empty_text));
    }
    let mut items = String::new();
    for title in titles {
        items.push_str(&format!(
            "<li style=\"margin:2px 0\">{}</li>",
            html_escape(title)
        ));
    }
    let extra = count.saturating_sub(titles.len());
    if extra > 0 {
        items.push_str(&format!(
            "<li style=\"margin:2px 0;color:#888\">+{} more</li>",
            extra
        ));
    }
    format!(
        "<p style=\"margin-bottom:4px\"><strong>{}</strong></p><ul style=\"margin-top:4px;padding-left:20px;color:#222\">{}</ul>",
        html_escape(heading),
        items
    )
}

fn render_section_text(count: usize, titles: &[String], heading: &str, empty_text: &str) -> String {
    if count == 0 {
        return empty_text.to_owned();
    }
    let mut out = String::from(heading);
    for title in titles {
        out.push_str(&format!("\n  \u{2022} {}", title));
    }
    let extra = count.saturating_sub(titles.len());
    if extra > 0 {
        out.push_str(&format!("\n  \u{2022} +{} more", extra));
    }
    out
}

fn plural<'a>(count: usize, one: &'a str, many: &'a str) -> &'a str {
    if count == 1 {
        one
    } else {
        many
    }
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
    send_email_with_headers(state, to, subject, html, text, &[]).await
}

async fn send_email_with_headers(
    state: &AppState,
    to: &str,
    subject: &str,
    html: String,
    text: String,
    headers: &[(&str, &str)],
) -> Result<(), ApiError> {
    let mut email = SendEmail::new(state.config.email_from.as_str(), to, subject)
        .html(html)
        .text(text);

    for (name, value) in headers {
        email = email.header(*name, *value);
    }

    email_client(state)
        .emails()
        .send(email)
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error.to_string())))?;

    Ok(())
}

fn email_client(state: &AppState) -> Email {
    let email = Email::new(&state.config.email_api_token);

    if let Some(account_id) = &state.config.email_account_id {
        email.with_account_id(account_id)
    } else {
        email
    }
}
