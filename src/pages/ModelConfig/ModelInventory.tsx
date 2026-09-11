import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { useAggregationStore } from '../../store/aggregationStore';
import type { Aggregation } from '../../types/aggregation';
import type { Model } from '../../types/provider';
import { FilterGrid, type FilterDefinition } from '../../components/interior/filter-grid';
import { ModelLogo } from '../../components/ui';
import { useT } from '../../i18n';
import { ChevronRight, Eye, Brain, SlidersHorizontal, Wrench, Braces } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

interface DirectMapping {
  kind: 'direct' | 'alias';
  providerName: string;
  providerId: string;
  /** Actual model name sent upstream (alias is resolved back to this). */
  modelName: string;
  model: Model;
  matchedBy: 'name' | 'alias';
}

interface AggMapping {
  kind: 'aggregation';
  aggregation: Aggregation;
  resolvedModels: Array<{
    modelName: string;
    providerName: string;
    providerId: string;
  }>;
}

type MappingSource = DirectMapping | AggMapping;

/** 各能力在该入口下是否成立（聚合来源无模型参数，视为不具备）。 */
function entryCaps(entry: ExposedEntry): {
  vision: boolean;
  reasoning: boolean;
  effort: boolean;
  tools: boolean;
  json: boolean;
} {
  const params = entry.sources
    .filter((s): s is DirectMapping => s.kind === 'direct' || s.kind === 'alias')
    .map((s) => s.model);
  return {
    vision: params.length > 0 && params.every((m) => m.supportsVision),
    reasoning: params.length > 0 && params.every((m) => m.supportsReasoning),
    effort: params.some((m) => m.supportsReasoningEffort),
    tools: params.length > 0 && params.every((m) => m.supportsToolCalls),
    json: params.length > 0 && params.every((m) => m.supportsJsonMode),
  };
}

interface ExposedEntry {
  name: string;
  sources: MappingSource[];
}

// ── Component ──────────────────────────────────────────────

export const ModelInventory: React.FC = () => {
  const navigate = useNavigate();
  const t = useT();
  const providers = useProviderStore((s) => s.providers);
  const aggregations = useAggregationStore((s) => s.aggregations);

  const kindLabel = (sources: MappingSource[]): string => {
    const hasDirect = sources.some((s) => s.kind === 'direct');
    const hasAlias = sources.some((s) => s.kind === 'alias');
    const hasAgg = sources.some((s) => s.kind === 'aggregation');
    const parts: string[] = [];
    if (hasDirect) parts.push(t('models.inventory.direct'));
    if (hasAlias) parts.push(t('models.inventory.alias'));
    if (hasAgg) parts.push(t('models.inventory.aggregation'));
    return parts.join(' / ');
  };

  // Build the full list of externally-exposed names by merging:
  //   1. Every model's `name` (direct exposure)
  //   2. Every model's `alias` (alias exposure, if set and != name)
  //   3. Every enabled aggregation's `name` (aggregation exposure)
  const entries = useMemo(() => {
    const map = new Map<string, ExposedEntry>();

    const ensure = (name: string): ExposedEntry => {
      let e = map.get(name);
      if (!e) {
        e = { name, sources: [] };
        map.set(name, e);
      }
      return e;
    };

    for (const provider of providers) {
      for (const model of provider.models) {
        // Direct exposure via model.name
        if (model.name) {
          ensure(model.name).sources.push({
            kind: 'direct',
            providerName: provider.name,
            providerId: provider.id,
            modelName: model.name,
            model: { ...model },
            matchedBy: 'name',
          });
        }
        // Alias exposure
        const alias = model.alias?.trim();
        if (alias && alias !== model.name) {
          ensure(alias).sources.push({
            kind: 'alias',
            providerName: provider.name,
            providerId: provider.id,
            modelName: model.name,
            model: { ...model },
            matchedBy: 'alias',
          });
        }
      }
    }

    // Aggregation exposure
    for (const agg of aggregations) {
      if (!agg.enabled) continue;
      const modelNames = agg.models
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const resolvedModels: AggMapping['resolvedModels'] = [];
      for (const mn of modelNames) {
        for (const provider of providers) {
          for (const model of provider.models) {
            if (model.name === mn || model.alias?.trim() === mn) {
              resolvedModels.push({
                modelName: model.name,
                providerName: provider.name,
                providerId: provider.id,
              });
            }
          }
        }
      }
      ensure(agg.name).sources.push({
        kind: 'aggregation',
        aggregation: { ...agg },
        resolvedModels,
      });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [providers, aggregations]);

  // FilterGrid 筛选：全部 + 五种能力（单选；聚合来源无模型参数，能力筛选中不出现）。
  const gridFilters: FilterDefinition<ExposedEntry>[] = useMemo<FilterDefinition<ExposedEntry>[]>(
    () => [
      { id: 'all', label: t('models.inventory.filterAll'), match: () => true },
      { id: 'vision', label: t('capability.vision'), match: (e) => entryCaps(e).vision },
      { id: 'reasoning', label: t('capability.reasoning'), match: (e) => entryCaps(e).reasoning },
      { id: 'effort', label: t('capability.effort'), match: (e) => entryCaps(e).effort },
      { id: 'tools', label: t('capability.tools'), match: (e) => entryCaps(e).tools },
      { id: 'json', label: t('capability.json'), match: (e) => entryCaps(e).json },
    ],
    [t],
  );

  // 正方形格子内容（三行：名称 / 元信息 / 能力图标，不换行，垂直居中）。
  const renderEntry = (entry: ExposedEntry): React.ReactNode => {
    const caps = entryCaps(entry);
    const paramSources = entry.sources.filter((s): s is DirectMapping => s.kind === 'direct' || s.kind === 'alias');
    const maxCtx = Math.max(0, ...paramSources.map((s) => s.model.contextWindow || 0));
    const icons: Array<{ icon: React.ReactNode; label: string }> = [];
    if (caps.vision) icons.push({ icon: <Eye size={13} />, label: t('capability.vision') });
    if (caps.reasoning) icons.push({ icon: <Brain size={13} />, label: t('capability.reasoning') });
    if (caps.effort) icons.push({ icon: <SlidersHorizontal size={13} />, label: t('capability.effort') });
    if (caps.tools) icons.push({ icon: <Wrench size={13} />, label: t('capability.tools') });
    if (caps.json) icons.push({ icon: <Braces size={13} />, label: t('capability.json') });
    const meta = `${kindLabel(entry.sources)} · ${t('models.inventory.sourceCount', { n: entry.sources.length })}${maxCtx > 0 ? ` · ${maxCtx.toLocaleString()} ctx` : ''}`;
    return (
      <button
        type="button"
        onClick={() => navigate(`/models/${encodeURIComponent(entry.name)}`)}
        aria-label={entry.name}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 'var(--spacer-10)',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacer-8)',
            color: 'var(--text-default)',
          }}
        >
          <ModelLogo
            modelName={paramSources[0]?.modelName || entry.name}
            providerId={paramSources[0]?.providerId || ''}
            name={entry.name}
            size={18}
          />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 'var(--body-base-font-size)',
              fontWeight: 'var(--font-weight-strong)',
              fontFamily: 'var(--font-family-mono)',
            }}
          >
            {entry.name}
          </span>
          <ChevronRight size={15} style={{ color: 'var(--icon-tertiary)', flexShrink: 0 }} />
        </span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 'var(--body-xs-font-size)',
            color: 'var(--text-tertiary)',
          }}
        >
          {meta}
        </span>
        <span
          aria-hidden
          style={{ display: 'flex', gap: 'var(--spacer-8)', height: 16, color: 'var(--text-tertiary)' }}
        >
          {icons.map((c) => (
            <span key={c.label} title={c.label} style={{ display: 'inline-flex' }}>
              {c.icon}
            </span>
          ))}
        </span>
      </button>
    );
  };

  if (entries.length === 0) return null;

  return (
    <div className="mc-section" style={{ marginBottom: 'var(--spacer-32)' }}>
      <FilterGrid
        items={entries}
        filters={gridFilters}
        getKey={(e) => e.name}
        renderItem={renderEntry}
        label={t('models.inventory.filterLabel')}
        columns={3}
        rowHeight={132}
        maxRows="auto"
        gap={16}
        emptyLabel={t('models.inventory.emptyFilter')}
      />
    </div>
  );
};
