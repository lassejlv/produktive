use std::sync::Arc;

use anyhow::{anyhow, Context as _};
use produktive_ai::Message as AiMessage;
use serenity::all::{
    AutoArchiveDuration, ChannelId, ChannelType, CommandInteraction, Context, CreateThread, Message,
};

use crate::commands::command_string_option;
use crate::state::{AgentThread, BotState};
use crate::{agent_respond, discord_truncate, linked_context};

pub async fn start_agent_thread(
    state: Arc<BotState>,
    ctx: &Context,
    command: &CommandInteraction,
) -> anyhow::Result<()> {
    let guild_id = command
        .guild_id
        .ok_or_else(|| anyhow!("Use this command in a server."))?
        .to_string();
    let discord_user_id = command.user.id.to_string();
    let prompt =
        command_string_option(command, "message").ok_or_else(|| anyhow!("Message is required."))?;
    let (server, _, _) = linked_context(&state, &guild_id, &discord_user_id).await?;
    if !server.agent_enabled {
        return Err(anyhow!("The agent is disabled in this server."));
    }

    let thread_name = agent_thread_name(&command.user.name, &prompt);
    let thread = command
        .channel_id
        .create_thread(
            &ctx.http,
            CreateThread::new(thread_name)
                .kind(ChannelType::PrivateThread)
                .invitable(false)
                .auto_archive_duration(AutoArchiveDuration::OneDay),
        )
        .await
        .context("failed to create private agent thread")?;
    thread
        .id
        .add_thread_member(&ctx.http, command.user.id)
        .await
        .context("failed to add you to the private agent thread")?;

    state.agent_threads.write().await.insert(
        thread.id,
        AgentThread {
            guild_id,
            owner_discord_user_id: discord_user_id.clone(),
            history: Vec::new(),
        },
    );

    respond_ephemeral(
        ctx,
        command,
        format!("Private agent thread created: <#{}>", thread.id.get()),
    )
    .await;

    let http = ctx.http.clone();
    tokio::spawn(async move {
        if let Err(error) = thread.id.say(&http, "Working on it...").await {
            tracing::warn!(%error, "failed to send Discord agent working message");
        }
        let reply = run_agent_thread_turn(state.clone(), thread.id, discord_user_id, prompt)
            .await
            .unwrap_or_else(|error| error.to_string());
        if let Err(error) = thread.id.say(&http, reply).await {
            tracing::warn!(%error, "failed to send Discord agent thread response");
        }
    });

    Ok(())
}

pub async fn handle_agent_thread_message(
    state: Arc<BotState>,
    ctx: &Context,
    msg: &Message,
) -> anyhow::Result<bool> {
    let session = state
        .agent_threads
        .read()
        .await
        .get(&msg.channel_id)
        .cloned();
    let Some(session) = session else {
        return Ok(false);
    };

    if msg.author.id.to_string() != session.owner_discord_user_id {
        return Ok(true);
    }
    let prompt = msg.content.trim().to_owned();
    if prompt.is_empty() {
        return Ok(true);
    }

    let thread_id = msg.channel_id;
    let discord_user_id = session.owner_discord_user_id;
    let http = ctx.http.clone();
    tokio::spawn(async move {
        let reply = run_agent_thread_turn(state, thread_id, discord_user_id, prompt)
            .await
            .unwrap_or_else(|error| error.to_string());
        if let Err(error) = thread_id.say(&http, reply).await {
            tracing::warn!(%error, "failed to send Discord agent follow-up response");
        }
    });

    Ok(true)
}

pub(crate) async fn respond_ephemeral(
    ctx: &Context,
    command: &CommandInteraction,
    content: String,
) {
    if let Err(error) = command
        .create_response(
            &ctx.http,
            serenity::all::CreateInteractionResponse::Message(
                serenity::all::CreateInteractionResponseMessage::new()
                    .content(discord_truncate(&content))
                    .ephemeral(true),
            ),
        )
        .await
    {
        tracing::warn!(%error, "failed to send Discord command response");
    }
}

async fn run_agent_thread_turn(
    state: Arc<BotState>,
    thread_id: ChannelId,
    discord_user_id: String,
    prompt: String,
) -> anyhow::Result<String> {
    let guild_id = state
        .agent_threads
        .read()
        .await
        .get(&thread_id)
        .map(|session| session.guild_id.clone())
        .ok_or_else(|| anyhow!("Agent thread session was not found."))?;
    let mut history = state
        .agent_threads
        .read()
        .await
        .get(&thread_id)
        .map(|session| session.history.clone())
        .unwrap_or_default();

    let reply = agent_respond(&state, &guild_id, &discord_user_id, prompt, &mut history).await?;
    let mut sessions = state.agent_threads.write().await;
    if let Some(session) = sessions.get_mut(&thread_id) {
        session.history = trim_agent_history(history);
    }
    Ok(reply)
}

fn trim_agent_history(mut history: Vec<AiMessage>) -> Vec<AiMessage> {
    const MAX_MESSAGES: usize = 32;
    if history.len() > MAX_MESSAGES {
        history.drain(0..history.len() - MAX_MESSAGES);
    }
    history
}

fn agent_thread_name(username: &str, prompt: &str) -> String {
    let summary = prompt
        .split_whitespace()
        .take(6)
        .collect::<Vec<_>>()
        .join(" ");
    let raw = if summary.is_empty() {
        format!("agent-{username}")
    } else {
        format!("agent-{username}-{summary}")
    };
    raw.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == ' ' {
                ch
            } else {
                '-'
            }
        })
        .take(90)
        .collect::<String>()
}
