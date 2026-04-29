use crate::types::{AiError, CompletionResult, Message, Role, Tool, ToolCall};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Clone)]
pub struct AiClient {
    http: reqwest::Client,
    base_url: String,
}

impl AiClient {
    pub fn new(api_key: &str, base_url: &str) -> Result<Self, AiError> {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {api_key}")).map_err(|_| AiError::Upstream {
                status: 0,
                body: "invalid AI_API_KEY characters".to_owned(),
            })?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let http = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(60))
            .build()?;

        Ok(Self {
            http,
            base_url: base_url.trim_end_matches('/').to_owned(),
        })
    }

    pub async fn complete(
        &self,
        model: &str,
        system_prompt: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<CompletionResult, AiError> {
        let mut wire_messages: Vec<Value> = Vec::with_capacity(messages.len() + 1);
        wire_messages.push(json!({ "role": "system", "content": system_prompt }));
        for message in messages {
            wire_messages.push(message_to_wire(message));
        }

        let mut body = json!({
            "model": model,
            "messages": wire_messages,
        });

        if !tools.is_empty() {
            body["tools"] = json!(tools_to_wire(tools));
            body["tool_choice"] = json!("auto");
        }

        let url = format!("{}/chat/completions", self.base_url);
        let response = self.http.post(&url).json(&body).send().await?;
        let status = response.status();
        let raw = response.text().await?;

        if !status.is_success() {
            tracing::warn!(%status, body = %raw, "ai upstream error");
            return Err(AiError::Upstream {
                status: status.as_u16(),
                body: raw,
            });
        }

        let parsed: ChatCompletionResponse = serde_json::from_str(&raw)?;
        let first = parsed
            .choices
            .into_iter()
            .next()
            .ok_or(AiError::EmptyChoices)?;

        if let Some(calls) = first.message.tool_calls {
            if !calls.is_empty() {
                let mapped = calls
                    .into_iter()
                    .map(|c| ToolCall {
                        id: c.id,
                        name: c.function.name,
                        arguments: c.function.arguments,
                    })
                    .collect();
                return Ok(CompletionResult::ToolCalls(mapped));
            }
        }

        Ok(CompletionResult::Text(
            first.message.content.unwrap_or_default(),
        ))
    }
}

fn message_to_wire(message: &Message) -> Value {
    match message.role {
        Role::System => json!({ "role": "system", "content": message.content }),
        Role::User => json!({ "role": "user", "content": message.content }),
        Role::Assistant => {
            if message.tool_calls.is_empty() {
                json!({ "role": "assistant", "content": message.content })
            } else {
                let calls: Vec<Value> = message
                    .tool_calls
                    .iter()
                    .map(|c| {
                        json!({
                            "id": c.id,
                            "type": "function",
                            "function": {
                                "name": c.name,
                                "arguments": c.arguments,
                            }
                        })
                    })
                    .collect();
                json!({
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": calls,
                })
            }
        }
        Role::Tool => json!({
            "role": "tool",
            "tool_call_id": message.tool_call_id.clone().unwrap_or_default(),
            "content": message.content,
        }),
    }
}

fn tools_to_wire(tools: &[Tool]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                }
            })
        })
        .collect()
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(Deserialize)]
struct ChatChoiceMessage {
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<ChatToolCall>>,
}

#[derive(Deserialize)]
struct ChatToolCall {
    id: String,
    #[allow(dead_code)]
    #[serde(rename = "type", default)]
    kind: Option<String>,
    function: ChatToolCallFunction,
}

#[derive(Deserialize)]
struct ChatToolCallFunction {
    name: String,
    arguments: String,
}
