import { useEffect, useRef } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { onRequestCompleted } from '../../lib/desktopApi';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { TimeRangeTabs } from '../Dashboard/TimeRangeTabs';
import { RecentRequests } from './RecentRequests';

/** 近期调用记录独立页：范围选择 + 请求表 + 详情抽屉。
 *  数据获取与仪表盘同节奏：挂载、请求完成事件（去抖）、页面重新可见。 */
export const RequestsPage: React.FC = () => {
  const fetchRequests = useStatsStore((s) => s.fetchRequests);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    fetchRequests();

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fetchRequests(), 300);
    };
    onRequestCompleted(schedule)
      .then((fn) => {
        unlistenRef.current = fn;
      })
      .catch((e) => console.warn('[Requests] failed to listen for request-completed:', e));

    const onVisibility = () => {
      if (!document.hidden) fetchRequests();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unlistenRef.current?.();
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchRequests]);

  return (
    <div>
      <TimeRangeTabs />
      <RecentRequests />
    </div>
  );
};

export default RequestsPage;
