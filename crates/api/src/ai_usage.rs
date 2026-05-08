use crate::{
    ai_models::{
        baseline_usd_per_million_units, degrade_model_id, model_info, AI_USAGE_FEE_MULTIPLIER,
    },
    error::ApiError,
    state::AppState,
};
use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveDate, Utc, Weekday};
pub use produktive_ai::models::AiPlan;
use produktive_ai::{CompletionResult, Message, Tool, Usage};
use produktive_entity::{ai_usage_event, organization};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DeleteResult, EntityTrait, IntoActiveModel, QueryFilter,
    QueryOrder, Set,
};
use serde::Serialize;
use std::collections::BTreeMap;
use uuid::Uuid;

const DEGRADE_PERCENT: f64 = 80.0;
const BLOCK_PERCENT: f64 = 100.0;

#[derive(Clone, Debug)]
pub struct AiCompletionRequest<'a> {
    pub organization_id: &'a str,
    pub user_id: Option<&'a str>,
    pub requested_model_id: &'a str,
    pub source: &'a str,
    pub system_prompt: &'a str,
    pub messages: &'a [Message],
    pub tools: &'a [Tool],
    pub reasoning_effort: Option<&'a str>,
}

#[derive(Clone, Debug)]
pub struct MeteredCompletion {
    pub result: CompletionResult,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageStatus {
    pub plan: String,
    pub weekly: AiUsagePeriod,
    pub monthly: AiUsagePeriod,
    pub degraded: bool,
    pub blocked: bool,
    pub degrade_model_id: String,
    pub breakdown: Vec<AiUsageBreakdown>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsagePeriod {
    pub used_units: i64,
    pub limit_units: i64,
    pub carryover_units: i64,
    pub percent_used: f64,
    pub period_start: String,
    pub period_end: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageBreakdown {
    pub model_id: String,
    pub source: String,
    pub normalized_units: i64,
    pub total_tokens: i64,
    pub estimated_micro_usd: i64,
}

pub async fn complete(
    state: &AppState,
    request: AiCompletionRequest<'_>,
) -> Result<MeteredCompletion, ApiError> {
    let status = usage_status(state, request.organization_id).await?;
    if status.blocked {
        return Err(ApiError::RateLimited(
            "AI usage limit reached. Usage resets at the next weekly or monthly reset.".to_owned(),
        ));
    }

    let requested_model_id = if model_info(request.requested_model_id).is_some() {
        request.requested_model_id
    } else {
        &state.config.ai_model
    };
    let plan = AiPlan::from_str(&status.plan);
    let model_id = if !plan.can_use_model(requested_model_id) || status.degraded {
        degrade_model_id()
    } else {
        requested_model_id
    };

    let result = state
        .ai
        .complete(
            model_id,
            request.system_prompt,
            request.messages,
            request.tools,
            request.reasoning_effort,
        )
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!("AI request failed: {error}")))?;

    record_completion(
        state,
        request.organization_id,
        request.user_id,
        request.source,
        model_id,
        (requested_model_id != model_id).then_some(requested_model_id),
        completion_usage(&result),
    )
    .await?;

    Ok(MeteredCompletion { result })
}

pub async fn usage_status(
    state: &AppState,
    organization_id: &str,
) -> Result<AiUsageStatus, ApiError> {
    let org = organization::Entity::find_by_id(organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_owned()))?;
    let plan = AiPlan::from_str(&org.ai_plan);
    let now = Utc::now().fixed_offset();
    let week_start = week_start(now);
    let month_start = month_start(now);
    let week_carryover = carryover_units(
        state,
        organization_id,
        week_start,
        PeriodKind::Week,
        plan.weekly_limit(),
    )
    .await?;
    let month_carryover = carryover_units(
        state,
        organization_id,
        month_start,
        PeriodKind::Month,
        plan.monthly_limit(),
    )
    .await?;
    let week_used =
        sum_units(state, organization_id, week_start, PeriodKind::Week).await? + week_carryover;
    let month_used =
        sum_units(state, organization_id, month_start, PeriodKind::Month).await? + month_carryover;
    let weekly = period_response(
        week_used,
        plan.weekly_limit(),
        week_carryover,
        week_start,
        week_start + Duration::weeks(1),
    );
    let monthly = period_response(
        month_used,
        plan.monthly_limit(),
        month_carryover,
        month_start,
        next_month_start(month_start),
    );
    let blocked = weekly.percent_used >= BLOCK_PERCENT || monthly.percent_used >= BLOCK_PERCENT;
    let degraded = !blocked
        && (weekly.percent_used >= DEGRADE_PERCENT || monthly.percent_used >= DEGRADE_PERCENT);

    Ok(AiUsageStatus {
        plan: plan.as_str().to_owned(),
        weekly,
        monthly,
        degraded,
        blocked,
        degrade_model_id: degrade_model_id().to_owned(),
        breakdown: usage_breakdown(state, organization_id, month_start).await?,
    })
}

pub async fn update_plan(
    state: &AppState,
    organization_id: &str,
    plan: AiPlan,
) -> Result<organization::Model, ApiError> {
    let org = organization::Entity::find_by_id(organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_owned()))?;
    let mut active = org.into_active_model();
    active.ai_plan = Set(plan.as_str().to_owned());
    active.updated_at = Set(Utc::now().fixed_offset());
    Ok(active.update(&state.db).await?)
}

pub async fn reset_usage(
    state: &AppState,
    organization_id: &str,
    scope: AiUsageResetScope,
) -> Result<DeleteResult, ApiError> {
    let now = Utc::now().fixed_offset();
    let mut delete = ai_usage_event::Entity::delete_many()
        .filter(ai_usage_event::Column::OrganizationId.eq(organization_id));
    if scope == AiUsageResetScope::Weekly {
        delete = delete.filter(ai_usage_event::Column::WeekStart.eq(week_start(now)));
    }
    Ok(delete.exec(&state.db).await?)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AiUsageResetScope {
    Weekly,
    All,
}

async fn record_completion(
    state: &AppState,
    organization_id: &str,
    user_id: Option<&str>,
    source: &str,
    model_id: &str,
    requested_model_id: Option<&str>,
    usage: Option<&Usage>,
) -> Result<(), ApiError> {
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
    .await?;

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
    state: &AppState,
    organization_id: &str,
    period_start: DateTime<FixedOffset>,
    kind: PeriodKind,
) -> Result<i64, ApiError> {
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
    state: &AppState,
    organization_id: &str,
    current_start: DateTime<FixedOffset>,
    kind: PeriodKind,
    limit_units: i64,
) -> Result<i64, ApiError> {
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

    Ok(carryover_from_periods(periods.into_values(), limit_units))
}

fn carryover_from_periods(periods: impl IntoIterator<Item = i64>, limit_units: i64) -> i64 {
    periods
        .into_iter()
        .fold(0, |carryover, used| (carryover + used - limit_units).max(0))
}

async fn usage_breakdown(
    state: &AppState,
    organization_id: &str,
    month_start: DateTime<FixedOffset>,
) -> Result<Vec<AiUsageBreakdown>, ApiError> {
    let events = ai_usage_event::Entity::find()
        .filter(ai_usage_event::Column::OrganizationId.eq(organization_id))
        .filter(ai_usage_event::Column::MonthStart.eq(month_start))
        .order_by_desc(ai_usage_event::Column::CreatedAt)
        .all(&state.db)
        .await?;
    let mut grouped: BTreeMap<(String, String), AiUsageBreakdown> = BTreeMap::new();
    for event in events {
        let key = (event.model_id.clone(), event.source.clone());
        let entry = grouped.entry(key).or_insert_with(|| AiUsageBreakdown {
            model_id: event.model_id,
            source: event.source,
            normalized_units: 0,
            total_tokens: 0,
            estimated_micro_usd: 0,
        });
        entry.normalized_units += event.normalized_units;
        entry.total_tokens += event.total_tokens;
        entry.estimated_micro_usd += event.estimated_micro_usd;
    }
    let mut out: Vec<_> = grouped.into_values().collect();
    out.sort_by(|a, b| b.normalized_units.cmp(&a.normalized_units));
    out.truncate(12);
    Ok(out)
}

fn period_response(
    used_units: i64,
    limit_units: i64,
    carryover_units: i64,
    start: DateTime<FixedOffset>,
    end: DateTime<FixedOffset>,
) -> AiUsagePeriod {
    let percent_used = if limit_units <= 0 {
        0.0
    } else {
        ((used_units as f64 / limit_units as f64) * 1000.0).round() / 10.0
    };
    AiUsagePeriod {
        used_units,
        limit_units,
        carryover_units,
        percent_used,
        period_start: start.to_rfc3339(),
        period_end: end.to_rfc3339(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn mini_input_tokens_are_baseline_units() {
        let (units, micro_usd) = priced_usage("gpt-5.4-mini", 1_000_000, 0);
        assert_eq!(units, 1_000_000);
        assert_eq!(micro_usd, 900_000);
    }

    #[test]
    fn output_tokens_consume_more_units() {
        let (units, _) = priced_usage("gpt-5.4-mini", 0, 1_000_000);
        assert_eq!(units, 6_000_000);
    }

    #[test]
    fn overage_carries_into_next_period() {
        let carry = carryover_from_periods([294_100], 250_000);
        assert_eq!(carry, 44_100);
    }

    #[test]
    fn unused_period_capacity_reduces_prior_overage() {
        let cleared = carryover_from_periods([294_100, 30_000], 250_000);
        assert_eq!(cleared, 0);
    }

    #[test]
    fn periods_start_on_utc_calendar_boundaries() {
        let now = Utc
            .with_ymd_and_hms(2026, 5, 8, 7, 30, 0)
            .single()
            .unwrap()
            .fixed_offset();
        assert_eq!(week_start(now).to_rfc3339(), "2026-05-04T00:00:00+00:00");
        assert_eq!(month_start(now).to_rfc3339(), "2026-05-01T00:00:00+00:00");
    }
}
