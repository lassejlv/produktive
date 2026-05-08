/// Catalog of LLM models we expose to the frontend chat picker.
///
/// The chat send endpoint validates an incoming `model` field against this
/// list, and the `/api/ai/models` endpoint returns it for the picker UI.
/// The default model is determined by `state.config.ai_model` at runtime.
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
