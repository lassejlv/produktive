mod agent_thread;
mod ai_usage;
mod commands;
mod env;
mod health;
mod state;

use agent_thread::{handle_agent_thread_message, respond_ephemeral, start_agent_thread};
use anyhow::{anyhow, Context as _};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration, Utc};
use commands::{
    agent_command, first_subcommand, issue_command, produktive_command, require_manage_guild,
    string_option, usage_command,
};
use env::{env_or_default, required_env};
use health::serve_http;
use produktive_ai::{AiClient, CompletionResult, Message as AiMessage, Tool, ToolCall};
use produktive_entity::{
    discord_link_state, discord_mention_issue, discord_server_link, discord_user_link, issue,
    issue_event, member, organization, user,
};
use rand_core::{OsRng, RngCore};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Database, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder,
    QuerySelect, Set,
};
use serde_json::{json, Value};
use serenity::{all::*, async_trait};
use state::BotState;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use uuid::Uuid;

struct Handler {
    state: Arc<BotState>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "produktive_discord_bot=info,serenity=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let token = required_env("DISCORD_BOT_TOKEN")?;
    let application_id = required_env("DISCORD_APPLICATION_ID")?
        .parse::<u64>()
        .context("DISCORD_APPLICATION_ID must be a Discord snowflake")?;
    let port = env_or_default("PORT", "3000")
        .parse::<u16>()
        .context("PORT must be a valid u16")?;
    let db = Database::connect(required_env("DATABASE_URL")?)
        .await
        .context("failed to connect to database")?;
    let app_url = env_or_default("APP_URL", "http://localhost:3000")
        .trim_end_matches('/')
        .to_owned();
    let ai = AiClient::new(
        &required_env("AI_API_KEY")?,
        &env_or_default("AI_BASE_URL", "https://api.openai.com/v1"),
    )
    .map_err(|error| anyhow!("failed to build AI client: {error}"))?;
    let state = Arc::new(BotState {
        db,
        app_url,
        ai,
        ai_model: env_or_default("AI_MODEL", "gpt-5.4-mini"),
        agent_threads: Arc::new(RwLock::new(HashMap::new())),
    });

    let intents =
        GatewayIntents::GUILDS | GatewayIntents::GUILD_MESSAGES | GatewayIntents::MESSAGE_CONTENT;
    let mut client = Client::builder(token, intents)
        .application_id(ApplicationId::new(application_id))
        .event_handler(Handler { state })
        .await
        .context("failed to create Discord client")?;

    tokio::select! {
        result = client.start() => {
            result.context("Discord client stopped")?;
        }
        result = serve_http(port) => {
            result.context("status server stopped")?;
        }
    }

    Ok(())
}

#[async_trait]
impl EventHandler for Handler {
    async fn ready(&self, ctx: Context, ready: Ready) {
        tracing::info!(bot = %ready.user.name, "Discord bot connected");
        if let Err(error) = Command::set_global_commands(
            &ctx.http,
            vec![
                produktive_command(),
                issue_command(),
                agent_command(),
                usage_command(),
            ],
        )
        .await
        {
            tracing::error!(%error, "failed to register Discord slash commands");
        }
    }

    async fn interaction_create(&self, ctx: Context, interaction: Interaction) {
        let Interaction::Command(command) = interaction else {
            return;
        };

        if command.data.name == "agent" {
            if let Err(error) = start_agent_thread(self.state.clone(), &ctx, &command).await {
                tracing::warn!(%error, "Discord agent command failed");
                respond_ephemeral(&ctx, &command, error.to_string()).await;
            }
            return;
        }

        let result = handle_command(&self.state, &ctx, &command).await;
        let content = match result {
            Ok(content) => content,
            Err(error) => {
                tracing::warn!(%error, command = %command.data.name, "Discord command failed");
                error.to_string()
            }
        };

        if let Err(error) = command
            .create_response(
                &ctx.http,
                CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new()
                        .content(content)
                        .ephemeral(true),
                ),
            )
            .await
        {
            tracing::warn!(%error, "failed to send Discord command response");
        }
    }

    async fn message(&self, ctx: Context, msg: Message) {
        if msg.author.bot || msg.guild_id.is_none() {
            return;
        }
        match handle_agent_thread_message(self.state.clone(), &ctx, &msg).await {
            Ok(true) => return,
            Ok(false) => {}
            Err(error) => tracing::warn!(%error, "failed to handle Discord agent thread message"),
        }
        let bot_id = ctx.cache.current_user().id;
        if !msg.mentions.iter().any(|user| user.id == bot_id) {
            return;
        }
        let content = strip_bot_mention(&msg.content, bot_id);
        let Some(request) = parse_mention_issue(&content) else {
            return;
        };
        let guild_id = msg.guild_id.expect("checked guild message");
        let result = create_issue_from_mention(
            &self.state,
            guild_id.to_string(),
            msg.channel_id.to_string(),
            msg.id.to_string(),
            msg.author.id.to_string(),
            request,
        )
        .await;
        let reply = match result {
            Ok(MentionCreateResult::Created(created)) => format!(
                "Created issue `{}` ({})",
                created.title,
                short_id(&created.id)
            ),
            Ok(MentionCreateResult::AlreadyHandled) => return,
            Err(error) => error.to_string(),
        };
        if let Err(error) = msg.channel_id.say(&ctx.http, reply).await {
            tracing::warn!(%error, "failed to send mention response");
        }
    }
}

async fn handle_command(
    state: &BotState,
    _ctx: &Context,
    command: &CommandInteraction,
) -> anyhow::Result<String> {
    let guild_id = command
        .guild_id
        .ok_or_else(|| anyhow!("Use this command in a server."))?
        .to_string();
    let discord_user_id = command.user.id.to_string();

    match command.data.name.as_str() {
        "produktive" => match first_subcommand(command)?.name.as_str() {
            "login" => create_login_link(state, &guild_id, &discord_user_id).await,
            "workspace" => {
                require_manage_guild(command)?;
                create_login_link(state, &guild_id, &discord_user_id).await
            }
            "status" => status_message(state, &guild_id, &discord_user_id).await,
            "usage" => usage_message(state, &guild_id, &discord_user_id).await,
            "agent-enable" => {
                require_manage_guild(command)?;
                set_agent_enabled(state, &guild_id, &discord_user_id, true).await
            }
            "agent-disable" => {
                require_manage_guild(command)?;
                set_agent_enabled(state, &guild_id, &discord_user_id, false).await
            }
            "unlink" => {
                require_manage_guild(command)?;
                unlink_server(state, &guild_id).await
            }
            _ => Ok("Unknown Produktive command.".to_owned()),
        },
        "issue" => {
            let sub = first_subcommand(command)?;
            match sub.name.as_str() {
                "list" => list_issues(state, &guild_id, &discord_user_id, sub).await,
                "create" => create_issue_command(state, &guild_id, &discord_user_id, sub).await,
                "update" => update_issue_command(state, &guild_id, &discord_user_id, sub).await,
                _ => Ok("Unknown issue command.".to_owned()),
            }
        }
        "usage" => usage_message(state, &guild_id, &discord_user_id).await,
        _ => Ok("Unknown command.".to_owned()),
    }
}

async fn create_login_link(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
) -> anyhow::Result<String> {
    let now = Utc::now().fixed_offset();
    let token = random_state();
    discord_link_state::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        state: Set(token.clone()),
        guild_id: Set(guild_id.to_owned()),
        discord_user_id: Set(discord_user_id.to_owned()),
        consumed_at: Set(None),
        expires_at: Set((Utc::now() + Duration::minutes(15)).fixed_offset()),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok(format!(
        "Open this link to select a Produktive workspace: {}/discord/link?state={}",
        state.app_url, token
    ))
}

async fn status_message(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
) -> anyhow::Result<String> {
    let server = discord_server_link::Entity::find()
        .filter(discord_server_link::Column::GuildId.eq(guild_id))
        .one(&state.db)
        .await?;
    let linked_user = discord_user_link::Entity::find()
        .filter(discord_user_link::Column::DiscordUserId.eq(discord_user_id))
        .one(&state.db)
        .await?;

    let Some(server) = server else {
        return Ok("This server is not linked. Run `/produktive login`.".to_owned());
    };
    let org = organization::Entity::find_by_id(&server.organization_id)
        .one(&state.db)
        .await?;
    let org_name = org
        .map(|org| org.name)
        .unwrap_or_else(|| "Unknown".to_owned());
    let user_status = if linked_user.is_some() {
        "linked"
    } else {
        "not linked"
    };
    Ok(format!(
        "Workspace: {org_name}\nAgent: {}\nYour account: {user_status}",
        if server.agent_enabled {
            "enabled"
        } else {
            "disabled"
        }
    ))
}

async fn usage_message(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
) -> anyhow::Result<String> {
    let (server, _, _) = linked_context(state, guild_id, discord_user_id).await?;
    let org = organization::Entity::find_by_id(&server.organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| anyhow!("Linked workspace was not found."))?;
    let usage = ai_usage::usage_status(state, &org.id).await?;
    let state_icon = if usage.blocked {
        "🔴"
    } else if usage.degraded {
        "🟡"
    } else {
        "🟢"
    };
    let state_label = if usage.blocked {
        "limit reached"
    } else if usage.degraded {
        "reduced"
    } else {
        "normal"
    };

    Ok(format!(
        "{state_icon} **AI usage** · {} · `{}`\n{}\n{}",
        org.name,
        usage.plan.as_str(),
        usage_line("Weekly", &usage.weekly),
        usage_line("Monthly", &usage.monthly),
    ) + &format!("\nStatus: {state_label}"))
}

fn usage_line(label: &str, period: &ai_usage::UsagePeriod) -> String {
    let reset_at = period.period_end.timestamp();
    let carryover = if period.carryover_units > 0 {
        format!(
            "\n↳ {} deducted after reset",
            format_units(period.carryover_units)
        )
    } else {
        String::new()
    };
    format!(
        "{}\n{} `{}` {} / {} · {:.1}% · resets <t:{}:R>{}",
        label,
        usage_bar(period.percent_used),
        usage_mood(period.percent_used),
        format_units(period.used_units),
        format_units(period.limit_units),
        period.percent_used,
        reset_at,
        carryover,
    )
}

fn usage_bar(percent: f64) -> String {
    const WIDTH: usize = 10;
    let filled = ((percent.clamp(0.0, 100.0) / 100.0) * WIDTH as f64).round() as usize;
    let fill = if percent >= 100.0 {
        "🟥"
    } else if percent >= 80.0 {
        "🟨"
    } else {
        "🟩"
    };
    let empty = "⬛";
    format!("{}{}", fill.repeat(filled), empty.repeat(WIDTH - filled))
}

fn usage_mood(percent: f64) -> &'static str {
    if percent >= 100.0 {
        "maxed"
    } else if percent >= 80.0 {
        "high"
    } else {
        "good"
    }
}

fn format_units(value: i64) -> String {
    let abs = value.abs();
    if abs >= 1_000_000 {
        format!("{:.1}M", value as f64 / 1_000_000.0)
    } else if abs >= 1_000 {
        format!("{:.1}K", value as f64 / 1_000.0)
    } else {
        value.to_string()
    }
}

async fn unlink_server(state: &BotState, guild_id: &str) -> anyhow::Result<String> {
    discord_server_link::Entity::delete_many()
        .filter(discord_server_link::Column::GuildId.eq(guild_id))
        .exec(&state.db)
        .await?;
    Ok("Discord server unlinked from Produktive.".to_owned())
}

pub(crate) async fn linked_context(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
) -> anyhow::Result<(discord_server_link::Model, user::Model, member::Model)> {
    let server = discord_server_link::Entity::find()
        .filter(discord_server_link::Column::GuildId.eq(guild_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| anyhow!("This server is not linked. Run `/produktive login`."))?;
    let link = discord_user_link::Entity::find()
        .filter(discord_user_link::Column::DiscordUserId.eq(discord_user_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| anyhow!("Your Discord user is not linked. Run `/produktive login`."))?;
    let user = user::Entity::find_by_id(&link.user_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| anyhow!("Linked Produktive user was not found. Run `/produktive login`."))?;
    let membership = member::Entity::find()
        .filter(member::Column::UserId.eq(&user.id))
        .filter(member::Column::OrganizationId.eq(&server.organization_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| {
            anyhow!("Your Produktive account is not a member of the linked workspace.")
        })?;
    Ok((server, user, membership))
}

async fn list_issues(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
    sub: &CommandDataOption,
) -> anyhow::Result<String> {
    let (server, _, _) = linked_context(state, guild_id, discord_user_id).await?;
    let mut select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&server.organization_id))
        .order_by_desc(issue::Column::CreatedAt)
        .limit(10);
    if let Some(status) = string_option(sub, "status").and_then(valid_status) {
        select = select.filter(issue::Column::Status.eq(status));
    }
    if let Some(priority) = string_option(sub, "priority").and_then(valid_priority) {
        select = select.filter(issue::Column::Priority.eq(priority));
    }
    let rows = select.all(&state.db).await?;
    if rows.is_empty() {
        return Ok("No matching issues.".to_owned());
    }
    Ok(rows
        .iter()
        .map(|issue| {
            format!(
                "- `{}` [{} / {}] {}",
                short_id(&issue.id),
                issue.status,
                issue.priority,
                issue.title
            )
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

async fn create_issue_command(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
    sub: &CommandDataOption,
) -> anyhow::Result<String> {
    let title = string_option(sub, "title").ok_or_else(|| anyhow!("Title is required."))?;
    let request = IssueRequest {
        title,
        description: string_option(sub, "description"),
        status: string_option(sub, "status")
            .and_then(valid_status)
            .unwrap_or_else(|| "backlog".to_owned()),
        priority: string_option(sub, "priority")
            .and_then(valid_priority)
            .unwrap_or_else(|| "medium".to_owned()),
    };
    let created = create_issue_from_discord(
        state,
        guild_id.to_owned(),
        discord_user_id.to_owned(),
        request,
    )
    .await?;
    Ok(format!(
        "Created issue `{}` ({})",
        created.title,
        short_id(&created.id)
    ))
}

async fn update_issue_command(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
    sub: &CommandDataOption,
) -> anyhow::Result<String> {
    let (server, actor, _) = linked_context(state, guild_id, discord_user_id).await?;
    let id = string_option(sub, "id").ok_or_else(|| anyhow!("Issue id is required."))?;
    let args = args_from_subcommand(sub);
    let updated = update_issue_fields(state, &server, &actor, &id, &args).await?;
    Ok(format!(
        "Updated issue `{}` ({})",
        updated.title,
        short_id(&updated.id)
    ))
}

fn args_from_subcommand(sub: &CommandDataOption) -> Value {
    let mut map = serde_json::Map::new();
    for name in ["title", "status", "priority"] {
        if let Some(value) = string_option(sub, name) {
            map.insert(name.to_owned(), json!(value));
        }
    }
    Value::Object(map)
}

async fn update_issue_fields(
    state: &BotState,
    server: &discord_server_link::Model,
    actor: &user::Model,
    id: &str,
    args: &Value,
) -> anyhow::Result<issue::Model> {
    let row = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&server.organization_id))
        .filter(issue::Column::Id.eq(id))
        .one(&state.db)
        .await?
        .ok_or_else(|| anyhow!("Issue not found."))?;
    let before = row.clone();
    let mut active = row.into_active_model();
    let mut changes = Vec::new();
    if let Some(title) = args
        .get("title")
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty())
    {
        changes.push(json!({ "field": "title", "before": before.title, "after": title.trim() }));
        active.title = Set(title.trim().to_owned());
    }
    if let Some(status) = args
        .get("status")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .and_then(valid_status)
    {
        changes.push(json!({ "field": "status", "before": before.status, "after": status }));
        active.status = Set(status);
    }
    if let Some(priority) = args
        .get("priority")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .and_then(valid_priority)
    {
        changes.push(json!({ "field": "priority", "before": before.priority, "after": priority }));
        active.priority = Set(priority);
    }
    if changes.is_empty() {
        return Err(anyhow!("No changes provided."));
    }
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;
    record_issue_event(
        state,
        &server.organization_id,
        &updated.id,
        Some(&actor.id),
        "updated",
        json!(changes),
    )
    .await?;
    Ok(updated)
}

async fn set_agent_enabled(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
    enabled: bool,
) -> anyhow::Result<String> {
    let (server, _, membership) = linked_context(state, guild_id, discord_user_id).await?;
    if membership.role != "owner" {
        return Err(anyhow!("Only workspace owners can change agent settings."));
    }
    let mut active = server.into_active_model();
    active.agent_enabled = Set(enabled);
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await?;
    Ok(format!(
        "Agent {}.",
        if enabled { "enabled" } else { "disabled" }
    ))
}

pub(crate) async fn agent_respond(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
    prompt: String,
    history: &mut Vec<AiMessage>,
    progress: Option<&AgentProgress>,
) -> anyhow::Result<AgentReply> {
    let (server, actor, _) = linked_context(state, guild_id, discord_user_id).await?;
    if !server.agent_enabled {
        return Err(anyhow!("The agent is disabled in this server."));
    }
    let org = organization::Entity::find_by_id(&server.organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| anyhow!("Linked workspace was not found."))?;
    let system = format!(
        "You are Produktive's Discord agent. Workspace: {} ({}). Current user: {} ({}). Be concise and practical. If the user asks to close, end, archive, or finish this Discord thread, call close_thread before your final response.",
        org.name, org.id, actor.name, actor.id
    );
    history.push(AiMessage::user(prompt));
    let tools = agent_tools();
    let mut close_thread = false;
    for _ in 0..5 {
        let result = ai_usage::complete(
            state,
            &org.id,
            &actor.id,
            &state.ai_model,
            &system,
            &history,
            &tools,
        )
        .await?;
        match result {
            CompletionResult::Text { text, .. } => {
                let text = discord_truncate(&text);
                history.push(AiMessage::assistant_text(text.clone()));
                return Ok(AgentReply {
                    content: text,
                    close_thread,
                });
            }
            CompletionResult::ToolCalls {
                calls,
                reasoning_content,
                ..
            } => {
                history.push(AiMessage::assistant_tool_calls_with_reasoning(
                    calls.clone(),
                    reasoning_content,
                ));
                for call in calls {
                    if let Some(progress) = progress {
                        progress.tool_started(&call.name).await;
                    }
                    let value = dispatch_agent_tool(state, &server, &actor, &call).await;
                    if let Some(progress) = progress {
                        progress.tool_finished(&call.name, &value).await;
                    }
                    if value
                        .get("will_close_thread")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                    {
                        close_thread = true;
                    }
                    let content = serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_owned());
                    history.push(AiMessage::tool_result(call.id, content));
                }
            }
        }
    }
    Ok(AgentReply {
        content: "The agent hit its tool-call limit before finishing. Try a narrower request."
            .to_owned(),
        close_thread,
    })
}

pub(crate) struct AgentReply {
    pub content: String,
    pub close_thread: bool,
}

pub(crate) struct AgentProgress {
    http: Arc<serenity::http::Http>,
    channel_id: ChannelId,
    state: Mutex<AgentProgressState>,
}

struct AgentProgressState {
    message_id: Option<MessageId>,
    steps: Vec<ToolActivity>,
}

struct ToolActivity {
    name: String,
    status: ToolActivityStatus,
    detail: String,
}

enum ToolActivityStatus {
    Running,
    Done,
    Failed,
}

impl AgentProgress {
    pub(crate) fn new(channel_id: ChannelId, http: Arc<serenity::http::Http>) -> Self {
        Self {
            http,
            channel_id,
            state: Mutex::new(AgentProgressState {
                message_id: None,
                steps: Vec::new(),
            }),
        }
    }

    async fn tool_started(&self, tool_name: &str) {
        let mut state = self.state.lock().await;
        state.steps.push(ToolActivity {
            name: tool_name.to_owned(),
            status: ToolActivityStatus::Running,
            detail: running_tool_label(tool_name),
        });
        self.flush(&mut state).await;
    }

    async fn tool_finished(&self, tool_name: &str, value: &Value) {
        let mut state = self.state.lock().await;
        if let Some(step) = state.steps.iter_mut().rev().find(|step| {
            step.name == tool_name && matches!(step.status, ToolActivityStatus::Running)
        }) {
            if let Some(error) = value.get("error").and_then(Value::as_str) {
                step.status = ToolActivityStatus::Failed;
                step.detail = format!("{} failed: {}", tool_display_name(tool_name), error);
            } else {
                step.status = ToolActivityStatus::Done;
                step.detail = finished_tool_label(tool_name, value);
            }
        }
        self.flush(&mut state).await;
    }

    async fn flush(&self, state: &mut AgentProgressState) {
        let content = render_tool_activity(&state.steps);
        if content.is_empty() {
            return;
        }
        if let Some(message_id) = state.message_id {
            if let Err(error) = self
                .channel_id
                .edit_message(&self.http, message_id, EditMessage::new().content(content))
                .await
            {
                tracing::warn!(%error, "failed to edit Discord agent activity message");
            }
            return;
        }

        match self
            .channel_id
            .send_message(&self.http, CreateMessage::new().content(content))
            .await
        {
            Ok(message) => state.message_id = Some(message.id),
            Err(error) => tracing::warn!(%error, "failed to create Discord agent activity message"),
        }
    }
}

fn render_tool_activity(steps: &[ToolActivity]) -> String {
    if steps.is_empty() {
        return String::new();
    }
    let mut lines = vec!["**Activity**".to_owned()];
    for step in steps
        .iter()
        .rev()
        .take(6)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
    {
        let icon = match step.status {
            ToolActivityStatus::Running => "⏳",
            ToolActivityStatus::Done => "✅",
            ToolActivityStatus::Failed => "⚠️",
        };
        lines.push(format!("{icon} {}", step.detail));
    }
    lines.join("\n")
}

fn running_tool_label(tool_name: &str) -> String {
    match tool_name {
        "list_issues" => "Looking up issues...".to_owned(),
        "create_issue" => "Creating issue...".to_owned(),
        "update_issue" => "Updating issue...".to_owned(),
        "close_thread" => "Closing thread after the reply...".to_owned(),
        other => format!("Running {}", tool_display_name(other)),
    }
}

fn finished_tool_label(tool_name: &str, value: &Value) -> String {
    match tool_name {
        "list_issues" => {
            let count = value
                .get("issues")
                .and_then(Value::as_array)
                .map(Vec::len)
                .unwrap_or(0);
            format!("Found {count} issue{}", if count == 1 { "" } else { "s" })
        }
        "create_issue" => value
            .get("issue")
            .map(issue_activity_label)
            .unwrap_or_else(|| "Created issue".to_owned()),
        "update_issue" => value
            .get("issue")
            .map(|issue| format!("Updated {}", issue_title_for_activity(issue)))
            .unwrap_or_else(|| "Updated issue".to_owned()),
        "close_thread" => "Thread will close after the reply".to_owned(),
        other => format!("Finished {}", tool_display_name(other)),
    }
}

fn issue_activity_label(issue: &Value) -> String {
    format!("Created {}", issue_title_for_activity(issue))
}

fn issue_title_for_activity(issue: &Value) -> String {
    let title = issue
        .get("title")
        .and_then(Value::as_str)
        .filter(|title| !title.trim().is_empty())
        .unwrap_or("issue");
    format!("issue `{}`", title.chars().take(80).collect::<String>())
}

fn tool_display_name(tool_name: &str) -> String {
    tool_name.replace('_', " ")
}

fn agent_tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "list_issues".to_owned(),
            description: "List issues in the linked Produktive workspace. Optional filters: status and priority.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "status": { "type": "string", "description": "backlog, todo, in-progress, or done" },
                    "priority": { "type": "string", "description": "low, medium, high, or urgent" }
                }
            }),
        },
        Tool {
            name: "create_issue".to_owned(),
            description: "Create an issue in the linked Produktive workspace.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "description": { "type": "string" },
                    "status": { "type": "string", "description": "Defaults to backlog" },
                    "priority": { "type": "string", "description": "Defaults to medium" }
                },
                "required": ["title"]
            }),
        },
        Tool {
            name: "update_issue".to_owned(),
            description: "Update an existing issue in the linked Produktive workspace. The id must be the full issue id from list_issues.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "title": { "type": "string" },
                    "status": { "type": "string" },
                    "priority": { "type": "string" }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "close_thread".to_owned(),
            description: "Close this private Discord agent thread after sending the final response. Use this when the user asks to close, archive, end, or finish the thread.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "reason": { "type": "string", "description": "Optional short reason for closing the thread." }
                }
            }),
        },
    ]
}

async fn dispatch_agent_tool(
    state: &BotState,
    server: &discord_server_link::Model,
    actor: &user::Model,
    call: &ToolCall,
) -> Value {
    let args = match serde_json::from_str::<Value>(&call.arguments) {
        Ok(value) => value,
        Err(error) => return json!({ "error": format!("Invalid JSON arguments: {error}") }),
    };
    match call.name.as_str() {
        "list_issues" => agent_list_issues(state, server, args).await,
        "create_issue" => agent_create_issue(state, server, actor, args).await,
        "update_issue" => agent_update_issue(state, server, actor, args).await,
        "close_thread" => json!({ "ok": true, "will_close_thread": true }),
        other => json!({ "error": format!("Unknown tool: {other}") }),
    }
}

async fn agent_list_issues(
    state: &BotState,
    server: &discord_server_link::Model,
    args: Value,
) -> Value {
    let mut select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&server.organization_id))
        .order_by_desc(issue::Column::CreatedAt)
        .limit(25);
    if let Some(status) = args
        .get("status")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .and_then(valid_status)
    {
        select = select.filter(issue::Column::Status.eq(status));
    }
    if let Some(priority) = args
        .get("priority")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .and_then(valid_priority)
    {
        select = select.filter(issue::Column::Priority.eq(priority));
    }
    match select.all(&state.db).await {
        Ok(rows) => json!({
            "issues": rows.into_iter().map(|issue| json!({
                "id": issue.id,
                "title": issue.title,
                "status": issue.status,
                "priority": issue.priority,
            })).collect::<Vec<_>>()
        }),
        Err(error) => json!({ "error": error.to_string() }),
    }
}

async fn agent_create_issue(
    state: &BotState,
    server: &discord_server_link::Model,
    actor: &user::Model,
    args: Value,
) -> Value {
    let Some(title) = args.get("title").and_then(Value::as_str) else {
        return json!({ "error": "title is required" });
    };
    let request = IssueRequest {
        title: title.to_owned(),
        description: args
            .get("description")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        status: args
            .get("status")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .and_then(valid_status)
            .unwrap_or_else(|| "backlog".to_owned()),
        priority: args
            .get("priority")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .and_then(valid_priority)
            .unwrap_or_else(|| "medium".to_owned()),
    };
    match create_issue_for_actor(state, server, actor, request).await {
        Ok(issue) => json!({ "issue": issue_json(issue) }),
        Err(error) => json!({ "error": error.to_string() }),
    }
}

async fn agent_update_issue(
    state: &BotState,
    server: &discord_server_link::Model,
    actor: &user::Model,
    args: Value,
) -> Value {
    let Some(id) = args.get("id").and_then(Value::as_str) else {
        return json!({ "error": "id is required" });
    };
    match update_issue_fields(state, server, actor, id, &args).await {
        Ok(issue) => json!({ "issue": issue_json(issue) }),
        Err(error) => json!({ "error": error.to_string() }),
    }
}

fn issue_json(issue: issue::Model) -> Value {
    json!({
        "id": issue.id,
        "title": issue.title,
        "status": issue.status,
        "priority": issue.priority,
    })
}

#[derive(Clone)]
struct IssueRequest {
    title: String,
    description: Option<String>,
    status: String,
    priority: String,
}

async fn create_issue_from_discord(
    state: &BotState,
    guild_id: String,
    discord_user_id: String,
    request: IssueRequest,
) -> anyhow::Result<issue::Model> {
    let (server, actor, _) = linked_context(state, &guild_id, &discord_user_id).await?;
    create_issue_for_actor(state, &server, &actor, request).await
}

enum MentionCreateResult {
    Created(issue::Model),
    AlreadyHandled,
}

async fn create_issue_from_mention(
    state: &BotState,
    guild_id: String,
    channel_id: String,
    message_id: String,
    discord_user_id: String,
    request: IssueRequest,
) -> anyhow::Result<MentionCreateResult> {
    let (server, actor, _) = linked_context(state, &guild_id, &discord_user_id).await?;
    let now = Utc::now().fixed_offset();
    let claim = discord_mention_issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        guild_id: Set(guild_id),
        channel_id: Set(channel_id),
        message_id: Set(message_id),
        issue_id: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await;

    let claim = match claim {
        Ok(claim) => claim,
        Err(error) => {
            tracing::warn!(%error, "duplicate or failed Discord mention claim");
            return Ok(MentionCreateResult::AlreadyHandled);
        }
    };

    let issue = create_issue_for_actor(state, &server, &actor, request).await?;
    let mut active = claim.into_active_model();
    active.issue_id = Set(Some(issue.id.clone()));
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await?;
    Ok(MentionCreateResult::Created(issue))
}

async fn create_issue_for_actor(
    state: &BotState,
    server: &discord_server_link::Model,
    actor: &user::Model,
    request: IssueRequest,
) -> anyhow::Result<issue::Model> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err(anyhow!("Issue title is required."));
    }
    let now = Utc::now().fixed_offset();
    let row = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(server.organization_id.clone()),
        title: Set(title.chars().take(180).collect()),
        description: Set(request.description.and_then(|v| {
            let trimmed = v.trim().to_owned();
            (!trimmed.is_empty()).then_some(trimmed)
        })),
        status: Set(request.status),
        priority: Set(request.priority),
        created_by_id: Set(Some(actor.id.clone())),
        created_by_oauth_client_id: Set(None),
        assigned_to_id: Set(None),
        parent_id: Set(None),
        project_id: Set(None),
        attachments: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    record_issue_event(
        state,
        &server.organization_id,
        &row.id,
        Some(&actor.id),
        "created",
        json!([
            { "field": "title", "before": null, "after": row.title },
            { "field": "status", "before": null, "after": row.status },
            { "field": "priority", "before": null, "after": row.priority }
        ]),
    )
    .await?;
    Ok(row)
}

async fn record_issue_event(
    state: &BotState,
    organization_id: &str,
    issue_id: &str,
    actor_id: Option<&str>,
    action: &str,
    changes: Value,
) -> anyhow::Result<()> {
    issue_event::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        issue_id: Set(issue_id.to_owned()),
        actor_id: Set(actor_id.map(ToOwned::to_owned)),
        actor_oauth_client_id: Set(None),
        action: Set(action.to_owned()),
        changes: Set(changes),
        created_at: Set(Utc::now().fixed_offset()),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

fn parse_mention_issue(content: &str) -> Option<IssueRequest> {
    let mut text = content.trim();
    for prefix in ["create issue", "new issue", "issue", "bug:"] {
        if let Some(rest) = text.strip_prefix(prefix) {
            text = rest.trim_start_matches([':', '-', ' ']);
            break;
        }
    }
    if text.is_empty() {
        return None;
    }
    let lower = text.to_lowercase();
    let priority = if lower.contains("urgent") {
        "urgent"
    } else if lower.contains("high priority") || lower.contains("important") {
        "high"
    } else if lower.contains("low priority") {
        "low"
    } else {
        "medium"
    };
    Some(IssueRequest {
        title: text.to_owned(),
        description: Some(format!("Created from Discord mention: {text}")),
        status: "backlog".to_owned(),
        priority: priority.to_owned(),
    })
}

fn strip_bot_mention(content: &str, bot_id: UserId) -> String {
    content
        .replace(&format!("<@{}>", bot_id.get()), "")
        .replace(&format!("<@!{}>", bot_id.get()), "")
        .trim()
        .to_owned()
}

fn valid_status(value: String) -> Option<String> {
    let normalized = value.trim().to_lowercase();
    matches!(
        normalized.as_str(),
        "backlog" | "todo" | "in-progress" | "done"
    )
    .then_some(normalized)
}

fn valid_priority(value: String) -> Option<String> {
    let normalized = value.trim().to_lowercase();
    matches!(normalized.as_str(), "low" | "medium" | "high" | "urgent").then_some(normalized)
}

fn random_state() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn short_id(id: &str) -> String {
    id.chars().take(8).collect()
}

pub(crate) fn discord_truncate(text: &str) -> String {
    const LIMIT: usize = 1900;
    if text.chars().count() <= LIMIT {
        text.to_owned()
    } else {
        format!("{}...", text.chars().take(LIMIT - 3).collect::<String>())
    }
}
