use std::collections::HashMap;
use std::sync::Arc;

use produktive_ai::{AiClient, Message as AiMessage};
use sea_orm::DatabaseConnection;
use serenity::all::ChannelId;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct BotState {
    pub db: DatabaseConnection,
    pub app_url: String,
    pub ai: AiClient,
    pub ai_model: String,
    pub agent_threads: Arc<RwLock<HashMap<ChannelId, AgentThread>>>,
}

#[derive(Clone)]
pub struct AgentThread {
    pub guild_id: String,
    pub owner_discord_user_id: String,
    pub history: Vec<AiMessage>,
}
