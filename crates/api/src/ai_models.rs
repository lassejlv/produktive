/// Catalog of LLM models we expose to the frontend chat picker.
///
/// The chat send endpoint validates an incoming `model` field against this
/// list, and the `/api/ai/models` endpoint returns it for the picker UI.
/// The default model is determined by `state.config.ai_model` at runtime.
pub struct AiModelInfo {
    pub id: &'static str,
    pub name: &'static str,
}

pub const AI_MODELS: &[AiModelInfo] = &[
    AiModelInfo {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
    },
    AiModelInfo {
        id: "glm-5.1",
        name: "GLM 5.1",
    },
    AiModelInfo {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
    },
    AiModelInfo {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
    },
];
