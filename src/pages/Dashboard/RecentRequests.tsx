import { useEffect, useRef, useState } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Card, Tag, FlexBetween, Skeleton } from '../../components/ui';
import { LoadingButton } from '../../components/interior/loading-button';
import { Pagination } from '../../components/interior/pagination';
import { Drawer } from '../../components/interior/drawer';
import { CopyButton } from '../../components/interior/copy-button';
import { useT } from '../../i18n';

const modelTagStyle: Record<string, { variant: 'brand' | 'green' | 'danger'; customColor?: string }> = {
  'GPT-4o': { variant: 'brand' },
  'Claude 3.5': { variant: 'green', customColor: 'var(--viz-series-coral)' },
  'DeepSeek V3': { variant: 'green', customColor: 'var(--accent-teal)' },
  'Qwen 2.5': { variant: 'green', customColor: 'var(--accent-amber)' },
};

/** 抽屉里的标签-值行。 */
const RequestDetailRow: React.FC<{ label: string; value?: string; children?: React.ReactNode }> = ({
  label,
  value,
  children,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 'var(--spacer-12)',
      padding: 'var(--spacer-10) 0',
      borderBottom: '1px solid var(--border-neutral-l1)',
      fontSize: 'var(--body-sm-font-size)',
    }}
  >
    <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{label}</span>
    {children ?? <span style={{ color: 'var(--text-default)', textAlign: 'right' }}>{value}</span>}
  </div>
);

export const RecentRequests: React.FC = () => {
  const t = useT();
  const recentRequests = useStatsStore((s) => s.recentRequests);
  const loading = useStatsStore((s) => s.requestsLoading);
  const error = useStatsStore((s) => s.requestsError);
  const fetchRequests = useStatsStore((s) => s.fetchRequests);
  const page = useStatsStore((s) => s.page);
  const pageSize = useSettingsStore((s) => s.settings.pageSize);
  const setPage = useStatsStore((s) => s.setPage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? (recentRequests.find((r) => r.id === selectedId) ?? null) : null;
  const prevLength = useRef(recentRequests.length);

  // Track new rows for animation
  const newRowIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (recentRequests.length > prevLength.current) {
      // New rows added — mark them
      const newIds = recentRequests.slice(0, recentRequests.length - prevLength.current).map((r) => r.id);
      newIds.forEach((id) => newRowIds.current.add(id));
      const timer = setTimeout(() => newRowIds.current.clear(), 600);
      prevLength.current = recentRequests.length;
      return () => clearTimeout(timer);
    }
    prevLength.current = recentRequests.length;
  }, [recentRequests.length]);

  const totalPages = Math.max(1, Math.ceil(recentRequests.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = recentRequests.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const formatTimestamp = (timestamp: string) => timestamp;

  // Loading skeleton
  if (loading && recentRequests.length === 0) {
    return (
      <Card padding="var(--spacer-16) var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
        <FlexBetween style={{ marginBottom: 'var(--spacer-16)' }}>
          <Skeleton width={120} height={18} />
        </FlexBetween>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--spacer-12)', padding: 'var(--spacer-8) 0' }}>
              <Skeleton width={80} height={14} />
              <Skeleton width={100} height={14} />
              <Skeleton width={60} height={14} />
              <div style={{ flex: 1 }} />
              <Skeleton width={40} height={14} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Error state
  if (error && recentRequests.length === 0) {
    return (
      <Card padding="var(--spacer-16) var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
        <FlexBetween style={{ marginBottom: 'var(--spacer-16)' }}>
          <span
            style={{
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 'var(--font-weight-strong)',
              color: 'var(--text-default)',
            }}
          >
            {t('dashboard.table.title')}
          </span>
        </FlexBetween>
        <div style={{ padding: 'var(--spacer-32) 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <span style={{ color: 'var(--status-error-default)', fontSize: 'var(--body-base-font-size)' }}>{t('dashboard.loadFailed')}</span>
          <div style={{ marginTop: 'var(--spacer-8)' }}>
            <LoadingButton
              onAction={fetchRequests}
              pendingLabel={t('dashboard.retrying')}
              successLabel={t('dashboard.retried')}
              errorLabel={t('dashboard.retry')}
            >
              {t('dashboard.retry')}
            </LoadingButton>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="var(--spacer-16) var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
      <FlexBetween style={{ marginBottom: 'var(--spacer-16)' }}>
        <div
          style={{
            fontSize: 'var(--heading-xs-font-size)',
            fontWeight: 'var(--font-weight-strong)',
            color: 'var(--text-default)',
            lineHeight: 'var(--heading-xs-line-height)',
          }}
        >
          {t('dashboard.table.title')}
          {recentRequests.length > 0 && (
            <span
              style={{
                fontSize: 'var(--body-sm-font-size)',
                color: 'var(--text-tertiary)',
                marginLeft: 'var(--spacer-8)',
                fontWeight: 400,
              }}
            >
              ({recentRequests.length} {t('dashboard.table.count')})
            </span>
          )}
        </div>
      </FlexBetween>

      {recentRequests.length === 0 ? (
        <div
          style={{
            padding: 'var(--spacer-32) 0',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-base-font-size)',
          }}
        >
          {t('dashboard.table.noData')}
        </div>
      ) : (
        <>
          <div className="ds-table-card" style={{ overflowX: 'auto' }}>
            <table className="ds-table" style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.time')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.model')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.provider')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.type')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'right',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.tokens')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.status')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'right',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.latency')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((req, idx) => {
                  const ts = modelTagStyle[req.model];
                  const isNewRow = newRowIds.current.has(req.id);
                  return (
                    <tr
                      key={req.id}
                      className={isNewRow ? 'rb-recent-request-new' : undefined}
                      tabIndex={0}
                      aria-label={`${req.model} ${formatTimestamp(req.timestamp)}`}
                      style={{
                        transition: 'background var(--transition-fast, 0.12s ease), opacity 0.3s ease',
                        animation: isNewRow ? 'slideInUp 0.25s ease-out both' : 'none',
                        animationDelay: isNewRow ? `${idx * 30}ms` : '0ms',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedId(req.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId(req.id);
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          fontFamily: 'var(--font-family-mono)',
                          fontSize: 'var(--body-md-font-size)',
                          color: 'var(--text-default)',
                        }}
                      >
                        {formatTimestamp(req.timestamp)}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                        }}
                      >
                        <Tag
                          variant={ts?.variant ?? 'brand'}
                          style={
                            ts?.customColor
                              ? { background: 'var(--bg-overlay-l1)', color: ts.customColor, border: 'none' }
                              : { border: 'none' }
                          }
                        >
                          {req.model}
                        </Tag>
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <span>{req.provider}</span>
                        {req.failoverCount && req.failoverCount > 0 && (
                          <Tag
                            variant="orange"
                            style={{
                              marginLeft: 'var(--spacer-4)',
                              border: 'none',
                              fontSize: 'var(--body-xs-font-size)',
                            }}
                          >
                            切换×{req.failoverCount}
                          </Tag>
                        )}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {req.type}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          textAlign: 'right',
                          fontFamily: 'var(--font-family-metric)',
                          color: 'var(--text-default)',
                        }}
                      >
                        {req.tokens.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                        }}
                      >
                        <Tag
                          variant={req.status === 'success' || req.status === 'streaming' ? 'success' : 'danger'}
                          style={{ border: 'none' }}
                        >
                        {req.status === 'success' || req.status === 'streaming' ? t('dashboard.table.success') : t('dashboard.table.failed')}
                        </Tag>
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          textAlign: 'right',
                          fontFamily: 'var(--font-family-metric)',
                        }}
                      >
                        {(req.latencyMs / 1000).toFixed(2)}s
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination（interior 1-indexed，store 为 0-indexed，此处做 ±1 适配） */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: 'var(--spacer-16)',
              }}
            >
              <Pagination count={totalPages} page={safePage + 1} onPageChange={(p) => setPage(p - 1)} />
            </div>
          )}

          {/* 行点击 → 右侧抽屉：表里放不下的请求 ID / 失败分类 / 故障转移链 */}
          <Drawer
            open={!!selected}
            onOpenChange={(o) => {
              if (!o) setSelectedId(null);
            }}
            title={t('dashboard.requestDetail.title')}
            description={selected ? `${selected.model} · ${formatTimestamp(selected.timestamp)}` : undefined}
            width={360}
          >
            {selected && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <RequestDetailRow label={t('dashboard.requestDetail.id')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
                    <code
                      style={{
                        fontFamily: 'var(--font-family-mono)',
                        fontSize: 'var(--body-sm-font-size)',
                        color: 'var(--text-default)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {selected.id}
                    </code>
                    <CopyButton
                      value={selected.id}
                      label={t('dashboard.requestDetail.copy')}
                      copiedLabel={t('dashboard.requestDetail.copied')}
                      errorLabel={t('dashboard.requestDetail.copyFailed')}
                    />
                  </span>
                </RequestDetailRow>
                <RequestDetailRow label={t('dashboard.table.provider')} value={selected.provider} />
                <RequestDetailRow label={t('dashboard.table.type')} value={selected.type} />
                <RequestDetailRow label={t('dashboard.table.tokens')} value={selected.tokens.toLocaleString()} />
                <RequestDetailRow label={t('dashboard.table.latency')} value={`${(selected.latencyMs / 1000).toFixed(2)}s`} />
                {selected.errorCategory && (
                  <RequestDetailRow label={t('dashboard.requestDetail.errorCategory')}>
                    <Tag variant="danger" style={{ border: 'none' }}>
                      {selected.errorCategory}
                    </Tag>
                  </RequestDetailRow>
                )}
                {selected.failoverCount != null && selected.failoverCount > 0 && (
                  <RequestDetailRow label={t('dashboard.requestDetail.failoverPath')}>
                    <span style={{ color: 'var(--text-default)' }}>
                      {selected.originalProvider ? `${selected.originalProvider} → ${selected.provider} ×${selected.failoverCount}` : `切换×${selected.failoverCount}`}
                    </span>
                  </RequestDetailRow>
                )}
              </div>
            )}
          </Drawer>
        </>
      )}
    </Card>
  );
};
