// MelodyHub interior — accordion（已换肤）
// 来源：ddoemonn/interior components/interior/accordion.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useAutoHeight + useAccordion 单选/多选、
// 受控/非受控、键盘导航、inert、reduced-motion、打断反转的高度/透明度动画）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 accordion.css（CSS Vars）、
// phosphor 风格 chevron svg 换成 lucide-react ChevronDown（旋转动画保留）。
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import './accordion.css';

const EASE = [0.23, 1, 0.32, 1] as const;
const EXIT_EASE = [0.4, 0, 1, 1] as const;

const DISCLOSE = {
  type: 'spring',
  stiffness: 480,
  damping: 40,
  mass: 0.6,
} as const;

const CHEVRON = {
  type: 'spring',
  stiffness: 700,
  damping: 46,
  mass: 0.5,
} as const;

const NONE: readonly string[] = [];

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Inertable = HTMLElement & { inert?: boolean };

export type UseAutoHeightResult = {
  ref: React.RefObject<HTMLDivElement | null>;
  height: number;
  ready: boolean;
};

export function useAutoHeight(): UseAutoHeightResult {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [ready, setReady] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const read = () => {
      const next = el.getBoundingClientRect().height;
      setHeight((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
    };

    read();
    setReady(true);

    const observer = new ResizeObserver(read);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return { ref, height, ready };
}

export type AccordionEntry = {
  id: string;
};

export type AccordionHeaderProps = {
  id: string;
  ref: (node: HTMLButtonElement | null) => void;
  type: 'button';
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  'aria-expanded': boolean;
  'aria-controls': string;
};

export type AccordionPanelProps = {
  id: string;
  role: 'region';
  'aria-labelledby': string;
  'aria-hidden': true | undefined;
};

export type UseAccordionOptions = {
  items: readonly AccordionEntry[];
  type?: 'single' | 'multiple';
  defaultOpen?: readonly string[];
  open?: readonly string[];
  onOpenChange?: (open: string[]) => void;
  collapsible?: boolean;
};

export type UseAccordionResult = {
  open: string[];
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  headerProps: (id: string) => AccordionHeaderProps;
  panelProps: (id: string) => AccordionPanelProps;
};

export function useAccordion({
  items,
  type = 'single',
  defaultOpen = NONE,
  open: controlled,
  onOpenChange,
  collapsible = true,
}: UseAccordionOptions): UseAccordionResult {
  const base = useId();

  const [uncontrolled, setUncontrolled] = useState<string[]>(() =>
    type === 'single' ? defaultOpen.slice(0, 1) : defaultOpen.slice(),
  );

  const open = useMemo(
    () => (controlled ? controlled.slice() : uncontrolled),
    [controlled, uncontrolled],
  );

  const headers = useRef(new Map<string, HTMLButtonElement>());
  const binders = useRef(new Map<string, AccordionHeaderProps['ref']>());

  const headerRef = useCallback((id: string): AccordionHeaderProps['ref'] => {
    const cached = binders.current.get(id);
    if (cached) return cached;
    const bind = (node: HTMLButtonElement | null) => {
      if (node) headers.current.set(id, node);
      else headers.current.delete(id);
    };
    binders.current.set(id, bind);
    return bind;
  }, []);

  const changed = useRef(onOpenChange);
  changed.current = onOpenChange;

  const commit = useCallback((next: string[]) => {
    setUncontrolled(next);
    changed.current?.(next);
  }, []);

  const isOpen = useCallback((id: string) => open.includes(id), [open]);

  const toggle = useCallback(
    (id: string) => {
      const active = open.includes(id);
      if (active && !collapsible && type === 'single') return;
      if (type === 'single') {
        commit(active ? [] : [id]);
        return;
      }
      commit(active ? open.filter((x) => x !== id) : [...open, id]);
    },
    [open, type, collapsible, commit],
  );

  const order = useMemo(() => items.map((item) => item.id), [items]);

  const move = useCallback(
    (id: string, delta: number, edge: 'first' | 'last' | null) => {
      if (order.length === 0) return;
      const at = order.indexOf(id);
      if (at < 0) return;
      const next =
        edge === 'first'
          ? 0
          : edge === 'last'
            ? order.length - 1
            : (at + delta + order.length) % order.length;
      headers.current.get(order[next])?.focus();
    },
    [order],
  );

  const headerProps = useCallback(
    (id: string): AccordionHeaderProps => ({
      id: `${base}-header-${id}`,
      ref: headerRef(id),
      type: 'button',
      onClick: () => toggle(id),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          move(id, 1, null);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          move(id, -1, null);
        } else if (event.key === 'Home') {
          event.preventDefault();
          move(id, 0, 'first');
        } else if (event.key === 'End') {
          event.preventDefault();
          move(id, 0, 'last');
        }
      },
      'aria-expanded': open.includes(id),
      'aria-controls': `${base}-panel-${id}`,
    }),
    [base, open, toggle, move, headerRef],
  );

  const panelProps = useCallback(
    (id: string): AccordionPanelProps => ({
      id: `${base}-panel-${id}`,
      role: 'region',
      'aria-labelledby': `${base}-header-${id}`,
      'aria-hidden': open.includes(id) ? undefined : true,
    }),
    [base, open],
  );

  return { open, isOpen, toggle, headerProps, panelProps };
}

export type AccordionItem = {
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
  meta?: React.ReactNode;
};

export type AccordionProps = {
  items: readonly AccordionItem[];
  type?: 'single' | 'multiple';
  defaultOpen?: readonly string[];
  open?: readonly string[];
  onOpenChange?: (open: string[]) => void;
  collapsible?: boolean;
  maxPanelHeight?: number;
  headingLevel?: number;
  className?: string;
};

export function Accordion({
  items,
  type = 'single',
  defaultOpen = NONE,
  open: controlled,
  onOpenChange,
  collapsible = true,
  maxPanelHeight = 220,
  headingLevel = 3,
  className = '',
}: AccordionProps) {
  const reduced = useReducedMotion();

  const entries = useMemo(() => items.map(({ id }) => ({ id })), [items]);

  const { isOpen, headerProps, panelProps } = useAccordion({
    items: entries,
    type,
    defaultOpen,
    open: controlled,
    onOpenChange,
    collapsible,
  });

  return (
    <div className={`mh-accordion ${className}`}>
      {items.map((item) => (
        <AccordionRow
          key={item.id}
          item={item}
          open={isOpen(item.id)}
          reduced={Boolean(reduced)}
          maxPanelHeight={maxPanelHeight}
          headingLevel={headingLevel}
          header={headerProps(item.id)}
          panel={panelProps(item.id)}
        />
      ))}
    </div>
  );
}

function AccordionRow({
  item,
  open,
  reduced,
  maxPanelHeight,
  headingLevel,
  header,
  panel,
}: {
  item: AccordionItem;
  open: boolean;
  reduced: boolean;
  maxPanelHeight: number;
  headingLevel: number;
  header: AccordionHeaderProps;
  panel: AccordionPanelProps;
}) {
  const { ref, height, ready } = useAutoHeight();

  useEffect(() => {
    const el = ref.current as Inertable | null;
    if (!el) return;
    el.inert = !open;
    return () => {
      el.inert = false;
    };
  }, [ref, open]);

  return (
    <div className="mh-accordion__row">
      <div role="heading" aria-level={headingLevel}>
        <button
          {...header}
          data-open={open}
          className="mh-accordion__trigger"
        >
          <span className="mh-accordion__title" data-open={open}>
            {item.title}
          </span>

          {item.meta ? (
            <span className="mh-accordion__meta">{item.meta}</span>
          ) : null}

          <motion.span
            aria-hidden="true"
            className="mh-accordion__chevron"
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduced ? { duration: 0 } : CHEVRON}
          >
            <ChevronDown size={13} strokeWidth={2.5} />
          </motion.span>
        </button>
      </div>
      <motion.div
        initial={false}
        animate={ready ? { height: open ? height : 0 } : {}}
        transition={reduced ? { duration: 0 } : DISCLOSE}
        style={{
          overflow: 'hidden',
          height: ready ? undefined : open ? 'auto' : 0,
        }}
      >
        <div
          {...panel}
          ref={ref}
          className="mh-accordion__panel"
          style={{
            maxHeight: maxPanelHeight,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            scrollbarGutter: 'stable',
          }}
        >
          <motion.div
            initial={false}
            animate={{ opacity: open ? 1 : 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : open
                  ? { duration: 0.18, ease: EASE }
                  : { duration: 0.14, ease: EXIT_EASE }
            }
            className="mh-accordion__panel-inner"
          >
            {item.content}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
