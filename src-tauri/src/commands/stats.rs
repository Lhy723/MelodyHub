// ═══════════════════════════════════════════════════════════════
// Melody Hub — Stats commands
// ═══════════════════════════════════════════════════════════════
// Reads from the MetricsStore, which loads recent JSONL history
// on startup — so the dashboard survives restarts. Returned
// structs are camelCase-serialized, matching the frontend types
// directly (no manual field remapping in the stores).
// ═══════════════════════════════════════════════════════════════

use std::collections::HashMap;

use chrono::{Duration, NaiveDate, NaiveDateTime, Utc};

use crate::proxy::SharedAppState;
use crate::types::{DailyUsage, RequestRecord, UsageStats};

#[tauri::command]
pub async fn get_stats(
    time_range: Option<String>,
    state: tauri::State<'_, SharedAppState>,
) -> Result<UsageStats, String> {
    let records = state.metrics.snapshot().await;
    compute_stats_for_range(&records, time_range.as_deref())
}

#[tauri::command]
pub async fn get_recent_requests(
    limit: u32,
    time_range: Option<String>,
    state: tauri::State<'_, SharedAppState>,
) -> Result<Vec<RequestRecord>, String> {
    let records = state.metrics.snapshot().await;
    let filtered = filter_records_by_range(&records, time_range.as_deref());
    // Return the most recent `limit` records within the range.
    let start = filtered.len().saturating_sub(limit as usize);
    Ok(filtered[start..].to_vec())
}

/// Daily usage for the heatmap, aggregated from all records
/// (in-memory + startup-loaded history).
#[tauri::command]
pub async fn get_daily_usage(
    state: tauri::State<'_, SharedAppState>,
    time_range: Option<String>,
) -> Result<Vec<DailyUsage>, String> {
    let records = state.metrics.snapshot().await;
    let filtered = filter_records_by_range(&records, time_range.as_deref());
    Ok(compute_daily_usage(&filtered, time_range.as_deref()))
}

/// Reset all in-memory statistics. Persisted JSONL files on disk
/// are left untouched (they remain available as historical logs).
#[tauri::command]
pub async fn reset_stats(state: tauri::State<'_, SharedAppState>) -> Result<(), String> {
    state.metrics.flush().await;
    state.metrics.clear().await;
    Ok(())
}

// ── Aggregation helpers ────────────────────────────────────

fn compute_stats(records: &[RequestRecord]) -> Result<UsageStats, String> {
    let aggregate = aggregate_stats(records);
    Ok(UsageStats {
        total_tokens: aggregate.total_tokens,
        total_requests: aggregate.total_requests,
        active_models: aggregate.active_models,
        avg_response_time: aggregate.avg_response_time,
        token_change: 0.0,
        request_change: 0.0,
        response_time_change: 0.0,
        response_time_trend: "up".into(),
    })
}

fn compute_stats_for_range(
    records: &[RequestRecord],
    time_range: Option<&str>,
) -> Result<UsageStats, String> {
    let Some(range) = time_range else {
        return compute_stats(records);
    };
    if range == "24h" {
        // Rolling 24h window vs the preceding 24h, compared on timestamps.
        let current = filter_since(records, hours_ago(24));
        let previous = filter_between(records, hours_ago(48), hours_ago(24));
        return Ok(compare_periods(&current, &previous));
    }
    let days = range_days(range);
    let today = Utc::now().date_naive();
    let current_start = today - Duration::days(days - 1);
    let previous_start = current_start - Duration::days(days);

    let current: Vec<_> = records
        .iter()
        .filter(|r| record_date(r).is_some_and(|d| d >= current_start && d <= today))
        .cloned()
        .collect();
    let previous: Vec<_> = records
        .iter()
        .filter(|r| {
            record_date(r).is_some_and(|d| d >= previous_start && d < current_start)
        })
        .cloned()
        .collect();

    Ok(compare_periods(&current, &previous))
}

fn compare_periods(current: &[RequestRecord], previous: &[RequestRecord]) -> UsageStats {
    let cur = aggregate_stats(current);
    let prev = aggregate_stats(previous);
    let response_delta = round1(cur.avg_response_time - prev.avg_response_time);

    UsageStats {
        total_tokens: cur.total_tokens,
        total_requests: cur.total_requests,
        active_models: cur.active_models,
        avg_response_time: cur.avg_response_time,
        token_change: percent_change(cur.total_tokens as f64, prev.total_tokens as f64),
        request_change: percent_change(
            cur.total_requests as f64,
            prev.total_requests as f64,
        ),
        response_time_change: response_delta,
        response_time_trend: if response_delta <= 0.0 { "up" } else { "down" }.into(),
    }
}

/// Filter records to those falling within the given time range
/// (e.g. "7d", "30d", "90d"). Returns all records when `time_range`
/// is `None`.
fn filter_records_by_range(
    records: &[RequestRecord],
    time_range: Option<&str>,
) -> Vec<RequestRecord> {
    let Some(range) = time_range else {
        return records.to_vec();
    };
    if range == "24h" {
        return filter_since(records, Utc::now().naive_utc() - Duration::hours(24));
    }
    let days = range_days(range);
    let today = Utc::now().date_naive();
    let start = today - Duration::days(days - 1);
    records
        .iter()
        .filter(|r| record_date(r).is_some_and(|d| d >= start && d <= today))
        .cloned()
        .collect()
}

#[derive(Default)]
struct AggregatedStats {
    total_tokens: i64,
    total_requests: i64,
    active_models: i32,
    avg_response_time: f64,
}

fn aggregate_stats(records: &[RequestRecord]) -> AggregatedStats {
    let total_tokens: i64 = records.iter().map(|r| r.tokens).sum();
    let total_requests = records.len() as i64;

    let mut models = std::collections::HashSet::new();
    for r in records {
        models.insert(r.model.clone());
    }

    let avg_latency = if records.is_empty() {
        0.0
    } else {
        let sum: i64 = records.iter().map(|r| r.latency_ms).sum();
        sum as f64 / records.len() as f64 / 1000.0 // ms → seconds
    };

    AggregatedStats {
        total_tokens,
        total_requests,
        active_models: models.len() as i32,
        avg_response_time: round1(avg_latency),
    }
}

fn range_days(range: &str) -> i64 {
    match range {
        "30d" => 30,
        "90d" => 90,
        _ => 7,
    }
}

fn percent_change(current: f64, previous: f64) -> f64 {
    if previous == 0.0 {
        if current == 0.0 {
            0.0
        } else {
            100.0
        }
    } else {
        round1(((current - previous) / previous) * 100.0)
    }
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn record_date(record: &RequestRecord) -> Option<NaiveDate> {
    if let Ok(dt) = NaiveDateTime::parse_from_str(&record.timestamp, "%Y-%m-%d %H:%M:%S")
    {
        return Some(dt.date());
    }
    if record.timestamp.len() >= 10 {
        return NaiveDate::parse_from_str(&record.timestamp[..10], "%Y-%m-%d").ok();
    }
    None
}

fn record_datetime(record: &RequestRecord) -> Option<NaiveDateTime> {
    if let Ok(dt) = NaiveDateTime::parse_from_str(&record.timestamp, "%Y-%m-%d %H:%M:%S")
    {
        return Some(dt);
    }
    record_date(record).and_then(|d| d.and_hms_opt(0, 0, 0))
}

fn hours_ago(hours: i64) -> NaiveDateTime {
    Utc::now().naive_utc() - Duration::hours(hours)
}

fn filter_since(records: &[RequestRecord], start: NaiveDateTime) -> Vec<RequestRecord> {
    records
        .iter()
        .filter(|r| record_datetime(r).is_some_and(|ts| ts >= start))
        .cloned()
        .collect()
}

fn filter_between(
    records: &[RequestRecord],
    start: NaiveDateTime,
    end: NaiveDateTime,
) -> Vec<RequestRecord> {
    records
        .iter()
        .filter(|r| record_datetime(r).is_some_and(|ts| ts >= start && ts < end))
        .cloned()
        .collect()
}

fn compute_daily_usage(
    records: &[RequestRecord],
    time_range: Option<&str>,
) -> Vec<DailyUsage> {
    // 24h 视图按小时分桶（“YYYY-MM-DD HH:00”），其余按天。
    let hourly = time_range == Some("24h");
    let mut daily: HashMap<String, (i64, i64)> = HashMap::new();
    for r in records {
        let key = if hourly {
            if r.timestamp.len() >= 13 {
                format!("{}:00", &r.timestamp[..13])
            } else {
                r.timestamp.clone()
            }
        } else if r.timestamp.len() >= 10 {
            r.timestamp[..10].to_string()
        } else {
            r.timestamp.clone()
        };
        let entry = daily.entry(key).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += r.tokens;
    }

    let mut result: Vec<DailyUsage> = daily
        .into_iter()
        .map(|(date, (count, tokens))| DailyUsage {
            date,
            count,
            tokens,
        })
        .collect();
    result.sort_by(|a, b| a.date.cmp(&b.date));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::RequestRecord;

    fn rec(model: &str, tokens: i64, latency_ms: i64, ts: &str) -> RequestRecord {
        RequestRecord {
            id: "x".into(),
            timestamp: ts.into(),
            model: model.into(),
            provider: "p".into(),
            r#type: "Chat Completion".into(),
            tokens,
            status: "success".into(),
            latency_ms,
            error_category: String::new(),
            failover_count: 0,
            original_provider: String::new(),
        }
    }

    #[test]
    fn stats_empty() {
        let s = compute_stats(&[]).unwrap();
        assert_eq!(s.total_tokens, 0);
        assert_eq!(s.total_requests, 0);
        assert_eq!(s.active_models, 0);
        assert_eq!(s.token_change, 0.0);
    }

    #[test]
    fn stats_aggregates() {
        let recs = vec![
            rec("gpt-4o", 100, 1000, "2026-01-01 10:00:00"),
            rec("claude", 200, 3000, "2026-01-01 11:00:00"),
        ];
        let s = compute_stats(&recs).unwrap();
        assert_eq!(s.total_tokens, 300);
        assert_eq!(s.total_requests, 2);
        assert_eq!(s.active_models, 2);
        // (1000+3000)/2 / 1000 = 2.0s
        assert_eq!(s.avg_response_time, 2.0);
    }

    #[test]
    fn stats_range_computes_previous_period_delta() {
        let today = Utc::now().date_naive();
        let current = today.format("%Y-%m-%d").to_string();
        let prev = (today - Duration::days(8)).format("%Y-%m-%d").to_string();
        let recs = vec![
            rec("gpt-4o", 200, 1000, &format!("{} 10:00:00", current)),
            rec("gpt-4o", 100, 2000, &format!("{} 10:00:00", prev)),
        ];
        let s = compute_stats_for_range(&recs, Some("7d")).unwrap();
        assert_eq!(s.total_tokens, 200);
        assert_eq!(s.token_change, 100.0);
        assert_eq!(s.response_time_change, -1.0);
    }

    #[test]
    fn daily_groups_by_date() {
        let recs = vec![
            rec("gpt-4o", 100, 1000, "2026-01-01 10:00:00"),
            rec("gpt-4o", 50, 500, "2026-01-01 12:00:00"),
            rec("claude", 200, 3000, "2026-01-02 11:00:00"),
        ];
        let d = compute_daily_usage(&recs, None);
        assert_eq!(d.len(), 2);
        let jan1 = d.iter().find(|x| x.date == "2026-01-01").unwrap();
        assert_eq!(jan1.count, 2);
        assert_eq!(jan1.tokens, 150);
    }
    #[test]
    fn stats_24h_uses_rolling_hour_windows() {
        let now = Utc::now().naive_utc();
        let ts = |hours_ago: i64| {
            (now - Duration::hours(hours_ago))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string()
        };
        let records = vec![
            rec("m", 10, 100, &ts(1)),
            rec("m", 20, 100, &ts(2)),
            rec("m", 40, 100, &ts(30)),
            rec("m", 80, 100, &ts(25)),
        ];
        let stats = compute_stats_for_range(&records, Some("24h")).unwrap();
        // 当前窗口（最近 24h）只有前两条；上一窗口是 24~48h 前的后两条
        assert_eq!(stats.total_tokens, 30);
        assert_eq!(stats.total_requests, 2);
        assert_eq!(stats.token_change, -75.0); // 30 vs 120
    }

    #[test]
    fn daily_usage_buckets_by_hour_for_24h() {
        let now = Utc::now().naive_utc();
        let ts = |hours_ago: i64| {
            (now - Duration::hours(hours_ago))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string()
        };
        let records = vec![rec("m", 5, 10, &ts(1)), rec("m", 7, 10, &ts(25))];
        // 命令层先过滤再分桶；这里模拟同样流程。
        let filtered = filter_records_by_range(&records, Some("24h"));
        let usage = compute_daily_usage(&filtered, Some("24h"));
        assert_eq!(usage.len(), 1);
        assert!(usage[0].date.ends_with(":00"));
        assert_eq!(usage[0].tokens, 5);

        let usage = compute_daily_usage(&records, Some("24h"));
        assert_eq!(usage.len(), 2);
        assert!(usage.iter().all(|u| u.date.ends_with(":00")));

        let usage = compute_daily_usage(&records, None);
        assert_eq!(usage.len(), 2);
        assert!(usage.iter().all(|u| !u.date.contains(':')));
    }
}
