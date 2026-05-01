use crate::{
    email::{send_progress_digest_email, ProgressDigest},
    error::ApiError,
    http::preferences::for_user as prefs_for_user,
    state::AppState,
};
use chrono::{DateTime, Datelike, Duration, FixedOffset, TimeZone, Utc};
use hmac::{Hmac, Mac};
use produktive_entity::{member, notification_preference, organization, session, user};
use rand_core::{OsRng, RngCore};
use sea_orm::{
    sea_query::{LockBehavior, LockType},
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseBackend, DatabaseConnection,
    EntityTrait, IntoActiveModel, QueryFilter, QueryOrder, QuerySelect, Set, Statement,
    TransactionTrait,
};
use serde::Serialize;
use sha2::Sha256;
use std::time::Duration as StdDuration;

const TICK_SECONDS: u64 = 300;
const BATCH_SIZE: u64 = 50;
const FIRST_SEND_DAYS_MIN: i64 = 2;
const FIRST_SEND_DAYS_MAX: i64 = 5;
const NEXT_SEND_DAYS_MIN: i64 = 5;
const NEXT_SEND_DAYS_MAX: i64 = 10;
const SEND_HOUR_MIN: u32 = 8;
const SEND_HOUR_MAX: u32 = 17;
const DEFAULT_LOOKBACK_DAYS: i64 = 14;
const PREVIEW_TITLES: usize = 5;

pub fn spawn_progress_digest_scheduler(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(StdDuration::from_secs(TICK_SECONDS));
        loop {
            ticker.tick().await;
            if let Err(error) = tick(&state).await {
                tracing::warn!(%error, "progress digest tick failed");
            }
        }
    });
}

async fn tick(state: &AppState) -> Result<(), anyhow::Error> {
    let now = Utc::now().fixed_offset();

    let due = claim_due(&state.db, now).await?;
    for prefs in due {
        let user_id = prefs.user_id.clone();
        if let Err(error) = process_user(state, prefs).await {
            tracing::warn!(user_id = %user_id, %error, "progress digest user failed");
        }
    }
    Ok(())
}

async fn claim_due(
    db: &DatabaseConnection,
    now: DateTime<FixedOffset>,
) -> Result<Vec<notification_preference::Model>, anyhow::Error> {
    let rows = notification_preference::Entity::find()
        .filter(notification_preference::Column::EmailProgress.eq(true))
        .filter(notification_preference::Column::EmailPaused.eq(false))
        .filter(
            notification_preference::Column::NextProgressEmailAt
                .is_null()
                .or(notification_preference::Column::NextProgressEmailAt.lte(now)),
        )
        .order_by_asc(notification_preference::Column::NextProgressEmailAt)
        .limit(BATCH_SIZE)
        .lock_with_behavior(LockType::Update, LockBehavior::SkipLocked)
        .all(db)
        .await?;
    Ok(rows)
}

async fn process_user(
    state: &AppState,
    prefs: notification_preference::Model,
) -> Result<(), anyhow::Error> {
    let txn = state.db.begin().await?;
    let now = Utc::now().fixed_offset();

    let mut active = prefs.clone().into_active_model();

    if prefs.next_progress_email_at.is_none() {
        let scheduled = jitter_future(now, FIRST_SEND_DAYS_MIN, FIRST_SEND_DAYS_MAX);
        active.next_progress_email_at = Set(Some(scheduled));
        active.updated_at = Set(now);
        active.update(&txn).await?;
        txn.commit().await?;
        return Ok(());
    }

    let user = user::Entity::find_by_id(&prefs.user_id).one(&txn).await?;
    let user = match user {
        Some(value) => value,
        None => {
            txn.commit().await?;
            return Ok(());
        }
    };

    let org_id = match resolve_org(&txn, &user.id).await? {
        Some(id) => id,
        None => {
            active.next_progress_email_at = Set(Some(jitter_future(
                now,
                NEXT_SEND_DAYS_MIN,
                NEXT_SEND_DAYS_MAX,
            )));
            active.updated_at = Set(now);
            active.update(&txn).await?;
            txn.commit().await?;
            return Ok(());
        }
    };

    let since = prefs
        .last_progress_email_at
        .unwrap_or(now - Duration::days(DEFAULT_LOOKBACK_DAYS));

    let aggregated = aggregate_progress(&txn, &user.id, &org_id, since).await?;

    if aggregated.is_empty() {
        active.next_progress_email_at = Set(Some(jitter_future(
            now,
            NEXT_SEND_DAYS_MIN,
            NEXT_SEND_DAYS_MAX,
        )));
        active.updated_at = Set(now);
        active.update(&txn).await?;
        txn.commit().await?;
        return Ok(());
    }

    let org = organization::Entity::find_by_id(&org_id).one(&txn).await?;
    let org_name = org
        .map(|o| o.name)
        .unwrap_or_else(|| "your workspace".into());

    let settings_url = format!("{}/account", state.config.app_url);
    let unsubscribe_url = build_unsubscribe_url(state, &user.id);

    let digest = ProgressDigest {
        closed_count: aggregated.closed_count,
        closed_titles: &aggregated.closed_titles,
        plate_count: aggregated.plate_count,
        plate_titles: &aggregated.plate_titles,
        comments_posted: aggregated.comments_posted,
        issues_touched: aggregated.issues_touched,
    };

    if let Err(error) = send_progress_digest_email(
        state,
        &user.email,
        &user.name,
        &org_name,
        &digest,
        &settings_url,
        &unsubscribe_url,
    )
    .await
    {
        // Don't advance timestamps on send failure — try again next tick.
        txn.rollback().await?;
        return Err(anyhow::anyhow!("send failed: {error}"));
    }

    active.last_progress_email_at = Set(Some(now));
    active.next_progress_email_at = Set(Some(jitter_future(
        now,
        NEXT_SEND_DAYS_MIN,
        NEXT_SEND_DAYS_MAX,
    )));
    active.updated_at = Set(now);
    active.update(&txn).await?;
    txn.commit().await?;
    Ok(())
}

async fn resolve_org<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<String>, anyhow::Error> {
    let recent_session = session::Entity::find()
        .filter(session::Column::UserId.eq(user_id))
        .filter(session::Column::RevokedAt.is_null())
        .order_by_desc(session::Column::UpdatedAt)
        .one(db)
        .await?;
    if let Some(s) = recent_session {
        return Ok(Some(s.active_organization_id));
    }
    let any_membership = member::Entity::find()
        .filter(member::Column::UserId.eq(user_id))
        .order_by_asc(member::Column::CreatedAt)
        .one(db)
        .await?;
    Ok(any_membership.map(|m| m.organization_id))
}

struct Aggregated {
    closed_count: usize,
    closed_titles: Vec<String>,
    plate_count: usize,
    plate_titles: Vec<String>,
    comments_posted: usize,
    issues_touched: usize,
}

impl Aggregated {
    fn is_empty(&self) -> bool {
        self.closed_count == 0
            && self.plate_count == 0
            && self.comments_posted == 0
            && self.issues_touched == 0
    }
}

async fn aggregate_progress<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    org_id: &str,
    since: DateTime<FixedOffset>,
) -> Result<Aggregated, anyhow::Error> {
    use produktive_entity::{issue, issue_comment};
    use sea_orm::{PaginatorTrait, QueryFilter as _};

    // Closed by user — JSONB containment check on issue_events.changes
    // @> '[{"field":"status","after":"done"}]' picks up status→done transitions.
    let closed_titles_rows = db
        .query_all(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT i.title
            FROM issue_events e
            JOIN issues i ON i.id = e.issue_id
            WHERE e.actor_id = $1
              AND e.organization_id = $2
              AND e.action = 'updated'
              AND e.created_at > $3
              AND e.changes @> '[{"field":"status","after":"done"}]'::jsonb
            ORDER BY e.created_at DESC
            LIMIT $4
            "#,
            [
                user_id.into(),
                org_id.into(),
                since.into(),
                ((PREVIEW_TITLES + 1) as i64).into(),
            ],
        ))
        .await?;
    let closed_titles: Vec<String> = closed_titles_rows
        .iter()
        .filter_map(|row| row.try_get::<String>("", "title").ok())
        .collect();

    let closed_count_row = db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(*)::bigint AS n
            FROM issue_events e
            WHERE e.actor_id = $1
              AND e.organization_id = $2
              AND e.action = 'updated'
              AND e.created_at > $3
              AND e.changes @> '[{"field":"status","after":"done"}]'::jsonb
            "#,
            [user_id.into(), org_id.into(), since.into()],
        ))
        .await?;
    let closed_count = closed_count_row
        .and_then(|row| row.try_get::<i64>("", "n").ok())
        .unwrap_or(0) as usize;

    // Issues still on plate, scoped to org
    let plate_models = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(org_id))
        .filter(issue::Column::AssignedToId.eq(user_id))
        .filter(
            issue::Column::Status
                .eq("todo")
                .or(issue::Column::Status.eq("in-progress"))
                .or(issue::Column::Status.eq("backlog")),
        )
        .order_by_desc(issue::Column::UpdatedAt)
        .limit((PREVIEW_TITLES + 1) as u64)
        .all(db)
        .await?;
    let plate_titles: Vec<String> = plate_models.iter().map(|i| i.title.clone()).collect();

    let plate_count = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(org_id))
        .filter(issue::Column::AssignedToId.eq(user_id))
        .filter(
            issue::Column::Status
                .eq("todo")
                .or(issue::Column::Status.eq("in-progress"))
                .or(issue::Column::Status.eq("backlog")),
        )
        .count(db)
        .await? as usize;

    // Comments posted in window, scoped to org
    let comments_posted = issue_comment::Entity::find()
        .filter(issue_comment::Column::AuthorId.eq(user_id))
        .filter(issue_comment::Column::OrganizationId.eq(org_id))
        .filter(issue_comment::Column::CreatedAt.gt(since))
        .count(db)
        .await? as usize;

    // Distinct issues touched (any update event) in window
    let touched_row = db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(DISTINCT issue_id)::bigint AS n
            FROM issue_events
            WHERE actor_id = $1
              AND organization_id = $2
              AND created_at > $3
            "#,
            [user_id.into(), org_id.into(), since.into()],
        ))
        .await?;
    let issues_touched = touched_row
        .and_then(|row| row.try_get::<i64>("", "n").ok())
        .unwrap_or(0) as usize;

    Ok(Aggregated {
        closed_count,
        closed_titles: closed_titles.into_iter().take(PREVIEW_TITLES).collect(),
        plate_count,
        plate_titles: plate_titles.into_iter().take(PREVIEW_TITLES).collect(),
        comments_posted,
        issues_touched,
    })
}

fn jitter_future(
    now: DateTime<FixedOffset>,
    days_min: i64,
    days_max: i64,
) -> DateTime<FixedOffset> {
    let days = rand_in_range_i64(days_min, days_max);
    let hour = rand_in_range_u32(SEND_HOUR_MIN, SEND_HOUR_MAX);
    let minute = (OsRng.next_u32() % 60) as u32;
    let target = now + Duration::days(days);
    Utc.with_ymd_and_hms(target.year(), target.month(), target.day(), hour, minute, 0)
        .single()
        .map(|t| t.fixed_offset())
        .unwrap_or(target)
}

fn rand_in_range_i64(min: i64, max: i64) -> i64 {
    debug_assert!(max >= min);
    let span = (max - min + 1) as u32;
    min + (OsRng.next_u32() % span) as i64
}

fn rand_in_range_u32(min: u32, max: u32) -> u32 {
    debug_assert!(max >= min);
    let span = max - min + 1;
    min + (OsRng.next_u32() % span)
}

fn build_unsubscribe_url(state: &AppState, user_id: &str) -> String {
    let token = sign_unsubscribe_token(&state.config.jwt_secret, user_id);
    format!(
        "{}/api/unsubscribe/progress?u={}&t={}",
        state.config.app_url, user_id, token
    )
}

pub fn sign_unsubscribe_token(secret: &str, user_id: &str) -> String {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(b"progress:");
    mac.update(user_id.as_bytes());
    let bytes = mac.finalize().into_bytes();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn verify_unsubscribe_token(secret: &str, user_id: &str, token: &str) -> bool {
    let expected = sign_unsubscribe_token(secret, user_id);
    constant_time_eq(expected.as_bytes(), token.as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsubscribe_tokens_are_user_scoped() {
        let secret = "a-secret-that-is-long-enough";
        let token = sign_unsubscribe_token(secret, "user_1");

        assert!(verify_unsubscribe_token(secret, "user_1", &token));
        assert!(!verify_unsubscribe_token(secret, "user_2", &token));
    }

    #[test]
    fn empty_digest_is_detected_before_sending() {
        let digest = Aggregated {
            closed_count: 0,
            closed_titles: Vec::new(),
            plate_count: 0,
            plate_titles: Vec::new(),
            comments_posted: 0,
            issues_touched: 0,
        };

        assert!(digest.is_empty());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerOutcome {
    pub sent: bool,
    pub reason: Option<&'static str>,
    pub sent_to: Option<String>,
    pub org_name: Option<String>,
    pub closed: usize,
    pub on_plate: usize,
    pub comments: usize,
    pub touched: usize,
}

/// Force-send a progress digest for a single user, bypassing scheduling and
/// opt-out checks. Used by the dev trigger endpoint. Always advances the
/// `last_progress_email_at` and `next_progress_email_at` columns to keep the
/// scheduler's view consistent with reality.
pub async fn trigger_for_user(state: &AppState, user_id: &str) -> Result<TriggerOutcome, ApiError> {
    let prefs = prefs_for_user(state, user_id).await?;

    let user = user::Entity::find_by_id(user_id).one(&state.db).await?;
    let user = match user {
        Some(value) => value,
        None => {
            return Ok(TriggerOutcome {
                sent: false,
                reason: Some("user not found"),
                sent_to: None,
                org_name: None,
                closed: 0,
                on_plate: 0,
                comments: 0,
                touched: 0,
            });
        }
    };

    let org_id = match resolve_org(&state.db, user_id).await? {
        Some(id) => id,
        None => {
            return Ok(TriggerOutcome {
                sent: false,
                reason: Some("user has no active session and no org membership"),
                sent_to: Some(user.email),
                org_name: None,
                closed: 0,
                on_plate: 0,
                comments: 0,
                touched: 0,
            });
        }
    };

    let now = Utc::now().fixed_offset();
    let since = prefs
        .last_progress_email_at
        .unwrap_or(now - Duration::days(DEFAULT_LOOKBACK_DAYS));
    let aggregated = aggregate_progress(&state.db, user_id, &org_id, since).await?;

    let org = organization::Entity::find_by_id(&org_id)
        .one(&state.db)
        .await?;
    let org_name = org
        .map(|o| o.name)
        .unwrap_or_else(|| "your workspace".into());

    let settings_url = format!("{}/account", state.config.app_url);
    let unsubscribe_url = build_unsubscribe_url(state, user_id);

    let digest = ProgressDigest {
        closed_count: aggregated.closed_count,
        closed_titles: &aggregated.closed_titles,
        plate_count: aggregated.plate_count,
        plate_titles: &aggregated.plate_titles,
        comments_posted: aggregated.comments_posted,
        issues_touched: aggregated.issues_touched,
    };

    send_progress_digest_email(
        state,
        &user.email,
        &user.name,
        &org_name,
        &digest,
        &settings_url,
        &unsubscribe_url,
    )
    .await?;

    let mut active = prefs.into_active_model();
    active.last_progress_email_at = Set(Some(now));
    active.next_progress_email_at = Set(Some(jitter_future(
        now,
        NEXT_SEND_DAYS_MIN,
        NEXT_SEND_DAYS_MAX,
    )));
    active.updated_at = Set(now);
    active.update(&state.db).await?;

    Ok(TriggerOutcome {
        sent: true,
        reason: None,
        sent_to: Some(user.email),
        org_name: Some(org_name),
        closed: aggregated.closed_count,
        on_plate: aggregated.plate_count,
        comments: aggregated.comments_posted,
        touched: aggregated.issues_touched,
    })
}
