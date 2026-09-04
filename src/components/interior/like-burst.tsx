// MelodyHub interior — like-burst（已换肤备用，本轮不接入页面）
// 来源：ddoemonn/interior components/interior/like-burst.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useOptimisticLike 乐观点赞/防抖提交/abort+回滚/burst 计数 + 双层心形交叉淡入/粒子爆发/文案交叉淡入/计数滚动 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 like-burst.css（CSS Vars + data-liked）。
// 内联 svg 为动画载体（两层 motion.svg 做 opacity/scale 交叉淡入 + 弹出），沿用 password-strength.tsx 保留内联 motion.svg 的先例，不换 lucide-react。
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { Ref } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './like-burst.css';

const EASE = [0.23, 1, 0.32, 1] as const;
const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

const HEART =
  'M12 20.3 4.3 12.6a4.8 4.8 0 0 1 6.8-6.8l.9.9.9-.9a4.8 4.8 0 0 1 6.8 6.8Z';

const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const h = (((i + 1) * 2654435761) % 997) / 997;
  const angle = (i / 8) * Math.PI * 2 - Math.PI / 2 + (h - 0.5) * 0.4;
  const distance = 13 + h * 9;
  return {
    x: Math.round(Math.cos(angle) * distance * 10) / 10,
    y: Math.round(Math.sin(angle) * distance * 10) / 10,
    size: h > 0.5 ? 4 : 3,
    delay: Math.round(h * 50) / 1000,
  };
});

const DEFAULT_FORMAT = (value: number) =>
  new Intl.NumberFormat('en-US').format(value);

export type LikeCommit = (
  liked: boolean,
  signal: AbortSignal,
) => Promise<unknown>;

export type LikeBurstHandle = {
  toggle: () => void;
};

export type UseOptimisticLikeOptions = {
  initialLiked?: boolean;
  initialCount?: number;
  onCommit?: LikeCommit;
  onError?: (error: unknown) => void;
  settle?: number;
};

export type OptimisticLike = {
  liked: boolean;
  count: number;
  base: number;
  pending: boolean;
  burst: number;
  settled: { liked: boolean; count: number };
  toggle: () => void;
};

export function useOptimisticLike({
  initialLiked = false,
  initialCount = 0,
  onCommit,
  onError,
  settle = 400,
}: UseOptimisticLikeOptions = {}): OptimisticLike {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [burst, setBurst] = useState(0);
  const [settled, setSettled] = useState({
    liked: initialLiked,
    count: initialCount,
  });

  const likedNow = useRef(initialLiked);
  const countNow = useRef(initialCount);
  const truth = useRef({ liked: initialLiked, count: initialCount });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const commit = useRef(onCommit);
  commit.current = onCommit;
  const failed = useRef(onError);
  failed.current = onError;

  const flush = useCallback(() => {
    timer.current = null;
    inFlight.current?.abort();
    inFlight.current = null;
    seq.current += 1;

    const intent = likedNow.current;

    if (intent === truth.current.liked) {
      countNow.current = truth.current.count;
      setLiked(truth.current.liked);
      setCount(truth.current.count);
      setPending(false);
      return;
    }

    const target = { liked: intent, count: countNow.current };
    const run = commit.current;

    if (!run) {
      truth.current = target;
      setSettled(target);
      setPending(false);
      return;
    }

    const controller = new AbortController();
    const id = seq.current;
    inFlight.current = controller;
    setPending(true);

    run(intent, controller.signal).then(
      () => {
        if (id !== seq.current) return;
        inFlight.current = null;
        truth.current = target;
        setSettled(target);
        setPending(false);
      },
      (error: unknown) => {
        if (id !== seq.current) return;
        inFlight.current = null;
        likedNow.current = truth.current.liked;
        countNow.current = truth.current.count;
        setLiked(truth.current.liked);
        setCount(truth.current.count);
        setPending(false);
        failed.current?.(error);
      },
    );
  }, []);

  const toggle = useCallback(() => {
    const next = !likedNow.current;
    likedNow.current = next;
    countNow.current += next ? 1 : -1;

    setLiked(next);
    setCount(countNow.current);
    setPending(true);
    if (next) setBurst((b) => b + 1);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, settle);
  }, [flush, settle]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      seq.current += 1;
      inFlight.current?.abort();
      inFlight.current = null;
    },
    [],
  );

  return {
    liked,
    count,
    base: liked ? count - 1 : count,
    pending,
    burst,
    settled,
    toggle,
  };
}

export type LikeBurstProps = {
  initialLiked?: boolean;
  initialCount?: number;
  onCommit?: LikeCommit;
  onError?: (error: unknown) => void;
  onToggle?: (liked: boolean) => void;
  settle?: number;
  label?: string;
  activeLabel?: string;
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
};

export function LikeBurst({
  initialLiked = false,
  initialCount = 0,
  onCommit,
  onError,
  onToggle,
  settle = 400,
  label = 'Like',
  activeLabel = 'Liked',
  format = DEFAULT_FORMAT,
  disabled = false,
  className = '',
  ref,
}: LikeBurstProps & { ref?: Ref<LikeBurstHandle> }) {
  const reduced = useReducedMotion();
  const { liked, count, base, pending, burst, settled, toggle } =
    useOptimisticLike({ initialLiked, initialCount, onCommit, onError, settle });

  useImperativeHandle(ref, () => ({ toggle }), [toggle]);

  const low = format(base);
  const high = format(base + 1);
  const widest = high.length >= low.length ? high : low;
  const shown = format(count);

  return (
    <span className={`mh-like-burst ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={liked}
        aria-busy={pending}
        aria-label={label}
        data-liked={liked}
        onClick={() => {
          toggle();
          onToggle?.(!liked);
        }}
        className="mh-like-burst__button"
      >
        <span aria-hidden="true" className="mh-like-burst__heart">
          <motion.svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
            className="mh-like-burst__heart-outline"
            initial={false}
            animate={{ opacity: liked ? 0 : 1 }}
            transition={reduced ? INSTANT : CROSSFADE}
          >
            <path d={HEART} />
          </motion.svg>

          <motion.svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="mh-like-burst__heart-filled"
            initial={false}
            animate={{ opacity: liked ? 1 : 0, scale: liked ? 1 : 0.55 }}
            transition={reduced ? INSTANT : CELL}
          >
            <path d={HEART} />
          </motion.svg>

          {!reduced && burst > 0 ? (
            <span
              key={burst}
              className="mh-like-burst__sparks"
            >
              {SPARKS.map((spark, i) => (
                <motion.span
                  key={i}
                  className="mh-like-burst__spark"
                  style={{
                    width: spark.size,
                    height: spark.size,
                    marginLeft: -spark.size / 2,
                    marginTop: -spark.size / 2,
                  }}
                  initial={{ x: 0, y: 0, scale: 0.6, opacity: 0.85 }}
                  animate={{ x: spark.x, y: spark.y, scale: 1, opacity: 0 }}
                  transition={{ duration: 0.44, delay: spark.delay, ease: EASE }}
                />
              ))}
            </span>
          ) : null}
        </span>

        <span aria-hidden="true" className="mh-like-burst__labels">
          <motion.span
            className="mh-like-burst__label"
            initial={false}
            animate={{ opacity: liked ? 0 : 1 }}
            transition={reduced ? INSTANT : CROSSFADE}
          >
            {label}
          </motion.span>
          <motion.span
            className="mh-like-burst__label"
            initial={false}
            animate={{ opacity: liked ? 1 : 0 }}
            transition={reduced ? INSTANT : CROSSFADE}
          >
            {activeLabel}
          </motion.span>
        </span>

        <span
          aria-hidden="true"
          className="mh-like-burst__count"
        >
          <span className="mh-like-burst__count-sizer">{widest}</span>
          <AnimatePresence initial={false}>
            <motion.span
              key={shown}
              className="mh-like-burst__count-value"
              initial={{ opacity: 0, y: reduced ? 0 : -7 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : 7 }}
              transition={reduced ? INSTANT : CROSSFADE}
            >
              {shown}
            </motion.span>
          </AnimatePresence>
        </span>

      </button>

      <span role="status" aria-live="polite" className="mh-like-burst__sr">
        {`${format(settled.count)} likes, ${settled.liked ? 'liked' : 'not liked'}`}
      </span>
    </span>
  );
}
