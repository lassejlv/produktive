use serde::Serialize;

/// Catalog of LLM models exposed by Produktive.
pub struct AiModelInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub provider: &'static str,
    pub input_usd_per_million: f64,
    pub cached_input_usd_per_million: f64,
    pub output_usd_per_million: f64,
    pub is_degrade_target: bool,
}

pub const AI_MODELS: &[AiModelInfo] = &[
    AiModelInfo {
        id: "gpt-5.5",
        name: "GPT-5.5",
        provider: "OpenAI",
        // Official OpenAI API pricing: https://openai.com/api/pricing/
        input_usd_per_million: 5.00,
        cached_input_usd_per_million: 0.50,
        output_usd_per_million: 30.00,
        is_degrade_target: false,
    },
    AiModelInfo {
        id: "gpt-5.4",
        name: "GPT-5.4",
        provider: "OpenAI",
        // Official OpenAI API pricing: https://openai.com/api/pricing/
        input_usd_per_million: 2.50,
        cached_input_usd_per_million: 0.25,
        output_usd_per_million: 15.00,
        is_degrade_target: false,
    },
    AiModelInfo {
        id: "gpt-5.4-mini",
        name: "GPT-5.4 mini",
        provider: "OpenAI",
        // Official OpenAI API pricing: https://openai.com/api/pricing/
        input_usd_per_million: 0.75,
        cached_input_usd_per_million: 0.075,
        output_usd_per_million: 4.50,
        is_degrade_target: true,
    },
];

pub const AI_USAGE_FEE_MULTIPLIER: f64 = 1.20;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AiPlan {
    Free,
    Pro,
}

impl AiPlan {
    pub fn from_str(value: &str) -> Self {
        match value {
            "pro" => Self::Pro,
            _ => Self::Free,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Free => "free",
            Self::Pro => "pro",
        }
    }

    pub fn weekly_limit(self) -> i64 {
        match self {
            Self::Free => 250_000,
            Self::Pro => 2_500_000,
        }
    }

    pub fn monthly_limit(self) -> i64 {
        match self {
            Self::Free => 1_000_000,
            Self::Pro => 10_000_000,
        }
    }

    pub fn can_use_model(self, model_id: &str) -> bool {
        match self {
            Self::Free => model_id == degrade_model_id(),
            Self::Pro => true,
        }
    }
}

pub fn model_info(model_id: &str) -> Option<&'static AiModelInfo> {
    AI_MODELS.iter().find(|model| model.id == model_id)
}

pub fn degrade_model_id() -> &'static str {
    AI_MODELS
        .iter()
        .find(|model| model.is_degrade_target)
        .map(|model| model.id)
        .unwrap_or("gpt-5.4-mini")
}

pub fn baseline_usd_per_million_units() -> f64 {
    model_info(degrade_model_id())
        .map(|model| model.input_usd_per_million * AI_USAGE_FEE_MULTIPLIER)
        .unwrap_or(1.0)
}
