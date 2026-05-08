use std::sync::Arc;

use anyhow::{anyhow, Context as _};
use produktive_ai::Message as AiMessage;
use produktive_entity::{chat, chat_access, chat_message};
use sea_orm::{ActiveModelTrait, EntityTrait, IntoActiveModel, Set};
use serenity::all::{
    AutoArchiveDuration, ChannelId, ChannelType, CommandInteraction, Context, CreateMessage,
    CreateThread, EditThread, Message,
};
use uuid::Uuid;

use crate::commands::command_string_option;
use crate::state::{AgentThread, BotState};
use crate::{agent_respond, discord_truncate, linked_context, AgentProgress, AgentReply};

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
    let (server, actor, _) = linked_context(&state, &guild_id, &discord_user_id).await?;
    if !server.agent_enabled {
        return Err(anyhow!("The agent is disabled in this server."));
    }

    let thread_name = agent_thread_name(&command.user.name, &prompt);
    let produktive_chat_id =
        create_produktive_chat(&state, &server.organization_id, &actor.id, &thread_name)
            .await
            .context("failed to create Produktive chat for Discord agent thread")?;
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
            produktive_chat_id,
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
        let typing = thread.id.start_typing(&http);
        let progress = AgentProgress::new(thread.id, http.clone());
        let turn = run_agent_thread_turn(
            state.clone(),
            thread.id,
            discord_user_id,
            prompt,
            Some(&progress),
        )
        .await
        .unwrap_or_else(|error| AgentReply {
            content: error.to_string(),
            close_thread: false,
            rename_thread: None,
        });
        typing.stop();
        maybe_rename_thread(thread.id, &http, turn.rename_thread.as_deref()).await;
        if let Err(error) = send_agent_reply(thread.id, &http, turn.content).await {
            tracing::warn!(%error, "failed to send Discord agent thread response");
        }
        if turn.close_thread {
            close_agent_thread(state, thread.id, &http).await;
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
        let typing = thread_id.start_typing(&http);
        let progress = AgentProgress::new(thread_id, http.clone());
        let turn = run_agent_thread_turn(
            state.clone(),
            thread_id,
            discord_user_id,
            prompt,
            Some(&progress),
        )
        .await
        .unwrap_or_else(|error| AgentReply {
            content: error.to_string(),
            close_thread: false,
            rename_thread: None,
        });
        typing.stop();
        maybe_rename_thread(thread_id, &http, turn.rename_thread.as_deref()).await;
        if let Err(error) = send_agent_reply(thread_id, &http, turn.content).await {
            tracing::warn!(%error, "failed to send Discord agent follow-up response");
        }
        if turn.close_thread {
            close_agent_thread(state, thread_id, &http).await;
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
    progress: Option<&AgentProgress>,
) -> anyhow::Result<AgentReply> {
    let session = state
        .agent_threads
        .read()
        .await
        .get(&thread_id)
        .cloned()
        .ok_or_else(|| anyhow!("Agent thread session was not found."))?;
    let guild_id = session.guild_id;
    let produktive_chat_id = session.produktive_chat_id;
    let mut history = session.history;

    insert_chat_message(&state, &produktive_chat_id, "user", &prompt).await?;
    let reply = agent_respond(
        &state,
        &guild_id,
        &discord_user_id,
        prompt,
        &mut history,
        progress,
    )
    .await?;
    insert_chat_message(&state, &produktive_chat_id, "assistant", &reply.content).await?;
    if let Some(title) = reply.rename_thread.as_deref() {
        update_produktive_chat_title(&state, &produktive_chat_id, title).await?;
    }
    let mut sessions = state.agent_threads.write().await;
    if let Some(session) = sessions.get_mut(&thread_id) {
        session.history = trim_agent_history(history);
    }
    Ok(reply)
}

async fn close_agent_thread(
    state: Arc<BotState>,
    thread_id: ChannelId,
    http: &std::sync::Arc<serenity::http::Http>,
) {
    if let Err(error) = thread_id
        .edit_thread(http, EditThread::new().archived(true))
        .await
    {
        tracing::warn!(%error, "failed to archive Discord agent thread");
        return;
    }
    state.agent_threads.write().await.remove(&thread_id);
}

async fn maybe_rename_thread(
    thread_id: ChannelId,
    http: &std::sync::Arc<serenity::http::Http>,
    title: Option<&str>,
) {
    let Some(title) = title else {
        return;
    };
    if let Err(error) = thread_id
        .edit_thread(http, EditThread::new().name(title))
        .await
    {
        tracing::warn!(%error, "failed to rename Discord agent thread");
    }
}

async fn send_agent_reply(
    thread_id: ChannelId,
    http: &std::sync::Arc<serenity::http::Http>,
    content: String,
) -> serenity::Result<Message> {
    thread_id
        .send_message(http, CreateMessage::new().content(content))
        .await
}

async fn create_produktive_chat(
    state: &BotState,
    organization_id: &str,
    user_id: &str,
    title: &str,
) -> anyhow::Result<String> {
    let now = chrono::Utc::now().fixed_offset();
    let chat_id = Uuid::new_v4().to_string();
    chat::ActiveModel {
        id: Set(chat_id.clone()),
        organization_id: Set(organization_id.to_owned()),
        created_by_id: Set(Some(user_id.to_owned())),
        title: Set(title.to_owned()),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    chat_access::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        chat_id: Set(chat_id.clone()),
        user_id: Set(user_id.to_owned()),
        granted_by_id: Set(Some(user_id.to_owned())),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(chat_id)
}

async fn insert_chat_message(
    state: &BotState,
    chat_id: &str,
    role: &str,
    content: &str,
) -> anyhow::Result<()> {
    chat_message::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        chat_id: Set(chat_id.to_owned()),
        role: Set(role.to_owned()),
        content: Set(content.to_owned()),
        tool_calls: Set(None),
        tool_call_id: Set(None),
        created_at: Set(chrono::Utc::now().fixed_offset()),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

async fn update_produktive_chat_title(
    state: &BotState,
    chat_id: &str,
    title: &str,
) -> anyhow::Result<()> {
    let Some(row) = chat::Entity::find_by_id(chat_id).one(&state.db).await? else {
        return Ok(());
    };
    let mut active = row.into_active_model();
    active.title = Set(title.to_owned());
    active.updated_at = Set(chrono::Utc::now().fixed_offset());
    active.update(&state.db).await?;
    Ok(())
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
