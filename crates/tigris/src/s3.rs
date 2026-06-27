use std::convert::Infallible;

use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::config::Builder as S3ConfigBuilder;
use aws_sdk_s3::error::ProvideErrorMetadata;
use aws_sdk_s3::Client;
use aws_smithy_async::rt::sleep::TokioSleep;

use crate::error::{TigrisError, TigrisResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BucketAccess {
    Private,
    Public,
}

impl BucketAccess {
    pub fn parse(raw: &str) -> TigrisResult<Self> {
        match raw.trim().to_lowercase().as_str() {
            "private" => Ok(Self::Private),
            "public" => Ok(Self::Public),
            _ => Err(TigrisError::Message(
                "access must be 'private' or 'public'".into(),
            )),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Private => "private",
            Self::Public => "public",
        }
    }
}

pub async fn build_s3_client(
    access_key_id: &str,
    secret_access_key: &str,
    endpoint: &str,
) -> Client {
    let creds = Credentials::new(access_key_id, secret_access_key, None, None, "tigris");
    let shared = aws_config::defaults(BehaviorVersion::latest())
        .credentials_provider(creds)
        .region(aws_sdk_s3::config::Region::new("auto"))
        .load()
        .await;
    let conf = S3ConfigBuilder::from(&shared)
        .endpoint_url(endpoint.trim_end_matches('/'))
        .force_path_style(true)
        .sleep_impl(TokioSleep::new())
        .build();
    Client::from_conf(conf)
}

pub async fn create_bucket(
    client: &Client,
    bucket_name: &str,
    region: &str,
    access: BucketAccess,
) -> TigrisResult<()> {
    let region = region.trim().to_lowercase();
    let acl = match access {
        BucketAccess::Private => "private",
        BucketAccess::Public => "public-read",
    };

    client
        .create_bucket()
        .bucket(bucket_name)
        .customize()
        .map_request(move |mut req| {
            req.headers_mut().insert("x-tigris-regions", region.clone());
            req.headers_mut().insert("x-amz-acl", acl.to_owned());
            Result::<_, Infallible>::Ok(req)
        })
        .send()
        .await
        .map_err(map_s3_error)?;

    Ok(())
}

pub async fn delete_bucket(client: &Client, bucket_name: &str) -> TigrisResult<()> {
    match client.delete_bucket().bucket(bucket_name).send().await {
        Ok(_) => Ok(()),
        Err(err) if bucket_missing(&err) => Ok(()),
        Err(err) => Err(map_s3_error(err)),
    }
}

pub async fn bucket_size_bytes(client: &Client, bucket_name: &str) -> TigrisResult<u64> {
    let mut total = 0_u64;
    let mut continuation_token: Option<String> = None;

    loop {
        let mut request = client.list_objects_v2().bucket(bucket_name);
        if let Some(token) = continuation_token.as_deref() {
            request = request.continuation_token(token);
        }

        let response = match request.send().await {
            Ok(response) => response,
            Err(err) if list_bucket_missing(&err) => return Ok(0),
            Err(err) => return Err(map_s3_error(err)),
        };

        for object in response.contents() {
            if let Some(size) = object.size() {
                total = total.saturating_add(size.max(0) as u64);
            }
        }

        if response.is_truncated().unwrap_or(false) {
            continuation_token = response.next_continuation_token().map(str::to_owned);
            if continuation_token.is_none() {
                break;
            }
        } else {
            break;
        }
    }

    Ok(total)
}

fn bucket_missing(
    err: &aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::delete_bucket::DeleteBucketError>,
) -> bool {
    matches!(
        err.as_service_error(),
        Some(e) if e.code() == Some("NoSuchBucket")
    )
}

fn list_bucket_missing(
    err: &aws_sdk_s3::error::SdkError<aws_sdk_s3::operation::list_objects_v2::ListObjectsV2Error>,
) -> bool {
    matches!(
        err.as_service_error(),
        Some(e) if e.code() == Some("NoSuchBucket")
    )
}

fn map_s3_error<E>(err: aws_sdk_s3::error::SdkError<E>) -> TigrisError
where
    E: std::error::Error + ProvideErrorMetadata,
{
    TigrisError::S3(err.to_string())
}
