use std::{collections::BTreeMap, sync::Arc, time::Duration};

use chrono::{DateTime, FixedOffset, Utc};
use deploy::{DeployError, DeployResult, LogLine, MetricPoint};
use reqwest::{Method, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use url::Url;

use crate::models::{
    AppResponse, CertificateResponse, CreateAppRequest, CreateAppResponse,
    CreateCertificateRequest, CreateMachineRequest, CreateVolumeRequest, MachineResponse,
    VolumeResponse,
};

const DEFAULT_API_HOSTNAME: &str = "https://api.machines.dev";
const DEFAULT_PLATFORM_API_HOSTNAME: &str = "https://api.fly.io";
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

    pub async fn list_platform_regions(&self) -> DeployResult<Vec<deploy::FlyPlatformRegion>> {
        fetch_platform_regions(
            &self.inner.http,
            self.inner.base_url.as_str(),
            Some(&self.inner.api_token),
        )
        .await
    }

    pub async fn ensure_public_ips(&self, app_name: &str) -> DeployResult<Vec<AllocatedIpAddress>> {
        let mut allocated = Vec::new();
        for kind in ["v6", "shared_v4"] {
            match self.allocate_ip(app_name, kind).await {
                Ok(Some(ip)) => allocated.push(ip),
                Ok(None) => {}
                Err(DeployError::Provider(message))
                    if is_already_allocated_error(&message)
                        || is_not_allocatable_error(&message) => {}
                Err(error) => return Err(error),
            }
        }
        Ok(allocated)
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

    pub async fn delete_app(&self, app_name: &str) -> DeployResult<()> {
        self.request::<(), serde_json::Value>(Method::DELETE, &format!("/v1/apps/{app_name}"), None)
            .await
            .map(|_| ())
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

    pub async fn delete_machine(&self, app_name: &str, machine_id: &str) -> DeployResult<()> {
        self.request::<(), serde_json::Value>(
            Method::DELETE,
            &format!("/v1/apps/{app_name}/machines/{machine_id}?force=true"),
            None,
        )
        .await
        .map(|_| ())
    }

    pub async fn create_volume(
        &self,
        app_name: &str,
        body: &CreateVolumeRequest,
    ) -> DeployResult<VolumeResponse> {
        self.request(
            Method::POST,
            &format!("/v1/apps/{app_name}/volumes"),
            Some(body),
        )
        .await
    }

    pub async fn delete_volume(&self, app_name: &str, volume_id: &str) -> DeployResult<()> {
        self.request::<(), serde_json::Value>(
            Method::DELETE,
            &format!("/v1/apps/{app_name}/volumes/{volume_id}?force=true"),
            None,
        )
        .await
        .map(|_| ())
    }

    pub async fn request_acme_certificate(
        &self,
        app_name: &str,
        hostname: &str,
    ) -> DeployResult<CertificateResponse> {
        self.request(
            Method::POST,
            &format!("/v1/apps/{app_name}/certificates/acme"),
            Some(&CreateCertificateRequest {
                hostname: hostname.to_owned(),
            }),
        )
        .await
    }

    pub async fn check_certificate(
        &self,
        app_name: &str,
        hostname: &str,
    ) -> DeployResult<CertificateResponse> {
        self.request::<(), CertificateResponse>(
            Method::POST,
            &format!("/v1/apps/{app_name}/certificates/{hostname}/check"),
            None,
        )
        .await
    }

    pub async fn delete_certificate(&self, app_name: &str, hostname: &str) -> DeployResult<()> {
        self.request::<(), serde_json::Value>(
            Method::DELETE,
            &format!("/v1/apps/{app_name}/certificates/{hostname}"),
            None,
        )
        .await
        .map(|_| ())
    }

    pub async fn logs(
        &self,
        app_name: &str,
        instance: Option<&str>,
        limit: u16,
    ) -> DeployResult<Vec<LogLine>> {
        let mut url = Url::parse(&format!(
            "{DEFAULT_PLATFORM_API_HOSTNAME}/api/v1/apps/{app_name}/logs"
        ))
        .map_err(|error| DeployError::Config(format!("invalid Fly logs URL: {error}")))?;
        {
            let mut query = url.query_pairs_mut();
            if let Some(instance) = instance.filter(|value| !value.trim().is_empty()) {
                query.append_pair("instance", instance);
            }
            query.append_pair("limit", &limit.clamp(1, 500).to_string());
        }

        let response = self
            .inner
            .http
            .get(url)
            .header("Authorization", self.inner.api_token.as_str())
            .send()
            .await
            .map_err(|error| DeployError::Transport(error.to_string()))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|error| DeployError::Transport(error.to_string()))?;
        if !status.is_success() {
            return Err(DeployError::Provider(format!(
                "Fly logs API {status}: {text}"
            )));
        }
        let payload: Value =
            serde_json::from_str(&text).map_err(|error| DeployError::Decode(error.to_string()))?;
        Ok(parse_log_payload(&payload))
    }

    pub async fn metrics(
        &self,
        app_name: &str,
        from: DateTime<FixedOffset>,
        to: DateTime<FixedOffset>,
    ) -> DeployResult<Vec<MetricPoint>> {
        let app = prometheus_label_value(app_name);
        let cpu_query = format!(
            r#"100 * sum(rate(fly_instance_cpu{{app="{app}",mode!="idle"}}[2m])) / sum(rate(fly_instance_cpu{{app="{app}"}}[2m]))"#
        );
        let memory_query = format!(
            r#"sum(fly_instance_memory_mem_total{{app="{app}"}} - fly_instance_memory_mem_available{{app="{app}"}}) / 1024 / 1024"#
        );
        let requests_query =
            format!(r#"sum(increase(fly_app_http_responses_count{{app="{app}"}}[1m]))"#);

        let cpu = self.prometheus_query_range(&cpu_query, from, to).await?;
        let memory = self.prometheus_query_range(&memory_query, from, to).await?;
        let requests = self
            .prometheus_query_range(&requests_query, from, to)
            .await?;
        Ok(merge_metric_series(cpu, memory, requests))
    }

    async fn prometheus_query_range(
        &self,
        query: &str,
        from: DateTime<FixedOffset>,
        to: DateTime<FixedOffset>,
    ) -> DeployResult<Vec<(DateTime<FixedOffset>, f64)>> {
        let mut url = Url::parse(&format!(
            "{DEFAULT_PLATFORM_API_HOSTNAME}/prometheus/{}/api/v1/query_range",
            self.inner.org_slug
        ))
        .map_err(|error| DeployError::Config(format!("invalid Fly metrics URL: {error}")))?;
        {
            let mut query_pairs = url.query_pairs_mut();
            query_pairs.append_pair("query", query);
            query_pairs.append_pair("start", &from.timestamp().to_string());
            query_pairs.append_pair("end", &to.timestamp().to_string());
            query_pairs.append_pair("step", "60");
        }

        let mut last_failure = None;
        let mut text = None;
        for authorization in fly_authorization_headers(&self.inner.api_token) {
            let response = self
                .inner
                .http
                .get(url.clone())
                .header("Authorization", authorization)
                .send()
                .await
                .map_err(|error| DeployError::Transport(error.to_string()))?;
            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| DeployError::Transport(error.to_string()))?;
            if status.is_success() {
                text = Some(response_text);
                break;
            }
            last_failure = Some(format!("Fly metrics API {status}: {response_text}"));
            if !matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
                break;
            }
        }
        let text = text.ok_or_else(|| {
            DeployError::Provider(
                last_failure.unwrap_or_else(|| "Fly metrics API request failed".into()),
            )
        })?;
        let payload: PrometheusRangeResponse =
            serde_json::from_str(&text).map_err(|error| DeployError::Decode(error.to_string()))?;
        if payload.status != "success" {
            return Err(DeployError::Provider(format!(
                "Fly metrics query failed: {}",
                payload
                    .error
                    .or(payload.error_type)
                    .unwrap_or_else(|| "unknown error".into())
            )));
        }
        Ok(payload
            .data
            .map(|data| parse_prometheus_values(&data.result))
            .unwrap_or_default())
    }

    async fn allocate_ip(
        &self,
        app_name: &str,
        kind: &str,
    ) -> DeployResult<Option<AllocatedIpAddress>> {
        let data: AllocateIpData = self
            .graphql(
                r#"
                mutation AllocateIp($input: AllocateIPAddressInput!) {
                    allocateIpAddress(input: $input) {
                        ipAddress {
                            id
                            address
                            type
                        }
                    }
                }
                "#,
                &AllocateIpVariables {
                    input: AllocateIpInput {
                        app_id: app_name,
                        kind,
                    },
                },
            )
            .await?;
        Ok(data
            .allocate_ip_address
            .and_then(|payload| payload.ip_address))
    }

    async fn graphql<V, T>(&self, query: &str, variables: &V) -> DeployResult<T>
    where
        V: Serialize,
        T: DeserializeOwned,
    {
        let url = Url::parse(&format!("{DEFAULT_PLATFORM_API_HOSTNAME}/graphql"))
            .map_err(|error| DeployError::Config(format!("invalid Fly GraphQL URL: {error}")))?;
        let mut last_failure = None;
        let mut text = None;
        for authorization in fly_authorization_headers(&self.inner.api_token) {
            let response = self
                .inner
                .http
                .post(url.clone())
                .header("Authorization", authorization)
                .json(&GraphqlRequest { query, variables })
                .send()
                .await
                .map_err(|error| DeployError::Transport(error.to_string()))?;
            let status = response.status();
            let response_text = response
                .text()
                .await
                .map_err(|error| DeployError::Transport(error.to_string()))?;
            if status.is_success() {
                text = Some(response_text);
                break;
            }
            last_failure = Some(format!("Fly GraphQL {status}: {response_text}"));
            if !matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
                break;
            }
        }
        let text = text.ok_or_else(|| {
            DeployError::Provider(
                last_failure.unwrap_or_else(|| "Fly GraphQL request failed".into()),
            )
        })?;
        let payload: GraphqlResponse<T> =
            serde_json::from_str(&text).map_err(|error| DeployError::Decode(error.to_string()))?;
        if let Some(errors) = payload.errors.filter(|errors| !errors.is_empty()) {
            let message = errors
                .into_iter()
                .map(|error| error.message)
                .collect::<Vec<_>>()
                .join("; ");
            return Err(DeployError::Provider(format!(
                "Fly GraphQL error: {message}"
            )));
        }
        payload
            .data
            .ok_or_else(|| DeployError::Decode("Fly GraphQL response missing data".into()))
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
        let mut last_failure = None;
        for authorization in fly_authorization_headers(&self.inner.api_token) {
            let mut request = self
                .inner
                .http
                .request(method.clone(), url.clone())
                .header("Authorization", authorization);
            if let Some(body) = body.as_ref() {
                request = request.json(body);
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
            if status.is_success() {
                if text.trim().is_empty() {
                    return serde_json::from_value(serde_json::Value::Null)
                        .map_err(|error| DeployError::Decode(error.to_string()));
                }
                return serde_json::from_str(&text)
                    .map_err(|error| DeployError::Decode(error.to_string()));
            }
            if status == StatusCode::NOT_FOUND {
                return Err(DeployError::NotFound("Fly resource not found".into()));
            }
            if status == StatusCode::TOO_MANY_REQUESTS {
                return Err(DeployError::RateLimited(
                    "Fly API rate limit exceeded".into(),
                ));
            }
            last_failure = Some(format!("Fly API {method} {path} {status}: {text}"));
            if !matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
                break;
            }
        }
        Err(DeployError::Provider(last_failure.unwrap_or_else(|| {
            format!("Fly API {method} {path} request failed")
        })))
    }
}

#[derive(Debug, Deserialize)]
struct PlatformRegionsResponse {
    #[serde(default, rename = "Regions")]
    regions: Vec<PlatformRegionRow>,
}

#[derive(Debug, Deserialize)]
struct PlatformRegionRow {
    code: String,
    name: String,
}

/// Lists Fly platform regions. Uses bearer auth when a token is provided.
pub async fn fetch_platform_regions(
    http: &reqwest::Client,
    base_url: &str,
    api_token: Option<&str>,
) -> DeployResult<Vec<deploy::FlyPlatformRegion>> {
    let url = format!("{}/v1/platform/regions", base_url.trim_end_matches('/'));
    let mut request = http.get(url);
    if let Some(token) = api_token.filter(|value| !value.trim().is_empty()) {
        request = request.bearer_auth(token);
    }
    let response = request
        .send()
        .await
        .map_err(|error| DeployError::Transport(error.to_string()))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| DeployError::Transport(error.to_string()))?;
    if !status.is_success() {
        return Err(DeployError::Provider(format!(
            "Fly platform regions API {status}: {text}"
        )));
    }
    let payload: PlatformRegionsResponse = serde_json::from_str(&text)
        .map_err(|error| DeployError::Decode(format!("Fly platform regions: {error}")))?;
    Ok(payload
        .regions
        .into_iter()
        .map(|region| deploy::FlyPlatformRegion {
            code: region.code,
            name: region.name,
        })
        .collect())
}

#[derive(Debug, Clone, Deserialize)]
pub struct AllocatedIpAddress {
    pub id: Option<String>,
    pub address: Option<String>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
}

#[derive(Serialize)]
struct GraphqlRequest<'a, V> {
    query: &'a str,
    variables: &'a V,
}

#[derive(Deserialize)]
struct GraphqlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GraphqlError>>,
}

#[derive(Deserialize)]
struct GraphqlError {
    message: String,
}

#[derive(Deserialize)]
struct PrometheusRangeResponse {
    status: String,
    data: Option<PrometheusRangeData>,
    error: Option<String>,
    #[serde(rename = "errorType")]
    error_type: Option<String>,
}

#[derive(Deserialize)]
struct PrometheusRangeData {
    result: Vec<PrometheusSeries>,
}

#[derive(Deserialize)]
struct PrometheusSeries {
    values: Vec<Value>,
}

#[derive(Serialize)]
struct AllocateIpVariables<'a> {
    input: AllocateIpInput<'a>,
}

#[derive(Serialize)]
struct AllocateIpInput<'a> {
    #[serde(rename = "appId")]
    app_id: &'a str,
    #[serde(rename = "type")]
    kind: &'a str,
}

#[derive(Deserialize)]
struct AllocateIpData {
    #[serde(rename = "allocateIpAddress")]
    allocate_ip_address: Option<AllocateIpPayload>,
}

#[derive(Deserialize)]
struct AllocateIpPayload {
    #[serde(rename = "ipAddress")]
    ip_address: Option<AllocatedIpAddress>,
}

fn is_already_allocated_error(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("already") && (message.contains("allocated") || message.contains("exists"))
}

fn is_not_allocatable_error(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("unavailable") && message.contains("shared_v4")
}

fn fly_authorization_headers(token: &str) -> Vec<String> {
    let token = token.trim();
    let mut headers = Vec::new();
    let mut push = |value: String| {
        if !headers.iter().any(|header| header == &value) {
            headers.push(value);
        }
    };

    if let Some(stripped) = token.strip_prefix("Bearer ") {
        push(token.to_owned());
        let stripped = stripped.trim();
        if let Some(fly_token) = stripped.strip_prefix("FlyV1 ") {
            push(stripped.to_owned());
            push(format!("Bearer {}", fly_token.trim()));
        } else {
            push(format!("FlyV1 {stripped}"));
        }
    } else if let Some(stripped) = token.strip_prefix("FlyV1 ") {
        push(token.to_owned());
        let stripped = stripped.trim();
        push(format!("Bearer {token}"));
        push(format!("Bearer {stripped}"));
    } else if token.starts_with("fm") {
        push(format!("FlyV1 {token}"));
        push(format!("Bearer {token}"));
    } else {
        push(format!("Bearer {token}"));
        push(format!("FlyV1 {token}"));
    }
    headers
}

fn prometheus_label_value(value: &str) -> String {
    value.replace('\\', r"\\").replace('"', r#"\""#)
}

fn parse_prometheus_values(series: &[PrometheusSeries]) -> Vec<(DateTime<FixedOffset>, f64)> {
    let mut values = BTreeMap::<i64, f64>::new();
    for item in series {
        for value in &item.values {
            let Some((timestamp, metric_value)) = parse_prometheus_sample(value) else {
                continue;
            };
            *values.entry(timestamp).or_default() += metric_value;
        }
    }
    values
        .into_iter()
        .filter_map(|(timestamp, value)| {
            DateTime::<Utc>::from_timestamp(timestamp, 0)
                .map(|timestamp| (timestamp.fixed_offset(), value))
        })
        .collect()
}

fn parse_prometheus_sample(value: &Value) -> Option<(i64, f64)> {
    let values = value.as_array()?;
    let timestamp = values.first().and_then(prometheus_timestamp)?;
    let metric_value = values.get(1).and_then(prometheus_f64)?;
    if metric_value.is_finite() {
        Some((timestamp, metric_value))
    } else {
        None
    }
}

fn prometheus_timestamp(value: &Value) -> Option<i64> {
    if let Some(timestamp) = value.as_i64() {
        return Some(timestamp);
    }
    if let Some(timestamp) = value.as_f64() {
        return Some(timestamp as i64);
    }
    value
        .as_str()?
        .parse::<f64>()
        .ok()
        .map(|value| value as i64)
}

fn prometheus_f64(value: &Value) -> Option<f64> {
    if let Some(value) = value.as_f64() {
        return Some(value);
    }
    value.as_str()?.parse().ok()
}

fn merge_metric_series(
    cpu: Vec<(DateTime<FixedOffset>, f64)>,
    memory: Vec<(DateTime<FixedOffset>, f64)>,
    requests: Vec<(DateTime<FixedOffset>, f64)>,
) -> Vec<MetricPoint> {
    let mut points = BTreeMap::<i64, MetricPoint>::new();
    apply_metric_series(&mut points, cpu, |point, value| {
        point.cpu_percent = Some(value.clamp(0.0, 100.0));
    });
    apply_metric_series(&mut points, memory, |point, value| {
        point.memory_mb = Some(value.max(0.0));
    });
    apply_metric_series(&mut points, requests, |point, value| {
        point.requests = Some(value.max(0.0));
    });
    points.into_values().collect()
}

fn apply_metric_series(
    points: &mut BTreeMap<i64, MetricPoint>,
    series: Vec<(DateTime<FixedOffset>, f64)>,
    apply: impl Fn(&mut MetricPoint, f64),
) {
    for (timestamp, value) in series {
        let key = timestamp.timestamp();
        let point = points.entry(key).or_insert_with(|| MetricPoint {
            timestamp,
            cpu_percent: None,
            memory_mb: None,
            requests: None,
        });
        apply(point, value);
    }
}

fn parse_log_payload(payload: &Value) -> Vec<LogLine> {
    let Some(rows) = payload.get("data").and_then(Value::as_array) else {
        return Vec::new();
    };
    rows.iter().filter_map(parse_log_entry).collect()
}

fn parse_log_entry(row: &Value) -> Option<LogLine> {
    let attributes = row.get("attributes").unwrap_or(row);
    let message = string_at(
        attributes,
        &[
            &["message"],
            &["msg"],
            &["text"],
            &["log"],
            &["line"],
            &["event", "message"],
        ],
    )?;
    let timestamp = value_at(
        attributes,
        &[
            &["timestamp"],
            &["time"],
            &["created_at"],
            &["createdAt"],
            &["event", "timestamp"],
        ],
    )
    .and_then(parse_timestamp)
    .unwrap_or_else(|| Utc::now().fixed_offset());
    let stream = string_at(
        attributes,
        &[&["stream"], &["source"], &["level"], &["event", "provider"]],
    )
    .unwrap_or_else(|| "stdout".into());
    let provider_instance_id = string_at(
        attributes,
        &[
            &["instance"],
            &["instance_id"],
            &["instanceId"],
            &["machine"],
            &["machine_id"],
            &["machineId"],
        ],
    );
    let source_id = string_at(row, &[&["id"]]).or_else(|| {
        Some(format!(
            "{}:{}:{}",
            timestamp.timestamp_nanos_opt().unwrap_or_default(),
            provider_instance_id.as_deref().unwrap_or("app"),
            message
        ))
    });

    let mut metadata = BTreeMap::new();
    for key in ["region", "level", "source", "stream"] {
        if let Some(value) = attributes.get(key) {
            metadata.insert(key.to_owned(), value.clone());
        }
    }
    if let Some(instance) = provider_instance_id.as_ref() {
        metadata.insert("provider_instance_id".into(), json!(instance));
    }

    Some(LogLine {
        timestamp,
        stream,
        message,
        source_id,
        provider_instance_id,
        metadata: Value::Object(metadata.into_iter().collect()),
    })
}

fn value_at<'a>(value: &'a Value, paths: &[&[&str]]) -> Option<&'a Value> {
    paths.iter().find_map(|path| {
        let mut cursor = value;
        for segment in *path {
            cursor = cursor.get(*segment)?;
        }
        Some(cursor)
    })
}

fn string_at(value: &Value, paths: &[&[&str]]) -> Option<String> {
    value_at(value, paths)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn parse_timestamp(value: &Value) -> Option<DateTime<FixedOffset>> {
    if let Some(raw) = value.as_str() {
        return DateTime::parse_from_rfc3339(raw).ok();
    }
    let nanos = value.as_i64()?;
    let seconds = nanos.div_euclid(1_000_000_000);
    let subsecond_nanos = nanos.rem_euclid(1_000_000_000) as u32;
    DateTime::<Utc>::from_timestamp(seconds, subsecond_nanos)
        .map(|timestamp| timestamp.fixed_offset())
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
