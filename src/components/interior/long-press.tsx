// MelodyHub interior — long-press（已换肤）
// 来源：ddoemonn/interior components/interior/long-press.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useLongPress + LongPressButton 进度/取消/触摸与鼠标双通道/reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 long-press.css（CSS Vars）、React 命名空间类型改为显式 type import（严格模式）。
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './long-press.css';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const POP = { type: 'spring', stiffness: 640, damping: 22, mass: 0.7 } as const;
const INSTANT = { duration: 0 } as const;

export type UseLongPressOptions = {
  onLongPress: () => void;
  duration?: number;
  steps?: number;
  moveTolerance?: number;
  haptic?: boolean;
  disabled?: boolean;
  onCancel?: () => void;
};

type Phase = 'idle' | 'holding' | 'fired';

export function useLongPress({
  onLongPress,
  duration = 550,
  steps = 12,
  moveTolerance = 8,
  haptic = true,
  disabled = false,
  onCancel,
}: UseLongPressOptions) {
  const cells = Math.max(1, Math.round(steps));

  const [step, setStep] = useState(0);
  const [holding, setHolding] = useState(false);

  const phase = useRef<Phase>('idle');
  const raf = useRef(0);
  const startedAt = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = useRef(onLongPress);
  fire.current = onLongPress;
  const cancelled = useRef(onCancel);
  cancelled.current = onCancel;

  const reset = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (settle.current) {
      clearTimeout(settle.current);
      settle.current = null;
    }
    origin.current = null;
    phase.current = 'idle';
    setHolding(false);
    setStep(0);
  }, []);

  const end = useCallback(() => {
    if (phase.current !== 'holding') return;
    reset();
    cancelled.current?.();
  }, [reset]);

  const begin = useCallback(
    (point?: { x: number; y: number }) => {
      if (disabled || phase.current !== 'idle') return;

      phase.current = 'holding';
      origin.current = point ?? null;
      startedAt.current = performance.now();
      setHolding(true);
      setStep(0);

      const tick = (now: number) => {
        const p = Math.min(1, (now - startedAt.current) / duration);

        const s = Math.floor(p * cells);
        setStep((prev) => (prev === s ? prev : s));

        if (p < 1) {
          raf.current = requestAnimationFrame(tick);
          return;
        }

        raf.current = 0;
        phase.current = 'fired';
        setStep(cells);
        if (haptic) navigator.vibrate?.(12);
        fire.current();

        settle.current = setTimeout(() => {
          if (phase.current === 'fired') reset();
        }, 260);
      };

      raf.current = requestAnimationFrame(tick);
    },
    [disabled, duration, cells, haptic, reset],
  );

  useEffect(() => {
    const bail = () => end();
    const onVisibility = () => {
      if (document.hidden) end();
    };
    window.addEventListener('blur', bail);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', bail);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(raf.current);
      if (settle.current) clearTimeout(settle.current);
    };
  }, [end]);

  const bind = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      begin({ x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const from = origin.current;
      if (phase.current !== 'holding' || !from) return;
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > moveTolerance) {
        end();
      }
    },
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: end,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        begin();
      }
    },
    onKeyUp: (e: ReactKeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') end();
      if (e.key === 'Escape') end();
    },
    onBlur: end,
    onClick: (e: ReactMouseEvent) => {
      if (phase.current === 'fired') {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };

  return {
    bind,
    step,
    steps: cells,
    holding,
    fired: step === cells,
    progress: step / cells,
  };
}

export type LongPressButtonProps = {
  onLongPress: () => void;
  children: ReactNode;
  duration?: number;
  steps?: number;
  disabled?: boolean;
  className?: string;
};

export function LongPressButton({
  onLongPress,
  children,
  duration = 550,
  steps = 12,
  disabled = false,
  className = '',
}: LongPressButtonProps) {
  const hintId = useId();
  const reduced = useReducedMotion() === true;
  const { bind, step, steps: cells, holding, fired } = useLongPress({
    onLongPress,
    duration,
    steps,
    disabled,
  });

  const progress = fired ? 1 : step / cells;

  return (
    <motion.button
      type="button"
      aria-disabled={disabled}
      aria-describedby={hintId}
      data-holding={holding}
      data-fired={fired}
      initial={false}
      animate={{ scale: reduced ? 1 : fired ? [1, 1.045, 1] : 1 }}
      transition={reduced ? INSTANT : POP}
      className={`mh-long-press ${className}`}
      style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none' }}
      {...bind}
    >
      <span className="mh-long-press__labels">
        <span className="mh-long-press__label mh-long-press__label--base">{children}</span>
        <motion.span
          aria-hidden
          initial={false}
          animate={{
            clipPath: `inset(0 ${((1 - progress) * 100).toFixed(2)}% 0 0)`,
          }}
          transition={reduced ? INSTANT : CELL}
          className="mh-long-press__label mh-long-press__label--progress"
        >
          {children}
        </motion.span>
      </span>
      <span id={hintId} className="mh-long-press__sr">
        Press and hold for {Math.round(duration / 100) / 10} seconds to confirm
      </span>
    </motion.button>
  );
}
