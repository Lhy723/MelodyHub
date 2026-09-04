import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { useT } from '../../i18n';
import { ProviderLogo } from '../../components/ui/ProviderLogo';
import { Tabs } from '../../components/interior/tabs';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/Toast';
import { desktopApi } from '../../lib/desktopApi';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { LoadingButton } from '../../components/interior/loading-button';
import { ProviderBasicTab } from './tabs/ProviderBasicTab';
import { ProviderModelsTab } from './tabs/ProviderModelsTab';
import { ProviderMappingsTab } from './tabs/ProviderMappingsTab';
import { ProviderProxyTab } from './tabs/ProviderProxyTab';
import type { Model, Provider, ProviderProxyConfig } from '../../types/provider';

type TabKey = 'basic' | 'models' | 'mappings' | 'proxy';


const headerInputStyle: React.CSSProperties = {
  fontSize: 'var(--heading-md-font-size)',
  fontWeight: 600,
  lineHeight: 'var(--heading-md-line-height)',
  color: 'var(--text-default)',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 'var(--radius-6)',
  padding: '2px var(--spacer-6)',
  margin: '-2px calc(-1 * var(--spacer-6))',
  outline: 'none',
  font: 'inherit',
};

type SaveState = 'saved' | 'saving' | 'error';

export const EditProviderPage: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const { providerId } = useParams<{ providerId: string }>();
  const { providers, updateProvider, removeProvider } = useProviderStore();

  const provider = providers.find((p) => p.id === providerId);

  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [form, setForm] = useState<Provider | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | undefined>();
  const [testTime, setTestTime] = useState<string | undefined>();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const formInitialized = useRef(false);

  const TAB_TABS = [
    { key: 'basic' as TabKey, label: t('providers.form.basicInfo') },
    { key: 'models' as TabKey, label: t('providers.form.modelManagement') },
    { key: 'mappings' as TabKey, label: t('providers.form.modelMapping') },
    { key: 'proxy' as TabKey, label: t('providers.form.proxySettings') },
  ];

  useEffect(() => {
    if (!provider) return;
    if (formInitialized.current) return;
    setForm({ ...provider, proxyConfig: provider.proxyConfig ? { ...provider.proxyConfig } : undefined });
    formInitialized.current = true;
  }, [provider]);

  const doAutoSave = useCallback(async () => {
    if (!form || !providerId) return;
    setSaveState('saving');
    try {
      const patch: Partial<Provider> = {
        name: form.name,
        apiBase: form.apiBase,
        apiFlavor: form.apiFlavor,
        models: form.models,
        modelMapping: form.modelMapping,
        proxyConfig: form.proxyConfig,
      };
      if (form.apiKey !== provider?.apiKey) {
        patch.apiKey = form.apiKey;
      }
      await updateProvider(providerId, patch);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [form, providerId, provider?.apiKey, updateProvider]);

  const scheduleAutoSave = useCallback(() => {
    setSaveState('saving');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doAutoSave, 400);
  }, [doAutoSave]);

  const flushSave = useCallback(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = undefined;
      doAutoSave();
    }
  }, [doAutoSave]);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    const handler = () => flushSave();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flushSave]);

  const updateField = useCallback(
    <K extends keyof Provider>(key: K, value: Provider[K]) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  const handleTestConnection = useCallback(async () => {
    if (!form) return;
    setTesting(true);
    setTestMessage(undefined);
    try {
      const result = await desktopApi.testProviderConnection(
        form.apiFlavor || 'openai-compatible',
        form.apiBase,
        form.apiKey,
      );
      if (result.success) {
        setTestMessage(undefined);
        setTestTime(new Date().toLocaleTimeString());
        updateField('status', 'connected');
        toast(result.message || '连接成功', 'success');
      } else {
        const msg = result.error?.message || result.message || '连接失败';
        setTestMessage(msg);
        setTestTime(new Date().toLocaleTimeString());
        updateField('status', 'error');
        toast(`连接失败: ${msg}`, 'error');
        // 继续 throw，让调用方的 LoadingButton 进入 error 脸（toast 已发出，不重复）。
        throw new Error(msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestMessage(msg);
      setTestTime(new Date().toLocaleTimeString());
      updateField('status', 'error');
      if (!(e instanceof Error)) toast(`连接失败: ${msg}`, 'error');
      throw e instanceof Error ? e : new Error(msg);
    } finally {
      setTesting(false);
    }
  }, [form, updateField]);

  const handleDelete = async () => {
    if (!providerId) return;
    try {
      await removeProvider(providerId);
      toast('供应商已删除', 'success');
      navigate('/providers');
    } catch (e) {
      toast(`删除失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  if (!provider || !form) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
        {provider === undefined ? '供应商不存在' : '加载中...'}
      </div>
    );
  }

  const statusDotColor =
    {
      connected: 'var(--status-success-default)',
      error: 'var(--status-error-default)',
      testing: 'var(--status-warning-default)',
      configuring: 'var(--text-disabled)',
      disabled: 'var(--text-disabled)',
    }[form.status] || 'var(--text-disabled)';

  const saveStateText = {
    saved: '所有更改已保存',
    saving: '保存中...',
    error: '保存失败，点击重试',
  }[saveState];

  const saveStateColor = {
    saved: 'var(--text-tertiary)',
    saving: 'var(--text-secondary)',
    error: 'var(--status-error-default)',
  }[saveState];

  const tabCounts: Record<string, number | undefined> = {
    models: form.models.length,
    mappings: Object.keys(form.modelMapping ?? {}).length || undefined,
  };

  const proxyConfig: ProviderProxyConfig = form.proxyConfig ?? { enabled: false, url: '' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '16px 24px 0',
          background: 'var(--bg-base-default)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {/* 页头返回钮：hover/focus 走 index.css 的 .icon-action-btn 伪类 */}
          <button
            type="button"
            className="icon-action-btn"
            aria-label="返回供应商列表"
            onClick={() => {
              flushSave();
              navigate('/providers');
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <ProviderLogo providerId={form.id} name={form.name} size={28} />
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            style={headerInputStyle}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusDotColor,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
              {
                {
                  connected: t('providers.status.connected'),
                  error: t('providers.status.error'),
                  testing: t('providers.status.testing'),
                  configuring: '未测试',
                  disabled: t('providers.status.disabled'),
                }[form.status]
              }
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 'var(--body-sm-font-size)',
              color: saveStateColor,
              cursor: saveState === 'error' ? 'pointer' : 'default',
            }}
            onClick={saveState === 'error' ? doAutoSave : undefined}
          >
            {saveStateText}
          </span>
          {/* 页头快捷测试与基本信息分组内是同一个 handleTestConnection（async），进行态由按钮各自拥有；testing 只保留给状态文案。 */}
          <LoadingButton
            onAction={handleTestConnection}
            pendingLabel={t('providers.status.testing')}
            successLabel={t('providers.status.connected')}
            errorLabel={t('providers.retest')}
          >
            {t('providers.testConnection')}
          </LoadingButton>
          <Button variant="secondary" size="sm" icon={Save} onClick={doAutoSave}>
            {t('common.save')}
          </Button>
          <Button variant="secondary" size="sm" icon={Trash2} onClick={() => setShowDeleteConfirm(true)}>
            {t('models.delete')}
          </Button>
        </div>
      </div>

      {/* 文档站同款：一张卡片内含标签栏 + 面板，renderPanel 随选中切换，切换带方向滑动。 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacer-16) var(--spacer-24) var(--spacer-24)' }}>
        <Tabs
          variant="segmented"
          label="供应商设置分组"
          items={TAB_TABS.map((t) => ({ value: t.key, label: t.label, badge: tabCounts[t.key] }))}
          value={activeTab}
          onValueChange={(v) => {
            flushSave();
            setActiveTab(v as TabKey);
          }}
          panelClassName="mh-tabs__panel--page"
          renderPanel={(v) => {
            if (v === 'models')
              return (
                <ProviderModelsTab
                  models={form.models}
                  apiBase={form.apiBase}
                  apiKey={form.apiKey}
                  apiFlavor={form.apiFlavor || 'openai-compatible'}
                  providerId={provider?.id || ''}
                  providerName={form.name || provider?.name}
                  onModelsChange={(m: Model[]) => updateField('models', m)}
                />
              );
            if (v === 'mappings')
              return (
                <ProviderMappingsTab
                  mappings={form.modelMapping ?? {}}
                  onChange={(m) => updateField('modelMapping', Object.keys(m).length ? m : undefined)}
                />
              );
            if (v === 'proxy')
              return (
                <ProviderProxyTab
                  proxyEnabled={proxyConfig.enabled}
                  proxyUrl={proxyConfig.url}
                  onProxyEnabledChange={(e) => updateField('proxyConfig', { ...proxyConfig, enabled: e })}
                  onProxyUrlChange={(u) => updateField('proxyConfig', { ...proxyConfig, url: u })}
                />
              );
            return (
              <ProviderBasicTab
                apiBase={form.apiBase}
                apiKey={form.apiKey}
                apiKeyConfigured={!!provider.apiKey}
                apiFlavor={form.apiFlavor || 'openai-compatible'}
                testStatus={
                  form.status === 'connected'
                    ? 'connected'
                    : form.status === 'error'
                      ? 'error'
                      : testing
                        ? 'testing'
                        : 'idle'
                }
                testMessage={testMessage}
                testTime={testTime}
                onApiBaseChange={(v) => updateField('apiBase', v)}
                onApiKeyChange={(v) => updateField('apiKey', v)}
                onApiFlavorChange={(v) => updateField('apiFlavor', v)}
                onTestConnection={handleTestConnection}
              />
            );
          }}
        />
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          open={showDeleteConfirm}
          title="删除供应商?"
          message={`确定要删除供应商「${form.name}」吗？此操作不可撤销。`}
          confirmLabel="删除"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
};
