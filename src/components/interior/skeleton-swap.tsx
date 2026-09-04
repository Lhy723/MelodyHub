// MelodyHub interior — skeleton-swap（已换肤）
// 来源：ddoemonn/interior components/interior/skeleton-swap.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useSkeletonSwap 延迟显示 + 最小可见 + 内容/骨架交叉淡入 + reduced-motion + ResizeObserver 滚动探测）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 skeleton-swap.css（CSS Vars）、删上游 eslint-disable 注释（本项目无该规则）。
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './skeleton-swap.css';

const CROSSFADE = {
  type: 'spring',
  stiffness: 260,
  damping: 34,
  mass: 0.8,
} as const;

const WIDTHS = [100, 93, 97, 88, 95, 91] as const;

function widthFor(index: number, total: number) {
  if (total > 1 && index === total - 1) return 62;
  return WIDTHS[(index * 7 + 3) % WIDTHS.length];
}

export type UseSkeletonSwapOptions = {
  ready: boolean;
  delay?: number;
  minVisible?: number;
};

export function useSkeletonSwap({
  ready,
  delay = 120,
  minVisible = 380,
}: UseSkeletonSwapOptions) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (!ready) {
      if (visible) return;
      const t = setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, delay);
      return () => clearTimeout(t);
    }

    if (!visible) return;
    const rest = Math.max(0, minVisible - (performance.now() - shownAt.current));
    const t = setTimeout(() => setVisible(false), rest);
    return () => clearTimeout(t);
  }, [ready, visible, delay, minVisible]);

  return { showSkeleton: visible, busy: !ready };
}

export type SkeletonSwapProps = {
  ready: boolean;
  children: React.ReactNode;
  lines?: number;
  lineHeight?: number;
  barHeight?: number;
  reserve?: number;
  delay?: number;
  minVisible?: number;
  label?: string;
  skeleton?: React.ReactNode;
  className?: string;
};

export function SkeletonSwap({
  ready,
  children,
  lines = 3,
  lineHeight = 21,
  barHeight = 9,
  reserve,
  delay = 120,
  minVisible = 380,
  label,
  skeleton,
  className = '',
}: SkeletonSwapProps) {
  const { showSkeleton } = useSkeletonSwap({ ready, delay, minVisible });
  const reduced = useReducedMotion();

  const shell = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  const box = reserve ?? lines * lineHeight;

  useEffect(() => {
    const el = shell.current;
    const inner = body.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const check = () => setScrollable(el.scrollHeight - el.clientHeight > 1);
    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={shell}
      aria-busy={!ready}
      aria-label={label}
      tabIndex={scrollable ? 0 : undefined}
      style={{ height: box }}
      className={`mh-skeleton-swap ${className}`}
    >
      <motion.div
        ref={body}
        className="mh-skeleton-swap__body"
        initial={false}
        animate={
          reduced
            ? { opacity: showSkeleton ? 0 : 1 }
            : {
                opacity: showSkeleton ? 0 : 1,
                scale: showSkeleton ? 0.99 : 1,
                filter: showSkeleton ? 'blur(4px)' : 'blur(0px)',
              }
        }
        transition={reduced ? { duration: 0 } : CROSSFADE}
        style={{
          transformOrigin: 'top left',
          pointerEvents: showSkeleton ? 'none' : undefined,
        }}
      >
        {children}
      </motion.div>

      <AnimatePresence initial={false}>
        {showSkeleton ? (
          <motion.div
            key="skeleton"
            aria-hidden
            className="mh-skeleton-swap__overlay"
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(3px)' }}
            transition={reduced ? { duration: 0 } : CROSSFADE}
          >
            {skeleton ?? (
              <div className="mh-skeleton-swap__lines">
                {Array.from({ length: lines }, (_, i) => (
                  <div
                    key={i}
                    className="mh-skeleton-swap__row"
                    style={{ height: lineHeight }}
                  >
                    <div
                      className="mh-skeleton-swap__bar"
                      style={{
                        height: barHeight,
                        width: `${widthFor(i, lines)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {label ? (
        <span role="status" className="mh-skeleton-swap__sr">
          {ready ? `${label} loaded` : ''}
        </span>
      ) : null}
    </div>
  );
}
