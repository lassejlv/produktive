use std::sync::Arc;

use reqwest::Client as HttpClient;

use crate::error::{TigrisError, TigrisResult};
use crate::iam::{CreatedAccessKey, IamClient};
use crate::regions::validate_allowed_region;
use crate::s3::{self, BucketAccess};

#[derive(Debug, Clone)]
pub struct TigrisConfig {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub s3_endpoint: String,
    pub iam_endpoint: String,
}

pub struct TigrisClient {
    config: TigrisConfig,
    s3: aws_sdk_s3::Client,
    iam: IamClient,
}

impl TigrisClient {
    pub async fn new(config: TigrisConfig, http: HttpClient) -> Self {
        let s3 = s3::build_s3_client(
            &config.access_key_id,
            &config.secret_access_key,
            &config.s3_endpoint,
        )
        .await;
        let iam = IamClient::new(
            config.iam_endpoint.clone(),
            config.access_key_id.clone(),
            config.secret_access_key.clone(),
            http,
        );
        Self { config, s3, iam }
    }

    pub fn endpoint(&self) -> &str {
        self.config.s3_endpoint.as_str()
    }

    pub async fn create_bucket(
        &self,
        bucket_name: &str,
        region: &str,
        access: BucketAccess,
    ) -> TigrisResult<()> {
        validate_allowed_region(region).map_err(TigrisError::Message)?;
        s3::create_bucket(&self.s3, bucket_name, region, access).await
    }

    pub async fn delete_bucket(&self, bucket_name: &str) -> TigrisResult<()> {
        s3::delete_bucket(&self.s3, bucket_name).await
    }

    pub async fn create_access_key(
        &self,
        name: &str,
        bucket: &str,
    ) -> TigrisResult<CreatedAccessKey> {
        self.iam.create_access_key(name, bucket).await
    }

    pub async fn delete_access_key(&self, access_key_id: &str) -> TigrisResult<()> {
        self.iam.delete_access_key(access_key_id).await
    }
}

pub type SharedTigrisClient = Arc<TigrisClient>;
