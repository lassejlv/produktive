use serde::{Deserialize, Serialize};

use crate::{DeployError, DeployResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentStatus {
    Queued,
    Provisioning,
    Pulling,
    Starting,
    Healthy,
    Live,
    Failed,
    RollingBack,
    RolledBack,
    Stopped,
}

impl DeploymentStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Provisioning => "provisioning",
            Self::Pulling => "pulling",
            Self::Starting => "starting",
            Self::Healthy => "healthy",
            Self::Live => "live",
            Self::Failed => "failed",
            Self::RollingBack => "rolling_back",
            Self::RolledBack => "rolled_back",
            Self::Stopped => "stopped",
        }
    }

    pub fn code(self) -> i16 {
        match self {
            Self::Queued => 0,
            Self::Provisioning => 1,
            Self::Pulling => 2,
            Self::Starting => 3,
            Self::Healthy => 4,
            Self::Live => 5,
            Self::Failed => 6,
            Self::RollingBack => 7,
            Self::RolledBack => 8,
            Self::Stopped => 9,
        }
    }

    pub fn from_code(code: i16) -> DeployResult<Self> {
        match code {
            0 => Ok(Self::Queued),
            1 => Ok(Self::Provisioning),
            2 => Ok(Self::Pulling),
            3 => Ok(Self::Starting),
            4 => Ok(Self::Healthy),
            5 => Ok(Self::Live),
            6 => Ok(Self::Failed),
            7 => Ok(Self::RollingBack),
            8 => Ok(Self::RolledBack),
            9 => Ok(Self::Stopped),
            _ => Err(DeployError::Validation(format!(
                "unknown deployment status code {code}"
            ))),
        }
    }

    pub fn from_provider_state(state: &str) -> Self {
        match state {
            "created" | "launching" | "replacing" => Self::Provisioning,
            "starting" => Self::Starting,
            "started" => Self::Live,
            "stopping" | "stopped" | "suspended" => Self::Stopped,
            "destroyed" => Self::Stopped,
            "failed" | "dead" => Self::Failed,
            _ => Self::Provisioning,
        }
    }
}

impl std::fmt::Display for DeploymentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_codes_round_trip() {
        for status in [
            DeploymentStatus::Queued,
            DeploymentStatus::Provisioning,
            DeploymentStatus::Pulling,
            DeploymentStatus::Starting,
            DeploymentStatus::Healthy,
            DeploymentStatus::Live,
            DeploymentStatus::Failed,
            DeploymentStatus::RollingBack,
            DeploymentStatus::RolledBack,
            DeploymentStatus::Stopped,
        ] {
            assert_eq!(DeploymentStatus::from_code(status.code()).unwrap(), status);
        }
    }

    #[test]
    fn maps_provider_states() {
        assert_eq!(
            DeploymentStatus::from_provider_state("started"),
            DeploymentStatus::Live
        );
        assert_eq!(
            DeploymentStatus::from_provider_state("dead"),
            DeploymentStatus::Failed
        );
        assert_eq!(
            DeploymentStatus::from_provider_state("starting"),
            DeploymentStatus::Starting
        );
    }
}
