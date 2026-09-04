import { useState } from 'react';
import { useAggregationStore } from '../../store/aggregationStore';
import { useProviderStore } from '../../store/providerStore';
import { Card, SectionTitle, toast, Dropdown, Button } from '../../components/ui';
import type { RouteTarget, RoutingStrategy } from '../../types/aggregation';
import { useT } from '../../i18n';
import { RoutingStrategySelect } from './RoutingStrategySelect';
import { Chip } from '../Providers/chip';

const priorityOptions = [
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
];

const protocolForFlavor = (flavor?: string): NonNullable<RouteTarget['protocol']> => {
  if (flavor === 'anthropic' || flavor === 'anthropic-messages') return 'anthropic-messages';
  if (flavor === 'responses' || flavor === 'openai-responses') return 'openai-responses';
  return 'openai-chat';
};

export const QuickAddPanel: React.FC = () => {
  const t = useT();
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState<RoutingStrategy>('round-robin');
  const [priority, setPriority] = useState('P0');
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [nameError, setNameError] = useState(false);
  const [modelsError, setModelsError] = useState(false);
  const addAggregation = useAggregationStore((s) => s.addAggregation);
  const providers = useProviderStore((s) => s.providers);

  // Collect all model names from all providers
  const allModels = providers.flatMap((provider) =>
    provider.models.map((model) => ({
      providerId: provider.id,
      providerName: provider.name,
      model: model.name,
      key: `${provider.id}:${model.id}`,
      protocol: protocolForFlavor(provider.apiFlavor),
    })),
  );

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    if (selectedTargets.length === 0) {
      setModelsError(true);
      return;
    }
    setNameError(false);
    setModelsError(false);
    try {
      await addAggregation({
        id: crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2),
        name: name.trim(),
        models: allModels
          .filter((candidate) => selectedTargets.includes(candidate.key))
          .map((candidate) => candidate.model)
          .join(', '),
        targets: allModels
          .filter((candidate) => selectedTargets.includes(candidate.key))
          .map((candidate, index) => ({
            id: crypto.randomUUID?.() || `${Date.now().toString(36)}-${index}`,
            providerId: candidate.providerId,
            model: candidate.model,
            protocol: candidate.protocol,
            priority: 0,
            weight: 1,
            enabled: true,
          })),
        // Persist the normalized enum key.
        strategy,
        priority,
        enabled: true,
      });
      toast('聚合规则已添加', 'success');
      setName('');
      setSelectedTargets([]);
    } catch (e) {
      console.error('Failed to add aggregation:', e);
    }
  };

  const toggleModel = (targetKey: string) => {
    setSelectedTargets((prev) =>
      prev.includes(targetKey) ? prev.filter((key) => key !== targetKey) : [...prev, targetKey],
    );
  };

  return (
    <Card>
      <SectionTitle>快速添加聚合</SectionTitle>
      <form onSubmit={handleAdd}>
        <div
          className="mc-quick-add__form"
          style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--spacer-16)', flexWrap: 'wrap' }}
        >
          <div
            className="mc-quick-add__field"
            style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}
          >
            <label
              style={{
                fontSize: 'var(--body-sm-font-size)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--text-tertiary)',
              }}
            >
              聚合名称
            </label>
            <input
              className="mc-input"
              type="text"
              placeholder="输入聚合名称"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(false);
              }}
              style={{
                height: 36,
                padding: '0 var(--spacer-12)',
                borderRadius: 'var(--radius-8)',
                border: `1px solid ${nameError ? 'var(--status-error-default)' : 'var(--border-neutral-l1)'}`,
                background: 'var(--bg-white)',
                fontSize: 'var(--body-base-font-size)',
                color: 'var(--text-default)',
                outline: 'none',
                boxSizing: 'border-box',
                width: '100%',
                transition: 'border-color var(--transition-fast, 0.12s ease)',
              }}
            />
            {nameError && (
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--status-error-default)' }}>
                请输入聚合名称
              </span>
            )}
          </div>
          <div
            className="mc-quick-add__field"
            style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}
          >
            <label
              style={{
                fontSize: 'var(--body-sm-font-size)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--text-tertiary)',
              }}
            >
              {t('routing.mode.label')}
            </label>
            <RoutingStrategySelect value={strategy} onChange={setStrategy} />
          </div>
          <div
            className="mc-quick-add__field"
            style={{ flex: 1, minWidth: 100, display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}
          >
            <label
              style={{
                fontSize: 'var(--body-sm-font-size)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--text-tertiary)',
              }}
            >
              优先级
            </label>
            <Dropdown options={priorityOptions} value={priority} onChange={setPriority} className="mc-select" />
          </div>
          <div className="mc-quick-add__action" style={{ flexShrink: 0 }}>
            <Button type="submit" variant="secondary">
              添加
            </Button>
          </div>
        </div>
      </form>

      {/* Model picker */}
      {allModels.length === 0 ? (
        <div
          style={{
            marginTop: 'var(--spacer-16)',
            fontSize: 'var(--body-sm-font-size)',
            color: modelsError ? 'var(--status-error-default)' : 'var(--text-tertiary)',
          }}
        >
          请先为提供商配置至少一个模型
        </div>
      ) : (
        <div style={{ marginTop: 'var(--spacer-16)' }}>
          <label
            style={{
              fontSize: 'var(--body-sm-font-size)',
              color: 'var(--text-tertiary)',
              display: 'block',
              marginBottom: 'var(--spacer-8)',
            }}
          >
            选择上游目标{' '}
            {selectedTargets.length > 0 && (
              <span style={{ color: 'var(--text-brand)' }}>(已选 {selectedTargets.length})</span>
            )}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacer-6)' }}>
            {allModels.map(({ providerName, model, protocol, key }) => {
              const selected = selectedTargets.includes(key);
              return (
                <Chip
                  key={key}
                  selected={selected}
                  onClick={() => toggleModel(key)}
                  aria-pressed={selected}
                  title={`${providerName} · ${protocol}`}
                >
                  <span>{model}</span>
                  <span style={{ opacity: 0.65 }}>{providerName}</span>
                </Chip>
              );
            })}
          </div>
          {modelsError && (
            <span
              style={{
                display: 'block',
                marginTop: 'var(--spacer-8)',
                fontSize: 'var(--body-xs-font-size)',
                color: 'var(--status-error-default)',
              }}
            >
              请至少选择一个模型
            </span>
          )}
        </div>
      )}
    </Card>
  );
};
