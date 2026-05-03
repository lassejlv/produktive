use anyhow::anyhow;
use serenity::all::{
    CommandDataOption, CommandDataOptionValue, CommandInteraction, CommandOptionType,
    CreateCommand, CreateCommandOption,
};

pub fn produktive_command() -> CreateCommand {
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
            "agent-enable",
            "Enable the private thread agent in this server",
        ))
        .add_option(CreateCommandOption::new(
            CommandOptionType::SubCommand,
            "agent-disable",
            "Disable the private thread agent in this server",
        ))
        .add_option(CreateCommandOption::new(
            CommandOptionType::SubCommand,
            "unlink",
            "Unlink this Discord server from Produktive",
        ))
}

pub fn issue_command() -> CreateCommand {
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

pub fn agent_command() -> CreateCommand {
    CreateCommand::new("agent")
        .description("Start a private Produktive agent thread")
        .add_option(
            CreateCommandOption::new(
                CommandOptionType::String,
                "message",
                "What you want the Produktive agent to do",
            )
            .required(true),
        )
}

pub fn first_subcommand(command: &CommandInteraction) -> anyhow::Result<&CommandDataOption> {
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

pub fn string_option(sub: &CommandDataOption, name: &str) -> Option<String> {
    sub_options(sub).iter().find_map(|option| {
        if option.name == name {
            option.value.as_str().map(ToOwned::to_owned)
        } else {
            None
        }
    })
}

pub fn command_string_option(command: &CommandInteraction, name: &str) -> Option<String> {
    command.data.options.iter().find_map(|option| {
        if option.name == name {
            option.value.as_str().map(ToOwned::to_owned)
        } else {
            None
        }
    })
}

pub fn require_manage_guild(command: &CommandInteraction) -> anyhow::Result<()> {
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
