// MelodyHub interior — press-depth（已换肤）
// 来源：ddoemonn/interior components/interior/press-depth.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（usePressDepth 按压缩放/阴影深度/origin 倾斜 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 press-depth.css（CSS Vars）。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEventHandler, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './press-depth.css';

const PRESS = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

export type UsePressDepthOptions = {
  disabled?: boolean;
  onPressStart?: () => void;
  onPressEnd?: () => void;
};

export type PressOrigin = { x: number; y: number };

export type UsePressDepthResult = {
  pressed: boolean;
  origin: PressOrigin | null;
  ref: (node: HTMLElement | null) => void;
  bind: {
    onPointerDown: (event: ReactPointerEvent) => void;
    onKeyDown: (event: ReactKeyboardEvent) => void;
    onKeyUp: (event: ReactKeyboardEvent) => void;
    onBlur: () => void;
  };
};

export function usePressDepth(options: UsePressDepthOptions = {}): UsePressDepthResult {
  const { disabled = false, onPressStart, onPressEnd } = options;

  const [pressed, setPressed] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [origin, setOrigin] = useState<PressOrigin | null>(null);

  const node = useRef<HTMLElement | null>(null);
  const pointer = useRef<number | null>(null);
  const down = useRef(false);

  const began = useRef(onPressStart);
  began.current = onPressStart;
  const ended = useRef(onPressEnd);
  ended.current = onPressEnd;

  const setDown = useCallback((next: boolean) => {
    if (down.current === next) return;
    down.current = next;
    setPressed(next);
    if (next) began.current?.();
    else ended.current?.();
  }, []);

  const stop = useCallback(() => {
    pointer.current = null;
    setTracking(false);
    setOrigin(null);
    setDown(false);
  }, [setDown]);

  useEffect(() => {
    if (!tracking) return;

    const contains = (event: PointerEvent) => {
      const el = node.current;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    };

    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer.current) return;
      setDown(contains(event));
    };
    const lift = (event: PointerEvent) => {
      if (event.pointerId !== pointer.current) return;
      stop();
    };
    const bail = () => stop();
    const hidden = () => {
      if (document.hidden) stop();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', lift);
    window.addEventListener('blur', bail);
    document.addEventListener('visibilitychange', hidden);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', lift);
      window.removeEventListener('pointercancel', lift);
      window.removeEventListener('blur', bail);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [tracking, setDown, stop]);

  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  const ref = useCallback((next: HTMLElement | null) => {
    node.current = next;
  }, []);

  const bind = {
    onPointerDown: (event: ReactPointerEvent) => {
      if (disabled) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const r = event.currentTarget.getBoundingClientRect();
      setOrigin({
        x: Math.max(-1, Math.min(1, ((event.clientX - r.left) / r.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((event.clientY - r.top) / r.height) * 2 - 1)),
      });
      pointer.current = event.pointerId;
      setTracking(true);
      setDown(true);
    },
    onKeyDown: (event: ReactKeyboardEvent) => {
      if (disabled || event.repeat) return;
      if (event.key === ' ' || event.key === 'Enter') setDown(true);
    },
    onKeyUp: (event: ReactKeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter' || event.key === 'Escape') {
        setDown(false);
      }
    },
    onBlur: () => stop(),
  };

  return { pressed, origin, ref, bind };
}

export type PressDepthProps = {
  children: ReactNode;
  depth?: number;
  tilt?: number;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  'aria-label'?: string;
};

export function PressDepth({
  children,
  depth = 4,
  tilt = 7,
  disabled = false,
  type = 'button',
  onClick,
  className = '',
  'aria-label': ariaLabel,
}: PressDepthProps) {
  const reduced = useReducedMotion();
  const { pressed, origin, ref, bind } = usePressDepth({ disabled });

  const lean = pressed && origin && !reduced ? origin : null;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-label={ariaLabel}
      data-pressed={pressed ? '' : undefined}
      onClick={onClick}
      style={{
        paddingBottom: depth,
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
      }}
      className={`mh-press-depth ${className}`}
      {...bind}
    >
      <span aria-hidden style={{ top: depth }} className="mh-press-depth__edge" />
      <motion.span
        initial={false}
        animate={{
          y: pressed ? depth : 0,
          rotateX: lean ? -lean.y * tilt : 0,
          rotateY: lean ? lean.x * tilt : 0,
        }}
        transition={reduced ? { duration: 0 } : PRESS}
        style={{ transformPerspective: 340 }}
        className="mh-press-depth__face"
      >
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: pressed ? 0 : 1 }}
          transition={reduced ? { duration: 0 } : PRESS}
          className="mh-press-depth__sheen"
        />
        {children}
      </motion.span>
    </button>
  );
}
