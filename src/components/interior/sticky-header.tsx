// MelodyHub interior — sticky-header（已换肤）
// 来源：ddoemonn/interior components/interior/sticky-header.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useCondense 粘性阈值/useScroll 容器监听/
// useSpring 收缩动画/useReducedMotion/reduced-motion 回退）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 sticky-header.css（CSS Vars）。
// 上游无 phosphor 图标（纯 motion 占位层），故无 lucide-react 替换。
import { useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import "./sticky-header.css";

const SMOOTH = { stiffness: 240, damping: 44, mass: 0.6 } as const;

export type UseCondenseOptions = {
  range?: number;
};

export type UseCondenseResult<T extends HTMLElement> = {
  ref: React.RefObject<T | null>;
  progress: MotionValue<number>;
  condensed: boolean;
};

export function useCondense<T extends HTMLElement = HTMLDivElement>({
  range = 48,
}: UseCondenseOptions = {}): UseCondenseResult<T> {
  const ref = useRef<T | null>(null);
  const { scrollY } = useScroll({ container: ref });

  const progress = useTransform(scrollY, [0, Math.max(1, range)], [0, 1], {
    clamp: true,
  });

  const [condensed, setCondensed] = useState(false);
  useMotionValueEvent(progress, "change", (p) => {
    const done = p >= 1;
    setCondensed((prev) => (prev === done ? prev : done));
  });

  return { ref, progress, condensed };
}

export type StickyHeaderProps = {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  expandedHeight?: number;
  compactHeight?: number;
  maxHeight?: number;
  className?: string;
};

export function StickyHeader({
  title,
  children,
  subtitle,
  leading,
  actions,
  expandedHeight = 68,
  compactHeight = 48,
  maxHeight = 320,
  className = "",
}: StickyHeaderProps) {
  const tall = Math.max(expandedHeight, compactHeight);
  const short = Math.min(expandedHeight, compactHeight);
  const travel = Math.max(1, tall - short);

  const { ref, progress: tracked, condensed } = useCondense<HTMLDivElement>({
    range: Math.max(64, travel * 3),
  });
  const reduced = useReducedMotion();
  const sprung = useSpring(tracked, SMOOTH);
  const progress = reduced ? tracked : sprung;

  const plate = useTransform(progress, (p) => (tall - travel * p) / tall);
  const edge = useTransform(progress, (p) => tall - travel * p);
  const lifted = useTransform(progress, [0, 0.12], [0, 1], { clamp: true });

  const bigY = useTransform(progress, (p) => -travel * p);
  const bigOpacity = useTransform(progress, [0, 0.45], [1, 0], { clamp: true });
  const bigScale = useTransform(progress, (p) => 1 - 0.05 * p);

  const smallOpacity = useTransform(progress, [0.55, 0.9], [0, 1], {
    clamp: true,
  });
  const smallY = useTransform(smallOpacity, (o) => (1 - o) * 6);

  return (
    <div className={`mh-sticky-header${className ? ` ${className}` : ""}`}>
      <div
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label={title}
        style={{ maxHeight, scrollPaddingTop: short + 10 }}
        className="mh-sticky-header__scroll"
      >
        <div
          aria-hidden
          className="mh-sticky-header__spacer"
          style={{ height: tall }}
        />
        {children}

        <div aria-hidden className="mh-sticky-header__bottom-fade" />
      </div>
      <header
        data-condensed={condensed ? "true" : "false"}
        style={{ height: tall }}
        className="mh-sticky-header__bar"
      >
        <motion.div
          aria-hidden
          style={{ height: tall, scaleY: plate }}
          className="mh-sticky-header__plate"
        />
        <motion.div
          aria-hidden
          style={{ y: edge, opacity: lifted }}
          className="mh-sticky-header__edge-shadow"
        />
        <motion.div
          aria-hidden
          style={{ y: edge, opacity: lifted }}
          className="mh-sticky-header__edge-glow"
        />
        <motion.div
          aria-hidden
          style={{ y: edge, opacity: lifted }}
          className="mh-sticky-header__edge-line"
        />
        <div className="mh-sticky-header__row">
          {leading ? (
            <div className="mh-sticky-header__leading">{leading}</div>
          ) : null}

          <div className="mh-sticky-header__titles">
            <motion.div
              style={{
                y: bigY,
                opacity: bigOpacity,
                scale: bigScale,
                transformOrigin: "left top",
              }}
            >
              <h2 className="mh-sticky-header__title">{title}</h2>
              {subtitle ? (
                <p className="mh-sticky-header__subtitle">{subtitle}</p>
              ) : null}
            </motion.div>
            <motion.span
              aria-hidden
              style={{ opacity: smallOpacity, y: smallY }}
              className="mh-sticky-header__title-compact"
            >
              {title}
            </motion.span>
          </div>

          {actions ? (
            <div className="mh-sticky-header__actions">{actions}</div>
          ) : null}
        </div>
      </header>
    </div>
  );
}
