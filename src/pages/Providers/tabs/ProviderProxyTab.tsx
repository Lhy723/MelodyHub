import React from 'react';
import { Switch } from '../../../components/ui/Switch';
import { FloatingLabelInput } from '../../../components/interior/floating-label';

interface ProviderProxyTabProps {
  proxyEnabled: boolean;
  proxyUrl: string;
  onProxyEnabledChange: (v: boolean) => void;
  onProxyUrlChange: (v: string) => void;
}

export const ProviderProxyTab: React.FC<ProviderProxyTabProps> = ({
  proxyEnabled,
  proxyUrl,
  onProxyEnabledChange,
  onProxyUrlChange,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 'var(--body-base-font-size)' }}>使用独立代理</div>
          <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)', marginTop: 2 }}>
            为该提供商单独配置 HTTP/SOCKS 代理
          </div>
        </div>
        <Switch checked={proxyEnabled} onChange={onProxyEnabledChange} />
      </div>

      {proxyEnabled && (
        <div>
          <FloatingLabelInput
            label="代理地址"
            value={proxyUrl}
            onChange={onProxyUrlChange}
            hint="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
            autoComplete="url"
          />
        </div>
      )}
    </div>
  );
};
