// MelodyHub interior — value-flash（已换肤）
// 来源：ddoemonn/interior components/interior/value-flash.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useValueFlash + 数值滚动/闪光着色 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 value-flash.css（CSS Vars）、
// 三角 glyph 内联 svg 换 lucide-react Triangle（down 方向旋转 180°）。
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Triangle } from 'lucide-react';
import './value-flash.css';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const ROLL = { type: 'spring', stiffness: 460, damping: 32, mass: 0.55 } as const;
const POP = { type: 'spring', stiffness: 640, damping: 22, mass: 0.7 } as const;
const LIFT = { type: 'spring', stiffness: 380, damping: 26, mass: 0.7 } as const;
const SETTLE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

const CLEAR = { duration: 0.16, ease: [0.4, 0, 1, 1] } as const;
const DROP = { duration: 0.14, ease: [0.4, 0, 1, 1] } as const;
const STILL = { duration: 0 } as const;

export type FlashDirection = 'up' | 'down';

export type UseValueFlashOptions<T> = {
  hold?: number;
  compare?: (next: T, previous: T) => number;
};

export type ValueFlashState<T> = {
  direction: FlashDirection | null;
  from: T;
  changeId: number;
  flashing: boolean;
};

export function useValueFlash<T>(
  value: T,
  { hold = 900, compare }: UseValueFlashOptions<T> = {},
): ValueFlashState<T> {
  const [state, setState] = useState<ValueFlashState<T>>({
    direction: null,
    from: value,
    changeId: 0,
    flashing: false,
  });

  const previous = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rank = useRef(compare);

  useEffect(() => {
    rank.current = compare;
  });

  useEffect(() => {
    const prior = previous.current;
    if (Object.is(prior, value)) return;
    previous.current = value;

    const measure = rank.current;
    const delta = measure
      ? measure(value, prior)
      : typeof value === 'number' && typeof prior === 'number'
        ? value - prior
        : 0;

    if (delta === 0) return;

    setState((prev) => ({
      direction: delta > 0 ? 'up' : 'down',
      from: prior,
      changeId: prev.changeId + 1,
      flashing: true,
    }));

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setState((prev) => (prev.flashing ? { ...prev, flashing: false } : prev));
    }, hold);
  }, [value, hold]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return state;
}

export type ValueFlashProps = {
  value: number;
  format?: (value: number) => string;
  label?: string;
  hold?: number;
  announceAfter?: number;
  /** 定制方向判定（如响应时间“降为好”传 (n, p) => p - n）。 */
  compare?: (next: number, previous: number) => number;
  className?: string;
};

export function ValueFlash({
  value,
  format,
  label,
  hold = 900,
  announceAfter = 700,
  compare,
  className = '',
}: ValueFlashProps) {
  const { direction, flashing, changeId } = useValueFlash(value, { hold, compare });
  const reduced = useReducedMotion();

  const text = format ? format(value) : String(value);
  const [settled, setSettled] = useState(text);

  useEffect(() => {
    const id = setTimeout(() => setSettled(text), announceAfter);
    return () => clearTimeout(id);
  }, [text, announceAfter]);

  const tone = flashing ? (direction === 'up' ? 'up' : 'down') : 'idle';

  return (
    <motion.span
      initial={false}
      animate={{ scale: reduced ? 1 : flashing ? 1.05 : 1 }}
      transition={reduced ? STILL : flashing ? LIFT : SETTLE}
      data-tone={tone}
      data-flashing={flashing}
      className={`mh-value-flash ${className}`}
    >
      {direction ? (
        <motion.span
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: flashing ? 1 : 0 }}
          transition={reduced ? STILL : flashing ? CELL : CLEAR}
          data-tone={direction}
          className="mh-value-flash__tint"
        />
      ) : null}

      <span aria-hidden className="mh-value-flash__value">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={changeId}
            initial={
              reduced
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    y: direction === 'down' ? '-0.85em' : '0.85em',
                    filter: 'blur(5px)',
                  }
            }
            animate={{ opacity: 1, y: '0em', filter: 'blur(0px)' }}
            exit={
              reduced
                ? { opacity: 0, transition: STILL }
                : {
                    opacity: 0,
                    y: direction === 'down' ? '0.7em' : '-0.7em',
                    filter: 'blur(4px)',
                    transition: DROP,
                  }
            }
            transition={reduced ? STILL : ROLL}
            className="mh-value-flash__text"
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </span>
      <span aria-hidden className="mh-value-flash__icon">
        <AnimatePresence initial={false}>
          {flashing && direction ? (
            <motion.span
              key={`${changeId}-${direction}`}
              initial={
                reduced
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 0.4,
                      y: direction === 'up' ? '0.3em' : '-0.3em',
                    }
              }
              animate={{ opacity: 1, scale: 1, y: '0em' }}
              exit={
                reduced
                  ? { opacity: 0, transition: STILL }
                  : { opacity: 0, scale: 0.8, transition: CLEAR }
              }
              transition={reduced ? STILL : POP}
              data-direction={direction}
              className="mh-value-flash__glyph"
            >
              <Triangle fill="currentColor" strokeWidth={0} aria-hidden />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
      <span className="mh-value-flash__sr" aria-live="polite">
        {label ? `${label}: ${settled}` : settled}
      </span>
    </motion.span>
  );
}
