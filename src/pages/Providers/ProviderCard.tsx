import { useT } from '../../i18n';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import type { Model } from '../../types/provider';
import type { ProviderHealthSnapshot, ProviderRate } from '../../lib/desktopApi';
import { ConfirmDialog, SpotlightCard, Tag, toast, ProviderLogo, ModelLogo } from '../../components/ui';
import { Pencil, Trash2, Box, Loader2 } from 'lucide-react';
import { useCopyToClipboard } from '../../components/interior/copy-button';
import { useIconMorph, MorphGlyph } from '../../components/interior/icon-morph';
import { TooltipGroup, Tooltip } from '../../components/interior/tooltip-group';
import './providers.css';
import { Chip } from './chip';

/** 卡片模型叠堆:按模型名解析真实品牌图标,层叠展示,超出 max 显示 +N。 */
const CARD_MODEL_STACK_MAX = 5;

const describeModelCapabilities = (model: Model, t: ReturnType<typeof useT>) => {
  const tags: string[] = [];
  if (model.contextWindow) tags.push(`${model.contextWindow.toLocaleString()} ctx`);
  if (model.maxOutputTokens) tags.push(`${model.maxOutputTokens.toLocaleString()} out`);
  if (model.supportsVision) tags.push(t('capability.vision'));
  if (model.supportsReasoning) tags.push(t('capability.reasoning'));
  if (model.supportsReasoningEffort) tags.push(t('capability.effort'));
  if (model.supportsToolCalls) tags.push(t('capability.tools'));
  if (model.supportsJsonMode) tags.push(t('capability.json'));
  return tags;
};

const getStatusConfig = (
  t: ReturnType<typeof useT>,
): Record<
  string,
  { tagVariant: 'green' | 'orange' | 'danger' | 'neutral'; label: string; cardStatus: string }
> => ({
  connected: { tagVariant: 'green', label: t('providers.status.connected'), cardStatus: 'normal' },
  configuring: { tagVariant: 'orange', label: t('providers.status.configuring'), cardStatus: 'unconfigured' },
  error: { tagVariant: 'danger', label: t('providers.status.error'), cardStatus: 'failed' },
  disabled: { tagVariant: 'neutral', label: t('providers.status.disabled'), cardStatus: 'disabled' },
  testing: { tagVariant: 'orange', label: t('providers.status.testing'), cardStatus: 'testing' },
  // Health-driven states (override provider.status Tag when not healthy)
  rate_limited: { tagVariant: 'orange', label: t('providers.status.rateLimited'), cardStatus: 'testing' },
  unhealthy: { tagVariant: 'danger', label: t('providers.status.circuitOpen'), cardStatus: 'failed' },
  auth_error: { tagVariant: 'danger', label: t('providers.status.authFailed'), cardStatus: 'failed' },
});

const formatRate = (value: number): string => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(value > 0 && value < 10 ? 1 : 0);
};

export const ProviderCard: React.FC<{
  providerId: string;
  health?: ProviderHealthSnapshot;
  rates?: ProviderRate;
}> = ({
  providerId,
  health,
  rates,
}) => {
  const navigate = useNavigate();
  const t = useT();
  const provider = useProviderStore((s) => s.providers.find((p) => p.id === providerId));
  const updateProvider = useProviderStore((s) => s.updateProvider);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Key 复制改走 interior（fallback + 自动复位，之前无已复制反馈）；电源/展开箭头走路径变形。
  const keyCopy = useCopyToClipboard({
    onCopy: () => toast(t('providers.apiKeyCopied'), 'success'),
    onError: () => toast(t('providers.copyFailed'), 'error'),
  });
  const keyCopyIcon = useIconMorph({ preset: 'copy-check', active: keyCopy.copied });

  if (!provider) return null;

  const statusCfg = getStatusConfig(t)[provider.status] || getStatusConfig(t).configuring;
  // Health status takes priority over provider.status for the Tag display
  const healthCfg = health && health.status !== 'healthy' ? getStatusConfig(t)[health.status] : null;
  const tagVariant = healthCfg?.tagVariant ?? statusCfg.tagVariant;
  const tagLabel = healthCfg?.label ?? statusCfg.label;

  const handleCopyKey = () => {
    if (provider?.apiKey) void keyCopy.copy(provider.apiKey);
  };

  const handleDelete = async () => {
    try {
      await useProviderStore.getState().removeProvider(provider.id);
      toast(`已删除提供商「${provider.name}」`, 'info');
      setConfirmDelete(false);
    } catch (e) {
      console.error('Failed to remove provider:', e);
    }
  };

  const handleToggleEnabled = async () => {
    const newStatus = provider.status === 'disabled' ? 'connected' : 'disabled';
    try {
      await updateProvider(provider.id, { status: newStatus });
      toast(newStatus === 'disabled' ? `已禁用「${provider.name}」` : `已启用「${provider.name}」`, 'success');
    } catch (e) {
      console.error('Failed to toggle provider:', e);
    }
  };

  const isDisabled = provider.status === 'disabled';
  const powerIcon = useIconMorph({ preset: 'power', active: isDisabled });
  const expandIcon = useIconMorph({ preset: 'chevron', active: expanded });

  return (
    <SpotlightCard
      padding="0"
      variant={statusCfg.cardStatus === 'failed' ? 'danger' : 'neutral'}
      className={statusCfg.cardStatus !== 'normal' ? `rb-card-status--${statusCfg.cardStatus}` : ''}
      style={{
        overflow: 'hidden',
        opacity: isDisabled ? 0.7 : 1,
        filter: isDisabled ? 'saturate(0.7)' : 'none',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={() => navigate(`/providers/${provider.id}`)}
        className="mh-pcard__surface"
        style={{
          height: '100%',
          opacity: isDisabled ? 0.7 : 1,
          cursor: 'pointer',
        }}
      >
      {/* Header */}
      <div
        className="mc-provider-card__header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacer-16) var(--spacer-16) var(--spacer-12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
          <ProviderLogo
            providerId={provider.id}
            name={provider.name}
            size={20}
            style={{
              color: isDisabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
              transition: 'color var(--transition-normal, 0.2s ease)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-family-heading)',
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 'var(--font-weight-strong)',
              lineHeight: 'var(--heading-xs-line-height)',
              color: isDisabled ? 'var(--text-disabled)' : 'var(--text-default)',
              transition: 'color var(--transition-normal, 0.2s ease)',
            }}
          >
            {provider.name}
          </span>
          {provider.status === 'testing' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--spacer-4)',
                padding: '0 var(--spacer-8)',
                borderRadius: 'var(--radius-4)',
                fontSize: 'var(--body-xs-font-size)',
                background: 'var(--status-primary-surface-l1)',
                color: 'var(--status-primary-default)',
              }}
            >
              <Loader2 size={10} className="animate-spin" />
              {t('providers.status.testing')}
            </span>
          ) : (
            <Tag variant={tagVariant} style={{ border: 'none' }}>
              {tagLabel}
            </Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacer-4)' }}>
          <TooltipGroup>
          <Tooltip label={isDisabled ? '启用' : '禁用'} side="bottom">
          <button
            className={`icon-action-btn ${isDisabled ? 'mh-icon-btn--power-off' : 'mh-icon-btn--power-on'}`}
            aria-label={isDisabled ? '启用提供商' : '禁用提供商'}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleEnabled();
            }}
          >
            <MorphGlyph slots={powerIcon.slots} rotate={powerIcon.rotate} transition={powerIcon.transition} mode={powerIcon.mode} size={14} />
          </button>
          </Tooltip>
          <Tooltip label={t('models.edit')} side="bottom">
          <button
            className="icon-action-btn"
            aria-label={t('models.edit')}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/providers/${provider.id}/edit`);
            }}
          >
            <Pencil size={14} />
          </button>
          </Tooltip>
          <Tooltip label={t('models.delete')} side="bottom">
          <button
            className="icon-action-btn mh-icon-btn--danger"
            aria-label={t('models.delete')}
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
          >
            <Trash2 size={14} />
          </button>
          </Tooltip>
        </TooltipGroup>
        </div>
      </div>

      {/* Details */}
      <div
        className="mc-provider-card__details"
        style={{
          padding: '0 var(--spacer-16) var(--spacer-12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacer-8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
            API Base
          </span>
          <span
            style={{
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--text-secondary)',
              textAlign: 'right',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 200,
              fontFamily: 'var(--font-family-mono)',
            }}
          >
            {provider.apiBase}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
            API Key
          </span>
          {provider.apiKey ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-4)' }}>
              <span
                style={{
                  fontSize: 'var(--body-xs-font-size)',
                  color: 'var(--text-secondary)',
                  textAlign: 'right',
                  fontFamily: 'var(--font-family-mono)',
                }}
              >
                {provider.apiKey ? `${provider.apiKey.slice(0, 8)}...` : ''}
              </span>
              <button
                title={t('providers.apiKeyCopied')}
                className="mh-pcard__copybtn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyKey();
                }}
              >
                <MorphGlyph slots={keyCopyIcon.slots} rotate={keyCopyIcon.rotate} transition={keyCopyIcon.transition} mode={keyCopyIcon.mode} size={12} />
              </button>
            </div>
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/providers/${provider.id}/edit`);
              }}
              style={{
                fontSize: 'var(--body-sm-font-size)',
                color: 'var(--text-brand)',
                cursor: 'pointer',
                textDecoration: 'underline',
                textDecorationStyle: 'dashed',
                textUnderlineOffset: 2,
              }}
            >
              {t('models.clickToConfig')}
            </span>
          )}
        </div>
        {rates && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}
              title={t('providers.ratesHint')}
            >
              {t('providers.ratesLabel')}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 'var(--spacer-8)',
                fontSize: 'var(--body-sm-font-size)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-family-metric)',
              }}
            >
              <span>
                {formatRate(rates.tpm)}
                <span style={{ color: 'var(--text-tertiary)', marginLeft: 2 }}>TPM</span>
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>/</span>
              <span>
                {formatRate(rates.rpm)}
                <span style={{ color: 'var(--text-tertiary)', marginLeft: 2 }}>RPM</span>
              </span>
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
            模型数量
          </span>
          {provider.models.length === 0 ? (
            <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>0</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-6)' }}>
              <span
                role="img"
                aria-label={`${provider.name}共 ${provider.models.length} 个模型`}
                title={provider.models.map((m) => m.name).join('、')}
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                {provider.models.slice(0, CARD_MODEL_STACK_MAX).map((m, i) => (
                  <span key={m.id} title={m.name} style={{ marginLeft: i === 0 ? 0 : -6, display: 'inline-flex' }}>
                    <ModelLogo
                      modelName={m.name}
                      providerId={provider.id}
                      name={provider.name}
                      size={22}
                    />
                  </span>
                ))}
                {provider.models.length > CARD_MODEL_STACK_MAX && (
                  <span
                    title={provider.models
                      .slice(CARD_MODEL_STACK_MAX)
                      .map((m) => m.name)
                      .join('、')}
                    style={{
                      marginLeft: -6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'var(--bg-overlay-l1)',
                      color: 'var(--text-secondary)',
                      fontSize: 'var(--body-xs-font-size)',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    +{provider.models.length - CARD_MODEL_STACK_MAX}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
                {provider.models.length}
              </span>
            </span>
          )}
        </div>

        {/* Error summary for failed status */}
        {provider.status === 'error' && (
          <div
            style={{
              padding: 'var(--spacer-8) var(--spacer-12)',
              borderRadius: 'var(--radius-6)',
              background: 'var(--status-error-surface-l1)',
              color: 'var(--status-error-default)',
              fontSize: 'var(--body-xs-font-size)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-6)',
              marginTop: 'var(--spacer-4)',
            }}
          >
            <span>{t('providers.connectError')}</span>
          </div>
        )}

        {/* Unconfigured hint */}
        {provider.status === 'configuring' && (
          <div
            style={{
              padding: 'var(--spacer-8) var(--spacer-12)',
              borderRadius: 'var(--radius-6)',
              background: 'var(--status-alert-surface-l1)',
              color: 'var(--status-alert-default)',
              fontSize: 'var(--body-xs-font-size)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-6)',
              marginTop: 'var(--spacer-4)',
            }}
          >
            <span>{t('providers.noApiKey')}</span>
          </div>
        )}
      </div>

      {/* Divider + Toggle model list */}
      <div style={{ height: 1, background: 'var(--border-neutral-l1)', margin: '0 var(--spacer-16)' }} />
      <div
        className="mc-provider-card__toggle mh-pcard__toggle"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-4)',
          padding: 'var(--spacer-8) var(--spacer-16)',
          cursor: 'pointer',
          color: 'var(--text-tertiary)',
          fontSize: 'var(--body-xs-font-size)',
          lineHeight: 'var(--body-xs-line-height)',
        }}
      >
        <span className="mc-provider-card__chevron" style={{ display: 'inline-flex' }}>
          <MorphGlyph slots={expandIcon.slots} rotate={expandIcon.rotate} transition={expandIcon.transition} mode={expandIcon.mode} size={12} />
        </span>
        <span>{expanded ? t('providers.collapseModels') : t('providers.expandModels')}</span>
      </div>

      {/* Model list */}
      <div
        className="mc-provider-card__models"
        style={{
          maxHeight: expanded ? 500 : 0,
          overflow: 'hidden',
          transition: 'max-height var(--transition-normal, 0.2s ease), opacity var(--transition-fast, 0.12s ease)',
          opacity: expanded ? 1 : 0,
          padding: expanded ? 'var(--spacer-8) var(--spacer-16) var(--spacer-12)' : '0 var(--spacer-16)',
          borderTop: expanded ? '1px solid var(--border-neutral-l1)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: expanded ? 'var(--spacer-6)' : 0,
          background: 'var(--bg-white)',
        }}
      >
        {provider.models.map((model) => {
          const capabilityTags = describeModelCapabilities(model, t);
          return (
            <div
              key={model.id}
              className="mc-model-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-8)',
                flexWrap: 'wrap',
                fontSize: 'var(--body-sm-font-size)',
                lineHeight: 'var(--body-sm-line-height)',
                color: isDisabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
              }}
            >
              <Box size={14} style={{ color: isDisabled ? 'var(--icon-disabled)' : 'var(--icon-tertiary)' }} />
              <span>{model.name}</span>
              {capabilityTags.map((tag) => (
                <Chip key={tag} size="sm" muted style={isDisabled ? { color: 'var(--text-disabled)' } : undefined}>
                  {tag}
                </Chip>
              ))}
            </div>
          );
        })}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={confirmDelete}
        title={t('providers.deleteTitle')}
        message={`确定删除提供商「${provider.name}」？此操作不可撤销。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      </div>
    </SpotlightCard>
  );
};
