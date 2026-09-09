// Wire-format types returned by the Tauri `get_stats` /
// `get_recent_requests` / `get_daily_usage` commands. The Rust
// structs now serialize with camelCase, so these mirror the
// payload exactly — no manual field renaming in the stores.

export interface UsageStats {
  totalTokens: number;
  totalRequests: number;
  activeModels: number;
  avgResponseTime: number;
  // Trend deltas (currently 0 server-side; reserved for future
  // period-over-period comparison). Kept so the dashboard can
  // render change indicators without a contract change.
  tokenChange: number;
  requestChange: number;
  responseTimeChange: number;
  responseTimeTrend: 'up' | 'down';
}

export interface ModelBreakdown {
  name: string;
  percentage: number;
  color: string;
  /** 该模型累计 token 数。 */
  tokens: number;
  /** token 占比（与 percentage 同一筛选范围）。 */
  tokenPercentage: number;
}

/** Raw request record as delivered over IPC (camelCase). */
export interface RequestRecord {
  id: string;
  timestamp: string;
  model: string;
  provider: string;
  /** Serialized as `type` on the wire (Rust `r#type`). */
  type: string;
  tokens: number;
  status: string;
  latencyMs: number;
  errorCategory: string;
  /** How many times the request failed over to a different
   * provider before succeeding (or failing). 0 = no failover. */
  failoverCount?: number;
  /** The first provider attempted. When failover occurs, this
   * differs from `provider` (the final provider used). */
  originalProvider?: string;
}

export interface DailyUsage {
  date: string;
  count: number;
  tokens: number;
}

export type TimeRange = '24h' | '7d' | '30d' | '90d';

export interface ProviderRate {
  providerId: string;
  /** 近 1 小时平均：每分钟请求数。 */
  rpm: number;
  /** 近 1 小时平均：每分钟 token 数。 */
  tpm: number;
}
