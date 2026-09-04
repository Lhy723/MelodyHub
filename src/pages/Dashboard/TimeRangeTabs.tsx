import React from 'react';
import { useStatsStore } from '../../store/statsStore';
import type { TimeRange } from '../../types/stats';
import { Tabs } from '../../components/interior/tabs';
import { useT } from '../../i18n';

export const TimeRangeTabs: React.FC = () => {
  const t = useT();
  const rangeOptions: { key: TimeRange; label: string }[] = [
    { key: '7d', label: t('dashboard.tabs.7d') },
    { key: '30d', label: t('dashboard.tabs.30d') },
    { key: '90d', label: t('dashboard.tabs.90d') },
  ];
  const activeRange = useStatsStore((s) => s.timeRange);
  const setTimeRange = useStatsStore((s) => s.setTimeRange);
  const fetchStats = useStatsStore((s) => s.fetchStats);
  const fetchRequests = useStatsStore((s) => s.fetchRequests);

  return (
    <div style={{ marginBottom: 'var(--spacer-24)' }}>
      <Tabs
        items={rangeOptions.map((opt) => ({ value: opt.key, label: opt.label }))}
        value={activeRange}
        onValueChange={(next) => {
          setTimeRange(next as TimeRange);
          void fetchStats();
          void fetchRequests();
        }}
        variant="underline"
        label={t('dashboard.tabs.label')}
      />
    </div>
  );
};
