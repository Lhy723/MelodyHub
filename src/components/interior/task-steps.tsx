// MelodyHub interior — task-steps（已换肤）
// 来源：ddoemonn/interior components/interior/task-steps.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useTaskSteps 步骤状态推导 + sentence 文案 +
// 状态交叉淡入 + active shimmer + 500ms 防抖 live-region + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 task-steps.css（CSS Vars）、
// phosphor 风格内联 svg（Tick / Cross / Arc spinner）换成 lucide-react（Check / X / LoaderCircle）。
// 取舍：上游 Arc 是 motion.svg 自旋转（circle + arc 路径）；换成 lucide LoaderCircle 后
// 无法复用内置 arc 路径动画，故只保留外层 motion.span 的 rotate 360 循环（参数不变），
// 视觉仍为连续旋转；reduced-motion 时 spinner 与上游一致保持旋转（上游 Arc 不感知 reduced）。
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, LoaderCircle, X } from 'lucide-react';
import './task-steps.css';

const POP = { type: 'spring', stiffness: 640, damping: 22, mass: 0.7 } as const;
const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const STILL = { duration: 0 } as const;
const SPIN = { duration: 0.8, ease: 'linear', repeat: Infinity } as const;

export type TaskStep = {
  id: string;
  label: string;
  meta?: string;
};

export type TaskStepStatus = 'pending' | 'active' | 'done' | 'error';

export type UseTaskStepsOptions = {
  steps: TaskStep[];
  current: number;
  failed?: boolean;
};

export type TaskStepRow = TaskStep & {
  status: TaskStepStatus;
};

export type UseTaskStepsReturn = {
  rows: TaskStepRow[];
  complete: boolean;
  failed: boolean;
  sentence: string;
};

export function useTaskSteps({ steps, current, failed = false }: UseTaskStepsOptions): UseTaskStepsReturn {
  const complete = !failed && current >= steps.length;

  const rows: TaskStepRow[] = steps.map((step, i) => ({
    ...step,
    status: (
      i < current
        ? 'done'
        : i === current && failed
          ? 'error'
          : i === current && !complete
            ? 'active'
            : 'pending'
    ) as TaskStepStatus,
  }));

  const active = rows.find((r) => r.status === 'active');
  const sentence = failed
    ? `Failed at ${steps[Math.min(current, steps.length - 1)]?.label ?? 'step'}`
    : complete
      ? `All ${steps.length} steps complete`
      : active
        ? `${active.label}, step ${current + 1} of ${steps.length}`
        : '';

  return { rows, complete, failed, sentence };
}

export type TaskStepsProps = UseTaskStepsOptions & {
  label?: string;
  className?: string;
};

export function TaskSteps({
  steps,
  current,
  failed = false,
  label = 'Task progress',
  className = '',
}: TaskStepsProps) {
  const { rows, complete, sentence } = useTaskSteps({ steps, current, failed });
  const reduced = useReducedMotion() === true;

  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    if (!sentence) return;
    const t = setTimeout(() => setSpoken(sentence), 500);
    return () => clearTimeout(t);
  }, [sentence]);

  return (
    <div className={`mh-task-steps ${className}`}>
      <ol aria-label={label} className="mh-task-steps__list">
        {rows.map((row) => (
          <li
            key={row.id}
            aria-current={row.status === 'active' ? 'step' : undefined}
            data-status={row.status}
            className="mh-task-steps__row"
          >
            <span className="mh-task-steps__marker" aria-hidden="true">
              <AnimatePresence initial={false}>
                {row.status === 'done' ? (
                  <motion.span
                    key="done"
                    className="mh-task-steps__badge mh-task-steps__badge--done"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: STILL }}
                    transition={reduced ? STILL : POP}
                  >
                    <Check size={11} strokeWidth={2.5} aria-hidden="true" />
                  </motion.span>
                ) : row.status === 'error' ? (
                  <motion.span
                    key="error"
                    className="mh-task-steps__badge mh-task-steps__badge--error"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: STILL }}
                    transition={reduced ? STILL : POP}
                  >
                    <X size={10} strokeWidth={2.5} aria-hidden="true" />
                  </motion.span>
                ) : row.status === 'active' ? (
                  <motion.span
                    key="active"
                    className="mh-task-steps__badge mh-task-steps__badge--active"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: STILL }}
                    transition={reduced ? STILL : CELL}
                  >
                    <motion.span
                      className="mh-task-steps__spinner"
                      initial={false}
                      animate={{ rotate: 360 }}
                      transition={SPIN}
                    >
                      <LoaderCircle size={12} strokeWidth={2} aria-hidden="true" />
                    </motion.span>
                  </motion.span>
                ) : (
                  <motion.span
                    key="pending"
                    className="mh-task-steps__badge mh-task-steps__badge--pending"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: STILL }}
                    transition={STILL}
                  />
                )}
              </AnimatePresence>
            </span>

            {row.status === 'active' && !reduced ? (
              <motion.span
                className="mh-task-steps__label mh-task-steps__label--shimmer"
                animate={{ backgroundPosition: ['120% 0', '-120% 0'] }}
                transition={{ duration: 1.6, ease: 'linear', repeat: Infinity }}
              >
                {row.label}
              </motion.span>
            ) : (
              <span className="mh-task-steps__label">{row.label}</span>
            )}

            {row.meta ? (
              <span
                className="mh-task-steps__meta"
                aria-hidden={row.status !== 'done'}
              >
                {row.meta}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <span role="status" className="mh-task-steps__sr">
        {spoken}
      </span>
      <span className="mh-task-steps__sr" aria-live={complete || failed ? 'polite' : 'off'}>
        {complete ? 'Run complete' : failed ? 'Run failed' : ''}
      </span>
    </div>
  );
}
