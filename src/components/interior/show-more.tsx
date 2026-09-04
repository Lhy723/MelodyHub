// MelodyHub interior — show-more（已换肤）
// 来源：ddoemonn/interior components/interior/show-more.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useShowMore 受控/非受控展开、
// ResizeObserver 量测行高与全文高、collapsedHeight/fullHeight/expandable/capped/scrollable、
// 收起时回滚滚动、渐隐遮罩、标签交叉淡入、chevron 旋转、reduced-motion 瞬时过渡）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 show-more.css（CSS Vars）、
// phosphor 风格内联 chevron svg 换成 lucide-react ChevronDown（旋转动画保留）。
import { useCallback, useRef, useState, useId } from 'react';
import { motion, useIsomorphicLayoutEffect, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import './show-more.css';

const DISCLOSE = {
  type: 'spring',
  stiffness: 190,
  damping: 30,
  mass: 1,
} as const;

const SMALL = {
  type: 'spring',
  stiffness: 700,
  damping: 46,
  mass: 0.5,
} as const;

const INSTANT = { duration: 0 } as const;

type Metrics = { line: number; full: number };

export type UseShowMoreOptions = {
  lines?: number;
  maxHeight?: number;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export type UseShowMoreResult = {
  contentRef: React.RefObject<HTMLDivElement | null>;
  expanded: boolean;
  open: boolean;
  toggle: () => void;
  setExpanded: (next: boolean) => void;
  height: number | null;
  collapsedHeight: number | null;
  fullHeight: number | null;
  expandable: boolean;
  capped: boolean;
  scrollable: boolean;
};

export function useShowMore({
  lines = 3,
  maxHeight = 320,
  defaultExpanded = false,
  expanded: expandedProp,
  onExpandedChange,
}: UseShowMoreOptions = {}): UseShowMoreResult {
  const [uncontrolled, setUncontrolled] = useState(defaultExpanded);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const expanded = expandedProp ?? uncontrolled;

  const notify = useRef(onExpandedChange);
  notify.current = onExpandedChange;

  const setExpanded = useCallback(
    (next: boolean) => {
      if (expandedProp === undefined) setUncontrolled(next);
      notify.current?.(next);
    },
    [expandedProp],
  );

  const toggle = useCallback(() => setExpanded(!expanded), [setExpanded, expanded]);

  useIsomorphicLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const read = () => {
      const styles = getComputedStyle(el);
      const parsed = Number.parseFloat(styles.lineHeight);
      const line = Number.isFinite(parsed)
        ? parsed
        : Number.parseFloat(styles.fontSize) * 1.5;
      const full = el.scrollHeight;

      setMetrics((prev) =>
        prev && prev.line === line && prev.full === full ? prev : { line, full },
      );
    };

    read();

    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const clamped = metrics ? metrics.line * lines : 0;
  const expandable = metrics ? metrics.full - clamped > 1 : true;
  const capped = metrics ? metrics.full > maxHeight : false;
  const collapsedHeight = metrics ? Math.min(clamped, metrics.full) : null;
  const fullHeight = metrics ? Math.min(metrics.full, maxHeight) : null;
  const open = expanded && expandable;

  return {
    contentRef,
    expanded,
    open,
    toggle,
    setExpanded,
    height: open ? fullHeight : collapsedHeight,
    collapsedHeight,
    fullHeight,
    expandable,
    capped,
    scrollable: open && capped,
  };
}

export type ShowMoreProps = UseShowMoreOptions & {
  children: React.ReactNode;
  moreLabel?: string;
  lessLabel?: string;
  label?: string;
  className?: string;
};

export function ShowMore({
  children,
  moreLabel = 'Show more',
  lessLabel = 'Show less',
  label = 'Details',
  lines = 3,
  maxHeight = 320,
  defaultExpanded,
  expanded,
  onExpandedChange,
  className = '',
}: ShowMoreProps) {
  const reduced = useReducedMotion();
  const regionId = useId();
  const regionRef = useRef<HTMLDivElement>(null);

  const { contentRef, open, toggle, height, expandable, capped, scrollable } =
    useShowMore({
      lines,
      maxHeight,
      defaultExpanded,
      expanded,
      onExpandedChange,
    });

  const press = () => {
    if (open) regionRef.current?.scrollTo({ top: 0 });
    toggle();
  };

  const veiled = expandable && (!open || scrollable);

  return (
    <div className={`mh-show-more ${className}`}>
      <div className="mh-show-more__wrap">
        <motion.div
          ref={regionRef}
          id={regionId}
          role={scrollable ? 'region' : undefined}
          aria-label={scrollable ? label : undefined}
          tabIndex={scrollable ? 0 : undefined}
          initial={false}
          animate={height === null ? {} : { height }}
          transition={reduced ? INSTANT : DISCLOSE}
          style={{
            maxHeight: height === null ? `${lines}lh` : undefined,
            overflowY: scrollable ? 'auto' : 'hidden',
            scrollbarGutter: capped ? 'stable' : undefined,
          }}
          className="mh-show-more__viewport"
        >
          <div ref={contentRef}>{children}</div>
        </motion.div>
        <motion.div
          aria-hidden
          initial={false}
          animate={{ opacity: veiled ? 1 : 0 }}
          transition={reduced ? INSTANT : SMALL}
          className="mh-show-more__veil"
        />
      </div>
      <div className="mh-show-more__footer">
        <button
          type="button"
          onClick={press}
          aria-expanded={open}
          aria-controls={regionId}
          className="mh-show-more__toggle"
          data-expandable={expandable}
        >
          <span className="mh-show-more__labels">
            <motion.span
              aria-hidden={open}
              className="mh-show-more__label"
              initial={false}
              animate={{ opacity: open ? 0 : 1 }}
              transition={reduced ? INSTANT : SMALL}
            >
              {moreLabel}
            </motion.span>
            <motion.span
              aria-hidden={!open}
              className="mh-show-more__label"
              initial={false}
              animate={{ opacity: open ? 1 : 0 }}
              transition={reduced ? INSTANT : SMALL}
            >
              {lessLabel}
            </motion.span>
          </span>
          <motion.span
            aria-hidden
            className="mh-show-more__chevron"
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduced ? INSTANT : SMALL}
          >
            <ChevronDown size={12} strokeWidth={2.5} />
          </motion.span>
        </button>
      </div>
    </div>
  );
}
