import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  FileCog,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Terminal,
  X,
} from 'lucide-react';
import { t as translate, useT } from '../../i18n';
import {
  AnimatedContent,
  Button,
  Card,
  CardDesc,
  CardTitle,
  Dropdown,
  Input,
  Switch,
  toast,
} from '../../components/ui';
import { desktopApi, type AgentAppConfigInput, type AgentAppId, type AgentAppStatus } from '../../lib/desktopApi';
import { useProviderStore } from '../../store/providerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CodexSettingsEditor } from './CodexSettingsEditor';
import { ClaudeSettingsEditor } from './ClaudeSettingsEditor';

type TokenMode = 'melody' | 'keep' | 'custom';
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type ReasoningEffort = 'auto' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
type FeatureKey =
  'web_search' | 'shell_tool' | 'computer_use' | 'multi_agent' | 'showThinkingSummaries' | 'encryptedReasoning';

const CUSTOM_MODEL_VALUE = '__custom_model__';

interface AgentDefinition {
  id: AgentAppId;
  nameKey: string;
  descriptionKey: string;
  protocolValue: 'responses' | 'messages';
  icon: LucideIcon;
  reasoningEfforts: ReasoningEffort[];
  showThinkingToggle: boolean;
  featureKeys: FeatureKey[];
}

interface AgentForm {
  endpoint: string;
  model: string;
  availableModels: string[];
  tokenMode: TokenMode;
  token: string;
  reasoningEffort: ReasoningEffort;
  thinkingEnabled: boolean;
  featureFlags: Record<string, boolean>;
}

const FEATURE_LABEL_KEYS: Record<FeatureKey, string> = {
  web_search: 'applications.feature.webSearch',
  shell_tool: 'applications.feature.shellTool',
  computer_use: 'applications.feature.computerUse',
  multi_agent: 'applications.feature.multiAgent',
  showThinkingSummaries: 'applications.feature.showThinkingSummaries',
  encryptedReasoning: 'applications.feature.encryptedReasoning',
};

const FEATURE_HINT_KEYS: Record<FeatureKey, string> = {
  web_search: 'applications.feature.webSearchHint',
  shell_tool: 'applications.feature.shellToolHint',
  computer_use: 'applications.feature.computerUseHint',
  multi_agent: 'applications.feature.multiAgentHint',
  showThinkingSummaries: 'applications.feature.showThinkingSummariesHint',
  encryptedReasoning: 'applications.feature.encryptedReasoningHint',
};

const AGENTS: AgentDefinition[] = [
  {
    id: 'codex',
    nameKey: 'applications.codex.name',
    descriptionKey: 'applications.codex.description',
    protocolValue: 'responses',
    icon: Terminal,
    reasoningEfforts: ['auto', 'minimal', 'low', 'medium', 'high', 'xhigh'],
    showThinkingToggle: false,
    featureKeys: ['web_search', 'shell_tool', 'computer_use', 'multi_agent'],
  },
  {
    id: 'claude',
    nameKey: 'applications.claude.name',
    descriptionKey: 'applications.claude.description',
    protocolValue: 'messages',
    icon: MessageSquare,
    reasoningEfforts: ['auto', 'low', 'medium', 'high', 'xhigh'],
    showThinkingToggle: true,
    featureKeys: ['showThinkingSummaries'],
  },
  {
    id: 'opencode',
    nameKey: 'applications.opencode.name',
    descriptionKey: 'applications.opencode.description',
    protocolValue: 'responses',
    icon: Code2,
    reasoningEfforts: ['auto', 'low', 'medium', 'high'],
    showThinkingToggle: true,
    featureKeys: ['encryptedReasoning'],
  },
];

function defaultEndpoint(host: string, port: number, id: AgentAppId): string {
  let safeHost = host.trim() || '127.0.0.1';
  if (safeHost === '0.0.0.0' || safeHost === '::') safeHost = '127.0.0.1';
  const root = `http://${safeHost}:${port || 8080}`;
  return id === 'claude' ? root : `${root}/v1`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : error ? String(error) : fallback;
}

function formFromStatus(status: AgentAppStatus, fallbackEndpoint: string, hasMelodyToken: boolean): AgentForm {
  return {
    endpoint: status.endpoint || fallbackEndpoint,
    model: status.model,
    availableModels: [...(status.availableModels ?? [])],
    tokenMode: status.authTokenSet ? 'keep' : hasMelodyToken ? 'melody' : 'custom',
    token: '',
    reasoningEffort: (status.reasoningEffort || 'auto') as ReasoningEffort,
    thinkingEnabled: status.thinkingEnabled,
    featureFlags: { ...status.featureFlags },
  };
}

function statusColor(status: AgentAppStatus): string {
  if (status.error) return 'var(--status-error-default)';
  if (status.configExists) return 'var(--status-success-default)';
  return 'var(--text-tertiary)';
}

function SaveIndicator({ state, error, t }: { state: SaveState; error?: string; t: (key: string) => string }) {
  if (state === 'saving') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
        <Loader2 size={13} className="animate-spin" />
        {t('applications.saveState.saving')}
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--status-success-default)' }}>
        <CheckCircle2 size={13} />
        {t('applications.saveState.saved')}
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span
        title={error}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--status-error-default)' }}
      >
        <AlertCircle size={13} />
        {error || t('applications.saveState.error')}
      </span>
    );
  }
  if (state === 'dirty') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)' }}>
        {t('applications.saveState.pending')}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)' }}>
      {t('applications.saveState.idle')}
    </span>
  );
}

function SettingRow({
  label,
  hint,
  children,
  last = false,
}: {
  label: ReactNode;
  hint?: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--spacer-16)',
        padding: 'var(--spacer-10) 0',
        borderBottom: last ? 'none' : '1px solid var(--border-neutral-l1)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
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
      <div style={{ flex: '0 1 380px', minWidth: 220, display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

interface SwitchItem {
  key: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (enabled: boolean) => void;
}

function SwitchGrid({ items, last = false }: { items: SwitchItem[]; last?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'var(--spacer-8) var(--spacer-20)',
        padding: 'var(--spacer-10) 0',
        borderBottom: last ? 'none' : '1px solid var(--border-neutral-l1)',
      }}
    >
      {items.map((item) => (
        <div
          key={item.key}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacer-10)', minWidth: 0 }}
        >
          <Switch checked={item.checked} onChange={item.onChange} aria-label={item.label} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: 'var(--text-secondary)',
                fontSize: 'var(--body-sm-font-size)',
                fontWeight: 'var(--font-weight-medium)',
              }}
            >
              {item.label}
            </div>
            {item.hint && (
              <div
                style={{
                  marginTop: 2,
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--body-xs-font-size)',
                  lineHeight: 1.4,
                }}
              >
                {item.hint}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MultiSelectDropdown — 紧凑的多选下拉组件
// 触发器只占一行高度，点击后弹出带搜索的复选框列表
// ═══════════════════════════════════════════════════════════════
interface MultiSelectDropdownProps {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyText: string;
  searchPlaceholder: string;
  noMatchText: string;
  disabled?: boolean;
}

function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  emptyText,
  searchPlaceholder,
  noMatchText,
  disabled = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [popupRect, setPopupRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const updatePosition = useCallback(() => {
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setPopupRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
    setPopupRect(null);
    return;
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const toggle = (m: string) => {
    if (selected.includes(m)) {
      onChange(selected.filter((x) => x !== m));
    } else {
      onChange([...selected, m]);
    }
  };

  const remove = (m: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((x) => x !== m));
  };

  const summaryLabel =
    options.length === 0
      ? emptyText
      : selected.length === 0
        ? placeholder
        : `${selected.length} / ${options.length}`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        style={{
          width: '100%',
          minHeight: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacer-8)',
          padding: 'var(--spacer-4) var(--spacer-10) var(--spacer-4) var(--spacer-12)',
          borderRadius: 'var(--radius-8)',
          border: '1px solid var(--border-neutral-l1)',
          background: 'var(--bg-base-default)',
          color: selected.length > 0 ? 'var(--text-default)' : 'var(--text-tertiary)',
          fontSize: 'var(--body-sm-font-size)',
          fontFamily: 'inherit',
          cursor: disabled || options.length === 0 ? 'not-allowed' : 'pointer',
          opacity: disabled || options.length === 0 ? 0.6 : 1,
          outline: open ? '2px solid var(--bg-brand-popup)' : 'none',
          outlineOffset: -1,
          transition: 'border-color var(--transition-fast), outline var(--transition-fast)',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--spacer-4)',
            overflow: 'hidden',
            flex: 1,
            minWidth: 0,
          }}
        >
          {selected.length === 0 ? (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {options.length === 0 ? emptyText : placeholder}
            </span>
          ) : (
            selected.slice(0, 3).map((m) => (
              <span
                key={m}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '1px 6px 1px 8px',
                  borderRadius: 'var(--radius-4)',
                  background: 'var(--bg-overlay-l1)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--body-xs-font-size)',
                  maxWidth: 160,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m}</span>
                <X
                  size={11}
                  onClick={(e) => remove(m, e)}
                  style={{ cursor: 'pointer', color: 'var(--icon-tertiary)', flexShrink: 0 }}
                />
              </span>
            ))
          )}
          {selected.length > 3 && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)' }}>
              +{selected.length - 3}
            </span>
          )}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-6)', flexShrink: 0 }}>
          {selected.length > 0 && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)' }}>{summaryLabel}</span>
          )}
          <ChevronDown
            size={14}
            style={{
              color: 'var(--icon-secondary)',
              transition: 'transform var(--transition-normal)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </span>
      </button>

      {open &&
        popupRect &&
        createPortal(
          <div
            ref={popupRef}
            role="listbox"
            id={listboxId}
            style={{
              position: 'fixed',
              top: popupRect.top,
              left: popupRect.left,
              width: popupRect.width,
              zIndex: 99999,
              maxHeight: 320,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 'var(--radius-8)',
              border: '1px solid var(--border-neutral-l1)',
              background: 'var(--bg-base-default)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-6)',
                padding: 'var(--spacer-8) var(--spacer-12)',
                borderBottom: '1px solid var(--border-neutral-l1)',
                flexShrink: 0,
              }}
            >
              <Search size={14} style={{ color: 'var(--icon-tertiary)', flexShrink: 0 }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--text-default)',
                  fontSize: 'var(--body-sm-font-size)',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div
              ref={listRef}
              className="ds-scroll"
              style={{
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: 'var(--spacer-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacer-2)',
                flex: 1,
                minHeight: 0,
              }}
            >
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: 'var(--spacer-16) var(--spacer-12)',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--body-sm-font-size)',
                  }}
                >
                  {noMatchText}
                </div>
              ) : (
                filtered.map((m) => {
                  const checked = selected.includes(m);
                  return (
                    <div
                      key={m}
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(m)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacer-8)',
                        padding: 'var(--spacer-6) var(--spacer-10)',
                        borderRadius: 'var(--radius-6)',
                        color: checked ? 'var(--text-brand)' : 'var(--text-default)',
                        background: checked ? 'var(--bg-brand-popup)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast)',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!checked) e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                      }}
                      onMouseLeave={(e) => {
                        if (!checked) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 16,
                          height: 16,
                          borderRadius: 'var(--radius-3)',
                          border: checked ? 'none' : '1px solid var(--border-neutral-l2)',
                          background: checked ? 'var(--bg-brand)' : 'transparent',
                          flexShrink: 0,
                        }}
                      >
                        {checked && <Check size={11} style={{ color: '#fff' }} />}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export const ApplicationSettings: React.FC = () => {
  const t = useT();
  const appSettings = useSettingsStore((state) => state.settings);
  const settingsLoaded = useSettingsStore((state) => state.loaded);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const providers = useProviderStore((state) => state.providers);
  const providersLoaded = useProviderStore((state) => state.loaded);
  const loadProviders = useProviderStore((state) => state.loadProviders);
  const [statuses, setStatuses] = useState<Partial<Record<AgentAppId, AgentAppStatus>>>({});
  const [forms, setForms] = useState<Partial<Record<AgentAppId, AgentForm>>>({});
  const [configTexts, setConfigTexts] = useState<Partial<Record<AgentAppId, string>>>({});
  const [visualStates, setVisualStates] = useState<Partial<Record<AgentAppId, SaveState>>>({});
  const [textStates, setTextStates] = useState<Partial<Record<AgentAppId, SaveState>>>({});
  const [saveErrors, setSaveErrors] = useState<Partial<Record<AgentAppId, string>>>({});
  const [textErrors, setTextErrors] = useState<Partial<Record<AgentAppId, string>>>({});
  const [customModelById, setCustomModelById] = useState<Partial<Record<AgentAppId, boolean>>>({});
  const [activeId, setActiveId] = useState<AgentAppId>('codex');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restoringId, setRestoringId] = useState<AgentAppId | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const statusesRef = useRef(statuses);
  const formsRef = useRef(forms);
  const configTextsRef = useRef(configTexts);
  const appTokenRef = useRef(appSettings.authToken);
  const rawDirtyRef = useRef<Record<AgentAppId, boolean>>({ codex: false, claude: false, opencode: false });
  const visualVersionRef = useRef<Record<AgentAppId, number>>({ codex: 0, claude: 0, opencode: 0 });
  const textVersionRef = useRef<Record<AgentAppId, number>>({ codex: 0, claude: 0, opencode: 0 });
  const visualTimersRef = useRef<Partial<Record<AgentAppId, ReturnType<typeof setTimeout>>>>({});
  const textTimersRef = useRef<Partial<Record<AgentAppId, ReturnType<typeof setTimeout>>>>({});
  const codexSettingChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);
  useEffect(() => {
    formsRef.current = forms;
  }, [forms]);
  useEffect(() => {
    configTextsRef.current = configTexts;
  }, [configTexts]);
  useEffect(() => {
    appTokenRef.current = appSettings.authToken;
  }, [appSettings.authToken]);
  useEffect(
    () => () => {
      Object.values(visualTimersRef.current).forEach((timer) => timer && clearTimeout(timer));
      Object.values(textTimersRef.current).forEach((timer) => timer && clearTimeout(timer));
    },
    [],
  );

  const fallbackEndpoint = useCallback(
    (id: AgentAppId) => defaultEndpoint(appSettings.host, appSettings.port, id),
    [appSettings.host, appSettings.port],
  );

  const formFor = useCallback(
    (id: AgentAppId): AgentForm =>
      formsRef.current[id] ?? {
        endpoint: fallbackEndpoint(id),
        model: '',
        availableModels: [],
        tokenMode: appTokenRef.current ? 'melody' : 'custom',
        token: '',
        reasoningEffort: 'auto',
        thinkingEnabled: false,
        featureFlags: {},
      },
    [fallbackEndpoint],
  );

  const setStatus = (status: AgentAppStatus) => {
    statusesRef.current = { ...statusesRef.current, [status.id]: status };
    setStatuses((current) => ({ ...current, [status.id]: status }));
  };

  const setSaveState = (id: AgentAppId, state: SaveState, error?: string) => {
    setVisualStates((current) => ({ ...current, [id]: state }));
    setSaveErrors((current) => {
      const next = { ...current };
      if (error) next[id] = error;
      else delete next[id];
      return next;
    });
  };

  const setTextState = (id: AgentAppId, state: SaveState, error?: string) => {
    setTextStates((current) => ({ ...current, [id]: state }));
    setTextErrors((current) => {
      const next = { ...current };
      if (error) next[id] = error;
      else delete next[id];
      return next;
    });
  };

  const loadAgents = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const nextStatuses = await desktopApi.loadAgentApps();
        const statusMap: Partial<Record<AgentAppId, AgentAppStatus>> = {};
        const formMap: Partial<Record<AgentAppId, AgentForm>> = {};
        const textMap: Partial<Record<AgentAppId, string>> = {};
        nextStatuses.forEach((status) => {
          statusMap[status.id] = status;
          formMap[status.id] = formFromStatus(status, fallbackEndpoint(status.id), Boolean(appTokenRef.current));
          textMap[status.id] = status.configText;
          rawDirtyRef.current[status.id] = false;
          visualVersionRef.current[status.id] += 1;
          textVersionRef.current[status.id] += 1;
        });
        statusesRef.current = statusMap;
        formsRef.current = formMap;
        configTextsRef.current = textMap;
        setStatuses(statusMap);
        setForms(formMap);
        setConfigTexts(textMap);
        setVisualStates({});
        setTextStates({});
        setSaveErrors({});
        setTextErrors({});
        setCustomModelById({});
      } catch (error) {
        setLoadError(errorMessage(error, translate('applications.loadFailed')));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fallbackEndpoint],
  );

  useEffect(() => {
    if (!settingsLoaded) void loadSettings();
  }, [loadSettings, settingsLoaded]);

  useEffect(() => {
    if (!providersLoaded) void loadProviders();
  }, [loadProviders, providersLoaded]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const performVisualSave = useCallback(
    async (id: AgentAppId, form: AgentForm, version: number) => {
      if (rawDirtyRef.current[id]) return;
      const status = statusesRef.current[id];
      if (!status) return;

      if (!form.endpoint.trim()) {
        setSaveState(id, 'error', t('applications.endpointRequired'));
        return;
      }
      if (form.tokenMode === 'melody' && !appTokenRef.current.trim()) {
        setSaveState(id, 'error', t('applications.tokenRequired'));
        return;
      }
      if (form.tokenMode === 'custom' && !form.token.trim() && !status.authTokenSet) {
        setSaveState(id, 'error', t('applications.tokenRequired'));
        return;
      }

      setSaveState(id, 'saving');
      const config: AgentAppConfigInput = {
        id,
        endpoint: form.endpoint,
        model: form.model,
        availableModels: form.availableModels,
        reasoningEffort: form.reasoningEffort === 'auto' ? '' : form.reasoningEffort,
        thinkingEnabled: form.thinkingEnabled,
        featureFlags: form.featureFlags,
        authToken: form.tokenMode === 'keep' ? null : form.tokenMode === 'melody' ? appTokenRef.current : form.token,
      };

      try {
        const updated = await desktopApi.saveAgentAppConfig(config);
        setStatus(updated);
        if (visualVersionRef.current[id] === version) {
          const nextForm = formFromStatus(updated, fallbackEndpoint(id), Boolean(appTokenRef.current));
          formsRef.current = { ...formsRef.current, [id]: nextForm };
          configTextsRef.current = { ...configTextsRef.current, [id]: updated.configText };
          setForms((current) => ({ ...current, [id]: nextForm }));
          setConfigTexts((current) => ({ ...current, [id]: updated.configText }));
          setSaveState(id, 'saved');
        } else {
          setSaveState(id, 'dirty');
        }
      } catch (error) {
        setSaveState(id, 'error', errorMessage(error, t('applications.saveFailed')));
      }
    },
    [fallbackEndpoint, t],
  );

  const performTextSave = useCallback(
    async (id: AgentAppId, content: string, version: number) => {
      setTextState(id, 'saving');
      try {
        const updated = await desktopApi.saveAgentAppText(id, content);
        setStatus(updated);
        if (textVersionRef.current[id] === version) {
          rawDirtyRef.current[id] = false;
          configTextsRef.current = { ...configTextsRef.current, [id]: updated.configText };
          formsRef.current = {
            ...formsRef.current,
            [id]: formFromStatus(updated, fallbackEndpoint(id), Boolean(appTokenRef.current)),
          };
          setConfigTexts((current) => ({ ...current, [id]: updated.configText }));
          setForms((current) => ({
            ...current,
            [id]: formFromStatus(updated, fallbackEndpoint(id), Boolean(appTokenRef.current)),
          }));
          setTextState(id, 'saved');
          setSaveState(id, 'idle');
        } else {
          setTextState(id, 'dirty');
        }
      } catch (error) {
        setTextState(id, 'error', errorMessage(error, t('applications.finalConfig.invalid')));
      }
    },
    [fallbackEndpoint, t],
  );

  const updateCodexSetting = useCallback(
    (key: string, value: unknown) => {
      const task = codexSettingChainRef.current.then(async () => {
        if (rawDirtyRef.current.codex) {
          toast(t('applications.codexSettings.rawPending'), 'info');
          return;
        }
        const visualTimer = visualTimersRef.current.codex;
        if (visualTimer) clearTimeout(visualTimer);
        visualVersionRef.current.codex += 1;
        setTextState('codex', 'saving');
        try {
          const updated = await desktopApi.saveAgentAppSetting('codex', key, value);
          setStatus(updated);
          rawDirtyRef.current.codex = false;
          configTextsRef.current = { ...configTextsRef.current, codex: updated.configText };
          formsRef.current = {
            ...formsRef.current,
            codex: formFromStatus(updated, fallbackEndpoint('codex'), Boolean(appTokenRef.current)),
          };
          setConfigTexts((current) => ({ ...current, codex: updated.configText }));
          setForms((current) => ({
            ...current,
            codex: formFromStatus(updated, fallbackEndpoint('codex'), Boolean(appTokenRef.current)),
          }));
          setTextState('codex', 'saved');
          setSaveState('codex', 'idle');
        } catch (error) {
          setTextState('codex', 'error', errorMessage(error, t('applications.saveFailed')));
        }
      });
      codexSettingChainRef.current = task.catch(() => undefined);
      return task;
    },
    [fallbackEndpoint, t],
  );

  const updateForm = (id: AgentAppId, partial: Partial<AgentForm>) => {
    const nextForm = { ...formFor(id), ...partial };
    formsRef.current = { ...formsRef.current, [id]: nextForm };
    visualVersionRef.current[id] += 1;
    setForms((current) => ({ ...current, [id]: nextForm }));
    setSaveState(id, 'dirty');
  };

  const updateConfigText = (id: AgentAppId, content: string) => {
    rawDirtyRef.current[id] = true;
    textVersionRef.current[id] += 1;
    configTextsRef.current = { ...configTextsRef.current, [id]: content };
    setConfigTexts((current) => ({ ...current, [id]: content }));
    setTextState(id, 'dirty');
    const visualTimer = visualTimersRef.current[id];
    if (visualTimer) clearTimeout(visualTimer);
  };

  const handleManualVisualSave = (id: AgentAppId) => {
    const form = formsRef.current[id];
    if (!form) return;
    const version = visualVersionRef.current[id];
    void performVisualSave(id, form, version);
  };

  const handleManualTextSave = (id: AgentAppId) => {
    const content = configTextsRef.current[id];
    if (content === undefined) return;
    const version = textVersionRef.current[id];
    void performTextSave(id, content, version);
  };

  const restoreConfig = async (status: AgentAppStatus) => {
    setRestoringId(status.id);
    try {
      const restored = await desktopApi.restoreAgentAppConfig(status.id);
      rawDirtyRef.current[status.id] = false;
      setStatus(restored);
      const nextForm = formFromStatus(restored, fallbackEndpoint(status.id), Boolean(appTokenRef.current));
      formsRef.current = { ...formsRef.current, [status.id]: nextForm };
      configTextsRef.current = { ...configTextsRef.current, [status.id]: restored.configText };
      setForms((current) => ({ ...current, [status.id]: nextForm }));
      setConfigTexts((current) => ({ ...current, [status.id]: restored.configText }));
      setVisualStates((current) => ({ ...current, [status.id]: 'saved' }));
      setTextStates((current) => ({ ...current, [status.id]: 'saved' }));
      toast(t('applications.restored'), 'success');
    } catch (error) {
      toast(errorMessage(error, t('applications.restoreFailed')), 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const activeAgent = AGENTS.find((agent) => agent.id === activeId) ?? AGENTS[0];
  const activeStatus = statuses[activeAgent.id];
  const activeForm = forms[activeAgent.id] ?? formFor(activeAgent.id);
  const activeConfigText = configTexts[activeAgent.id] ?? '';
  const activeVisualState = visualStates[activeAgent.id] ?? 'idle';
  const activeTextState = textStates[activeAgent.id] ?? 'idle';
  const ActiveIcon = activeAgent.icon;
  const configuredModelValues = useMemo(() => {
    const values = new Set<string>();
    providers.forEach((provider) => {
      provider.models.forEach((model) => {
        if (model.id.trim()) values.add(model.id.trim());
        if (model.name.trim()) values.add(model.name.trim());
        if (model.alias?.trim()) values.add(model.alias.trim());
      });
    });
    return [...values].sort((left, right) => left.localeCompare(right));
  }, [providers]);
  const activeModelCustom =
    customModelById[activeAgent.id] ?? (Boolean(activeForm.model) && !configuredModelValues.includes(activeForm.model));
  const modelOptions = useMemo(
    () => [
      { value: '', label: t('applications.modelMode.auto') },
      ...configuredModelValues.map((model) => ({ value: model, label: model })),
      { value: CUSTOM_MODEL_VALUE, label: t('applications.modelMode.custom') },
    ],
    [configuredModelValues, t],
  );

  return (
    <div style={{ paddingBottom: 'var(--spacer-24)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--spacer-16)',
          marginBottom: 'var(--spacer-20)',
        }}
      >
        <div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t('applications.subtitle')}</p>
          <p style={{ margin: '6px 0 0', color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
            {t('applications.securityHint')}
          </p>
        </div>
        <Button
          variant="secondary"
          size="md"
          icon={RefreshCw}
          loading={refreshing}
          onClick={() => void loadAgents(true)}
          disabled={loading}
        >
          {t('applications.refresh')}
        </Button>
      </div>

      {loadError && (
        <Card
          style={{
            marginBottom: 'var(--spacer-16)',
            borderColor: 'var(--status-error-default)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacer-8)',
            color: 'var(--status-error-default)',
          }}
        >
          <AlertCircle size={16} />
          <span>{loadError}</span>
        </Card>
      )}

      {loading ? (
        <Card padding="var(--spacer-32)" style={{ color: 'var(--text-tertiary)', textAlign: 'center' }}>
          {t('applications.loading')}
        </Card>
      ) : (
        <>
          <div
            role="tablist"
            aria-label={t('applications.tabsLabel')}
            style={{
              display: 'flex',
              gap: 'var(--spacer-4)',
              borderBottom: '1px solid var(--border-neutral-l1)',
              marginBottom: 'var(--spacer-16)',
              overflowX: 'auto',
            }}
          >
            {AGENTS.map((agent) => {
              const status = statuses[agent.id];
              const selected = activeAgent.id === agent.id;
              const Icon = agent.icon;
              return (
                <button
                  key={agent.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveId(agent.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--spacer-8)',
                    flexShrink: 0,
                    border: 'none',
                    borderBottom: `2px solid ${selected ? 'var(--bg-brand)' : 'transparent'}`,
                    background: 'transparent',
                    color: selected ? 'var(--text-default)' : 'var(--text-secondary)',
                    padding: '0 var(--spacer-12) var(--spacer-10)',
                    fontFamily: 'inherit',
                    fontSize: 'var(--body-base-font-size)',
                    fontWeight: selected ? 'var(--font-weight-strong)' : 'var(--font-weight-medium)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={16} />
                  <span>{t(agent.nameKey)}</span>
                  <span
                    aria-label={
                      status?.configExists ? t('applications.statusDetected') : t('applications.statusNotDetected')
                    }
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: status ? statusColor(status) : 'var(--text-tertiary)',
                    }}
                  />
                </button>
              );
            })}
          </div>

          {!activeStatus ? (
            <Card padding="var(--spacer-32)" style={{ color: 'var(--text-tertiary)', textAlign: 'center' }}>
              {t('applications.loading')}
            </Card>
          ) : (
            <AnimatedContent key={activeAgent.id} delay={40}>
              <div role="tabpanel" aria-label={t(activeAgent.nameKey)}>
                <Card padding="0" style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 'var(--spacer-16)',
                      padding: 'var(--spacer-16)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacer-12)', minWidth: 0 }}>
                      <span
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 'var(--radius-8)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--icon-brand)',
                          background: 'var(--brand-100)',
                          flexShrink: 0,
                        }}
                      >
                        <ActiveIcon size={20} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacer-8)' }}
                        >
                          <CardTitle style={{ margin: 0 }}>{t(activeAgent.nameKey)}</CardTitle>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: statusColor(activeStatus),
                              fontSize: 'var(--body-xs-font-size)',
                            }}
                          >
                            {activeStatus.error ? (
                              <AlertCircle size={12} />
                            ) : activeStatus.configExists ? (
                              <CheckCircle2 size={12} />
                            ) : null}
                            {activeStatus.error
                              ? t('applications.statusError')
                              : activeStatus.configExists
                                ? t('applications.statusDetected')
                                : t('applications.statusNotDetected')}
                          </span>
                        </div>
                        <CardDesc>{t(activeAgent.descriptionKey)}</CardDesc>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-12)', flexShrink: 0 }}>
                      <SaveIndicator state={activeVisualState} error={saveErrors[activeAgent.id]} t={t} />
                      <Button
                        variant="primary"
                        size="md"
                        loading={activeVisualState === 'saving'}
                        disabled={activeVisualState !== 'dirty'}
                        onClick={() => handleManualVisualSave(activeAgent.id)}
                      >
                        {t('applications.save')}
                      </Button>
                      {activeStatus.backupExists && (
                        <Button
                          variant="secondary"
                          size="md"
                          icon={RotateCcw}
                          loading={restoringId === activeAgent.id}
                          disabled={restoringId !== null}
                          onClick={() => void restoreConfig(activeStatus)}
                          aria-label={t('applications.restore')}
                          title={t('applications.restore')}
                        >
                          {t('applications.restore')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {activeStatus.error && (
                    <div
                      style={{
                        margin: 'var(--spacer-16) var(--spacer-20) 0',
                        padding: 'var(--spacer-8) var(--spacer-10)',
                        borderRadius: 'var(--radius-6)',
                        background: 'color-mix(in srgb, var(--status-error-default) 10%, transparent)',
                        color: 'var(--status-error-default)',
                        fontSize: 'var(--body-sm-font-size)',
                      }}
                    >
                      {activeStatus.error}
                    </div>
                  )}

                  {!activeStatus.isManaged && activeStatus.configExists && !activeStatus.error && (
                    <div
                      style={{
                        margin: 'var(--spacer-16) var(--spacer-20) 0',
                        padding: 'var(--spacer-8) var(--spacer-10)',
                        borderRadius: 'var(--radius-6)',
                        background: 'color-mix(in srgb, var(--status-warning-default, var(--text-secondary)) 8%, transparent)',
                        color: 'var(--text-secondary)',
                        fontSize: 'var(--body-sm-font-size)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacer-6)',
                      }}
                    >
                      <AlertCircle size={14} style={{ flexShrink: 0, color: 'var(--status-warning-default, var(--text-secondary))' }} />
                      {t('applications.notManagedHint')}
                    </div>
                  )}

                  <div style={{ padding: 'var(--spacer-16)' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--spacer-12)',
                        marginBottom: 'var(--spacer-16)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--spacer-6)',
                          color: 'var(--text-tertiary)',
                          fontSize: 'var(--body-xs-font-size)',
                        }}
                      >
                        <FileCog size={13} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {activeStatus.configLabel}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          paddingBottom: 'var(--spacer-6)',
                          color: 'var(--text-default)',
                          fontSize: 'var(--body-sm-font-size)',
                          fontWeight: 'var(--font-weight-strong)',
                        }}
                      >
                        {t('applications.basicSection')}
                      </div>
                      <SettingRow
                        label={t('applications.endpoint')}
                        hint={
                          activeAgent.id === 'claude'
                            ? t('applications.claude.endpointHint')
                            : t('applications.endpointHint')
                        }
                      >
                        <Input
                          value={activeForm.endpoint}
                          onChange={(event) => updateForm(activeAgent.id, { endpoint: event.target.value })}
                          placeholder={fallbackEndpoint(activeAgent.id)}
                          aria-label={`${t(activeAgent.nameKey)} ${t('applications.endpoint')}`}
                        />
                      </SettingRow>
                      <SettingRow label={t('applications.protocol')} hint={t('applications.protocolFixed')}>
                        <Dropdown
                          options={[
                            { value: 'responses', label: t('applications.protocol.responses') },
                            { value: 'messages', label: t('applications.protocol.messages') },
                          ]}
                          value={activeAgent.protocolValue}
                          onChange={() => undefined}
                          disabled
                          size="sm"
                          style={{ width: '100%' }}
                        />
                      </SettingRow>
                      <SettingRow
                        label={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
                            {t('applications.model')}
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: 'var(--text-tertiary)',
                                fontSize: 'var(--body-xs-font-size)',
                                fontWeight: 'var(--font-weight-normal)',
                              }}
                            >
                              {t('applications.modelCustom')}
                              <Switch
                                checked={activeModelCustom}
                                onChange={(enabled) => {
                                  setCustomModelById((current) => ({ ...current, [activeAgent.id]: enabled }));
                                  if (enabled) {
                                    // 开启自定义模型时，认证令牌自动切换到手动输入，并清空可用模型列表
                                    updateForm(activeAgent.id, {
                                      tokenMode: 'custom',
                                      availableModels: [],
                                    });
                                  } else {
                                    // 关闭自定义模型时，清空自定义模型值并切回 Melody 令牌
                                    const nextModel = activeForm.model && configuredModelValues.includes(activeForm.model)
                                      ? activeForm.model
                                      : '';
                                    updateForm(activeAgent.id, {
                                      model: nextModel,
                                      tokenMode: appTokenRef.current ? 'melody' : 'keep',
                                    });
                                  }
                                }}
                                aria-label={t('applications.modelCustom')}
                              />
                            </span>
                          </span>
                        }
                        hint={t('applications.modelHint')}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            gap: 'var(--spacer-8)',
                            width: '100%',
                          }}
                        >
                          <Dropdown
                            options={modelOptions}
                            value={activeModelCustom ? CUSTOM_MODEL_VALUE : activeForm.model}
                            onChange={(value) => {
                              if (value === CUSTOM_MODEL_VALUE) {
                                setCustomModelById((current) => ({ ...current, [activeAgent.id]: true }));
                                return;
                              }
                              setCustomModelById((current) => ({ ...current, [activeAgent.id]: false }));
                              updateForm(activeAgent.id, { model: value });
                            }}
                            disabled={activeModelCustom}
                            placeholder={t('applications.modelMode.auto')}
                            size="sm"
                            style={{ width: '100%' }}
                          />
                          {activeModelCustom && (
                            <Input
                              value={activeForm.model}
                              onChange={(event) => updateForm(activeAgent.id, { model: event.target.value })}
                              placeholder={t('applications.modelPlaceholder')}
                              aria-label={`${t(activeAgent.nameKey)} ${t('applications.customModel')}`}
                            />
                          )}
                        </div>
                      </SettingRow>
                      {!activeModelCustom && (
                        <SettingRow
                          label={t('applications.availableModels')}
                          hint={t('applications.availableModelsHint')}
                        >
                          <MultiSelectDropdown
                            options={configuredModelValues.filter((m) => m !== activeForm.model)}
                            selected={activeForm.availableModels}
                            onChange={(next) => updateForm(activeAgent.id, { availableModels: next })}
                            placeholder={t('applications.availableModelsPlaceholder')}
                            emptyText={t('applications.availableModelsEmpty')}
                            searchPlaceholder={t('applications.availableModelsSearch')}
                            noMatchText={t('applications.availableModelsNoMatch')}
                          />
                        </SettingRow>
                      )}
                      <SettingRow label={t('applications.authToken')} hint={t('applications.authTokenHint')}>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            gap: 'var(--spacer-8)',
                            width: '100%',
                          }}
                        >
                          <Dropdown
                            options={(['melody', 'keep', 'custom'] as TokenMode[]).map((mode) => ({
                              value: mode,
                              label: t(`applications.tokenMode.${mode}`),
                            }))}
                            value={activeForm.tokenMode}
                            onChange={(value) => updateForm(activeAgent.id, { tokenMode: value as TokenMode })}
                            size="sm"
                            style={{ width: '100%' }}
                          />
                          {activeForm.tokenMode === 'custom' && (
                            <Input
                              type="password"
                              value={activeForm.token}
                              onChange={(event) => updateForm(activeAgent.id, { token: event.target.value })}
                              placeholder={
                                activeStatus.authTokenSet
                                  ? t('applications.tokenKeepHint')
                                  : t('applications.tokenPlaceholder')
                              }
                              autoComplete="new-password"
                              aria-label={`${t(activeAgent.nameKey)} ${t('applications.customToken')}`}
                            />
                          )}
                          {activeForm.tokenMode === 'keep' && activeStatus.authTokenSet && (
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)' }}>
                              {activeStatus.authTokenMasked} {t('applications.tokenKeepHint')}
                            </span>
                          )}
                        </div>
                      </SettingRow>

                      <div
                        style={{
                          marginTop: 'var(--spacer-12)',
                          paddingBottom: 'var(--spacer-6)',
                          color: 'var(--text-default)',
                          fontSize: 'var(--body-sm-font-size)',
                          fontWeight: 'var(--font-weight-strong)',
                        }}
                      >
                        {t('applications.reasoningSection')}
                      </div>
                      <SettingRow
                        label={t('applications.reasoningEffort')}
                        hint={t('applications.reasoningEffortHint')}
                        last={!activeAgent.showThinkingToggle && activeAgent.featureKeys.length === 0}
                      >
                        <Dropdown
                          options={activeAgent.reasoningEfforts.map((effort) => ({
                            value: effort,
                            label: t(`applications.reasoning.${effort}`),
                          }))}
                          value={
                            activeAgent.reasoningEfforts.includes(activeForm.reasoningEffort)
                              ? activeForm.reasoningEffort
                              : 'auto'
                          }
                          onChange={(value) =>
                            updateForm(activeAgent.id, { reasoningEffort: value as ReasoningEffort })
                          }
                          size="sm"
                          style={{ width: '100%' }}
                        />
                      </SettingRow>
                      {activeAgent.showThinkingToggle && (
                        <SwitchGrid
                          last={activeAgent.featureKeys.length === 0}
                          items={[
                            {
                              key: 'thinkingEnabled',
                              label: t('applications.thinkingEnabled'),
                              hint: t('applications.thinkingEnabledHint'),
                              checked: activeForm.thinkingEnabled,
                              onChange: (enabled: boolean) =>
                                updateForm(activeAgent.id, { thinkingEnabled: enabled }),
                            },
                          ]}
                        />
                      )}

                      {activeAgent.featureKeys.length > 0 && (
                        <>
                          <div
                            style={{
                              marginTop: 'var(--spacer-12)',
                              paddingBottom: 'var(--spacer-6)',
                              color: 'var(--text-default)',
                              fontSize: 'var(--body-sm-font-size)',
                              fontWeight: 'var(--font-weight-strong)',
                            }}
                          >
                            {t('applications.featuresSection')}
                          </div>
                          <SwitchGrid
                            last
                            items={activeAgent.featureKeys.map((featureKey) => ({
                              key: featureKey,
                              label: t(FEATURE_LABEL_KEYS[featureKey]),
                              hint: t(FEATURE_HINT_KEYS[featureKey]),
                              checked: Boolean(activeForm.featureFlags[featureKey]),
                              onChange: (enabled: boolean) =>
                                updateForm(activeAgent.id, {
                                  featureFlags: { ...activeForm.featureFlags, [featureKey]: enabled },
                                }),
                            }))}
                          />
                        </>
                      )}
                    </div>
                  </div>

                </Card>

                {activeAgent.id === 'codex' && (
                  <CodexSettingsEditor
                    settings={activeStatus.codexSettings ?? {}}
                    onSettingChange={updateCodexSetting}
                    t={t}
                    managed={!activeModelCustom}
                  />
                )}

                {activeAgent.id === 'claude' && (
                  <ClaudeSettingsEditor
                    content={activeConfigText}
                    onChange={(content) => updateConfigText('claude', content)}
                    t={t}
                  />
                )}

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
                      <FileText size={17} style={{ color: 'var(--icon-secondary)', marginTop: 2 }} />
                      <div>
                        <CardTitle style={{ margin: 0 }}>{t('applications.finalConfig.title')}</CardTitle>
                        <CardDesc>{t('applications.finalConfig.hint')}</CardDesc>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-12)', flexShrink: 0 }}>
                      <SaveIndicator state={activeTextState} error={textErrors[activeAgent.id]} t={t} />
                      <Button
                        variant="primary"
                        size="md"
                        loading={activeTextState === 'saving'}
                        disabled={activeTextState !== 'dirty'}
                        onClick={() => handleManualTextSave(activeAgent.id)}
                      >
                        {t('applications.save')}
                      </Button>
                    </div>
                  </div>
                  <div style={{ padding: 'var(--spacer-16) var(--spacer-20) var(--spacer-20)' }}>
                    <textarea
                      value={activeConfigText}
                      onChange={(event) => updateConfigText(activeAgent.id, event.target.value)}
                      spellCheck={false}
                      aria-label={t('applications.finalConfig.title')}
                      placeholder={t('applications.finalConfig.empty')}
                      style={{
                        display: 'block',
                        width: '100%',
                        minHeight: 220,
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        padding: 'var(--spacer-12)',
                        border: '1px solid var(--border-neutral-l1)',
                        borderRadius: 'var(--radius-8)',
                        background: 'var(--bg-base-default)',
                        color: 'var(--text-default)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: 'var(--body-sm-font-size)',
                        lineHeight: 1.6,
                        outline: 'none',
                      }}
                    />
                    <p
                      style={{
                        margin: 'var(--spacer-8) 0 0',
                        color: 'var(--text-tertiary)',
                        fontSize: 'var(--body-xs-font-size)',
                      }}
                    >
                      {t('applications.finalConfig.secretHint')}
                    </p>
                  </div>
                </Card>
              </div>
            </AnimatedContent>
          )}
        </>
      )}
    </div>
  );
};

export default ApplicationSettings;
