use anyhow::{anyhow, Context as _};
use axum::{routing::get, Json, Router};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration, Utc};
use produktive_ai::{AiClient, CompletionResult, Message as AiMessage, Tool, ToolCall};
use produktive_entity::{
    discord_link_state, discord_server_link, discord_user_link, issue, issue_event, member,
    organization, user,
};
use rand_core::{OsRng, RngCore};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Database, DatabaseConnection, EntityTrait, IntoActiveModel,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde_json::{json, Value};
use serenity::{all::*, async_trait};
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use uuid::Uuid;

#[derive(Clone)]
struct BotState {
    db: DatabaseConnection,
    app_url: String,
    ai: AiClient,
    ai_model: String,
}

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
        &env_or_default("AI_BASE_URL", "https://ollama.com/v1"),
    )
    .map_err(|error| anyhow!("failed to build AI client: {error}"))?;
    let state = Arc::new(BotState {
        db,
        app_url,
        ai,
        ai_model: env_or_default("AI_MODEL", "glm-5.1"),
    });

    let intents = GatewayIntents::GUILDS | GatewayIntents::GUILD_MESSAGES;
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

async fn serve_http(port: u16) -> anyhow::Result<()> {
    let app = Router::new().route("/status", get(status));
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr)
        .await
        .with_context(|| format!("failed to bind {addr}"))?;
    tracing::info!("Discord bot status server listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn status() -> Json<Value> {
    Json(json!({ "ok": true }))
}

#[async_trait]
impl EventHandler for Handler {
    async fn ready(&self, ctx: Context, ready: Ready) {
        tracing::info!(bot = %ready.user.name, "Discord bot connected");
        if let Err(error) = Command::set_global_commands(
            &ctx.http,
            vec![produktive_command(), issue_command(), agent_command()],
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
        let bot_id = ctx.cache.current_user().id;
        if !msg.mentions.iter().any(|user| user.id == bot_id) {
            return;
        }
        let content = strip_bot_mention(&msg.content, bot_id);
        let Some(request) = parse_mention_issue(&content) else {
            return;
        };
        let guild_id = msg.guild_id.expect("checked guild message");
        let result = create_issue_from_discord(
            &self.state,
            guild_id.to_string(),
            msg.author.id.to_string(),
            request,
        )
        .await;
        let reply = match result {
            Ok(created) => format!(
                "Created issue `{}` ({})",
                created.title,
                short_id(&created.id)
            ),
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
    let sub = first_subcommand(command)?;

    match command.data.name.as_str() {
        "produktive" => match sub.name.as_str() {
            "login" => create_login_link(state, &guild_id, &discord_user_id).await,
            "workspace" => {
                require_manage_guild(command)?;
                create_login_link(state, &guild_id, &discord_user_id).await
            }
            "status" => status_message(state, &guild_id, &discord_user_id).await,
            "unlink" => {
                require_manage_guild(command)?;
                unlink_server(state, &guild_id).await
            }
            _ => Ok("Unknown Produktive command.".to_owned()),
        },
        "issue" => match sub.name.as_str() {
            "list" => list_issues(state, &guild_id, &discord_user_id, sub).await,
            "create" => create_issue_command(state, &guild_id, &discord_user_id, sub).await,
            "update" => update_issue_command(state, &guild_id, &discord_user_id, sub).await,
            _ => Ok("Unknown issue command.".to_owned()),
        },
        "agent" => match sub.name.as_str() {
            "enable" => {
                require_manage_guild(command)?;
                set_agent_enabled(state, &guild_id, &discord_user_id, true).await
            }
            "disable" => {
                require_manage_guild(command)?;
                set_agent_enabled(state, &guild_id, &discord_user_id, false).await
            }
            "ask" => agent_ask(state, &guild_id, &discord_user_id, sub).await,
            _ => Ok("Unknown agent command.".to_owned()),
        },
        _ => Ok("Unknown command.".to_owned()),
    }
}

fn produktive_command() -> CreateCommand {
    CreateCommand::new("produktive")
        .description("Link and manage this Discord server")
        .add_option(CreateCommandOption::new(
            CommandOptionType::SubCommand,
            "login",
            "Link your Produktive account and select a workspace",
        ))
        .add_option(CreateCommandOption::new(
            CommandOptionType::SubCommand,
            "workspace",
            "Select or change the Produktive workspace for this server",
        ))
        .add_option(CreateCommandOption::new(
            CommandOptionType::SubCommand,
            "status",
            "Show the current Discord link status",
        ))
        .add_option(CreateCommandOption::new(
            CommandOptionType::SubCommand,
            "unlink",
            "Unlink this Discord server from Produktive",
        ))
}

fn issue_command() -> CreateCommand {
    CreateCommand::new("issue")
        .description("Work with Produktive issues")
        .add_option(
            CreateCommandOption::new(
                CommandOptionType::SubCommand,
                "list",
                "List workspace issues",
            )
            .add_sub_option(CreateCommandOption::new(
                CommandOptionType::String,
                "status",
                "backlog, todo, in-progress, or done",
            ))
            .add_sub_option(CreateCommandOption::new(
                CommandOptionType::String,
                "priority",
                "low, medium, high, or urgent",
            )),
        )
        .add_option(
            CreateCommandOption::new(CommandOptionType::SubCommand, "create", "Create an issue")
                .add_sub_option(
                    CreateCommandOption::new(CommandOptionType::String, "title", "Issue title")
                        .required(true),
                )
                .add_sub_option(CreateCommandOption::new(
                    CommandOptionType::String,
                    "description",
                    "Issue description",
                ))
                .add_sub_option(CreateCommandOption::new(
                    CommandOptionType::String,
                    "priority",
                    "low, medium, high, or urgent",
                ))
                .add_sub_option(CreateCommandOption::new(
                    CommandOptionType::String,
                    "status",
                    "backlog, todo, in-progress, or done",
                )),
        )
        .add_option(
            CreateCommandOption::new(CommandOptionType::SubCommand, "update", "Update an issue")
                .add_sub_option(
                    CreateCommandOption::new(CommandOptionType::String, "id", "Issue id")
                        .required(true),
                )
                .add_sub_option(CreateCommandOption::new(
                    CommandOptionType::String,
                    "title",
                    "New title",
                ))
                .add_sub_option(CreateCommandOption::new(
                    CommandOptionType::String,
                    "priority",
                    "low, medium, high, or urgent",
                ))
                .add_sub_option(CreateCommandOption::new(
                    CommandOptionType::String,
                    "status",
                    "backlog, todo, in-progress, or done",
                )),
        )
}

fn agent_command() -> CreateCommand {
    CreateCommand::new("agent")
        .description("Use the Produktive agent")
        .add_option(CreateCommandOption::new(
            CommandOptionType::SubCommand,
            "enable",
            "Enable the agent in this server",
        ))
        .add_option(CreateCommandOption::new(
            CommandOptionType::SubCommand,
            "disable",
            "Disable the agent in this server",
        ))
        .add_option(
            CreateCommandOption::new(
                CommandOptionType::SubCommand,
                "ask",
                "Ask the Produktive agent",
            )
            .add_sub_option(
                CreateCommandOption::new(CommandOptionType::String, "prompt", "Agent prompt")
                    .required(true),
            ),
        )
}

fn first_subcommand(command: &CommandInteraction) -> anyhow::Result<&CommandDataOption> {
    command
        .data
        .options
        .first()
        .ok_or_else(|| anyhow!("Choose a subcommand."))
}

fn sub_options(sub: &CommandDataOption) -> &[CommandDataOption] {
    match &sub.value {
        CommandDataOptionValue::SubCommand(options) => options,
        _ => &[],
    }
}

fn string_option(sub: &CommandDataOption, name: &str) -> Option<String> {
    sub_options(sub).iter().find_map(|option| {
        if option.name == name {
            option.value.as_str().map(ToOwned::to_owned)
        } else {
            None
        }
    })
}

fn require_manage_guild(command: &CommandInteraction) -> anyhow::Result<()> {
    let allowed = command
        .member
        .as_ref()
        .and_then(|member| member.permissions)
        .map(|permissions| permissions.administrator() || permissions.manage_guild())
        .unwrap_or(false);
    if allowed {
        Ok(())
    } else {
        Err(anyhow!(
            "You need Manage Server permission for this command."
        ))
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

async fn unlink_server(state: &BotState, guild_id: &str) -> anyhow::Result<String> {
    discord_server_link::Entity::delete_many()
        .filter(discord_server_link::Column::GuildId.eq(guild_id))
        .exec(&state.db)
        .await?;
    Ok("Discord server unlinked from Produktive.".to_owned())
}

async fn linked_context(
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

async fn agent_ask(
    state: &BotState,
    guild_id: &str,
    discord_user_id: &str,
    sub: &CommandDataOption,
) -> anyhow::Result<String> {
    let (server, actor, _) = linked_context(state, guild_id, discord_user_id).await?;
    if !server.agent_enabled {
        return Err(anyhow!("The agent is disabled in this server."));
    }
    let prompt = string_option(sub, "prompt").ok_or_else(|| anyhow!("Prompt is required."))?;
    let org = organization::Entity::find_by_id(&server.organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| anyhow!("Linked workspace was not found."))?;
    let system = format!(
        "You are Produktive's Discord agent. Workspace: {} ({}). Current user: {} ({}). Be concise and practical.",
        org.name, org.id, actor.name, actor.id
    );
    let mut history = vec![AiMessage::user(prompt)];
    let tools = agent_tools();
    for _ in 0..5 {
        let result = state
            .ai
            .complete(&state.ai_model, &system, &history, &tools)
            .await
            .map_err(|error| anyhow!("AI request failed: {error}"))?;
        match result {
            CompletionResult::Text { text, .. } => return Ok(discord_truncate(&text)),
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
                    let value = dispatch_agent_tool(state, &server, &actor, &call).await;
                    let content = serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_owned());
                    history.push(AiMessage::tool_result(call.id, content));
                }
            }
        }
    }
    Ok("The agent hit its tool-call limit before finishing. Try a narrower request.".to_owned())
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

fn discord_truncate(text: &str) -> String {
    const LIMIT: usize = 1900;
    if text.chars().count() <= LIMIT {
        text.to_owned()
    } else {
        format!("{}...", text.chars().take(LIMIT - 3).collect::<String>())
    }
}

fn required_env(key: &str) -> anyhow::Result<String> {
    std::env::var(key)
        .map(|value| value.trim().to_owned())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("{key} is required"))
}

fn env_or_default(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}
