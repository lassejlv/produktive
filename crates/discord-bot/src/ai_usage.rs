use anyhow::{anyhow, Context as _};
use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveDate, Utc, Weekday};
use produktive_ai::{
    models::{
        baseline_usd_per_million_units, degrade_model_id, model_info, AiPlan,
        AI_USAGE_FEE_MULTIPLIER,
    },
    CompletionResult, Message, Tool, Usage,
};
use produktive_entity::{ai_usage_event, organization};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::state::BotState;

const DEGRADE_PERCENT: f64 = 80.0;
const BLOCK_PERCENT: f64 = 100.0;

pub struct UsageStatus {
    pub plan: AiPlan,
    pub weekly: UsagePeriod,
    pub monthly: UsagePeriod,
    pub degraded: bool,
    pub blocked: bool,
}

pub struct UsagePeriod {
    pub used_units: i64,
    pub limit_units: i64,
    pub carryover_units: i64,
    pub percent_used: f64,
    pub period_end: DateTime<FixedOffset>,
}

pub async fn complete(
    state: &BotState,
    organization_id: &str,
    user_id: &str,
    requested_model_id: &str,
    system_prompt: &str,
    messages: &[Message],
    tools: &[Tool],
) -> anyhow::Result<CompletionResult> {
    let status = usage_status(state, organization_id).await?;
    if status.blocked {
        return Err(anyhow!(
            "AI usage limit reached. Usage resets at the next weekly or monthly reset."
        ));
    }

    let configured_model_id = if model_info(requested_model_id).is_some() {
        requested_model_id
    } else {
        degrade_model_id()
    };
    let model_id = if !status.plan.can_use_model(configured_model_id) || status.degraded {
        degrade_model_id()
    } else {
        configured_model_id
    };

    let result = state
        .ai
        .complete(model_id, system_prompt, messages, tools, None)
        .await
        .map_err(|error| anyhow!("AI request failed: {error}"))?;

    record_completion(
        state,
        organization_id,
        Some(user_id),
        "discord",
        model_id,
        (requested_model_id != model_id).then_some(requested_model_id),
        completion_usage(&result),
    )
    .await?;

    Ok(result)
}

pub async fn usage_status(state: &BotState, organization_id: &str) -> anyhow::Result<UsageStatus> {
    let org = organization::Entity::find_by_id(organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| anyhow!("Linked workspace was not found."))?;
    let plan = AiPlan::from_str(&org.ai_plan);
    let now = Utc::now().fixed_offset();
    let current_week_start = week_start(now);
    let current_month_start = month_start(now);
    let week_carryover = carryover_units(
        state,
        organization_id,
        current_week_start,
        PeriodKind::Week,
        plan.weekly_limit(),
    )
    .await?;
    let week_used = sum_units(state, organization_id, current_week_start, PeriodKind::Week).await?
        + week_carryover;
    let month_carryover = carryover_units(
        state,
        organization_id,
        current_month_start,
        PeriodKind::Month,
        plan.monthly_limit(),
    )
    .await?;
    let month_used = sum_units(
        state,
        organization_id,
        current_month_start,
        PeriodKind::Month,
    )
    .await?
        + month_carryover;
    let week_percent = percent_used(week_used, plan.weekly_limit());
    let month_percent = percent_used(month_used, plan.monthly_limit());
    let blocked = week_percent >= BLOCK_PERCENT || month_percent >= BLOCK_PERCENT;
    let degraded =
        !blocked && (week_percent >= DEGRADE_PERCENT || month_percent >= DEGRADE_PERCENT);

    Ok(UsageStatus {
        plan,
        weekly: UsagePeriod {
            used_units: week_used,
            limit_units: plan.weekly_limit(),
            carryover_units: week_carryover,
            percent_used: week_percent,
            period_end: current_week_start + Duration::weeks(1),
        },
        monthly: UsagePeriod {
            used_units: month_used,
            limit_units: plan.monthly_limit(),
            carryover_units: month_carryover,
            percent_used: month_percent,
            period_end: next_month_start(current_month_start),
        },
        degraded,
        blocked,
    })
}

async fn record_completion(
    state: &BotState,
    organization_id: &str,
    user_id: Option<&str>,
    source: &str,
    model_id: &str,
    requested_model_id: Option<&str>,
    usage: Option<&Usage>,
) -> anyhow::Result<()> {
    let now = Utc::now().fixed_offset();
    let (prompt_tokens, completion_tokens, total_tokens, usage_missing) = usage_numbers(usage);
    let (normalized_units, estimated_micro_usd) = if usage_missing {
        (0, 0)
    } else {
        priced_usage(model_id, prompt_tokens, completion_tokens)
    };

    ai_usage_event::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        user_id: Set(user_id.map(ToOwned::to_owned)),
        source: Set(source.to_owned()),
        model_id: Set(model_id.to_owned()),
        requested_model_id: Set(requested_model_id.map(ToOwned::to_owned)),
        prompt_tokens: Set(prompt_tokens),
        completion_tokens: Set(completion_tokens),
        total_tokens: Set(total_tokens),
        normalized_units: Set(normalized_units),
        estimated_micro_usd: Set(estimated_micro_usd),
        usage_missing: Set(usage_missing),
        week_start: Set(week_start(now)),
        month_start: Set(month_start(now)),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await
    .context("failed to record Discord AI usage")?;

    if usage_missing {
        tracing::warn!(%organization_id, %model_id, %source, "AI provider response omitted usage");
    }

    Ok(())
}

fn completion_usage(result: &CompletionResult) -> Option<&Usage> {
    match result {
        CompletionResult::Text { usage, .. } | CompletionResult::ToolCalls { usage, .. } => {
            usage.as_ref()
        }
    }
}

fn usage_numbers(usage: Option<&Usage>) -> (i64, i64, i64, bool) {
    let Some(usage) = usage else {
        return (0, 0, 0, true);
    };
    let prompt = usage.prompt_tokens.unwrap_or(0) as i64;
    let completion = usage.completion_tokens.unwrap_or(0) as i64;
    let total = usage
        .total_tokens
        .unwrap_or_else(|| (prompt + completion) as u64) as i64;
    let missing = prompt == 0 && completion == 0 && total == 0;
    (prompt, completion, total, missing)
}

fn priced_usage(model_id: &str, prompt_tokens: i64, completion_tokens: i64) -> (i64, i64) {
    let model = model_info(model_id).unwrap_or_else(|| model_info(degrade_model_id()).unwrap());
    let input_cost = prompt_tokens as f64 * model.input_usd_per_million / 1_000_000.0;
    let output_cost = completion_tokens as f64 * model.output_usd_per_million / 1_000_000.0;
    let cost_usd = (input_cost + output_cost) * AI_USAGE_FEE_MULTIPLIER;
    let normalized_units = (cost_usd * 1_000_000.0 / baseline_usd_per_million_units()).round();
    let micro_usd = (cost_usd * 1_000_000.0).round();
    (normalized_units as i64, micro_usd as i64)
}

#[derive(Clone, Copy)]
enum PeriodKind {
    Week,
    Month,
}

async fn sum_units(
    state: &BotState,
    organization_id: &str,
    period_start: DateTime<FixedOffset>,
    kind: PeriodKind,
) -> anyhow::Result<i64> {
    let mut query = ai_usage_event::Entity::find()
        .filter(ai_usage_event::Column::OrganizationId.eq(organization_id));
    query = match kind {
        PeriodKind::Week => query.filter(ai_usage_event::Column::WeekStart.eq(period_start)),
        PeriodKind::Month => query.filter(ai_usage_event::Column::MonthStart.eq(period_start)),
    };
    Ok(query
        .all(&state.db)
        .await?
        .into_iter()
        .map(|event| event.normalized_units)
        .sum())
}

async fn carryover_units(
    state: &BotState,
    organization_id: &str,
    current_start: DateTime<FixedOffset>,
    kind: PeriodKind,
    limit_units: i64,
) -> anyhow::Result<i64> {
    if limit_units <= 0 {
        return Ok(0);
    }

    let events = ai_usage_event::Entity::find()
        .filter(ai_usage_event::Column::OrganizationId.eq(organization_id))
        .all(&state.db)
        .await?;
    let mut periods: BTreeMap<DateTime<FixedOffset>, i64> = BTreeMap::new();
    for event in events {
        let period_start = match kind {
            PeriodKind::Week => event.week_start,
            PeriodKind::Month => event.month_start,
        };
        if period_start < current_start {
            *periods.entry(period_start).or_default() += event.normalized_units;
        }
    }

    Ok(periods
        .into_values()
        .fold(0, |carryover, used| (carryover + used - limit_units).max(0)))
}

fn percent_used(used_units: i64, limit_units: i64) -> f64 {
    if limit_units <= 0 {
        0.0
    } else {
        ((used_units as f64 / limit_units as f64) * 1000.0).round() / 10.0
    }
}

fn week_start(now: DateTime<FixedOffset>) -> DateTime<FixedOffset> {
    let days_from_monday = match now.weekday() {
        Weekday::Mon => 0,
        Weekday::Tue => 1,
        Weekday::Wed => 2,
        Weekday::Thu => 3,
        Weekday::Fri => 4,
        Weekday::Sat => 5,
        Weekday::Sun => 6,
    };
    midnight(
        now.date_naive() - Duration::days(days_from_monday),
        now.offset().to_owned(),
    )
}

fn month_start(now: DateTime<FixedOffset>) -> DateTime<FixedOffset> {
    midnight(
        NaiveDate::from_ymd_opt(now.year(), now.month(), 1).expect("valid month start"),
        now.offset().to_owned(),
    )
}

fn next_month_start(start: DateTime<FixedOffset>) -> DateTime<FixedOffset> {
    let (year, month) = if start.month() == 12 {
        (start.year() + 1, 1)
    } else {
        (start.year(), start.month() + 1)
    };
    midnight(
        NaiveDate::from_ymd_opt(year, month, 1).expect("valid next month start"),
        start.offset().to_owned(),
    )
}

fn midnight(date: NaiveDate, offset: FixedOffset) -> DateTime<FixedOffset> {
    date.and_hms_opt(0, 0, 0)
        .expect("valid midnight")
        .and_local_timezone(offset)
        .single()
        .expect("fixed offset has one midnight")
}
