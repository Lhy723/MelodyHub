// MelodyHub interior — progress-bar（已换肤）
// 来源：ddoemonn/interior components/interior/progress-bar.tsx
// 上游 commit 见 _vendor/SOURCE.txt；确定/不确定两种模式 + role=progressbar 无障碍原样保留，
// 仅做：删 "use client"、删 Tailwind 改走 progress-bar.css（CSS Vars，复用 index.css 已有 keyframes）。
// 说明：新增通用组件；更新器下载进度、日志导出进度等场景可直接使用（value=null 为不确定模式）。
import type { AriaAttributes } from 'react';
import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './progress-bar.css';

const FILL = { type: 'spring', stiffness: 210, damping: 34, mass: 0.9 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

export type ProgressBarProps = {
  value: number | null;
  max?: number;
  label?: string;
  pendingLabel?: string;
  completeLabel?: string;
  className?: string;
};

export function ProgressBar({
  value,
  max = 100,
  label = 'Progress',
  pendingLabel = 'Working',
  completeLabel = 'Complete',
  className = '',
}: ProgressBarProps) {
  const reduced = useReducedMotion();
  const labelId = useId();

  const indeterminate = value === null;
  const fraction = value === null || max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const percent = Math.round(fraction * 100);
  const complete = !indeterminate && fraction >= 1;

  const measured: AriaAttributes = indeterminate
    ? {}
    : { 'aria-valuenow': Math.round(fraction * max * 100) / 100, 'aria-valuetext': `${percent}%` };

  return (
    <div className={`mh-progress ${className}`}>
      <div className="mh-progress__row">
        <span id={labelId} className="mh-progress__label">
          {label}
        </span>
        <span aria-hidden className="mh-progress__value">
          <motion.span
            initial={false}
            animate={{ opacity: indeterminate ? 1 : 0 }}
            transition={reduced ? INSTANT : CROSSFADE}
          >
            {pendingLabel}
          </motion.span>
          <motion.span
            initial={false}
            animate={{ opacity: indeterminate ? 0 : 1 }}
            transition={reduced ? INSTANT : CROSSFADE}
            className="mh-progress__value-num"
          >
            {percent}%
          </motion.span>
        </span>
      </div>

      <div role="progressbar" aria-labelledby={labelId} aria-valuemin={0} aria-valuemax={max} {...measured} className="mh-progress__track">
        <div className="mh-progress__viewport">
          <motion.span
            aria-hidden
            data-done={complete}
            className="mh-progress__fill"
            initial={false}
            animate={{ scaleX: indeterminate ? 0 : fraction }}
            transition={reduced ? INSTANT : FILL}
          />
          {indeterminate ? (
            <span aria-hidden data-animate={!reduced} className="mh-progress__indeterminate" />
          ) : (
            <span aria-hidden data-animate={!reduced && !complete} className="mh-progress__shimmer" />
          )}
        </div>
      </div>

      <span aria-live="polite" className="mh-progress__sr">
        {complete ? completeLabel : indeterminate ? pendingLabel : ''}
      </span>
    </div>
  );
}
