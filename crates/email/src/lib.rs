use anyhow::{anyhow, Context, Result};
use lettre::{
    message::{Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

#[derive(Clone, Debug)]
pub struct EmailConfig {
    pub host: String,
    pub port: u16,
    pub tls: SmtpTlsMode,
    pub username: Option<String>,
    pub password: Option<String>,
    pub from_email: String,
    pub from_name: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SmtpTlsMode {
    StartTls,
    Tls,
    None,
}

#[derive(Clone, Debug)]
pub struct OutboundEmail {
    pub to: String,
    pub subject: String,
    pub text_body: String,
    pub html_body: Option<String>,
}

#[derive(Clone)]
pub enum EmailClient {
    Disabled,
    Smtp(SmtpEmailClient),
}

#[derive(Clone)]
pub struct SmtpEmailClient {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl EmailConfig {
    pub fn from_env() -> Result<Option<Self>> {
        let host = optional_env("SMTP_HOST");
        let from_email = optional_env("SMTP_FROM_EMAIL");
        if host.is_none() && from_email.is_none() {
            return Ok(None);
        }

        let host = host.ok_or_else(|| anyhow!("SMTP_HOST is required when SMTP is configured"))?;
        let from_email = from_email
            .ok_or_else(|| anyhow!("SMTP_FROM_EMAIL is required when SMTP is configured"))?;
        let tls = parse_tls(optional_env("SMTP_TLS").as_deref())?;
        let port = match optional_env("SMTP_PORT") {
            Some(raw) => raw.parse().context("SMTP_PORT must be u16")?,
            None => match tls {
                SmtpTlsMode::Tls => 465,
                SmtpTlsMode::StartTls | SmtpTlsMode::None => 587,
            },
        };
        let username = optional_env("SMTP_USERNAME");
        let password = optional_env("SMTP_PASSWORD");
        if username.is_some() != password.is_some() {
            return Err(anyhow!(
                "SMTP_USERNAME and SMTP_PASSWORD must either both be set or both be empty"
            ));
        }

        Ok(Some(Self {
            host,
            port,
            tls,
            username,
            password,
            from_email,
            from_name: optional_env("SMTP_FROM_NAME"),
        }))
    }
}

impl EmailClient {
    pub fn disabled() -> Self {
        Self::Disabled
    }

    pub fn smtp(config: EmailConfig) -> Result<Self> {
        Ok(Self::Smtp(SmtpEmailClient::new(config)?))
    }

    pub async fn send(&self, outbound: OutboundEmail) -> Result<bool> {
        match self {
            Self::Disabled => {
                tracing::info!(
                    to = %outbound.to,
                    subject = %outbound.subject,
                    body = %outbound.text_body,
                    "email disabled; logging outbound email"
                );
                Ok(false)
            }
            Self::Smtp(client) => {
                client.send(outbound).await?;
                Ok(true)
            }
        }
    }
}

impl SmtpEmailClient {
    pub fn new(config: EmailConfig) -> Result<Self> {
        let mut builder = match config.tls {
            SmtpTlsMode::StartTls => {
                AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)
                    .with_context(|| format!("invalid SMTP_HOST {}", config.host))?
            }
            SmtpTlsMode::Tls => AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)
                .with_context(|| format!("invalid SMTP_HOST {}", config.host))?,
            SmtpTlsMode::None => {
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(config.host.clone())
            }
        }
        .port(config.port);

        if let (Some(username), Some(password)) = (config.username, config.password) {
            builder = builder.credentials(Credentials::new(username, password));
        }

        let from_address = config
            .from_email
            .parse()
            .with_context(|| format!("invalid SMTP_FROM_EMAIL {}", config.from_email))?;
        let from = Mailbox::new(config.from_name, from_address);

        Ok(Self {
            transport: builder.build(),
            from,
        })
    }

    pub async fn send(&self, outbound: OutboundEmail) -> Result<()> {
        let to: Mailbox = outbound
            .to
            .parse()
            .with_context(|| format!("invalid recipient email {}", outbound.to))?;
        let builder = Message::builder()
            .from(self.from.clone())
            .to(to)
            .subject(outbound.subject);
        let message = if let Some(html) = outbound.html_body {
            builder.multipart(
                MultiPart::alternative()
                    .singlepart(SinglePart::plain(outbound.text_body))
                    .singlepart(SinglePart::html(html)),
            )?
        } else {
            builder.singlepart(SinglePart::plain(outbound.text_body))?
        };

        self.transport.send(message).await?;
        Ok(())
    }
}

fn optional_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn parse_tls(raw: Option<&str>) -> Result<SmtpTlsMode> {
    match raw.unwrap_or("starttls").trim().to_lowercase().as_str() {
        "starttls" | "start_tls" | "true" => Ok(SmtpTlsMode::StartTls),
        "tls" | "ssl" => Ok(SmtpTlsMode::Tls),
        "none" | "plain" | "false" => Ok(SmtpTlsMode::None),
        other => Err(anyhow!(
            "SMTP_TLS must be starttls, tls, or none, got {other}"
        )),
    }
}
