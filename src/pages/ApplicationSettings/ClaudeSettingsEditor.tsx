import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ListFilter, Maximize2, Minimize2, SlidersHorizontal } from 'lucide-react';
import { Card, CardDesc, CardTitle, Dropdown, Input, Switch } from '../../components/ui';

type Translate = (key: string) => string;
type JsonObject = Record<string, unknown>;

type ClaudeSettingKind = 'boolean' | 'string' | 'number' | 'integer' | 'enum' | 'stringList' | 'json';
type ClaudeSettingGroup =
  'general' | 'model' | 'permissions' | 'environment' | 'automation' | 'interface' | 'integrations' | 'advanced';

interface ClaudeSettingSpec {
  key: string;
  kind: ClaudeSettingKind;
  group: ClaudeSettingGroup;
  options?: string[];
}

const CLAUDE_SETTING_KEYS = [
  '$schema',
  'apiKeyHelper',
  'autoMemoryEnabled',
  'autoUpdatesChannel',
  'awsCredentialExport',
  'awsAuthRefresh',
  'claudeMdExcludes',
  'cleanupPeriodDays',
  'env',
  'attribution',
  'includeGitInstructions',
  'includeCoAuthoredBy',
  'plansDirectory',
  'respectGitignore',
  'permissions',
  'language',
  'model',
  'availableModels',
  'modelOverrides',
  'effortLevel',
  'fastMode',
  'fastModePerSessionOptIn',
  'feedbackSurveyRate',
  'enableAllProjectMcpServers',
  'enabledMcpjsonServers',
  'disabledMcpjsonServers',
  'allowedMcpServers',
  'deniedMcpServers',
  'httpHookAllowedEnvVars',
  'hooks',
  'disableAllHooks',
  'allowedChannelPlugins',
  'allowedHttpHookUrls',
  'allowManagedHooksOnly',
  'allowManagedPermissionRulesOnly',
  'statusLine',
  'fileSuggestion',
  'enabledPlugins',
  'extraKnownMarketplaces',
  'strictKnownMarketplaces',
  'skippedMarketplaces',
  'skippedPlugins',
  'forceLoginMethod',
  'forceLoginOrgUUID',
  'otelHeadersHelper',
  'outputStyle',
  'skipWebFetchPreflight',
  'sandbox',
  'spinnerVerbs',
  'spinnerTipsEnabled',
  'spinnerTipsOverride',
  'terminalProgressBarEnabled',
  'showTurnDuration',
  'skillOverrides',
  'prefersReducedMotion',
  'prUrlTemplate',
  'alwaysThinkingEnabled',
  'companyAnnouncements',
  'teammateMode',
  'worktree',
  'parentSettingsBehavior',
  'pluginTrustMessage',
  'pluginConfigs',
  'allowManagedMcpServersOnly',
  'blockedMarketplaces',
  'agent',
  'autoMemoryDirectory',
  'autoMode',
  'channelsEnabled',
  'defaultShell',
  'disableDeepLinkRegistration',
  'disableSkillShellExecution',
  'forceRemoteSettingsRefresh',
  'minimumVersion',
  'showClearContextOnPlanAccept',
  'showThinkingSummaries',
  'skipDangerousModePermissionPrompt',
  'strictPluginOnlyCustomization',
  'tui',
  'viewMode',
  'useAutoModeDuringPlan',
  'voiceEnabled',
  'wslInheritsWindowsSettings',
  'subagentStatusLine',
  'advisorModel',
  'autoCompactEnabled',
  'disableAgentView',
  'editorMode',
  'enforceAvailableModels',
  'fallbackModel',
  'fileCheckpointingEnabled',
  'gcpAuthRefresh',
  'managedMcpServers',
  'skillListingMaxDescChars',
  'preferredNotifChannel',
  'pluginSuggestionMarketplaces',
  'requiredMaximumVersion',
  'requiredMinimumVersion',
  'respondToBashCommands',
  'skillListingBudgetFraction',
  'sshConfigs',
  'sshHostAllowlist',
  'theme',
  'voice',
  'wheelScrollAccelerationEnabled',
  'disableBundledSkills',
  'awaySummaryEnabled',
  'autoScrollEnabled',
  'allowAllClaudeAiMcps',
  'agentPushNotifEnabled',
  'axScreenReader',
  'claudeMd',
  'disableArtifact',
  'disableAutoMode',
  'disableClaudeAiConnectors',
  'disableRemoteControl',
  'disableWorkflows',
  'footerLinksRegexes',
  'inputNeededNotifEnabled',
  'policyHelper',
  'remoteControlAtStartup',
  'syntaxHighlightingDisabled',
  'verbose',
  'workflowKeywordTriggerEnabled',
  'leftArrowOpensAgents',
  'askUserQuestionTimeout',
  'teammateDefaultModel',
  'workflowSizeGuideline',
  'enableArtifact',
  'permissionExplainerEnabled',
  'diffTool',
  'externalEditorContext',
  'autoConnectIde',
  'autoInstallIdeExtension',
  'emojiCompletionEnabled',
  'vimInsertModeRemaps',
  'processWrapper',
  'forceLoginGatewayUrl',
  'disableSideloadFlags',
  'browserExternalPageTools',
  'disableBrowserExternalNavigation',
  'disableMobileSimulatorTools',
  'requireCoworkFullVmSandbox',
] as const;

const BOOLEAN_KEYS = new Set([
  'autoMemoryEnabled',
  'includeGitInstructions',
  'includeCoAuthoredBy',
  'respectGitignore',
  'fastMode',
  'fastModePerSessionOptIn',
  'enableAllProjectMcpServers',
  'disableAllHooks',
  'allowManagedHooksOnly',
  'allowManagedPermissionRulesOnly',
  'skipWebFetchPreflight',
  'spinnerTipsEnabled',
  'terminalProgressBarEnabled',
  'showTurnDuration',
  'prefersReducedMotion',
  'alwaysThinkingEnabled',
  'allowManagedMcpServersOnly',
  'channelsEnabled',
  'disableSkillShellExecution',
  'forceRemoteSettingsRefresh',
  'showClearContextOnPlanAccept',
  'showThinkingSummaries',
  'skipDangerousModePermissionPrompt',
  'useAutoModeDuringPlan',
  'voiceEnabled',
  'wslInheritsWindowsSettings',
  'autoCompactEnabled',
  'disableAgentView',
  'enforceAvailableModels',
  'fileCheckpointingEnabled',
  'respondToBashCommands',
  'wheelScrollAccelerationEnabled',
  'disableBundledSkills',
  'awaySummaryEnabled',
  'autoScrollEnabled',
  'allowAllClaudeAiMcps',
  'agentPushNotifEnabled',
  'axScreenReader',
  'disableArtifact',
  'disableClaudeAiConnectors',
  'disableRemoteControl',
  'disableWorkflows',
  'inputNeededNotifEnabled',
  'remoteControlAtStartup',
  'syntaxHighlightingDisabled',
  'verbose',
  'workflowKeywordTriggerEnabled',
  'leftArrowOpensAgents',
  'enableArtifact',
  'permissionExplainerEnabled',
  'externalEditorContext',
  'autoConnectIde',
  'autoInstallIdeExtension',
  'emojiCompletionEnabled',
  'disableSideloadFlags',
  'disableBrowserExternalNavigation',
  'disableMobileSimulatorTools',
  'requireCoworkFullVmSandbox',
]);

const INTEGER_KEYS = new Set(['cleanupPeriodDays', 'skillListingMaxDescChars']);
const NUMBER_KEYS = new Set(['feedbackSurveyRate', 'skillListingBudgetFraction']);

const STRING_LIST_KEYS = new Set([
  'claudeMdExcludes',
  'availableModels',
  'enabledMcpjsonServers',
  'disabledMcpjsonServers',
  'httpHookAllowedEnvVars',
  'allowedHttpHookUrls',
  'skippedMarketplaces',
  'skippedPlugins',
  'companyAnnouncements',
  'fallbackModel',
  'pluginSuggestionMarketplaces',
  'sshHostAllowlist',
]);

const JSON_KEYS = new Set([
  'env',
  'attribution',
  'permissions',
  'modelOverrides',
  'allowedMcpServers',
  'deniedMcpServers',
  'hooks',
  'allowedChannelPlugins',
  'statusLine',
  'fileSuggestion',
  'enabledPlugins',
  'extraKnownMarketplaces',
  'strictKnownMarketplaces',
  'forceLoginOrgUUID',
  'sandbox',
  'spinnerVerbs',
  'spinnerTipsOverride',
  'skillOverrides',
  'worktree',
  'pluginConfigs',
  'blockedMarketplaces',
  'autoMode',
  'strictPluginOnlyCustomization',
  'subagentStatusLine',
  'managedMcpServers',
  'sshConfigs',
  'voice',
  'footerLinksRegexes',
  'policyHelper',
  'vimInsertModeRemaps',
  'teammateDefaultModel',
]);

const ENUM_OPTIONS: Record<string, string[]> = {
  autoUpdatesChannel: ['stable', 'latest'],
  effortLevel: ['low', 'medium', 'high', 'xhigh'],
  forceLoginMethod: ['claudeai', 'console', 'gateway'],
  teammateMode: ['auto', 'in-process', 'tmux', 'iterm2'],
  defaultShell: ['bash', 'powershell'],
  disableDeepLinkRegistration: ['disable'],
  disableAutoMode: ['disable'],
  tui: ['fullscreen', 'default'],
  viewMode: ['default', 'verbose', 'focus'],
  editorMode: ['normal', 'vim'],
  preferredNotifChannel: [
    'auto',
    'terminal_bell',
    'iterm2',
    'iterm2_with_bell',
    'kitty',
    'ghostty',
    'notifications_disabled',
  ],
  askUserQuestionTimeout: ['60s', '5m', '10m', 'never'],
  workflowSizeGuideline: ['unrestricted', 'small', 'medium', 'large'],
  diffTool: ['auto', 'terminal'],
  browserExternalPageTools: ['disabled'],
  parentSettingsBehavior: ['first-wins', 'merge'],
};

const GROUP_KEYS: ClaudeSettingGroup[] = [
  'general',
  'model',
  'permissions',
  'environment',
  'automation',
  'interface',
  'integrations',
  'advanced',
];

// These controls already have a dedicated row in the connection card. Keep
// the root `model` setting in this editor as well: Claude Code supports both
// the root setting and ANTHROPIC_MODEL, and users need to be able to inspect
// or edit either value without falling back to raw JSON.
const COMMON_KEYS = new Set(['effortLevel', 'alwaysThinkingEnabled', 'showThinkingSummaries']);

const LABELS: Record<string, string> = {
  $schema: 'JSON Schema',
  apiKeyHelper: 'API key helper',
  autoMemoryEnabled: 'Automatic memory',
  autoUpdatesChannel: 'Update channel',
  cleanupPeriodDays: 'Cleanup period (days)',
  includeGitInstructions: 'Include Git instructions',
  includeCoAuthoredBy: 'Include Co-Authored-By',
  respectGitignore: 'Respect .gitignore',
  model: 'Root model setting',
  availableModels: 'Available models',
  modelOverrides: 'Model overrides',
  effortLevel: 'Reasoning effort',
  fastMode: 'Fast mode',
  enableAllProjectMcpServers: 'Enable all project MCP servers',
  permissions: 'Permissions',
  hooks: 'Hooks',
  statusLine: 'Status line',
  fileSuggestion: 'File suggestions',
  enabledPlugins: 'Enabled plugins',
  extraKnownMarketplaces: 'Extra plugin marketplaces',
  strictKnownMarketplaces: 'Allowed plugin marketplaces',
  outputStyle: 'Output style',
  sandbox: 'Sandbox',
  spinnerTipsEnabled: 'Spinner tips',
  terminalProgressBarEnabled: 'Terminal progress bar',
  showTurnDuration: 'Show turn duration',
  prUrlTemplate: 'Pull request URL template',
  teammateMode: 'Teammate display mode',
  worktree: 'Worktree',
  autoMode: 'Auto mode rules',
  defaultShell: 'Default shell',
  disableAllHooks: 'Disable all hooks',
  disableAgentView: 'Disable agent view',
  autoCompactEnabled: 'Automatic compaction',
  fileCheckpointingEnabled: 'File checkpointing',
  preferredNotifChannel: 'Notification channel',
  theme: 'Theme',
  voice: 'Voice dictation',
  footerLinksRegexes: 'Footer link badges',
  language: 'Response language',
  minimumVersion: 'Minimum update version',
  requiredMinimumVersion: 'Required minimum version',
  requiredMaximumVersion: 'Required maximum version',
  askUserQuestionTimeout: 'Question timeout',
  workflowSizeGuideline: 'Workflow size guideline',
};

function settingGroup(key: string): ClaudeSettingGroup {
  if (
    [
      'model',
      'availableModels',
      'modelOverrides',
      'effortLevel',
      'fallbackModel',
      'advisorModel',
      'teammateDefaultModel',
    ].includes(key)
  )
    return 'model';
  if (['permissions', 'skipDangerousModePermissionPrompt', 'allowManagedPermissionRulesOnly'].includes(key))
    return 'permissions';
  if (
    [
      'env',
      'apiKeyHelper',
      'awsCredentialExport',
      'awsAuthRefresh',
      'gcpAuthRefresh',
      'otelHeadersHelper',
      'language',
      'forceLoginMethod',
      'forceLoginOrgUUID',
      'forceLoginGatewayUrl',
    ].includes(key)
  )
    return 'environment';
  if (
    [
      'hooks',
      'disableAllHooks',
      'fileSuggestion',
      'autoMode',
      'workflowKeywordTriggerEnabled',
      'disableAutoMode',
      'processWrapper',
    ].includes(key)
  )
    return 'automation';
  if (
    [
      'statusLine',
      'outputStyle',
      'theme',
      'tui',
      'viewMode',
      'editorMode',
      'spinnerVerbs',
      'spinnerTipsEnabled',
      'spinnerTipsOverride',
      'terminalProgressBarEnabled',
      'showTurnDuration',
      'voice',
      'voiceEnabled',
      'preferredNotifChannel',
      'axScreenReader',
      'syntaxHighlightingDisabled',
      'diffTool',
      'externalEditorContext',
      'autoConnectIde',
      'autoInstallIdeExtension',
      'emojiCompletionEnabled',
      'wheelScrollAccelerationEnabled',
      'prefersReducedMotion',
    ].includes(key)
  )
    return 'interface';
  if (
    [
      'allowedMcpServers',
      'deniedMcpServers',
      'enabledMcpjsonServers',
      'disabledMcpjsonServers',
      'managedMcpServers',
      'enableAllProjectMcpServers',
      'allowAllClaudeAiMcps',
      'disableClaudeAiConnectors',
      'blockedMarketplaces',
      'allowedChannelPlugins',
      'enabledPlugins',
      'extraKnownMarketplaces',
      'strictKnownMarketplaces',
      'skippedMarketplaces',
      'skippedPlugins',
      'pluginConfigs',
      'pluginTrustMessage',
      'strictPluginOnlyCustomization',
      'agent',
      'subagentStatusLine',
      'sshConfigs',
      'sshHostAllowlist',
      'worktree',
    ].includes(key)
  )
    return 'integrations';
  if (
    [
      'allowManagedHooksOnly',
      'allowManagedMcpServersOnly',
      'forceRemoteSettingsRefresh',
      'requiredMinimumVersion',
      'requiredMaximumVersion',
      'minimumVersion',
      'disableSideloadFlags',
      'disableBrowserExternalNavigation',
      'browserExternalPageTools',
      'disableMobileSimulatorTools',
      'requireCoworkFullVmSandbox',
      'wslInheritsWindowsSettings',
      'parentSettingsBehavior',
      'policyHelper',
    ].includes(key)
  )
    return 'advanced';
  return 'general';
}

function settingSpecs(): ClaudeSettingSpec[] {
  return CLAUDE_SETTING_KEYS.filter((key) => !COMMON_KEYS.has(key)).map((key) => ({
    key,
    group: settingGroup(key),
    kind: ENUM_OPTIONS[key]
      ? 'enum'
      : BOOLEAN_KEYS.has(key)
        ? 'boolean'
        : INTEGER_KEYS.has(key)
          ? 'integer'
          : NUMBER_KEYS.has(key)
            ? 'number'
            : STRING_LIST_KEYS.has(key)
              ? 'stringList'
              : JSON_KEYS.has(key)
                ? 'json'
                : 'string',
    options: ENUM_OPTIONS[key],
  }));
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (value) => value.toUpperCase());
}

function parseConfig(content: string): JsonObject | null {
  if (!content.trim()) return {};
  try {
    const value: unknown = JSON.parse(content);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
  } catch {
    return null;
  }
}

function formatConfig(config: JsonObject): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function ClaudeSettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--spacer-20)',
        padding: 'var(--spacer-12) 0',
        borderBottom: '1px solid var(--border-neutral-l1)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div
          style={{
            color: 'var(--text-secondary)',
            fontSize: 'var(--body-sm-font-size)',
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              marginTop: 4,
              color: 'var(--text-tertiary)',
              fontSize: 'var(--body-xs-font-size)',
              lineHeight: 1.45,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div style={{ flex: '0 1 420px', minWidth: 240, display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

function JsonValueEditor({
  value,
  onCommit,
  placeholder,
  t,
}: {
  value: unknown;
  onCommit: (value: unknown) => void;
  placeholder: string;
  t: Translate;
}) {
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(serialized);
    setInvalid(false);
  }, [serialized]);

  return (
    <div style={{ width: '100%' }}>
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={() => {
          if (!draft.trim()) {
            onCommit(undefined);
            return;
          }
          try {
            onCommit(JSON.parse(draft));
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
        spellCheck={false}
        placeholder={placeholder}
        style={{
          display: 'block',
          width: '100%',
          minHeight: 74,
          resize: 'vertical',
          boxSizing: 'border-box',
          padding: 'var(--spacer-8) var(--spacer-10)',
          border: `1px solid ${invalid ? 'var(--status-error-default)' : 'var(--border-neutral-l1)'}`,
          borderRadius: 'var(--radius-8)',
          background: 'var(--bg-base-default)',
          color: 'var(--text-default)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 'var(--body-xs-font-size)',
          lineHeight: 1.5,
          outline: 'none',
        }}
      />
      {invalid && (
        <div style={{ marginTop: 4, color: 'var(--status-error-default)', fontSize: 'var(--body-xs-font-size)' }}>
          {t('applications.claudeSettings.invalidFieldJson')}
        </div>
      )}
    </div>
  );
}

function StringListEditor({
  value,
  onCommit,
  placeholder,
}: {
  value: unknown;
  onCommit: (value: unknown) => void;
  placeholder: string;
}) {
  const items = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const serialized = items.join('\n');
  const [draft, setDraft] = useState(serialized);

  useEffect(() => setDraft(serialized), [serialized]);

  return (
    <textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean);
        onCommit(next.length ? next : undefined);
      }}
      placeholder={placeholder}
      style={{
        display: 'block',
        width: '100%',
        minHeight: 66,
        resize: 'vertical',
        boxSizing: 'border-box',
        padding: 'var(--spacer-8) var(--spacer-10)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-8)',
        background: 'var(--bg-base-default)',
        color: 'var(--text-default)',
        fontFamily: 'inherit',
        fontSize: 'var(--body-sm-font-size)',
        lineHeight: 1.5,
        outline: 'none',
      }}
    />
  );
}

function controlFor(
  spec: ClaudeSettingSpec,
  config: JsonObject,
  onUpdate: (key: string, value: unknown) => void,
  t: Translate,
) {
  const value = config[spec.key];
  const placeholder = t('applications.claudeSettings.unset');

  if (spec.kind === 'boolean') {
    return (
      <Switch
        checked={value === true}
        onChange={(next) => onUpdate(spec.key, next)}
        aria-label={LABELS[spec.key] ?? humanizeKey(spec.key)}
      />
    );
  }
  if (spec.kind === 'enum') {
    return (
      <Dropdown
        options={[
          { value: '', label: placeholder },
          ...(spec.options ?? []).map((option) => ({ value: option, label: option })),
        ]}
        value={typeof value === 'string' && spec.options?.includes(value) ? value : ''}
        onChange={(next) => onUpdate(spec.key, next || undefined)}
        size="sm"
        style={{ width: '100%' }}
      />
    );
  }
  if (spec.kind === 'stringList') {
    return (
      <StringListEditor
        value={value}
        onCommit={(next) => onUpdate(spec.key, next)}
        placeholder={t('applications.claudeSettings.listPlaceholder')}
      />
    );
  }
  if (spec.kind === 'json') {
    return (
      <JsonValueEditor
        value={value}
        onCommit={(next) => onUpdate(spec.key, next)}
        placeholder={t('applications.claudeSettings.jsonPlaceholder')}
        t={t}
      />
    );
  }
  return (
    <Input
      type={spec.kind === 'number' || spec.kind === 'integer' ? 'number' : 'text'}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(event) => {
        const next = event.target.value;
        if (!next.trim()) {
          onUpdate(spec.key, undefined);
        } else if (spec.kind === 'number' || spec.kind === 'integer') {
          const parsed = spec.kind === 'integer' ? Number.parseInt(next, 10) : Number.parseFloat(next);
          if (Number.isFinite(parsed)) onUpdate(spec.key, parsed);
        } else {
          onUpdate(spec.key, next);
        }
      }}
      placeholder={placeholder}
      aria-label={LABELS[spec.key] ?? humanizeKey(spec.key)}
    />
  );
}

export interface ClaudeSettingsEditorProps {
  content: string;
  onChange: (content: string) => void;
  t: Translate;
}

export function ClaudeSettingsEditor({ content, onChange, t }: ClaudeSettingsEditorProps) {
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<ClaudeSettingGroup, boolean>>({
    general: true,
    model: true,
    permissions: true,
    environment: true,
    automation: false,
    interface: false,
    integrations: false,
    advanced: false,
  });
  const specs = useMemo(() => settingSpecs(), []);
  const config = useMemo(() => parseConfig(content), [content]);
  const filteredSpecs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return specs;
    return specs.filter((spec) => {
      const label = LABELS[spec.key] ?? humanizeKey(spec.key);
      return spec.key.toLowerCase().includes(normalized) || label.toLowerCase().includes(normalized);
    });
  }, [query, specs]);

  const updateSetting = (key: string, value: unknown) => {
    if (!config) return;
    const next = { ...config };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(formatConfig(next));
  };

  return (
    <Card padding="0" style={{ overflow: 'hidden', marginTop: 'var(--spacer-16)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--spacer-12)',
          padding: 'var(--spacer-16) var(--spacer-20)',
          borderBottom: '1px solid var(--border-neutral-l1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacer-10)' }}>
          <SlidersHorizontal size={17} style={{ color: 'var(--icon-secondary)', marginTop: 2 }} />
          <div>
            <CardTitle style={{ margin: 0 }}>{t('applications.claudeSettings.title')}</CardTitle>
            <CardDesc>{t('applications.claudeSettings.hint')}</CardDesc>
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-6)' }}>
          <button
            type="button"
            onClick={() =>
              setOpenGroups(
                Object.fromEntries(GROUP_KEYS.map((group) => [group, true])) as Record<ClaudeSettingGroup, boolean>,
              )
            }
            title={t('applications.claudeSettings.expandAll')}
            aria-label={t('applications.claudeSettings.expandAll')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            onClick={() =>
              setOpenGroups(
                Object.fromEntries(GROUP_KEYS.map((group) => [group, false])) as Record<ClaudeSettingGroup, boolean>,
              )
            }
            title={t('applications.claudeSettings.collapseAll')}
            aria-label={t('applications.claudeSettings.collapseAll')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <Minimize2 size={14} />
          </button>
        </div>
      </div>

      <div style={{ padding: 'var(--spacer-12) var(--spacer-20) 0' }}>
        <Input
          icon={<ListFilter size={14} />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('applications.claudeSettings.searchPlaceholder')}
          aria-label={t('applications.claudeSettings.searchPlaceholder')}
        />
      </div>

      {!config ? (
        <div
          style={{
            margin: 'var(--spacer-16) var(--spacer-20)',
            padding: 'var(--spacer-10)',
            borderRadius: 'var(--radius-8)',
            background: 'color-mix(in srgb, var(--status-error-default) 10%, transparent)',
            color: 'var(--status-error-default)',
            fontSize: 'var(--body-sm-font-size)',
          }}
        >
          {t('applications.claudeSettings.invalidJson')}
        </div>
      ) : (
        <div style={{ padding: 'var(--spacer-8) var(--spacer-20) var(--spacer-16)' }}>
          {GROUP_KEYS.map((group) => {
            const groupSpecs = filteredSpecs.filter((spec) => spec.group === group);
            if (!groupSpecs.length) return null;
            const opened = openGroups[group];
            return (
              <section key={group} style={{ borderBottom: '1px solid var(--border-neutral-l1)' }}>
                <button
                  type="button"
                  onClick={() => setOpenGroups((current) => ({ ...current, [group]: !current[group] }))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    border: 'none',
                    background: 'transparent',
                    padding: 'var(--spacer-14) 0',
                    color: 'var(--text-default)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--font-weight-strong)',
                    textAlign: 'left',
                  }}
                >
                  <span>{t(`applications.claudeSettings.group.${group}`)}</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--body-xs-font-size)',
                      fontWeight: 'var(--font-weight-normal)',
                    }}
                  >
                    {groupSpecs.length}
                    <ChevronDown
                      size={14}
                      style={{
                        transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 160ms ease',
                      }}
                    />
                  </span>
                </button>
                {opened && (
                  <div>
                    {groupSpecs.map((spec) => (
                      <ClaudeSettingRow
                        key={spec.key}
                        label={LABELS[spec.key] ?? humanizeKey(spec.key)}
                        hint={spec.key}
                      >
                        {controlFor(spec, config, updateSetting, t)}
                      </ClaudeSettingRow>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {!filteredSpecs.length && (
            <div
              style={{
                padding: 'var(--spacer-20) 0',
                color: 'var(--text-tertiary)',
                textAlign: 'center',
                fontSize: 'var(--body-sm-font-size)',
              }}
            >
              {t('applications.claudeSettings.noResults')}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default ClaudeSettingsEditor;
