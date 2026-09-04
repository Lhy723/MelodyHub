// MelodyHub interior — hold-to-confirm（已换肤）
// 来源：ddoemonn/interior components/interior/hold-to-confirm.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useHoldToConfirm 按住进度 rAF 循环 +
// 阈值确认/松开回退/位移容差取消/Escape 重置/blur 与隐藏页签兜底 + swept 扫过
// 填充 + reduced-motion + resetAfter 自动复位）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 hold-to-confirm.css（CSS Vars）、
// 内联 svg 对勾换成 lucide-react（Check）。
// 取舍：上游 Faces 内联 svg 为 12px / strokeWidth 1.7 的细线对勾；换成 Check
//（size 12 / strokeWidth 2）后线条略粗，与其余已换肤组件（load-more/task-steps
// 等统一用 lucide Check 系图标）保持一致，故接受该细微视觉差。
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { Check } from 'lucide-react';
import './hold-to-confirm.css';

const FACE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

export type HoldPhase = 'idle' | 'holding' | 'releasing' | 'committed';

export type UseHoldToConfirmOptions = {
  onConfirm: () => void;
  onAbort?: () => void;
  duration?: number;
  steps?: number;
  releaseRate?: number;
  moveTolerance?: number;
  haptic?: boolean;
  disabled?: boolean;
};

export function useHoldToConfirm({
  onConfirm,
  onAbort,
  duration = 1800,
  steps = 20,
  releaseRate = 2.5,
  moveTolerance = 10,
  haptic = true,
  disabled = false,
}: UseHoldToConfirmOptions) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<HoldPhase>('idle');

  const phaseRef = useRef<HoldPhase>('idle');
  const down = useRef(false);
  const elapsed = useRef(0);
  const last = useRef(0);
  const raf = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const confirm = useRef(onConfirm);
  confirm.current = onConfirm;
  const abort = useRef(onAbort);
  abort.current = onAbort;

  const move = useCallback((next: HoldPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const reset = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    down.current = false;
    elapsed.current = 0;
    origin.current = null;
    setStep(0);
    move('idle');
  }, [move]);

  const begin = useCallback(
    (point?: { x: number; y: number }) => {
      if (disabled) return;
      if (phaseRef.current === 'committed' || phaseRef.current === 'holding') {
        return;
      }

      origin.current = point ?? null;
      down.current = true;
      move('holding');
      if (raf.current) return;

      last.current = performance.now();

      const loop = (now: number) => {
        const dt = Math.min(64, now - last.current);
        last.current = now;
        elapsed.current += down.current ? dt : -dt * releaseRate;

        if (elapsed.current >= duration) {
          raf.current = 0;
          elapsed.current = duration;
          down.current = false;
          origin.current = null;
          setStep(steps);
          move('committed');
          if (haptic) navigator.vibrate?.(14);
          confirm.current();
          return;
        }

        if (elapsed.current <= 0) {
          raf.current = 0;
          elapsed.current = 0;
          origin.current = null;
          setStep(0);
          move('idle');
          return;
        }

        const s = Math.min(steps, Math.floor((elapsed.current / duration) * steps));
        setStep((prev) => (prev === s ? prev : s));
        raf.current = requestAnimationFrame(loop);
      };

      raf.current = requestAnimationFrame(loop);
    },
    [disabled, duration, steps, releaseRate, haptic, move],
  );

  const release = useCallback(() => {
    if (phaseRef.current !== 'holding') return;
    down.current = false;
    origin.current = null;
    move('releasing');
    abort.current?.();
  }, [move]);

  useEffect(() => {
    const bail = () => release();
    const onVisibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener('blur', bail);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', bail);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [release]);

  const bind = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      begin({ x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const from = origin.current;
      if (phaseRef.current !== 'holding' || !from) return;
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > moveTolerance) {
        release();
      }
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Escape') {
        if (phaseRef.current === 'holding' || phaseRef.current === 'releasing') {
          e.preventDefault();
          reset();
        }
        return;
      }
      if (e.repeat) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        begin();
      }
    },
    onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') release();
    },
    onBlur: (_e: FocusEvent<HTMLButtonElement>) => release(),
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (phaseRef.current === 'committed') e.stopPropagation();
    },
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
  };

  return {
    bind,
    step,
    steps,
    phase,
    progress: step / steps,
    reset,
  };
}

export type HoldToConfirmProps = {
  onConfirm: () => void;
  children: ReactNode;
  onAbort?: () => void;
  confirmLabel?: string;
  duration?: number;
  resetAfter?: number;
  steps?: number;
  releaseRate?: number;
  disabled?: boolean;
  className?: string;
};

export function HoldToConfirm({
  onConfirm,
  children,
  onAbort,
  confirmLabel = 'Confirmed',
  duration = 1800,
  resetAfter = 1600,
  steps = 20,
  releaseRate = 2.5,
  disabled = false,
  className = '',
}: HoldToConfirmProps) {
  const { bind, phase, reset } = useHoldToConfirm({
    onConfirm,
    onAbort,
    duration,
    steps,
    releaseRate,
    disabled,
  });

  const reduced = useReducedMotion();
  const hintId = useId();

  const committed = phase === 'committed';
  const seconds = Math.round(duration / 100) / 10;

  const swept = useMotionValue(0);
  const clipPath = useTransform(swept, (v) => `inset(0 ${(1 - v) * 100}% 0 0)`);

  useEffect(() => {
    if (phase !== 'committed' || resetAfter <= 0) return;
    const back = setTimeout(reset, resetAfter);
    return () => clearTimeout(back);
  }, [phase, resetAfter, reset]);

  useEffect(() => {
    if (reduced) {
      swept.set(phase === 'holding' || phase === 'committed' ? 1 : 0);
      return;
    }

    if (phase === 'committed') {
      const controls = animate(swept, 1, { duration: 0.12, ease: 'linear' });
      return () => controls.stop();
    }

    const from = swept.get();

    if (phase === 'holding') {
      const controls = animate(swept, 1, {
        duration: (duration * (1 - from)) / 1000,
        ease: 'linear',
      });
      return () => controls.stop();
    }

    const controls = animate(swept, 0, {
      duration: (duration * from) / releaseRate / 1000,
      ease: [0.23, 1, 0.32, 1],
    });
    return () => controls.stop();
  }, [phase, duration, releaseRate, reduced, swept]);

  return (
    <button
      type="button"
      aria-disabled={disabled || committed}
      aria-describedby={hintId}
      {...bind}
      style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none' }}
      data-phase={phase}
      className={`mh-hold-to-confirm ${className}`}
    >
      <Faces committed={committed} confirmLabel={confirmLabel}>
        {children}
      </Faces>

      <motion.span aria-hidden style={{ clipPath }} className="mh-hold-to-confirm__fill">
        <Faces committed={committed} confirmLabel={confirmLabel}>
          {children}
        </Faces>
      </motion.span>

      <span id={hintId} className="mh-hold-to-confirm__sr">
        Press and hold for {seconds} seconds to confirm. Releasing early cancels and nothing happens.
      </span>

      <span role="status" aria-live="polite" className="mh-hold-to-confirm__sr">
        {committed ? confirmLabel : ''}
      </span>
    </button>
  );
}

function Faces({
  committed,
  confirmLabel,
  children,
}: {
  committed: boolean;
  confirmLabel: string;
  children: ReactNode;
}) {
  return (
    <span className="mh-hold-to-confirm__faces">
      <motion.span
        initial={false}
        animate={{ opacity: committed ? 0 : 1 }}
        transition={FACE}
        className="mh-hold-to-confirm__face"
      >
        {children}
      </motion.span>
      <motion.span
        initial={false}
        animate={{ opacity: committed ? 1 : 0 }}
        transition={FACE}
        className="mh-hold-to-confirm__face mh-hold-to-confirm__face--confirm"
      >
        <span aria-hidden="true" className="mh-hold-to-confirm__icon">
          <Check size={12} strokeWidth={2} aria-hidden="true" />
        </span>
        {confirmLabel}
      </motion.span>
    </span>
  );
}
