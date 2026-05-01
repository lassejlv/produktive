use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const CHARS_PER_TOKEN: usize = 4;
const CREDIT_TOKEN_UNIT: u64 = 1_000;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderUsage {
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}

impl ProviderUsage {
    pub fn normalized(&self) -> Option<TokenUsage> {
        let prompt_tokens = self.prompt_tokens.unwrap_or_default();
        let completion_tokens = self.completion_tokens.unwrap_or_default();
        let total_tokens = self
            .total_tokens
            .unwrap_or_else(|| prompt_tokens.saturating_add(completion_tokens));

        if total_tokens == 0 {
            return None;
        }

        Some(TokenUsage {
            prompt_tokens,
            completion_tokens,
            total_tokens,
            source: UsageSource::Provider,
        })
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TokenUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub source: UsageSource,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageSource {
    Provider,
    #[default]
    Estimated,
}

impl UsageSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Provider => "provider",
            Self::Estimated => "estimated",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BillableMessage {
    pub content: String,
    pub reasoning_content: Option<String>,
    pub tool_call_arguments: Vec<String>,
}

impl BillableMessage {
    pub fn plain(content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            reasoning_content: None,
            tool_call_arguments: Vec::new(),
        }
    }

    fn char_count(&self) -> usize {
        self.content.chars().count()
            + self
                .reasoning_content
                .as_deref()
                .map(str::chars)
                .map(Iterator::count)
                .unwrap_or_default()
            + self
                .tool_call_arguments
                .iter()
                .map(|value| value.chars().count())
                .sum::<usize>()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BillableTool {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

impl BillableTool {
    fn char_count(&self) -> usize {
        self.name.chars().count()
            + self.description.chars().count()
            + self.parameters.to_string().chars().count()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UsageRound {
    pub system_prompt: String,
    pub history: Vec<BillableMessage>,
    pub tools: Vec<BillableTool>,
    pub completion: BillableMessage,
    pub provider_usage: Option<ProviderUsage>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChatTurnUsageInput {
    pub organization_id: String,
    pub chat_id: String,
    pub user_message_id: String,
    pub model: String,
    pub rounds: Vec<UsageRound>,
    pub tool_result_bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChatTurnUsage {
    pub organization_id: String,
    pub chat_id: String,
    pub user_message_id: String,
    pub external_id: String,
    pub model: String,
    pub credits: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub usage_source: UsageSource,
    pub tool_call_count: u64,
    pub tool_result_bytes: u64,
    pub round_count: u64,
    pub metadata: Value,
}

pub fn calculate_chat_turn_usage(input: ChatTurnUsageInput) -> ChatTurnUsage {
    let mut prompt_tokens = 0_u64;
    let mut completion_tokens = 0_u64;
    let mut total_tokens = 0_u64;
    let mut used_estimate = false;
    let mut tool_call_count = 0_u64;

    for round in &input.rounds {
        tool_call_count =
            tool_call_count.saturating_add(round.completion.tool_call_arguments.len() as u64);

        let usage = round
            .provider_usage
            .as_ref()
            .and_then(ProviderUsage::normalized)
            .unwrap_or_else(|| {
                used_estimate = true;
                estimate_round_tokens(round)
            });

        prompt_tokens = prompt_tokens.saturating_add(usage.prompt_tokens);
        completion_tokens = completion_tokens.saturating_add(usage.completion_tokens);
        total_tokens = total_tokens.saturating_add(usage.total_tokens);
    }

    let credits = total_tokens.div_ceil(CREDIT_TOKEN_UNIT).max(1);
    let usage_source = if used_estimate {
        UsageSource::Estimated
    } else {
        UsageSource::Provider
    };
    let external_id = format!("chat_turn:{}:{}", input.chat_id, input.user_message_id);

    let metadata = json!({
        "credits": credits,
        "model": input.model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "usage_source": usage_source.as_str(),
        "tool_call_count": tool_call_count,
        "tool_result_bytes": input.tool_result_bytes,
        "round_count": input.rounds.len() as u64,
        "chat_id": input.chat_id,
        "user_message_id": input.user_message_id,
    });

    ChatTurnUsage {
        organization_id: input.organization_id,
        chat_id: input.chat_id,
        user_message_id: input.user_message_id,
        external_id,
        model: input.model,
        credits,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        usage_source,
        tool_call_count,
        tool_result_bytes: input.tool_result_bytes,
        round_count: input.rounds.len() as u64,
        metadata,
    }
}

fn estimate_round_tokens(round: &UsageRound) -> TokenUsage {
    let prompt_chars = round.system_prompt.chars().count()
        + round
            .history
            .iter()
            .map(BillableMessage::char_count)
            .sum::<usize>()
        + round
            .tools
            .iter()
            .map(BillableTool::char_count)
            .sum::<usize>();
    let completion_chars = round.completion.char_count();

    let prompt_tokens = estimate_tokens(prompt_chars);
    let completion_tokens = estimate_tokens(completion_chars);

    TokenUsage {
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens.saturating_add(completion_tokens),
        source: UsageSource::Estimated,
    }
}

fn estimate_tokens(chars: usize) -> u64 {
    (chars as u64).div_ceil(CHARS_PER_TOKEN as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_usage_wins_when_available() {
        let usage = calculate_chat_turn_usage(ChatTurnUsageInput {
            organization_id: "org_1".to_owned(),
            chat_id: "chat_1".to_owned(),
            user_message_id: "msg_1".to_owned(),
            model: "glm-5.1".to_owned(),
            rounds: vec![UsageRound {
                system_prompt: "system".to_owned(),
                history: vec![BillableMessage::plain("hello")],
                tools: Vec::new(),
                completion: BillableMessage::plain("world"),
                provider_usage: Some(ProviderUsage {
                    prompt_tokens: Some(900),
                    completion_tokens: Some(250),
                    total_tokens: Some(1_150),
                }),
            }],
            tool_result_bytes: 0,
        });

        assert_eq!(usage.credits, 2);
        assert_eq!(usage.total_tokens, 1_150);
        assert_eq!(usage.usage_source, UsageSource::Provider);
    }

    #[test]
    fn falls_back_to_heuristic_usage() {
        let usage = calculate_chat_turn_usage(ChatTurnUsageInput {
            organization_id: "org_1".to_owned(),
            chat_id: "chat_1".to_owned(),
            user_message_id: "msg_1".to_owned(),
            model: "glm-5.1".to_owned(),
            rounds: vec![UsageRound {
                system_prompt: "a".repeat(2_000),
                history: vec![BillableMessage::plain("b".repeat(2_000))],
                tools: Vec::new(),
                completion: BillableMessage::plain("c".repeat(2_000)),
                provider_usage: None,
            }],
            tool_result_bytes: 0,
        });

        assert_eq!(usage.total_tokens, 1_500);
        assert_eq!(usage.credits, 2);
        assert_eq!(usage.usage_source, UsageSource::Estimated);
    }

    #[test]
    fn counts_tool_arguments_and_metadata() {
        let usage = calculate_chat_turn_usage(ChatTurnUsageInput {
            organization_id: "org_1".to_owned(),
            chat_id: "chat_1".to_owned(),
            user_message_id: "msg_1".to_owned(),
            model: "glm-5.1".to_owned(),
            rounds: vec![UsageRound {
                system_prompt: String::new(),
                history: Vec::new(),
                tools: vec![BillableTool {
                    name: "list_issues".to_owned(),
                    description: "List issues".to_owned(),
                    parameters: json!({"type": "object"}),
                }],
                completion: BillableMessage {
                    content: String::new(),
                    reasoning_content: Some("Need data".to_owned()),
                    tool_call_arguments: vec![r#"{"limit":10}"#.to_owned()],
                },
                provider_usage: None,
            }],
            tool_result_bytes: 123,
        });

        assert_eq!(usage.tool_call_count, 1);
        assert_eq!(usage.metadata["credits"], usage.credits);
        assert_eq!(usage.metadata["tool_result_bytes"], 123);
    }
}
