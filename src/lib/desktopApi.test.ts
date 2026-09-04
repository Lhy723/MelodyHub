import { describe, it, expect, vi, beforeEach } from 'vitest';
import { desktopApi } from './desktopApi';
import type { AgentAppConfigInput, AgentAppStatus } from './desktopApi';
import type { AppSettings } from '../types/settings';
import type { Provider } from '../types/provider';
import type { Aggregation } from '../types/aggregation';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: ((m: unknown) => void) | null = null;
  },
}));
const { invoke } = await import('@tauri-apps/api/core');

const settingsFixture: AppSettings = {
  port: 8080,
  host: '127.0.0.1',
  autoStart: true,
  maxConcurrency: 20,
  language: 'zh-CN',
  theme: 'light',
  accentColor: '#00B95C',
  pageSize: 10,
  launchAtLogin: false,
  startMinimized: false,
  proxyEnabled: false,
  proxyHost: '',
  proxyPort: 7890,
  proxyProtocol: 'http',
  proxyUsername: '',
  proxyPassword: '',
  logRetentionDays: 30,
  logAutoClean: true,
  authToken: '',
  ipWhitelist: '',
  corsEnabled: true,
  rateLimit: '0',
  apiTimeout: 60,
  maxRetries: '0',
  checkUpdatesOnStart: true,
  updateChannel: 'stable',
};

const providerFixture: Provider = {
  id: 'test-provider',
  name: 'Test Provider',
  apiBase: 'https://api.example.com',
  apiKey: 'sk-test',
  status: 'connected',
  models: [],
};

const aggregationFixture: Aggregation = {
  id: 'test-agg',
  name: 'Test Aggregation',
  models: 'gpt-4o,claude-4',
  strategy: 'round-robin',
  priority: '1',
  enabled: true,
};

const agentStatusFixture: AgentAppStatus = {
  id: 'codex',
  configPath: '/tmp/.codex/config.toml',
  configLabel: '~/.codex/config.toml',
  configExists: true,
  backupExists: false,
  isManaged: true,
  endpoint: 'http://127.0.0.1:8080/v1',
  model: 'gpt-5.1-codex-mini',
  availableModels: [],
  authTokenSet: true,
  authTokenMasked: '••••••••',
  reasoningEffort: 'medium',
  thinkingEnabled: true,
  featureFlags: { web_search: true },
  codexSettings: {
    model: 'gpt-5.1-codex-mini',
    'features.web_search': true,
  },
  configText: 'model = "gpt-5.1-codex-mini"\n',
  error: null,
};

describe('desktopApi command contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the canonical command and payload for loadSettings', async () => {
    vi.mocked(invoke).mockResolvedValue(settingsFixture);
    const result = await desktopApi.loadSettings();
    expect(invoke).toHaveBeenCalledWith('load_settings');
    expect(result).toEqual(settingsFixture);
  });

  it('uses the canonical command and payload for saveSettings', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.saveSettings(settingsFixture);
    expect(invoke).toHaveBeenCalledWith('save_settings', { settings: settingsFixture });
  });

  it('uses the canonical command and payload for loadProviders', async () => {
    vi.mocked(invoke).mockResolvedValue([providerFixture]);
    const result = await desktopApi.loadProviders();
    expect(invoke).toHaveBeenCalledWith('load_providers');
    expect(result).toEqual([providerFixture]);
  });

  it('uses the canonical command and payload for saveProviders', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.saveProviders([providerFixture]);
    expect(invoke).toHaveBeenCalledWith('save_providers', { providers: [providerFixture] });
  });

  it('uses the canonical command and payload for loadAggregations', async () => {
    vi.mocked(invoke).mockResolvedValue([aggregationFixture]);
    const result = await desktopApi.loadAggregations();
    expect(invoke).toHaveBeenCalledWith('load_aggregations');
    expect(result).toEqual([aggregationFixture]);
  });

  it('uses the canonical command and payload for saveAggregations', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.saveAggregations([aggregationFixture]);
    expect(invoke).toHaveBeenCalledWith('save_aggregations', { aggregations: [aggregationFixture] });
  });

  it('uses the canonical command and payload for startProxy', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.startProxy('127.0.0.1', 8080);
    expect(invoke).toHaveBeenCalledWith('start_proxy', { host: '127.0.0.1', port: 8080 });
  });

  it('uses the canonical command and payload for stopProxy', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.stopProxy();
    expect(invoke).toHaveBeenCalledWith('stop_proxy');
  });

  it('uses the canonical command for getProxyStatus', async () => {
    vi.mocked(invoke).mockResolvedValue({ running: true, host: '127.0.0.1', port: 8080, uptimeSecs: 120 });
    const result = await desktopApi.getProxyStatus();
    expect(invoke).toHaveBeenCalledWith('get_proxy_status');
    expect(result).toEqual({ running: true, host: '127.0.0.1', port: 8080, uptimeSecs: 120 });
  });

  it('uses the canonical command for loading agent apps', async () => {
    vi.mocked(invoke).mockResolvedValue([agentStatusFixture]);
    const result = await desktopApi.loadAgentApps();
    expect(invoke).toHaveBeenCalledWith('load_agent_apps');
    expect(result).toEqual([agentStatusFixture]);
  });

  it('passes the agent config as a nested command payload', async () => {
    const config: AgentAppConfigInput = {
      id: 'codex',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'gpt-5.1-codex-mini',
      availableModels: [],
      reasoningEffort: 'medium',
      thinkingEnabled: true,
      featureFlags: { web_search: true },
      authToken: 'melody-token',
    };
    vi.mocked(invoke).mockResolvedValue(agentStatusFixture);
    await desktopApi.saveAgentAppConfig(config);
    expect(invoke).toHaveBeenCalledWith('save_agent_app_config', { config });
  });

  it('uses the canonical command for restoring an agent config', async () => {
    vi.mocked(invoke).mockResolvedValue(agentStatusFixture);
    await desktopApi.restoreAgentAppConfig('codex');
    expect(invoke).toHaveBeenCalledWith('restore_agent_app_config', { id: 'codex' });
  });

  it('passes complete agent config text to the canonical command', async () => {
    vi.mocked(invoke).mockResolvedValue(agentStatusFixture);
    await desktopApi.saveAgentAppText('codex', 'model = "gpt-5.1-codex-mini"\n');
    expect(invoke).toHaveBeenCalledWith('save_agent_app_text', {
      id: 'codex',
      content: 'model = "gpt-5.1-codex-mini"\n',
    });
  });

  it('passes one Codex setting to the canonical command', async () => {
    vi.mocked(invoke).mockResolvedValue(agentStatusFixture);
    await desktopApi.saveAgentAppSetting('codex', 'sandbox_mode', 'workspace-write');
    expect(invoke).toHaveBeenCalledWith('save_agent_app_setting', {
      setting: { id: 'codex', key: 'sandbox_mode', value: 'workspace-write' },
    });
  });

  it('propagates errors from the mocked transport', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('IPC error'));
    await expect(desktopApi.loadSettings()).rejects.toThrow('IPC error');
  });
});
