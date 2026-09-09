import { useT } from '../../i18n';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { Dropdown, toast, ProviderLogo, Switch, Button } from '../../components/ui';
import './providers.css';
import { Chip } from './chip';
import { WizardSteps } from '../../components/interior/wizard-steps';
import { LoadingButton } from '../../components/interior/loading-button';
import { useIconMorph, MorphGlyph } from '../../components/interior/icon-morph';
import { FloatingLabelInput } from '../../components/interior/floating-label';

// 远端模型行内加号→✓：map 回调里不能调 hook，包一层行级组件持有变形状态。
function AddedGlyph({ added }: { added: boolean }) {
  const icon = useIconMorph({ preset: 'plus-check', active: added });
  return <MorphGlyph slots={icon.slots} rotate={icon.rotate} transition={icon.transition} mode={icon.mode} size={12} />;
}
import type { DropdownOption } from '../../components/ui';
import type { Model } from '../../types/provider';
import { buildModelFromName } from '../../lib/modelPresets';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  Brain,
  SlidersHorizontal,
  Wrench,
  Braces,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

interface ProviderProfileEntry {
  id: string;
  label: string;
  baseUrl: string;
  flavor: string;
}

interface RemoteModelEntry {
  id: string;
  name: string;
}

interface FetchModelsResult {
  success: boolean;
  models: RemoteModelEntry[];
  message: string;
}

// ── Constants ──────────────────────────────────────────────

const API_FLAVOR_OPTIONS: DropdownOption[] = [
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'responses', label: 'Responses' },
];

const REASONING_EFFORT_OPTIONS: Array<{ value: 'low' | 'medium' | 'high'; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const FALLBACK_PROFILES: ProviderProfileEntry[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', flavor: 'responses' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', flavor: 'anthropic' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', flavor: 'openai-compatible' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', flavor: 'openai-compatible' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', flavor: 'openai-compatible' },
  { id: 'xai', label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', flavor: 'openai-compatible' },
  { id: 'togetherai', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', flavor: 'openai-compatible' },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    flavor: 'openai-compatible',
  },
  { id: 'cerebras', label: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', flavor: 'openai-compatible' },
  { id: 'deepinfra', label: 'Deep Infra', baseUrl: 'https://api.deepinfra.com/v1/openai', flavor: 'openai-compatible' },
  { id: 'baseten', label: 'Baseten', baseUrl: 'https://inference.baseten.co/v1', flavor: 'openai-compatible' },
  { id: 'mistral', label: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', flavor: 'openai-compatible' },
  { id: 'cohere', label: 'Cohere', baseUrl: 'https://api.cohere.ai/v1', flavor: 'openai-compatible' },
  { id: 'perplexity', label: 'Perplexity', baseUrl: 'https://api.perplexity.ai', flavor: 'openai-compatible' },
  { id: 'nvidia', label: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', flavor: 'openai-compatible' },
  {
    id: 'alibaba',
    label: 'Alibaba (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    flavor: 'openai-compatible',
  },
  { id: 'venice', label: 'Venice AI', baseUrl: 'https://api.venice.ai/api/v1', flavor: 'openai-compatible' },
  { id: '302ai', label: '302.AI', baseUrl: 'https://api.302.ai/v1', flavor: 'openai-compatible' },
  { id: 'moonshot', label: 'Moonshot AI (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', flavor: 'openai-compatible' },
  { id: 'minimax', label: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', flavor: 'openai-compatible' },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    flavor: 'openai-compatible',
  },
  { id: 'zai', label: 'Z.AI', baseUrl: 'https://api.z.ai/api/paas/v4', flavor: 'openai-compatible' },
  { id: 'ionet', label: 'IO.NET', baseUrl: 'https://api.intelligence.io.solutions/v1', flavor: 'openai-compatible' },
  {
    id: 'nebius',
    label: 'Nebius Token Factory',
    baseUrl: 'https://api.studio.nebius.ai/v1',
    flavor: 'openai-compatible',
  },
  { id: 'cortecs', label: 'Cortecs', baseUrl: 'https://api.cortecs.ai/v1', flavor: 'openai-compatible' },
  { id: 'stackit', label: 'STACKIT', baseUrl: 'https://api.openai.stackit.tech/v1', flavor: 'openai-compatible' },
  {
    id: 'ovhcloud',
    label: 'OVHcloud AI Endpoints',
    baseUrl: 'https://endpoints.ai.eu.ovhcloud.com/v1',
    flavor: 'openai-compatible',
  },
  { id: 'scaleway', label: 'Scaleway', baseUrl: 'https://api.scaleway.ai/ai-apis/v1', flavor: 'openai-compatible' },
  { id: 'helicone', label: 'Helicone', baseUrl: 'https://ai-gateway.helicone.ai', flavor: 'openai-compatible' },
  { id: 'frogbot', label: 'FrogBot', baseUrl: 'https://api.frogbot.ai/v1', flavor: 'openai-compatible' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://127.0.0.1:11434/v1', flavor: 'openai-compatible' },
  { id: 'ollama-cloud', label: 'Ollama Cloud', baseUrl: 'https://api.olama.cloud/v1', flavor: 'openai-compatible' },
  { id: 'lmstudio', label: 'LM Studio (local)', baseUrl: 'http://127.0.0.1:1234/v1', flavor: 'openai-compatible' },
  { id: 'llamacpp', label: 'llama.cpp (local)', baseUrl: 'http://127.0.0.1:8080/v1', flavor: 'openai-compatible' },
  { id: 'vllm', label: 'vLLM (local)', baseUrl: 'http://127.0.0.1:8000/v1', flavor: 'openai-compatible' },
  { id: 'atomic-chat', label: 'Atomic Chat (local)', baseUrl: 'http://127.0.0.1:1337/v1', flavor: 'openai-compatible' },
  {
    id: 'amazon-bedrock',
    label: 'Amazon Bedrock',
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    flavor: 'openai-compatible',
  },
  {
    id: 'azure-openai',
    label: 'Azure OpenAI',
    baseUrl: 'https://RESOURCE_NAME.openai.azure.com',
    flavor: 'openai-compatible',
  },
  {
    id: 'azure-cognitive-services',
    label: 'Azure Cognitive Services',
    baseUrl: 'https://RESOURCE_NAME.cognitiveservices.azure.com',
    flavor: 'openai-compatible',
  },
  {
    id: 'google-vertex',
    label: 'Google Vertex AI',
    baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1',
    flavor: 'openai-compatible',
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    baseUrl: 'https://api.githubcopilot.com',
    flavor: 'openai-compatible',
  },
  { id: 'gitlab-duo', label: 'GitLab Duo', baseUrl: 'https://cloud.gitlab.com/ai/v1', flavor: 'openai-compatible' },
  {
    id: 'sap-ai-core',
    label: 'SAP AI Core',
    baseUrl: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2',
    flavor: 'openai-compatible',
  },
  {
    id: 'cloudflare-ai-gateway',
    label: 'Cloudflare AI Gateway',
    baseUrl: 'https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/GATEWAY_ID',
    flavor: 'openai-compatible',
  },
  {
    id: 'vercel-ai-gateway',
    label: 'Vercel AI Gateway',
    baseUrl: 'https://ai-gateway.vercel.sh/v1',
    flavor: 'openai-compatible',
  },
  { id: 'zenmux', label: 'ZenMux', baseUrl: 'https://api.zenmux.ai/v1', flavor: 'openai-compatible' },
  { id: 'opencode-zen', label: 'OpenCode Zen', baseUrl: 'https://zen.opencode.ai/v1', flavor: 'openai-compatible' },
];

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : e ? String(e) : fallback);

const modelIdFromName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, '-')
    .replace(/^-+|-+$/g, '') ||
  crypto.randomUUID?.() ||
  Date.now().toString(36);

// `makeModel` wraps buildModelFromName to apply preset auto-fill
// based on the model name (regex match in modelPresets.ts).
const makeModel = (name: string, id?: string): Model => buildModelFromName(name, id);

// ── Shared input styles ────────────────────────────────────

const inputBaseStyle: React.CSSProperties = {
  height: 36,
  padding: '0 var(--spacer-12)',
  borderRadius: 'var(--radius-8)',
  border: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-base-default)',
  color: 'var(--text-default)',
  fontSize: 'var(--body-base-font-size)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color var(--transition-fast, 0.12s ease)',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacer-6)',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-default)',
  fontSize: 'var(--body-base-font-size)',
  fontWeight: 'var(--font-weight-medium)',
};

// ── Page Component ──────────────────────────────────────────

export const AddProviderPage: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const addProvider = useProviderStore((s) => s.addProvider);

  // Form state
  const [name, setName] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiFlavor, setApiFlavor] = useState('openai-compatible');
  const [models, setModels] = useState<Model[]>([]);
  const [remoteModels, setRemoteModels] = useState<RemoteModelEntry[]>([]);
  const [modelFetchMessage, setModelFetchMessage] = useState('');
  const [manualModelName, setManualModelName] = useState('');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [nameError, setNameError] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(false);
  const [apiBaseError, setApiBaseError] = useState(false);
  const [profiles, setProfiles] = useState<ProviderProfileEntry[]>(FALLBACK_PROFILES);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardKey, setStepperKey] = useState(0);
  const [retryStep, setRetryStep] = useState(1);
  const [finishError, setFinishError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Model mapping & proxy state
  const [modelMappingEntries, setModelMappingEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [modelMappingExpanded, setModelMappingExpanded] = useState(false);
  const mappingChevron = useIconMorph({ preset: 'chevron', active: modelMappingExpanded });
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');

  useEffect(() => {
    invoke<ProviderProfileEntry[]>('list_provider_profiles')
      .then(setProfiles)
      .catch(() => {
        /* keep FALLBACK_PROFILES */
      });
  }, []);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // ── Profile selection ────────────────────────────────────

  const handleProfileChange = (profileId: string) => {
    setSelectedProfile(profileId);
    if (profileId === 'custom') return;
    const p = profiles.find((x) => x.id === profileId);
    if (p) {
      setName((prev) => prev.trim() || p.label);
      setApiBase(p.baseUrl);
      setApiFlavor(p.flavor);
      setApiBaseError(false);
    }
  };

  const profileOptions: DropdownOption[] = useMemo(() => {
    const groupOf = (id: string): string => {
      if (id === 'openai' || id === 'anthropic') return '原生协议';
      if (['ollama', 'ollama-cloud', 'lmstudio', 'llamacpp', 'vllm', 'atomic-chat'].includes(id)) return '本地运行时';
      if (
        [
          'amazon-bedrock',
          'azure-openai',
          'azure-cognitive-services',
          'google-vertex',
          'github-copilot',
          'gitlab-duo',
          'sap-ai-core',
          'cloudflare-ai-gateway',
          'vercel-ai-gateway',
          'zenmux',
          'opencode-zen',
        ].includes(id)
      )
        return '云平台';
      return 'OpenAI 兼容';
    };
    const opts: DropdownOption[] = profiles.map((p) => ({
      value: p.id,
      label: p.label,
      group: groupOf(p.id),
    }));
    opts.push({ value: 'custom', label: t('providers.add.custom') });
    return opts;
  }, [profiles, t]);

  // ── Model management ─────────────────────────────────────

  const addModel = useCallback((model: Model) => {
    const cleanName = model.name.trim();
    if (!cleanName) return;
    setModels((prev) => {
      const exists = prev.some((m) => m.name.toLowerCase() === cleanName.toLowerCase() || m.id === model.id);
      if (exists) {
        toast(`模型「${cleanName}」已在列表中`, 'info');
        return prev;
      }
      return [...prev, { ...model, name: cleanName }];
    });
  }, []);

  const updateModel = (index: number, patch: Partial<Model>) => {
    setModels((prev) =>
      prev.map((model, i) => {
        if (i !== index) return model;
        const next = { ...model, ...patch };
        if (patch.supportsReasoning === false) {
          next.supportsReasoningEffort = false;
          next.defaultReasoningEffort = undefined;
        }
        if (patch.supportsReasoningEffort === false) {
          next.defaultReasoningEffort = undefined;
        }
        return next;
      }),
    );
  };

  const removeModel = (index: number) => {
    setModels((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Model mapping management ────────────────────────────

  const addModelMappingEntry = () => {
    setModelMappingEntries((prev) => [...prev, { key: '', value: '' }]);
  };

  const updateModelMappingEntry = (index: number, patch: Partial<{ key: string; value: string }>) => {
    setModelMappingEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  const removeModelMappingEntry = (index: number) => {
    setModelMappingEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const addManualModel = () => {
    const cleanName = manualModelName.trim();
    if (!cleanName) return;
    addModel(makeModel(cleanName));
    setManualModelName('');
  };

  // 进行态由 LoadingButton 拥有。语义收敛：原来 !success 时发 info toast，现在统一走 error（按钮 error 脸要求真实失败信号；服务端原文保留）。
  const handleFetchModels = async () => {
    if (!apiBase.trim() || !apiKey.trim()) {
      toast('请先填写 API Base URL 和 API Key', 'error');
      throw new Error('missing credentials');
    }
    setModelFetchMessage('');
    try {
      const result = await invoke<FetchModelsResult>('fetch_provider_models', {
        flavor: apiFlavor,
        apiBase,
        apiKey,
      });
      setRemoteModels(result.models ?? []);
      setModelFetchMessage(result.message);
      if (!result.success) throw new Error(result.message);
      toast(result.message, 'success');
    } catch (e: unknown) {
      const message = errorMessage(e, '拉取模型失败');
      setModelFetchMessage(message);
      toast(message, 'error');
      throw e;
    }
  };

  // ── Test connection ──────────────────────────────────────

  // 进行/成功/失败三态交给 LoadingButton；testResult 只负责结果横幅与向导门禁。
  // 成功反馈 = 按钮 success 脸 + 结果横幅（不再重复发成功 toast）；失败保留 toast 后继续 throw 进 error 脸。
  const handleTestConnection = async () => {
    setTestResult('idle');
    setTestMessage('');
    try {
      const result = await invoke<{
        success: boolean;
        modelCount?: number;
        error?: { kind: string; message: string };
        message: string;
      }>('test_provider_connection', {
        flavor: apiFlavor,
        apiBase,
        apiKey,
      });
      if (result.success) {
        setTestResult('success');
        setTestMessage(result.message);
        return;
      }
      setTestResult('fail');
      setTestMessage(result.message);
      toast(result.message, 'error');
      throw new Error(result.message);
    } catch (e: unknown) {
      setTestResult('fail');
      setTestMessage(errorMessage(e, '连接测试失败'));
      toast(errorMessage(e, '连接测试失败'), 'error');
      throw e instanceof Error ? e : new Error(errorMessage(e, '连接测试失败'));
    }
  };

  // ── Final submit ─────────────────────────────────────────

  const handleFinish = async () => {
    setSaving(true);
    setFinishError('');
    const configuredModels = models
      .map((model) => ({
        ...model,
        name: model.name.trim(),
        alias: model.alias?.trim() || undefined,
        id: model.id || modelIdFromName(model.name),
      }))
      .filter((model) => model.name);

    const modelMapping: Record<string, string> = {};
    for (const entry of modelMappingEntries) {
      const key = entry.key.trim();
      const value = entry.value.trim();
      if (key && value) {
        modelMapping[key] = value;
      }
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    try {
      await addProvider({
        id,
        name: name.trim(),
        apiBase: apiBase.trim() || `https://api.${id}.com/v1`,
        apiKey: apiKey.trim(),
        apiFlavor,
        status: testResult === 'success' ? 'connected' : 'configuring',
        models: configuredModels,
        modelMapping: Object.keys(modelMapping).length > 0 ? modelMapping : undefined,
        proxyConfig: { enabled: proxyEnabled, url: proxyUrl.trim() },
      });
      toast('提供商已添加', 'success');
      navigate('/providers');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '添加失败';
      toast(msg, 'error');
      setFinishError(msg);
      setSaving(false);
      // Remount stepper at the final step so the user can retry.
      setRetryStep(5);
      setCurrentStep(5);
      setStepperKey((k) => k + 1);
    }
  };

  // ── Validation per step (1-indexed) ──────────────────────

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 1:
        return name.trim().length > 0;
      case 2:
        return apiBase.trim().length > 0 && apiKey.trim().length > 0;
      case 3:
        return true;
      case 4:
        return testResult === 'success';
      default:
        return true;
    }
  }, [currentStep, name, apiBase, apiKey, testResult]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1200,
        margin: '0 auto',
        // 撑满视口剩余高度：Shell 顶栏 ≈68px（24+28+16）+ 内容区底部内边距 24px。
        minHeight: 'calc(100vh - 92px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header with back button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-12)',
          marginBottom: 'var(--spacer-24)',
        }}
      >
        {/* 页头返回钮：hover/focus 走 .icon-action-btn 伪类 */}
        <button
          type="button"
          className="icon-action-btn"
          aria-label="返回供应商列表"
          onClick={() => navigate('/providers')}
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-family-heading)',
              fontSize: 'var(--heading-lg-font-size)',
              fontWeight: 'var(--font-weight-strong)',
              lineHeight: 'var(--heading-lg-line-height)',
              color: 'var(--text-default)',
              margin: 0,
            }}
          >
            {t('providers.add.save')}
          </h2>
          <p
            style={{
              fontSize: 'var(--body-base-font-size)',
              color: 'var(--text-tertiary)',
              margin: 'var(--spacer-4) 0 0 0',
            }}
          >
            {t('providers.subtitle')}
          </p>
        </div>
      </div>

      {/* WizardSteps */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-base-default)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-12)',
          padding: 'var(--spacer-12) var(--spacer-24) var(--spacer-24)',
        }}
      >
        <WizardSteps
          key={wizardKey}
          defaultIndex={retryStep - 1}
          index={currentStep - 1}
          onIndexChange={(i) => setCurrentStep(i + 1)}
          onComplete={handleFinish}
          canNext={canProceed && !saving}
          height="fill"
          bare
          railNavigation={false}
          backLabel="返回"
          nextLabel="下一步"
          finishLabel={saving ? t('providers.add.saving') : finishError ? '重试添加' : '完成添加'}
          label={t('providers.add.save')}
          steps={[
          // ── Step 1: Choose Type ──
          { id: 'type', label: t('providers.add.step1'), content: (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacer-16)',
                padding: 'var(--spacer-8) 0',
              }}
            >
              <div style={fieldStyle}>
                <label style={labelStyle}>{t('providers.add.selectType')}</label>
                <Dropdown
                  options={profileOptions}
                  value={selectedProfile}
                  onChange={handleProfileChange}
                  placeholder="— 选择预设提供商 —"
                  searchable
                  maxItems={8}
                  renderOption={(opt) =>
                    opt.value !== 'custom' ? <ProviderLogo providerId={opt.value} name={opt.label} size={16} /> : null
                  }
                  renderTriggerLeading={(opt) =>
                    opt && opt.value !== 'custom' ? (
                      <ProviderLogo providerId={opt.value} name={opt.label} size={16} />
                    ) : null
                  }
                />
                <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                  选择预设可自动填充地址和协议；选「自定义」手动填写
                </span>
              </div>
              <div style={fieldStyle}>
                <FloatingLabelInput
                  label={t('providers.add.name')}
                  required
                  inputRef={nameInputRef}
                  value={name}
                  onChange={(v) => {
                    setName(v);
                    if (nameError) setNameError(false);
                  }}
                  invalid={nameError}
                  hint={nameError ? '请输入提供商名称' : '例如 OpenAI、Anthropic、DeepSeek，用于在列表中区分不同的 AI 服务提供商'}
                />
              </div>
            </div>
          )},

          // ── Step 2: Credentials ──
          { id: 'credentials', label: t('providers.add.step2'), content: (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacer-16)',
                padding: 'var(--spacer-8) 0',
              }}
            >
              <div style={fieldStyle}>
                <FloatingLabelInput
                  label={t('providers.add.apiBase')}
                  required
                  value={apiBase}
                  onChange={(v) => {
                    setApiBase(v);
                    if (apiBaseError) setApiBaseError(false);
                  }}
                  invalid={apiBaseError}
                  hint={
                    apiBaseError
                      ? '请输入有效的 API Base URL'
                      : '完整地址，含 /v1，如 https://api.openai.com/v1。系统不会自动补全 /v1。'
                  }
                  autoComplete="url"
                />
              </div>

              <div style={fieldStyle}>
                <FloatingLabelInput
                  label={t('providers.add.apiKey')}
                  required
                  type="password"
                  value={apiKey}
                  onChange={(v) => {
                    setApiKey(v);
                    if (apiKeyError) setApiKeyError(false);
                  }}
                  invalid={apiKeyError}
                  hint={apiKeyError ? '请输入 API Key' : 'sk-...'}
                  autoComplete="off"
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>{t('providers.add.protocol')}</label>
                <Dropdown options={API_FLAVOR_OPTIONS} value={apiFlavor} onChange={setApiFlavor} size="sm" />
                <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                  选择适配协议，Anthropic API 需选 Anthropic
                </span>
              </div>

              {/* Proxy config */}
              <div style={fieldStyle}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--spacer-12)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                    <label style={labelStyle}>{t('providers.add.proxySettings')}</label>
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                      为该提供商单独配置 HTTP/SOCKS 代理
                    </span>
                  </div>
                  <Switch checked={proxyEnabled} onChange={setProxyEnabled} />
                </div>
                {proxyEnabled && (
                  <FloatingLabelInput
                    label="代理地址"
                    value={proxyUrl}
                    onChange={setProxyUrl}
                    hint="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
                    autoComplete="url"
                  />
                )}
              </div>
            </div>
          )},

          // ── Step 3: Models (with alias mapping) ──
          { id: 'models', label: t('providers.add.step3'), content: (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacer-12)',
                padding: 'var(--spacer-8) 0',
              }}
            >
              {/* Fetch models bar */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--spacer-8)',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--spacer-12)',
                  border: '1px solid var(--border-neutral-l1)',
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--bg-base-secondary)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                  <span
                    style={{
                      fontSize: 'var(--body-sm-font-size)',
                      fontWeight: 'var(--font-weight-medium)',
                      color: 'var(--text-default)',
                    }}
                  >
                    从接口拉取模型
                  </span>
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    OpenAI 兼容接口会请求 /models；不支持列表接口时仍可手动添加
                  </span>
                </div>
                <LoadingButton
                  onAction={handleFetchModels}
                  pendingLabel="拉取中"
                  successLabel="已拉取"
                  errorLabel="重新拉取"
                >
                  拉取模型
                </LoadingButton>
              </div>

              {modelFetchMessage && (
                <div
                  style={{
                    padding: 'var(--spacer-8) var(--spacer-12)',
                    borderRadius: 'var(--radius-6)',
                    background:
                      remoteModels.length > 0 ? 'var(--status-success-surface-l1)' : 'var(--status-alert-surface-l1)',
                    color: remoteModels.length > 0 ? 'var(--status-success-default)' : 'var(--status-alert-default)',
                    fontSize: 'var(--body-sm-font-size)',
                  }}
                >
                  {modelFetchMessage}
                </div>
              )}

              {/* Remote model chips */}
              {remoteModels.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                      接口返回的模型
                    </span>
                    <Button variant="ghost" size="sm" onClick={() =>
                      remoteModels.forEach((remote) => addModel(makeModel(remote.name || remote.id, remote.id)))
                    }>
                      全部加入
                    </Button>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 'var(--spacer-6)',
                      maxHeight: 92,
                      overflowY: 'auto',
                      paddingRight: 'var(--spacer-4)',
                    }}
                  >
                    {remoteModels.map((remote) => {
                      const displayName = remote.name || remote.id;
                      const added = models.some((model) => model.id === remote.id || model.name === displayName);
                      return (
                        <Chip
                          key={remote.id}
                          onClick={() => addModel(makeModel(displayName, remote.id))}
                          disabled={added}
                          muted={added}
                          title={added ? '已加入' : '加入模型列表'}
                          style={{ fontFamily: 'var(--font-family-mono)' }}
                        >
                          <AddedGlyph added={added} />
                          {displayName}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Manual add row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 'var(--spacer-8)',
                  alignItems: 'end',
                }}
              >
                <div
                  style={fieldStyle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addManualModel();
                    }
                  }}
                >
                  <FloatingLabelInput
                    label={t('providers.form.manualAddModel')}
                    value={manualModelName}
                    onChange={setManualModelName}
                    hint="例如 gpt-4o、claude-3-5-sonnet-20241022"
                  />
                </div>
                <Button
                  variant="brand"
                  icon={Plus}
                  disabled={!manualModelName.trim()}
                  onClick={addManualModel}
                >
                  {t('providers.form.add')}
                </Button>
              </div>

              {/* Model list with alias mapping */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={labelStyle}>{t('providers.form.addedModels')}</span>
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    {models.length > 0 ? `${models.length} 个模型` : '暂无模型'}
                  </span>
                </div>

                {models.length === 0 ? (
                  <div
                    style={{
                      minHeight: 72,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px dashed var(--border-neutral-l2)',
                      borderRadius: 'var(--radius-8)',
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--body-sm-font-size)',
                    }}
                  >
                    还没有模型。可以先拉取接口返回，或手动逐项添加。
                  </div>
                ) : (
                  <div
                    className="ds-scroll"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacer-8)',
                      maxHeight: 400,
                      overflowY: 'auto',
                      paddingRight: 'var(--spacer-4)',
                    }}
                  >
                    {models.map((model, index) => (
                      <div
                        key={`${model.id}-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(140px, 1fr) minmax(120px, 1fr) auto',
                          gap: 'var(--spacer-8)',
                          alignItems: 'center',
                          padding: 'var(--spacer-10)',
                          border: '1px solid var(--border-neutral-l1)',
                          borderRadius: 'var(--radius-8)',
                          background: 'var(--bg-base-default)',
                        }}
                      >
                        {/* Model name */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                            模型名称
                          </span>
                          <input
                            value={model.name}
                            onChange={(e) => updateModel(index, { name: e.target.value })}
                            placeholder="模型名称"
                            style={{
                              ...inputBaseStyle,
                              height: 32,
                              fontFamily: 'var(--font-family-mono)',
                              fontSize: 'var(--body-sm-font-size)',
                            }}
                          />
                        </div>

                        {/* Alias */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                            别名（客户端可用此名称调用）
                          </span>
                          <input
                            value={model.alias ?? ''}
                            onChange={(e) => updateModel(index, { alias: e.target.value || undefined })}
                            placeholder="留空则使用模型名称"
                            style={{
                              ...inputBaseStyle,
                              height: 32,
                              fontFamily: 'var(--font-family-mono)',
                              fontSize: 'var(--body-sm-font-size)',
                            }}
                          />
                        </div>

                        {/* Delete */}
                        <button
                          type="button"
                          className="icon-action-btn"
                          aria-label="删除模型"
                          title="删除模型"
                          onClick={() => removeModel(index)}
                          style={{ marginTop: 'var(--spacer-16)' }}
                        >
                          <Trash2 size={14} />
                        </button>

                        {/* Capability switches */}
                        <div
                          style={{
                            gridColumn: '1 / -1',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                            gap: 'var(--spacer-8)',
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--spacer-6)',
                              fontSize: 'var(--body-sm-font-size)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <Eye size={14} style={{ color: 'var(--icon-tertiary)' }} />
                            <span>{t('capability.vision')}</span>
                            <Switch
                              checked={Boolean(model.supportsVision)}
                              onChange={(v) => updateModel(index, { supportsVision: v })}
                              aria-label={t('capability.vision')}
                            />
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--spacer-6)',
                              fontSize: 'var(--body-sm-font-size)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <Brain size={14} style={{ color: 'var(--icon-tertiary)' }} />
                            <span>{t('capability.reasoning')}</span>
                            <Switch
                              checked={Boolean(model.supportsReasoning)}
                              onChange={(v) => updateModel(index, { supportsReasoning: v })}
                              aria-label={t('capability.reasoning')}
                            />
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--spacer-6)',
                              fontSize: 'var(--body-sm-font-size)',
                              color: model.supportsReasoning ? 'var(--text-secondary)' : 'var(--text-disabled)',
                            }}
                          >
                            <SlidersHorizontal
                              size={14}
                              style={{
                                color: model.supportsReasoning ? 'var(--icon-tertiary)' : 'var(--icon-disabled)',
                              }}
                            />
                            <span>思考强度</span>
                            <Switch
                              checked={Boolean(model.supportsReasoningEffort)}
                              disabled={!model.supportsReasoning}
                              onChange={(v) =>
                                updateModel(index, {
                                  supportsReasoningEffort: v,
                                  defaultReasoningEffort: v ? 'medium' : undefined,
                                })
                              }
                              aria-label="思考强度"
                            />
                          </label>
                          <Dropdown
                            options={REASONING_EFFORT_OPTIONS}
                            value={model.defaultReasoningEffort ?? 'medium'}
                            onChange={(v) =>
                              updateModel(index, { defaultReasoningEffort: v as Model['defaultReasoningEffort'] })
                            }
                            disabled={!model.supportsReasoningEffort}
                            size="sm"
                          />
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--spacer-6)',
                              fontSize: 'var(--body-sm-font-size)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <Wrench size={14} style={{ color: 'var(--icon-tertiary)' }} />
                            <span>{t('capability.tools')}</span>
                            <Switch
                              checked={Boolean(model.supportsToolCalls)}
                              onChange={(v) => updateModel(index, { supportsToolCalls: v })}
                              aria-label={t('capability.tools')}
                            />
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--spacer-6)',
                              fontSize: 'var(--body-sm-font-size)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <Braces size={14} style={{ color: 'var(--icon-tertiary)' }} />
                            <span>{t('capability.json')}</span>
                            <Switch
                              checked={Boolean(model.supportsJsonMode)}
                              onChange={(v) => updateModel(index, { supportsJsonMode: v })}
                              aria-label={t('capability.json')}
                            />
                          </label>
                        </div>

                        {/* Context window & max output tokens */}
                        <div
                          style={{
                            gridColumn: '1 / -1',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                            gap: 'var(--spacer-8)',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                            <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                              上下文长度（tokens）
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={model.contextWindow ?? ''}
                              onChange={(e) =>
                                updateModel(index, {
                                  contextWindow: e.target.value ? Number(e.target.value) : undefined,
                                })
                              }
                              placeholder="如 128000"
                              style={{
                                ...inputBaseStyle,
                                height: 32,
                                fontFamily: 'var(--font-family-mono)',
                                fontSize: 'var(--body-sm-font-size)',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                            <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                              最大输出长度（tokens）
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={model.maxOutputTokens ?? ''}
                              onChange={(e) =>
                                updateModel(index, {
                                  maxOutputTokens: e.target.value ? Number(e.target.value) : undefined,
                                })
                              }
                              placeholder="如 8192"
                              style={{
                                ...inputBaseStyle,
                                height: 32,
                                fontFamily: 'var(--font-family-mono)',
                                fontSize: 'var(--body-sm-font-size)',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Model mapping (collapsible) */}
              <div
                style={{
                  border: '1px solid var(--border-neutral-l1)',
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--bg-base-secondary)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setModelMappingExpanded((v) => !v)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--spacer-12)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 'var(--body-sm-font-size)',
                    color: 'var(--text-default)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacer-2)',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{t('providers.form.modelMapping')}</span>
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                      将客户端请求的模型名映射到上游实际模型名（支持通配符 *）
                    </span>
                  </div>
                  <MorphGlyph slots={mappingChevron.slots} rotate={mappingChevron.rotate} transition={mappingChevron.transition} mode={mappingChevron.mode} size={16} />
                </button>
                {modelMappingExpanded && (
                  <div
                    style={{
                      padding: 'var(--spacer-12)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacer-8)',
                      borderTop: '1px solid var(--border-neutral-l1)',
                    }}
                  >
                    {modelMappingEntries.length === 0 ? (
                      <div
                        style={{
                          minHeight: 48,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-tertiary)',
                          fontSize: 'var(--body-sm-font-size)',
                        }}
                      >
                        暂无映射规则
                      </div>
                    ) : (
                      modelMappingEntries.map((entry, index) => (
                        <div
                          key={index}
                          className="mh-mapping-row"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr) auto',
                            gap: 'var(--spacer-8)',
                            alignItems: 'start',
                          }}
                        >
                          <FloatingLabelInput
                            label="逻辑模型名"
                            value={entry.key}
                            onChange={(v) => updateModelMappingEntry(index, { key: v })}
                            hint="支持 * 通配符"
                          />
                          <span
                            style={{
                              color: 'var(--text-tertiary)',
                              marginTop: 32,
                              display: 'inline-flex',
                            }}
                          >
                            <ArrowRight size={14} />
                          </span>
                          <FloatingLabelInput
                            label="上游模型名"
                            value={entry.value}
                            onChange={(v) => updateModelMappingEntry(index, { value: v })}
                            hint="如 gpt-4o-2024-08-06"
                          />
                          <button
                            type="button"
                            className="icon-action-btn"
                            aria-label="删除映射"
                            title="删除映射"
                            onClick={() => removeModelMappingEntry(index)}
                            style={{ marginTop: 24 }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                    <Button variant="secondary" size="sm" icon={Plus} onClick={addModelMappingEntry} style={{ alignSelf: 'flex-start' }}>
                      添加映射规则
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )},

          // ── Step 4: Test Connection ──
          { id: 'test', label: t('providers.add.step4'), content: (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacer-16)',
                padding: 'var(--spacer-8) 0',
              }}
            >
              <div
                style={{
                  padding: 'var(--spacer-16)',
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--bg-base-secondary)',
                  border: '1px solid var(--border-neutral-l1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacer-4)',
                    marginBottom: 'var(--spacer-12)',
                  }}
                >
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}
                  >
                    <span style={{ color: 'var(--text-tertiary)' }}>提供商</span>
                    <span style={{ color: 'var(--text-default)' }}>{name}</span>
                  </div>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}
                  >
                    <span style={{ color: 'var(--text-tertiary)' }}>API Base</span>
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-family-mono)',
                        fontSize: 'var(--body-xs-font-size)',
                      }}
                    >
                      {apiBase}
                    </span>
                  </div>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}
                  >
                    <span style={{ color: 'var(--text-tertiary)' }}>协议</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {API_FLAVOR_OPTIONS.find((o) => o.value === apiFlavor)?.label}
                    </span>
                  </div>
                </div>

                {/* 测试连接：interior LoadingButton 四态（pending/success/error 脸 + 弹簧动效）；成功反馈交给 success 脸 + 下方结果横幅 */}
                <LoadingButton
                  onAction={handleTestConnection}
                  pendingLabel={t('providers.status.testing')}
                  successLabel={t('providers.status.connected')}
                  errorLabel="重新测试"
                  className="mh-loading-btn--full"
                >
                  测试连接
                </LoadingButton>

                {testResult === 'success' && (
                  <div
                    style={{
                      marginTop: 'var(--spacer-8)',
                      padding: 'var(--spacer-8) var(--spacer-12)',
                      borderRadius: 'var(--radius-6)',
                      background: 'var(--status-success-surface-l1)',
                      color: 'var(--status-success-default)',
                      fontSize: 'var(--body-sm-font-size)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacer-6)',
                    }}
                  >
                    <Check size={14} />
                    {testMessage || '配置有效，可以正常使用'}
                  </div>
                )}

                {testResult === 'fail' && (
                  <div
                    style={{
                      marginTop: 'var(--spacer-8)',
                      padding: 'var(--spacer-8) var(--spacer-12)',
                      borderRadius: 'var(--radius-6)',
                      background: 'var(--status-error-surface-l1)',
                      color: 'var(--status-error-default)',
                      fontSize: 'var(--body-sm-font-size)',
                    }}
                  >
                    {testMessage || '连接失败，请检查 API Base URL 和 API Key 是否正确'}
                  </div>
                )}
              </div>

              <span
                style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', textAlign: 'center' }}
              >
                测试连接将通过选定的 API Base 发送一个轻量请求以验证配置
              </span>
            </div>
          )},

          // ── Step 5: Complete ──
          { id: 'review', label: t('providers.add.step5'), content: (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacer-16)',
                alignItems: 'center',
                padding: 'var(--spacer-16) 0',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 'var(--radius-full)',
                  background: finishError ? 'var(--status-error-surface-l1)' : 'var(--status-success-surface-l1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {finishError ? (
                  <RefreshCw size={24} style={{ color: 'var(--status-error-default)' }} />
                ) : (
                  <Check size={28} strokeWidth={3} style={{ color: 'var(--status-success-default)' }} />
                )}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 'var(--heading-sm-font-size)',
                    fontWeight: 'var(--font-weight-strong)',
                    marginBottom: 'var(--spacer-4)',
                  }}
                >
                  {finishError ? '添加失败' : '连接已验证'}
                </div>
                <div style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-tertiary)' }}>
                  {finishError ? '请检查配置后重试' : `提供商「${name}」已通过连接测试，点击下方按钮完成添加`}
                </div>
              </div>

              {finishError && (
                <div
                  style={{
                    width: '100%',
                    padding: 'var(--spacer-8) var(--spacer-12)',
                    borderRadius: 'var(--radius-6)',
                    background: 'var(--status-error-surface-l1)',
                    color: 'var(--status-error-default)',
                    fontSize: 'var(--body-sm-font-size)',
                    textAlign: 'center',
                  }}
                >
                  {finishError}
                </div>
              )}

              <div
                style={{
                  width: '100%',
                  padding: 'var(--spacer-12)',
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--bg-base-secondary)',
                  border: '1px solid var(--border-neutral-l1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--spacer-4)',
                  fontSize: 'var(--body-sm-font-size)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>提供商</span>
                  <span style={{ color: 'var(--text-default)' }}>{name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>API Base</span>
                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: 'var(--body-xs-font-size)',
                    }}
                  >
                    {apiBase}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>模型数量</span>
                  <span style={{ color: 'var(--text-default)' }}>{models.length || '未配置'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>连接状态</span>
                  <span
                    style={{
                      color: testResult === 'success' ? 'var(--status-success-default)' : 'var(--status-alert-default)',
                    }}
                  >
                    {testResult === 'success' ? t('providers.status.connected') : '未测试'}
                  </span>
                </div>
              </div>
            </div>
          )},
          ]}
        />
      </div>
    </div>
  );
};
