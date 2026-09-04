// MelodyHub interior — load-more（已换肤）
// 来源：ddoemonn/interior components/interior/load-more.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useLoadMore 无限滚动哨兵 + 自动/手动加载 +
// maxAutoLoads 暂停 + 加载态/错误态/结束态 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 load-more.css（CSS Vars）、
// 内联 svg 图标（ChevronMark / SpinnerMark / AlertMark / CheckMark）换成
// lucide-react（ChevronDown / LoaderCircle / TriangleAlert / Check）。
// 取舍：上游 SpinnerMark 是 motion.svg 自旋转（circle + arc）；换成 lucide
// LoaderCircle 后无法复用内置 arc 路径动画，故只保留外层 motion.span 的
// rotate 360 循环（SPIN 参数不变），视觉仍为连续旋转。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, LoaderCircle, TriangleAlert } from 'lucide-react';
import './load-more.css';

const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;
const SPIN = { duration: 0.7, ease: 'linear', repeat: Infinity } as const;

export type LoadMoreStatus = 'idle' | 'loading' | 'error' | 'end';

export type UseLoadMoreOptions = {
  onLoad: () => unknown;
  hasMore?: boolean;
  auto?: boolean;
  rootRef?: RefObject<Element | null>;
  rootMargin?: string;
  maxAutoLoads?: number;
  onError?: (error: unknown) => void;
};

export type UseLoadMoreReturn = {
  status: LoadMoreStatus;
  paused: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  load: () => void;
};

export function useLoadMore({
  onLoad,
  hasMore = true,
  auto = true,
  rootRef,
  rootMargin = '600px 0px',
  maxAutoLoads = 3,
  onError,
}: UseLoadMoreOptions): UseLoadMoreReturn {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle');
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const seq = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const runs = useRef(0);
  const done = useRef(false);
  const blocked = useRef(false);

  const fetchMore = useRef(onLoad);
  fetchMore.current = onLoad;
  const fail = useRef(onError);
  fail.current = onError;
  const more = useRef(hasMore);
  more.current = hasMore;

  const reobserve = useCallback(() => {
    const io = observer.current;
    const el = sentinelRef.current;
    if (io && el) {
      io.unobserve(el);
      io.observe(el);
    }
  }, []);

  const run = useCallback(
    (manual: boolean) => {
      if (busy.current || done.current || !more.current) return;

      if (manual) {
        runs.current = 0;
        blocked.current = false;
        setPaused(false);
      } else {
        if (blocked.current) return;
        if (runs.current >= maxAutoLoads) {
          setPaused(true);
          return;
        }
        runs.current += 1;
      }

      busy.current = true;
      const id = ++seq.current;
      setPhase('loading');

      Promise.resolve()
        .then(() => fetchMore.current())
        .then(
          (result) => {
            busy.current = false;
            if (!alive.current || id !== seq.current) return;
            setPhase('idle');
            if (result === false) {
              done.current = true;
              setEnded(true);
              return;
            }
            reobserve();
          },
          (error: unknown) => {
            busy.current = false;
            if (!alive.current || id !== seq.current) return;
            blocked.current = true;
            fail.current?.(error);
            setPhase('error');
          },
        );
    },
    [maxAutoLoads, reobserve],
  );

  useEffect(() => {
    if (hasMore) {
      done.current = false;
      setEnded(false);
    }
  }, [hasMore]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!auto || ended) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.isIntersecting) {
          run(false);
          return;
        }
        runs.current = 0;
        setPaused(false);
      },
      { root: rootRef?.current ?? null, rootMargin, threshold: 0 },
    );

    observer.current = io;
    io.observe(el);

    return () => {
      io.disconnect();
      observer.current = null;
    };
  }, [auto, ended, rootMargin, rootRef, run]);

  const load = useCallback(() => run(true), [run]);

  const status: LoadMoreStatus = ended || !hasMore ? 'end' : phase;

  return { status, paused, sentinelRef, load };
}

function LoadMoreSpinner({ spinning }: { spinning: boolean }) {
  return (
    <motion.span
      aria-hidden="true"
      className="mh-load-more__icon mh-load-more__spinner"
      style={{ transformOrigin: '50% 50%' }}
      initial={false}
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={spinning ? SPIN : INSTANT}
    >
      <LoaderCircle size={11} strokeWidth={2} aria-hidden="true" />
    </motion.span>
  );
}

export type LoadMoreLabels = Record<LoadMoreStatus, string>;

const DEFAULT_LABELS: LoadMoreLabels = {
  idle: 'Load more',
  loading: 'Loading',
  error: 'Couldn’t load. Try again',
  end: 'You’re all caught up',
};

const ORDER: LoadMoreStatus[] = ['idle', 'loading', 'error', 'end'];

export type LoadMoreProps = {
  onLoad: () => unknown;
  hasMore?: boolean;
  auto?: boolean;
  rootRef?: RefObject<Element | null>;
  rootMargin?: string;
  maxAutoLoads?: number;
  labels?: Partial<LoadMoreLabels>;
  onError?: (error: unknown) => void;
  className?: string;
};

export function LoadMore({
  onLoad,
  hasMore = true,
  auto = true,
  rootRef,
  rootMargin = '600px 0px',
  maxAutoLoads = 3,
  labels,
  onError,
  className = '',
}: LoadMoreProps) {
  const reduced = useReducedMotion();

  const { status, sentinelRef, load } = useLoadMore({
    onLoad,
    hasMore,
    auto,
    rootRef,
    rootMargin,
    maxAutoLoads,
    onError,
  });

  const fade = reduced ? INSTANT : CROSSFADE;

  const text: LoadMoreLabels = { ...DEFAULT_LABELS, ...labels };
  const icons: Record<LoadMoreStatus, ReactNode> = {
    idle: (
      <span aria-hidden="true" className="mh-load-more__icon">
        <ChevronDown size={11} strokeWidth={2.5} aria-hidden="true" />
      </span>
    ),
    loading: <LoadMoreSpinner spinning={status === 'loading' && !reduced} />,
    error: (
      <span aria-hidden="true" className="mh-load-more__icon">
        <TriangleAlert size={11} strokeWidth={2.5} aria-hidden="true" />
      </span>
    ),
    end: (
      <span aria-hidden="true" className="mh-load-more__icon">
        <Check size={11} strokeWidth={2.5} aria-hidden="true" />
      </span>
    ),
  };

  const inert = status === 'loading' || status === 'end';

  return (
    <div className={`mh-load-more ${className}`}>
      <div ref={sentinelRef} aria-hidden className="mh-load-more__sentinel" />

      <button
        type="button"
        aria-busy={status === 'loading' || undefined}
        aria-disabled={inert || undefined}
        aria-label={text[status]}
        onClick={(event) => {
          if (inert) {
            event.preventDefault();
            return;
          }
          load();
        }}
        data-status={status}
        className="mh-load-more__button"
      >
        <motion.span
          aria-hidden
          initial={false}
          animate={{ y: status === 'loading' ? 1 : 0 }}
          transition={reduced ? INSTANT : CROSSFADE}
          className="mh-load-more__stack"
        >
          {ORDER.map((s) => (
            <motion.span
              key={s}
              initial={false}
              animate={
                s === status
                  ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                  : { opacity: 0, y: 3, filter: 'blur(3px)' }
              }
              transition={fade}
              data-status={s}
              className="mh-load-more__label"
            >
              {icons[s]}
              {text[s]}
            </motion.span>
          ))}
        </motion.span>
      </button>

      <span role="status" aria-live="polite" aria-atomic="true" className="mh-load-more__sr">
        {status === 'error' || status === 'end' ? text[status] : ''}
      </span>
    </div>
  );
}
