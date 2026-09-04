import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { Card, EChart, getCssVar, useThemeVersion } from '../../components/ui';
import type { EChartsOption } from '../../components/ui';
import { useT, t as tFn } from '../../i18n';

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// Heatmap grid dimensions: 52 weeks × 7 days (Mon–Sun).
const WEEKS = 52;
const DAYS = 7;

/** Format a Date as a local-timezone 'YYYY-MM-DD' string.
 * `toISOString()` returns UTC, which shifts the date by a day in non-UTC
 * timezones and breaks calendar-coordinate matching. */
function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const UsageHeatmap: React.FC = () => {
  const t = useT();
  const dailyUsage = useStatsStore((s) => s.dailyUsage);
  const themeVersion = useThemeVersion();
  const wrapRef = useRef<HTMLDivElement>(null);
  // 正方形格子：边长按卡片实测宽度推导（52 周均分，减去右侧 visualMap 预留 40px）。
  // ECharts 的 cellSize 不支持 auto 等比，只能用 JS 量一次 + 跟随窗口变化。
  const [cell, setCell] = useState(12);
  // 有数据时格子 div 才挂载：effect 跟随 hasData，数据回来后才开始量宽度。
  // （启动时数据异步到达，空 deps 只会在无数据时空跑一次，导致首屏一直长方形。）
  const hasData = dailyUsage.length > 0;
  useEffect(() => {
    if (!hasData) return;
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      setCell((prev) => {
        const next = Math.max(5, Math.min(18, Math.floor((w - 40) / WEEKS)));
        return prev === next ? prev : next;
      });
    };
    measure();
    // 挂载后布局可能还没稳定（侧栏动画/字体加载），500ms 后再量一次兜底。
    const settleTimer = window.setTimeout(measure, 500);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    // 兜底：RO 不触发时（后台标签页等）窗口 resize 也能跟上。
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(settleTimer);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [hasData]);
  const heatHeight = 40 + DAYS * cell + 14;

  // Date → real request count lookup for the tooltip and coloring.
  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dailyUsage) m.set(d.date, d.count);
    return m;
  }, [dailyUsage]);

  // Max count across the dataset, used to scale the visualMap so low-volume
  // days still get a non-zero color bucket. Falls back to 1 to avoid /0.
  const maxCount = useMemo(() => Math.max(...dailyUsage.map((d) => d.count), 1), [dailyUsage]);

  // Resolve the calendar date for a given [col, row] cell:
  //   col WEEKS-1 = current week, col 0 = oldest
  //   row 0 = Monday, row 6 = Sunday (getDay()-1, Sunday→6)
  const resolveCellDate = useMemo(() => {
    return (col: number, row: number): string => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayRow = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const diffDays = (WEEKS - 1 - col) * 7 + (todayRow - row);
      const d = new Date(today);
      d.setDate(today.getDate() - diffDays);
      return formatDateLocal(d);
    };
  }, []);

  const option = useMemo<EChartsOption>(() => {
    // Build [date, count] pairs for every cell. Real request counts come
    // from countByDate; cells without data push 0.
    const data: [string, number][] = [];
    for (let col = 0; col < WEEKS; col++) {
      for (let row = 0; row < DAYS; row++) {
        const dateStr = resolveCellDate(col, row);
        const count = countByDate.get(dateStr) ?? 0;
        data.push([dateStr, count]);
      }
    }

    // Calendar range: exactly (WEEKS-1) weeks back to today.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - (WEEKS - 1) * 7);
    const range = [formatDateLocal(start), formatDateLocal(today)];

    const heatColors = [
      getCssVar('--bg-base-tertiary') || '#E5E5E5',
      getCssVar('--brand-100') || '#E5EAFF',
      getCssVar('--brand-200') || '#CFD8FF',
      getCssVar('--brand-300') || '#AAB7FF',
      getCssVar('--brand-500') || '#6A6FFF',
      getCssVar('--bg-brand') || '#4B3FE3',
    ];
    const tertiaryText = getCssVar('--text-tertiary') || '#737373';
    const tooltipBg = getCssVar('--bg-tooltip') || '#FFFFFF';
    const tooltipText = getCssVar('--text-default') || '#171717';
    const borderColor = getCssVar('--border-neutral-l1') || 'rgba(115,115,115,0.12)';
    // Match the card surface (not pure white) so empty cells blend in.
    const cellBorder = getCssVar('--bg-base-secondary') || '#F5F5F5';

    return {
      title: {
        text: tFn('dashboard.heatmap.title'),
        left: 0,
        top: 0,
        textStyle: {
          fontSize: 13,
          fontWeight: 'bold',
          color: getCssVar('--text-default') || '#171717',
        },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        borderColor,
        borderWidth: 1,
        textStyle: { color: tooltipText, fontSize: 11 },
        formatter: (p: unknown) => {
          const [dateStr] = (p as { value: [string, number] }).value;
          const count = countByDate.get(dateStr) ?? 0;
          const [, m, d] = dateStr.split('-');
          return `${parseInt(m, 10)}月${parseInt(d, 10)}日<br/>${count} ${tFn('dashboard.chart.requests')}`;
        },
      },
      visualMap: {
        show: true,
        min: 0,
        max: maxCount,
        type: 'continuous',
        orient: 'vertical',
        right: 0,
        top: 'middle',
        itemWidth: 10,
        itemHeight: 60,
        textStyle: { color: tertiaryText, fontSize: 9 },
        // Smooth gradient from empty-cell color → brand color.
        inRange: {
          color: [heatColors[0], heatColors[1], heatColors[2], heatColors[3], heatColors[4], heatColors[5]],
        },
        // Show "多"/"少" at the ends instead of raw numbers.
        formatter: (v: unknown) => {
          const n = Number(v);
          if (n <= 0) return tFn('dashboard.heatmap.less');
          if (n >= maxCount) return tFn('dashboard.heatmap.more');
          return '';
        },
      },
      calendar: {
        top: 40,
        left: 0,
        right: 40,
        bottom: 5,
        cellSize: [cell, cell],
        range,
        itemStyle: {
          color: heatColors[0],
          borderColor: cellBorder,
          borderWidth: 2,
          borderRadius: 4,
        },
        splitLine: { show: false },
        yearLabel: { show: false },
        monthLabel: {
          nameMap: MONTH_NAMES,
          color: tertiaryText,
          fontSize: 9,
          margin: 4,
          align: 'left',
        },
        dayLabel: { show: false },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data,
          itemStyle: {
            borderRadius: 4,
            borderWidth: 2,
            borderColor: cellBorder,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 4,
              shadowColor: 'rgba(0,0,0,0.2)',
            },
          },
          progressive: 1000,
          animation: false,
        },
      ],
    };
  }, [themeVersion, resolveCellDate, countByDate, maxCount, cell]);

  return (
    <Card padding="var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
      {hasData ? (
        <div ref={wrapRef} style={{ height: heatHeight }}>
          <EChart option={option} />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 140,
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-sm-font-size)',
          }}
        >
          {t('dashboard.heatmap.noData')}
        </div>
      )}
    </Card>
  );
};
