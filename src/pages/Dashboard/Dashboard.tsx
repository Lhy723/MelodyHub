import { useEffect, useMemo } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { onRequestCompleted } from '../../lib/desktopApi';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { KPICards } from './KPICards';
import { TimeRangeTabs } from './TimeRangeTabs';
import { TokenTrendChart } from './TokenTrendChart';
import { ModelDonutChart } from './ModelDonutChart';
import { UsageHeatmap } from './UsageHeatmap';
import { ProxyControl } from './ProxyControl';
import { TriangleAlert } from 'lucide-react';
import { LoadingButton } from '../../components/interior/loading-button';
import { useT } from '../../i18n';
import './dashboard.css';

export const Dashboard: React.FC = () => {
  const t = useT();
  const fetchStats = useStatsStore((s) => s.fetchStats);
  const fetchRequests = useStatsStore((s) => s.fetchRequests);
  const fetchDailyUsage = useStatsStore((s) => s.fetchDailyUsage);
  const statsError = useStatsStore((s) => s.statsError);
  const requestsError = useStatsStore((s) => s.requestsError);
  const dailyUsageError = useStatsStore((s) => s.dailyUsageError);

  // Unified load error: combine all widget errors into one.
  const loadError = useMemo(() => {
    return statsError || requestsError || dailyUsageError;
  }, [statsError, requestsError, dailyUsageError]);

  // 重试同时刷三块数据，等全部落定再给成功脸；失败时 store 错误横幅会重新出现并说明原因。
  const handleRetry = async () => {
    await Promise.all([fetchStats(), fetchRequests(), fetchDailyUsage()]);
  };

  // 统一刷新入口：24h 视图额外拉小时桶（时间范围从 store 现读，避免闭包过期）。
  const refreshDashboardData = () => {
    void fetchStats();
    void fetchRequests();
    void fetchDailyUsage();
    if (useStatsStore.getState().timeRange === '24h') {
      void useStatsStore.getState().fetchHourlyUsage();
    }
  };

  useEffect(() => {
    // Initial load.
    refreshDashboardData();

    // Event-driven refresh: listen for `request-completed` events
    // from the Rust backend and debounce-refresh all three data
    // sources. Replaces the former 10-second polling interval.
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshDashboardData, 300);
    };

    onRequestCompleted(scheduleRefresh)
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e) => {
        console.warn('[Dashboard] Failed to listen for request-completed events:', e);
      });

    // Re-fetch when the tab becomes visible again (no polling).
    const onVisibility = () => {
      if (!document.hidden) {
        refreshDashboardData();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (unlisten) unlisten();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchStats, fetchRequests, fetchDailyUsage]);

  return (
    <div>
      {loadError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacer-8)',
            padding: 'var(--spacer-10) var(--spacer-14)',
            marginBottom: 'var(--spacer-16)',
            borderRadius: 'var(--radius-8)',
            background: 'var(--status-error-surface-l1)',
            // 全强度错误描边弱化为 30% 语义色发丝线，文字仍保持 --status-error-default。
            border: '1px solid color-mix(in srgb, var(--status-error-default) 30%, transparent)',
            color: 'var(--status-error-default)',
            fontSize: 'var(--body-sm-font-size)',
          }}
        >
          <TriangleAlert size={16} />
          <span style={{ flex: 1 }}>{t('dashboard.loadError')}{loadError}</span>
          <LoadingButton
            onAction={handleRetry}
            pendingLabel={t('dashboard.retrying')}
            successLabel={t('dashboard.retried')}
            errorLabel={t('dashboard.retry')}
          >
            {t('dashboard.retry')}
          </LoadingButton>
        </div>
      )}
      <ProxyControl />
      <TimeRangeTabs />
      <KPICards />
      <div
        className="dashboard-chart-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '3fr 2fr',
          gap: 'var(--spacer-16)',
          marginBottom: 'var(--spacer-24)',
        }}
      >
        <TokenTrendChart />
        <ModelDonutChart />
      </div>
      <UsageHeatmap />
    </div>
  );
};
