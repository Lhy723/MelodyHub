// MelodyHub interior — hide-on-scroll（已换肤）
// 来源：ddoemonn/interior components/interior/hide-on-scroll.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useHideOnScroll 滚动方向感知显隐、
// 累计阈值 hideAfter/revealAfter、topGuard、pinned/disabled/focusWithin 保持展开、
// ResizeObserver + rAF 节流、reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 hide-on-scroll.css（CSS Vars）。
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './hide-on-scroll.css';

const DISCLOSE = { type: 'spring', stiffness: 150, damping: 27, mass: 1 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

export type UseHideOnScrollOptions = {
  hideAfter?: number;
  revealAfter?: number;
  topGuard?: number;
  pinned?: boolean;
  disabled?: boolean;
};

export type UseHideOnScrollResult<T extends HTMLElement> = {
  ref: React.RefObject<T | null>;
  hidden: boolean;
  atTop: boolean;
};

export function useHideOnScroll<T extends HTMLElement = HTMLDivElement>({
  hideAfter = 14,
  revealAfter = 10,
  topGuard = 24,
  pinned = false,
  disabled = false,
}: UseHideOnScrollOptions = {}): UseHideOnScrollResult<T> {
  const ref = useRef<T | null>(null);
  const frame = useRef(0);
  const last = useRef(0);
  const accum = useRef(0);

  const held = useRef(pinned || disabled);
  held.current = pinned || disabled;

  const [hidden, setHidden] = useState(false);
  const [atTop, setAtTop] = useState(true);

  const down = Math.max(1, hideAfter);
  const up = Math.max(1, revealAfter);
  const guard = Math.max(0, topGuard);

  useEffect(() => {
    if (!pinned && !disabled) return;
    accum.current = 0;
    setHidden(false);
  }, [pinned, disabled]);

  useEffect(() => {
    const el = ref.current;
    const target: EventTarget = el ?? window;

    const readY = () => (el ? el.scrollTop : window.scrollY);
    const readMax = () =>
      el
        ? el.scrollHeight - el.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;

    const evaluate = () => {
      frame.current = 0;

      const max = readMax();
      const y = readY();

      if (max <= guard) {
        accum.current = 0;
        last.current = y;
        setAtTop((prev) => (prev ? prev : true));
        setHidden((prev) => (prev ? false : prev));
        return;
      }

      if (y < 0 || y > max) return;

      const dy = y - last.current;
      last.current = y;

      const top = y <= guard;
      setAtTop((prev) => (prev === top ? prev : top));

      if (held.current || top) {
        accum.current = 0;
        setHidden((prev) => (prev ? false : prev));
        return;
      }

      if (dy === 0) return;
      if (dy > 0 !== accum.current > 0) accum.current = 0;
      accum.current += dy;

      if (accum.current >= down) {
        accum.current = 0;
        setHidden((prev) => (prev ? prev : true));
      } else if (accum.current <= -up) {
        accum.current = 0;
        setHidden((prev) => (prev ? false : prev));
      }
    };

    const schedule = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(evaluate);
    };

    last.current = readY();
    evaluate();

    target.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    let observer: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(el);
    }

    return () => {
      target.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [down, up, guard]);

  return { ref, hidden, atTop };
}

export type HideOnScrollProps = {
  bar: React.ReactNode;
  children: React.ReactNode;
  barHeight?: number;
  hideAfter?: number;
  revealAfter?: number;
  topGuard?: number;
  pinned?: boolean;
  maxHeight?: number;
  label?: string;
  onHiddenChange?: (hidden: boolean) => void;
  className?: string;
};

export function HideOnScroll({
  bar,
  children,
  barHeight = 44,
  hideAfter = 14,
  revealAfter = 10,
  topGuard = 24,
  pinned = false,
  maxHeight = 320,
  label = 'Scrollable content',
  onHiddenChange,
  className = '',
}: HideOnScrollProps) {
  const [focusWithin, setFocusWithin] = useState(false);

  const { ref, hidden, atTop } = useHideOnScroll<HTMLDivElement>({
    hideAfter,
    revealAfter,
    topGuard,
    pinned: pinned || focusWithin,
  });

  const reduced = useReducedMotion();
  const slide = reduced ? { duration: 0 } : DISCLOSE;
  const fade = reduced ? { duration: 0 } : CROSSFADE;

  const seen = useRef(hidden);
  useEffect(() => {
    if (seen.current === hidden) return;
    seen.current = hidden;
    onHiddenChange?.(hidden);
  }, [hidden, onHiddenChange]);

  return (
    <div className={`mh-hide-on-scroll ${className}`}>
      <motion.div
        data-hidden={hidden ? 'true' : 'false'}
        onFocus={() => setFocusWithin(true)}
        onBlur={() => setFocusWithin(false)}
        style={{ height: barHeight }}
        initial={false}
        animate={{ y: hidden ? -barHeight : 0 }}
        transition={slide}
        className="mh-hide-on-scroll__bar"
      >
        {bar}

        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: atTop ? 0 : 1 }}
          transition={fade}
          className="mh-hide-on-scroll__rule"
        />
      </motion.div>
      <div
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label={label}
        style={{ maxHeight, scrollPaddingTop: barHeight + 8 }}
        className="mh-hide-on-scroll__viewport"
      >
        <div aria-hidden style={{ height: barHeight }} className="mh-hide-on-scroll__spacer" />
        <div aria-hidden className="mh-hide-on-scroll__fade mh-hide-on-scroll__fade--top" />
        {children}
        <div aria-hidden className="mh-hide-on-scroll__fade mh-hide-on-scroll__fade--bottom" />
      </div>
    </div>
  );
}
