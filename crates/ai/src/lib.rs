mod client;
pub mod models;
mod types;

pub use client::AiClient;
pub use types::{AiError, CompletionResult, Message, Role, Tool, ToolCall, Usage};
