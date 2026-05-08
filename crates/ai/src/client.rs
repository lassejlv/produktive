use crate::types::{AiError, CompletionResult, Message, Role, Tool, ToolCall, Usage};
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
            base_url: self::responses_base_url(base_url),
        })
    }

    pub async fn complete(
        &self,
        model: &str,
        system_prompt: &str,
        messages: &[Message],
        tools: &[Tool],
        reasoning_effort: Option<&str>,
    ) -> Result<CompletionResult, AiError> {
        let input = messages
            .iter()
            .flat_map(message_to_response_items)
            .collect::<Vec<_>>();

        let mut body = json!({
            "model": model,
            "instructions": system_prompt,
            "input": input,
        });

        if !tools.is_empty() {
            body["tools"] = json!(tools_to_response_wire(tools));
            body["tool_choice"] = json!("auto");
        }

        body["reasoning"] = json!({ "summary": "auto" });

        if let Some(reasoning_effort) = reasoning_effort
            .map(str::trim)
            .filter(|value| matches!(*value, "low" | "medium" | "high" | "xhigh"))
        {
            body["reasoning"] = json!({
                "effort": reasoning_effort,
                "summary": "auto",
            });
        }

        let url = format!("{}/responses", self.base_url);
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

        let parsed: ResponsesResponse = serde_json::from_str(&raw)?;
        response_to_completion(parsed)
    }
}

fn responses_base_url(base_url: &str) -> String {
    base_url
        .trim_end_matches('/')
        .strip_suffix("/chat/completions")
        .unwrap_or_else(|| base_url.trim_end_matches('/'))
        .trim_end_matches('/')
        .to_owned()
}

fn message_to_response_items(message: &Message) -> Vec<Value> {
    match message.role {
        Role::System => Vec::new(),
        Role::User => vec![json!({ "role": "user", "content": message.content })],
        Role::Assistant => {
            if message.tool_calls.is_empty() {
                vec![json!({ "role": "assistant", "content": message.content })]
            } else {
                message
                    .tool_calls
                    .iter()
                    .map(|call| {
                        json!({
                            "type": "function_call",
                            "call_id": call.id,
                            "name": call.name,
                            "arguments": call.arguments,
                        })
                    })
                    .collect()
            }
        }
        Role::Tool => vec![json!({
            "type": "function_call_output",
            "call_id": message.tool_call_id.clone().unwrap_or_default(),
            "output": message.content,
        })],
    }
}

fn tools_to_response_wire(tools: &[Tool]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            })
        })
        .collect()
}

fn response_to_completion(response: ResponsesResponse) -> Result<CompletionResult, AiError> {
    let mut text_parts = Vec::new();
    let mut calls = Vec::new();
    let mut reasoning_parts = Vec::new();

    for item in response.output {
        match item {
            ResponseOutputItem::Message { content, .. } => {
                for part in content {
                    if let Some(text) = part.text {
                        text_parts.push(text);
                    }
                }
            }
            ResponseOutputItem::FunctionCall {
                call_id,
                name,
                arguments,
                ..
            } => calls.push(ToolCall {
                id: call_id,
                name,
                arguments,
            }),
            ResponseOutputItem::Reasoning {
                summary, content, ..
            } => {
                for part in summary.into_iter().chain(content) {
                    if let Some(text) = part.text {
                        reasoning_parts.push(text);
                    }
                }
            }
            ResponseOutputItem::Other => {}
        }
    }

    if !calls.is_empty() {
        return Ok(CompletionResult::ToolCalls {
            calls,
            reasoning_content: join_text(reasoning_parts),
            usage: response.usage,
        });
    }

    let text = text_parts.join("");
    if !text.is_empty() {
        return Ok(CompletionResult::Text {
            text,
            reasoning_content: join_text(reasoning_parts),
            usage: response.usage,
        });
    }

    Err(AiError::EmptyOutput)
}

fn join_text(parts: Vec<String>) -> Option<String> {
    let joined = parts
        .into_iter()
        .map(|part| part.trim().to_owned())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    (!joined.is_empty()).then_some(joined)
}

#[derive(Deserialize)]
struct ResponsesResponse {
    #[serde(default)]
    output: Vec<ResponseOutputItem>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum ResponseOutputItem {
    #[serde(rename = "message")]
    Message {
        #[allow(dead_code)]
        role: Option<String>,
        #[serde(default)]
        content: Vec<ResponseContentPart>,
    },
    #[serde(rename = "function_call")]
    FunctionCall {
        #[allow(dead_code)]
        id: Option<String>,
        call_id: String,
        name: String,
        arguments: String,
    },
    #[serde(rename = "reasoning")]
    Reasoning {
        #[serde(default)]
        summary: Vec<ResponseContentPart>,
        #[serde(default)]
        content: Vec<ResponseContentPart>,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct ResponseContentPart {
    #[allow(dead_code)]
    #[serde(rename = "type", default)]
    kind: Option<String>,
    #[serde(default)]
    text: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_input_maps_assistant_tool_calls_to_function_calls() {
        let message = Message::assistant_tool_calls(vec![ToolCall {
            id: "call_1".to_owned(),
            name: "list_issues".to_owned(),
            arguments: "{}".to_owned(),
        }]);

        let wire = message_to_response_items(&message);

        assert_eq!(wire[0]["type"], "function_call");
        assert_eq!(wire[0]["call_id"], "call_1");
        assert_eq!(wire[0]["name"], "list_issues");
        assert_eq!(wire[0]["arguments"], "{}");
    }

    #[test]
    fn response_input_maps_tool_results_to_function_outputs() {
        let message = Message::tool_result("call_1", "{\"ok\":true}");

        let wire = message_to_response_items(&message);

        assert_eq!(wire[0]["type"], "function_call_output");
        assert_eq!(wire[0]["call_id"], "call_1");
        assert_eq!(wire[0]["output"], "{\"ok\":true}");
    }

    #[test]
    fn responses_response_decodes_tool_call_reasoning_content() {
        let parsed: ResponsesResponse = serde_json::from_value(json!({
            "output": [
                {
                    "type": "reasoning",
                    "summary": [{ "type": "summary_text", "text": "Need issue data before answering." }]
                },
                {
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "list_issues",
                    "arguments": "{}"
                }
            ]
        }))
        .expect("valid responses response");

        let result = response_to_completion(parsed).expect("completion");
        match result {
            CompletionResult::ToolCalls {
                calls,
                reasoning_content,
                ..
            } => {
                assert_eq!(calls[0].id, "call_1");
                assert_eq!(
                    reasoning_content.as_deref(),
                    Some("Need issue data before answering.")
                );
            }
            CompletionResult::Text { .. } => panic!("expected tool calls"),
        }
    }

    #[test]
    fn responses_response_decodes_text_and_usage() {
        let parsed: ResponsesResponse = serde_json::from_value(json!({
            "output": [{
                "type": "message",
                "role": "assistant",
                "content": [{ "type": "output_text", "text": "Done" }]
            }],
            "usage": {
                "input_tokens": 123,
                "output_tokens": 45,
                "total_tokens": 168
            }
        }))
        .expect("valid responses response");

        let result = response_to_completion(parsed).expect("completion");
        match result {
            CompletionResult::Text { text, usage, .. } => {
                assert_eq!(text, "Done");
                assert_eq!(
                    usage,
                    Some(Usage {
                        prompt_tokens: Some(123),
                        completion_tokens: Some(45),
                        total_tokens: Some(168),
                    })
                );
            }
            CompletionResult::ToolCalls { .. } => panic!("expected text"),
        }
    }

    #[test]
    fn strips_legacy_chat_completions_suffix_from_base_url() {
        assert_eq!(
            responses_base_url("https://api.openai.com/v1/chat/completions"),
            "https://api.openai.com/v1"
        );
    }
}
