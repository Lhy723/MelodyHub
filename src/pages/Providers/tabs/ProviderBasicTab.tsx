import React, { useState } from 'react';
import { Dropdown } from '../../../components/ui/Dropdown';
import { TriangleAlert } from 'lucide-react';
import { LoadingButton } from '../../../components/interior/loading-button';
import { useIconMorph, MorphGlyph } from '../../../components/interior/icon-morph';
import { FloatingLabelInput } from '../../../components/interior/floating-label';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--body-sm-font-size)',
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

const helpStyle: React.CSSProperties = {
  fontSize: 'var(--body-sm-font-size)',
  color: 'var(--text-tertiary)',
  marginTop: 6,
  lineHeight: 1.5,
};

interface ProviderBasicTabProps {
  apiBase: string;
  apiKey: string;
  apiKeyConfigured: boolean;
  apiFlavor: string;
  testStatus: 'connected' | 'configuring' | 'error' | 'testing' | 'idle';
  testMessage?: string;
  testTime?: string;
  onApiBaseChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onApiFlavorChange: (v: string) => void;
  onTestConnection: () => void;
}

export const ProviderBasicTab: React.FC<ProviderBasicTabProps> = ({
  apiBase,
  apiKey,
  apiKeyConfigured,
  apiFlavor,
  testStatus,
  testMessage,
  testTime,
  onApiBaseChange,
  onApiKeyChange,
  onApiFlavorChange,
  onTestConnection,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [keyCleared, setKeyCleared] = useState(false);
  const keyEye = useIconMorph({ preset: 'eye', active: showKey });

  const handleKeyFocus = () => {
    if (!keyCleared && apiKeyConfigured) {
      setShowKey(true);
    }
  };

  const handleKeyChange = (v: string) => {
    setKeyCleared(true);
    onApiKeyChange(v);
  };

  const flavorOptions = [
    { value: 'openai-compatible', label: 'OpenAI 兼容' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'responses', label: 'Responses API' },
  ];

  const statusColor = {
    connected: 'var(--status-success-default)',
    error: 'var(--status-error-default)',
    testing: 'var(--text-secondary)',
    configuring: 'var(--text-tertiary)',
    idle: 'var(--text-tertiary)',
  }[testStatus];

  const statusText = {
    connected: '● 已连接',
    error: '● 连接失败',
    testing: '● 测试中...',
    configuring: '○ 未测试',
    idle: '○ 未测试',
  }[testStatus];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0', maxWidth: 520 }}>
      <div>
        <FloatingLabelInput
          label="API Base URL"
          value={apiBase}
          onChange={onApiBaseChange}
          hint="填写完整 Base URL（含版本路径，如 /v1）"
          autoComplete="url"
        />
      </div>

      <div>
        <div style={{ position: 'relative' }} className="mh-with-trailing-icon">
          <FloatingLabelInput
            label="API Key"
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={handleKeyChange}
            onFocus={handleKeyFocus}
            hint={apiKeyConfigured && !keyCleared ? '已设置 Key，点击输入框直接修改' : 'sk-...'}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              background: 'none',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
            }}
          >
            <MorphGlyph slots={keyEye.slots} rotate={keyEye.rotate} transition={keyEye.transition} mode={keyEye.mode} size={16} />
          </button>
        </div>
        {apiKeyConfigured && keyCleared && (
          <div style={{ ...helpStyle, color: 'var(--status-warning-default)', display: 'flex', alignItems: 'center', gap: 'var(--spacer-4)' }}>
            <TriangleAlert size={14} style={{ flexShrink: 0 }} />
            <span>原有 Key 已清空，保存后将使用新值</span>
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>API 协议类型</label>
        <Dropdown
          options={flavorOptions}
          value={apiFlavor}
          onChange={onApiFlavorChange}
          placeholder="选择协议类型"
          size="sm"
        />
        <div style={helpStyle}>
          {apiFlavor === 'anthropic'
            ? '使用 Anthropic Messages API 格式'
            : apiFlavor === 'responses'
              ? '使用 OpenAI Responses API 格式'
              : '兼容 OpenAI Chat Completions 格式的接口'}
        </div>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 10,
          background: 'var(--bg-overlay-l1)',
          border: '1px solid var(--border-neutral-l1)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 'var(--body-sm-font-size)', color: statusColor, fontWeight: 500 }}>{statusText}</span>
        {testTime && (
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>{testTime}</span>
        )}
        {testMessage && testStatus === 'error' && (
          <span
            style={{
              fontSize: 'var(--body-sm-font-size)',
              color: 'var(--status-error-default)',
              marginLeft: 'auto',
              marginRight: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 200,
            }}
          >
            {testMessage}
          </span>
        )}
        {/* onTestConnection 本就是 async（返回 promise），LoadingButton 直接拥有进行态；父级 testing 只保留给状态文案。 */}
        <div style={{ marginLeft: 'auto' }}>
          <LoadingButton onAction={onTestConnection} pendingLabel="测试中" successLabel="已连接" errorLabel="重试测试">
            测试连接
          </LoadingButton>
        </div>
      </div>
    </div>
  );
};
