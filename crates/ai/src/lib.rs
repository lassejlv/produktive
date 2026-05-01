mod client;
mod types;

pub use client::AiClient;
pub use types::{AiError, CompletionResult, Message, Role, Tool, ToolCall, Usage};
