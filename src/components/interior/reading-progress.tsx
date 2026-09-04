// MelodyHub interior — reading-progress（已换肤）
// 来源：ddoemonn/interior components/interior/reading-progress.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useReadingProgress 滚动进度计算 + rAF 节流 +
// ResizeObserver + spring 平滑 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 reading-progress.css（CSS Vars）、
// phosphor 风格 check svg 换成 lucide-react Check（内层 pathLength 绘制动画取舍见下）。
// 取舍：上游完成态图标是 motion.polyline 的 pathLength 绘制动画；换成 lucide Check 后
// 无法直接对内置 path 做 pathLength 动画，故只保留外层 crossfade + x 位移动画。
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import './reading-progress.css';

const FILL = { type: 'spring', stiffness: 210, damping: 34, mass: 0.9 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

export type ScrollRef = { readonly current: HTMLElement | null };

export type UseReadingProgressOptions = {
  target?: ScrollRef;
  scroller?: ScrollRef;
  steps?: number;
  words?: number;
  wordsPerMinute?: number;
};

export type ReadingProgressState = {
  step: number;
  steps: number;
  progress: number;
  percent: number;
  minutesLeft: number;
  totalMinutes: number;
  complete: boolean;
};

function clamp01(n: number) {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
}

export function useReadingProgress({
  target,
  scroller,
  steps = 24,
  words = 0,
  wordsPerMinute = 220,
}: UseReadingProgressOptions = {}): ReadingProgressState {
  const [step, setStep] = useState(0);
  const frame = useRef(0);

  const read = useCallback(() => {
    frame.current = 0;

    const scrollEl = scroller?.current ?? null;
    const targetEl = target?.current ?? null;
    const viewport = scrollEl ? scrollEl.clientHeight : window.innerHeight;

    let ratio: number;
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const base = scrollEl ? scrollEl.getBoundingClientRect().top : 0;
      const travel = rect.height - viewport;
      ratio = travel <= 0 ? 1 : (base - rect.top) / travel;
    } else if (scrollEl) {
      const travel = scrollEl.scrollHeight - scrollEl.clientHeight;
      ratio = travel <= 0 ? 1 : scrollEl.scrollTop / travel;
    } else {
      const doc = document.documentElement;
      const travel = doc.scrollHeight - viewport;
      ratio = travel <= 0 ? 1 : window.scrollY / travel;
    }

    const next = Math.round(clamp01(ratio) * steps);
    setStep((prev) => (prev === next ? prev : next));
  }, [scroller, target, steps]);

  useEffect(() => {
    const scrollEl = scroller?.current ?? null;
    const targetEl = target?.current ?? null;
    const source: EventTarget = scrollEl ?? window;

    const schedule = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(read);
    };

    source.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (observer) {
      if (targetEl) observer.observe(targetEl);
      if (scrollEl) observer.observe(scrollEl);
      if (!targetEl && !scrollEl) observer.observe(document.documentElement);
    }

    read();

    return () => {
      source.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [read, scroller, target]);

  const progress = steps > 0 ? step / steps : 1;
  const totalMinutes = words > 0 ? Math.max(1, Math.ceil(words / wordsPerMinute)) : 0;
  const minutesLeft =
    words > 0 ? Math.ceil(((1 - progress) * words) / wordsPerMinute) : 0;

  return {
    step,
    steps,
    progress,
    percent: Math.round(progress * 100),
    minutesLeft,
    totalMinutes,
    complete: step >= steps,
  };
}

export type ReadingProgressProps = UseReadingProgressOptions & {
  label?: string;
  doneLabel?: string;
  className?: string;
};

export function ReadingProgress({
  target,
  scroller,
  steps = 24,
  words = 0,
  wordsPerMinute = 220,
  label = 'Reading progress',
  doneLabel = 'End',
  className = '',
}: ReadingProgressProps) {
  const { step, percent, minutesLeft, totalMinutes, complete } =
    useReadingProgress({ target, scroller, steps, words, wordsPerMinute });

  const reduced = useReducedMotion();
  const fillTransition = reduced ? INSTANT : FILL;
  const fadeTransition = reduced ? INSTANT : CROSSFADE;

  const estimate = words > 0;
  const readout = `${minutesLeft} min left`;
  const finish = `${doneLabel} · ${totalMinutes} min`;
  const valueText = estimate
    ? `${percent}% read, ${readout}`
    : `${percent}% read`;

  return (
    <div className={`mh-reading-progress ${className}`}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={steps}
        aria-valuenow={step}
        aria-valuetext={valueText}
        className="mh-reading-progress__track"
      >
        <motion.div
          className="mh-reading-progress__fill"
          style={{ width: '100%' }}
          initial={false}
          animate={{ scaleX: step / Math.max(1, steps) }}
          transition={fillTransition}
        />
      </div>

      {estimate ? (
        <div className="mh-reading-progress__meta">
          <span
            aria-hidden
            className="mh-reading-progress__sizer"
          >
            <span className="mh-reading-progress__sizer-icon" />
            {finish}
          </span>
          <motion.span
            aria-hidden
            className="mh-reading-progress__readout"
            initial={false}
            animate={{ opacity: complete ? 0 : 1 }}
            transition={fadeTransition}
          >
            {readout}
          </motion.span>
          <motion.span
            aria-hidden
            className="mh-reading-progress__done"
            initial={false}
            animate={{ opacity: complete ? 1 : 0 }}
            transition={fadeTransition}
          >
            <Check size={12} strokeWidth={2.5} aria-hidden="true" />
            <motion.span
              initial={false}
              animate={{ x: complete ? 0 : 4 }}
              transition={fadeTransition}
            >
              {finish}
            </motion.span>
          </motion.span>
        </div>
      ) : null}
    </div>
  );
}
