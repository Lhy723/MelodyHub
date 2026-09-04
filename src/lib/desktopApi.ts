import { Channel, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AppSettings } from '../types/settings';
import type { Provider } from '../types/provider';
import type { Aggregation } from '../types/aggregation';
import type { UsageStats, RequestRecord, DailyUsage } from '../types/stats';

export interface ProviderHealthSnapshot {
  providerId: string;
  status: 'healthy' | 'rate_limited' | 'unhealthy' | 'auth_error';
  cooldownSecs: number;
  inFlight: number;
  consecutiveFailures: number;
}

/** Metadata returned by the `check_for_updates` command. */
export interface UpdateMetadata {
  version: string;
  currentVersion: string;
  date?: string;
  body: string;
}

export type AgentAppId = 'codex' | 'claude' | 'opencode';

export interface AgentAppStatus {
  id: AgentAppId;
  configPath: string;
  configLabel: string;
  configExists: boolean;
  backupExists: boolean;
  isManaged: boolean;
  endpoint: string;
  model: string;
  availableModels: string[];
  authTokenSet: boolean;
  authTokenMasked: string;
  reasoningEffort: string;
  thinkingEnabled: boolean;
  featureFlags: Record<string, boolean>;
  codexSettings?: Record<string, unknown>;
  configText: string;
  error?: string | null;
}

export interface AgentAppConfigInput {
  id: AgentAppId;
  endpoint: string;
  model: string;
  availableModels: string[];
  reasoningEffort: string;
  thinkingEnabled: boolean;
  featureFlags: Record<string, boolean>;
  /** null keeps the existing credential; a string replaces it. */
  authToken: string | null;
}

/** Progress events streamed from `download_and_install_update`. */
export type DownloadEvent =
  | { event: 'started'; data: { contentLength?: number } }
  | { event: 'progress'; data: { chunkLength: number } }
  | { event: 'finished' };

export interface DesktopApi {
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  loadProviders(): Promise<Provider[]>;
  saveProviders(providers: Provider[]): Promise<void>;
  loadAggregations(): Promise<Aggregation[]>;
  saveAggregations(aggregations: Aggregation[]): Promise<void>;
  startProxy(host: string, port: number): Promise<void>;
  stopProxy(): Promise<void>;
  getProxyStatus(): Promise<{ running: boolean; host: string; port: number; uptimeSecs: number }>;
  getStats(timeRange: string): Promise<UsageStats>;
  getRecentRequests(limit: number, timeRange?: string): Promise<RequestRecord[]>;
  getDailyUsage(): Promise<DailyUsage[]>;
  resetStats(): Promise<void>;
  exitApp(): Promise<void>;
  initLogDir(): Promise<void>;
  openLogDir(): Promise<void>;
  exportLogs(): Promise<string>;
  fetchProviderModels(
    flavor: string,
    apiBase: string,
    apiKey: string,
  ): Promise<{ success: boolean; models: Array<{ id: string; name: string }>; message: string }>;
  testProviderConnection(
    flavor: string,
    apiBase: string,
    apiKey: string,
  ): Promise<{ success: boolean; modelCount?: number; error?: { kind: string; message: string }; message: string }>;
  getProviderHealth(): Promise<Record<string, ProviderHealthSnapshot>>;
  loadAgentApps(): Promise<AgentAppStatus[]>;
  saveAgentAppConfig(config: AgentAppConfigInput): Promise<AgentAppStatus>;
  saveAgentAppText(id: AgentAppId, content: string): Promise<AgentAppStatus>;
  saveAgentAppSetting(id: AgentAppId, key: string, value: unknown): Promise<AgentAppStatus>;
  restoreAgentAppConfig(id: AgentAppId): Promise<AgentAppStatus>;
  /** Probe the updater endpoints. Returns `null` when up-to-date. */
  checkForUpdates(): Promise<UpdateMetadata | null>;
  /** Download + install the pending update, streaming progress to `onEvent`. */
  downloadAndInstallUpdate(onEvent: (event: DownloadEvent) => void): Promise<void>;
}

export const desktopApi: DesktopApi = {
  loadSettings: () => invoke<AppSettings>('load_settings'),
  saveSettings: (settings) => invoke('save_settings', { settings }),
  loadProviders: () => invoke<Provider[]>('load_providers'),
  saveProviders: (providers) => invoke('save_providers', { providers }),
  loadAggregations: () => invoke<Aggregation[]>('load_aggregations'),
  saveAggregations: (aggregations) => invoke('save_aggregations', { aggregations }),
  startProxy: (host, port) => invoke('start_proxy', { host, port }),
  stopProxy: () => invoke('stop_proxy'),
  getProxyStatus: () =>
    invoke<{ running: boolean; host: string; port: number; uptimeSecs: number }>('get_proxy_status'),
  getStats: (timeRange) => invoke<UsageStats>('get_stats', { timeRange }),
  getRecentRequests: (limit, timeRange) =>
    invoke<RequestRecord[]>('get_recent_requests', { limit, timeRange }),
  getDailyUsage: () => invoke<DailyUsage[]>('get_daily_usage'),
  resetStats: () => invoke('reset_stats'),
  exitApp: () => invoke('exit_app'),
  initLogDir: () => invoke('init_log_dir'),
  openLogDir: () => invoke('open_log_dir'),
  exportLogs: () => invoke<string>('export_logs'),
  fetchProviderModels: (flavor, apiBase, apiKey) => invoke('fetch_provider_models', { flavor, apiBase, apiKey }),
  testProviderConnection: (flavor, apiBase, apiKey) => invoke('test_provider_connection', { flavor, apiBase, apiKey }),
  getProviderHealth: () => invoke<Record<string, ProviderHealthSnapshot>>('get_provider_health'),
  loadAgentApps: () => invoke<AgentAppStatus[]>('load_agent_apps'),
  saveAgentAppConfig: (config) => invoke<AgentAppStatus>('save_agent_app_config', { config }),
  saveAgentAppText: (id, content) => invoke<AgentAppStatus>('save_agent_app_text', { id, content }),
  saveAgentAppSetting: (id, key, value) =>
    invoke<AgentAppStatus>('save_agent_app_setting', { setting: { id, key, value } }),
  restoreAgentAppConfig: (id) => invoke<AgentAppStatus>('restore_agent_app_config', { id }),
  checkForUpdates: () => invoke<UpdateMetadata | null>('check_for_updates'),
  downloadAndInstallUpdate: (onEvent) => {
    const channel = new Channel<DownloadEvent>();
    channel.onmessage = (message) => {
      // The Tauri Channel delivers the message payload directly.
      onEvent(message);
    };
    return invoke('download_and_install_update', { onEvent: channel });
  },
};

/**
 * Subscribe to `request-completed` events emitted by the Rust
 * backend after each proxy request finishes. Replaces polling.
 * Returns an `UnlistenFn` for cleanup.
 */
export function onRequestCompleted(callback: (record: RequestRecord) => void): Promise<UnlistenFn> {
  return listen<RequestRecord>('request-completed', (event) => {
    callback(event.payload);
  });
}

/**
 * Subscribe to `update-available` events emitted by the Rust backend
 * during startup (when `checkUpdatesOnStart` is enabled). The payload
 * contains the new version metadata. Use this to surface a toast that
 * routes the user to Settings → About to install.
 */
export function onUpdateAvailable(callback: (meta: UpdateMetadata) => void): Promise<UnlistenFn> {
  return listen<UpdateMetadata>('update-available', (event) => {
    callback(event.payload);
  });
}
