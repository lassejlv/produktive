use std::{sync::Arc, time::Duration};

use deploy::{DeployError, DeployResult};
use reqwest::{Method, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use url::Url;

use crate::models::{
    AppResponse, CreateAppRequest, CreateAppResponse, CreateMachineRequest, MachineResponse,
};

const DEFAULT_API_HOSTNAME: &str = "https://api.machines.dev";
const DEFAULT_USER_AGENT: &str = "produktive-fly/0.1";

#[derive(Clone, Debug)]
pub struct Fly {
    inner: Arc<FlyInner>,
}

#[derive(Debug)]
struct FlyInner {
    http: reqwest::Client,
    base_url: Url,
    api_token: String,
    org_slug: String,
    app_name_prefix: String,
}

#[derive(Debug, Clone)]
pub struct FlyConfig {
    pub api_token: String,
    pub org_slug: String,
    pub api_hostname: Option<String>,
    pub app_name_prefix: String,
}

#[derive(Debug, Default)]
pub struct FlyBuilder {
    api_token: Option<String>,
    org_slug: Option<String>,
    api_hostname: Option<String>,
    app_name_prefix: Option<String>,
    http: Option<reqwest::Client>,
}

impl Fly {
    pub fn builder() -> FlyBuilder {
        FlyBuilder::default()
    }

    pub fn from_config(config: FlyConfig) -> DeployResult<Self> {
        Self::builder()
            .api_token(config.api_token)
            .org_slug(config.org_slug)
            .api_hostname(
                config
                    .api_hostname
                    .unwrap_or_else(|| DEFAULT_API_HOSTNAME.into()),
            )
            .app_name_prefix(config.app_name_prefix)
            .build()
    }

    pub fn app_name_prefix(&self) -> &str {
        &self.inner.app_name_prefix
    }

    pub fn app_url(&self, app_name: &str) -> String {
        format!("https://{app_name}.fly.dev")
    }

    pub async fn ensure_app(&self, app_name: &str, network: &str) -> DeployResult<AppResponse> {
        match self.get_app(app_name).await {
            Ok(app) => return Ok(app),
            Err(DeployError::NotFound(_)) => {}
            Err(error) => return Err(error),
        }

        let body = CreateAppRequest {
            app_name: app_name.to_owned(),
            org_slug: self.inner.org_slug.clone(),
            network: network.to_owned(),
        };
        match self
            .request::<_, CreateAppResponse>(Method::POST, "/v1/apps", Some(&body))
            .await
        {
            Ok(created) => Ok(AppResponse {
                id: created.id,
                name: app_name.to_owned(),
                status: Some("created".into()),
                organization: created.created_at,
            }),
            Err(DeployError::Provider(message)) if message.contains("409") => {
                self.get_app(app_name).await
            }
            Err(error) => Err(error),
        }
    }

    pub async fn get_app(&self, app_name: &str) -> DeployResult<AppResponse> {
        self.request::<(), AppResponse>(Method::GET, &format!("/v1/apps/{app_name}"), None)
            .await
    }

    pub async fn create_machine(
        &self,
        app_name: &str,
        body: &CreateMachineRequest,
    ) -> DeployResult<MachineResponse> {
        self.request(
            Method::POST,
            &format!("/v1/apps/{app_name}/machines"),
            Some(body),
        )
        .await
    }

    pub async fn get_machine(
        &self,
        app_name: &str,
        machine_id: &str,
    ) -> DeployResult<MachineResponse> {
        self.request::<(), MachineResponse>(
            Method::GET,
            &format!("/v1/apps/{app_name}/machines/{machine_id}"),
            None,
        )
        .await
    }

    pub async fn stop_machine(&self, app_name: &str, machine_id: &str) -> DeployResult<()> {
        self.request::<(), serde_json::Value>(
            Method::POST,
            &format!("/v1/apps/{app_name}/machines/{machine_id}/stop"),
            None,
        )
        .await
        .map(|_| ())
    }

    async fn request<B, T>(&self, method: Method, path: &str, body: Option<B>) -> DeployResult<T>
    where
        B: Serialize,
        T: DeserializeOwned,
    {
        let url = self
            .inner
            .base_url
            .join(path.trim_start_matches('/'))
            .map_err(|error| DeployError::Config(format!("invalid Fly API URL: {error}")))?;
        let mut request = self
            .inner
            .http
            .request(method, url)
            .bearer_auth(&self.inner.api_token);
        if let Some(body) = body {
            request = request.json(&body);
        }

        let response = request
            .send()
            .await
            .map_err(|error| DeployError::Transport(error.to_string()))?;
        let status = response.status();
        if status == StatusCode::NO_CONTENT {
            return serde_json::from_value(serde_json::Value::Null)
                .map_err(|error| DeployError::Decode(error.to_string()));
        }
        let text = response
            .text()
            .await
            .map_err(|error| DeployError::Transport(error.to_string()))?;
        if !status.is_success() {
            if status == StatusCode::NOT_FOUND {
                return Err(DeployError::NotFound("Fly resource not found".into()));
            }
            if status == StatusCode::TOO_MANY_REQUESTS {
                return Err(DeployError::RateLimited(
                    "Fly API rate limit exceeded".into(),
                ));
            }
            return Err(DeployError::Provider(format!("Fly API {status}: {text}")));
        }
        serde_json::from_str(&text).map_err(|error| DeployError::Decode(error.to_string()))
    }
}

impl FlyBuilder {
    pub fn api_token(mut self, token: impl Into<String>) -> Self {
        self.api_token = Some(token.into());
        self
    }

    pub fn org_slug(mut self, org_slug: impl Into<String>) -> Self {
        self.org_slug = Some(org_slug.into());
        self
    }

    pub fn api_hostname(mut self, hostname: impl Into<String>) -> Self {
        self.api_hostname = Some(hostname.into());
        self
    }

    pub fn app_name_prefix(mut self, prefix: impl Into<String>) -> Self {
        self.app_name_prefix = Some(prefix.into());
        self
    }

    pub fn http_client(mut self, http: reqwest::Client) -> Self {
        self.http = Some(http);
        self
    }

    pub fn build(self) -> DeployResult<Fly> {
        let api_token = self
            .api_token
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| DeployError::Config("FLY_API_TOKEN is required".into()))?;
        let org_slug = self
            .org_slug
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| DeployError::Config("FLY_ORG_SLUG is required".into()))?;
        let app_name_prefix = self
            .app_name_prefix
            .unwrap_or_else(|| "prd".into())
            .trim()
            .trim_matches('-')
            .to_ascii_lowercase();
        if app_name_prefix.is_empty() {
            return Err(DeployError::Config(
                "FLY_APP_NAME_PREFIX must not be empty".into(),
            ));
        }
        let base_url = Url::parse(
            self.api_hostname
                .unwrap_or_else(|| DEFAULT_API_HOSTNAME.into())
                .trim_end_matches('/'),
        )
        .map_err(|error| DeployError::Config(format!("invalid FLY_API_HOSTNAME: {error}")))?;
        let http = match self.http {
            Some(http) => http,
            None => reqwest::Client::builder()
                .user_agent(DEFAULT_USER_AGENT)
                .timeout(Duration::from_secs(30))
                .build()
                .map_err(|error| DeployError::Transport(error.to_string()))?,
        };

        Ok(Fly {
            inner: Arc::new(FlyInner {
                http,
                base_url,
                api_token,
                org_slug,
                app_name_prefix,
            }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_token() {
        assert!(Fly::builder()
            .org_slug("personal")
            .app_name_prefix("prd")
            .build()
            .is_err());
    }
}
