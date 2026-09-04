// MelodyHub interior — tabs（已换肤）
// 来源：ddoemonn/interior components/interior/tabs.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useTabs + 滑动指示器 + 键盘导航 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 tabs.css（CSS Vars）、无图标依赖故无图标替换。
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './tabs.css';

const INDICATOR = { type: 'spring', stiffness: 620, damping: 42, mass: 0.35 } as const;

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const PANEL = { type: 'spring', stiffness: 460, damping: 38, mass: 0.8 } as const;

export type TabItem = {
  value: string;
  label: string;
  disabled?: boolean;
  /** 自制 Tabs 迁移带来的扩展：标签旁的数量徽标（上游无，MelodyHub 供应商页需要）。 */
  badge?: ReactNode;
  /** MelodyHub 扩展：标签前置图标（应用设置页 agent 图标），同时计入幽灵层量宽。 */
  icon?: ReactNode;
};

export type TabsActivation = 'automatic' | 'manual';
export type UseTabsOptions = {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  activation?: TabsActivation;
};

export function useTabs({
  items,
  value: controlled,
  defaultValue,
  onValueChange,
  activation = 'automatic',
}: UseTabsOptions) {
  const base = useId();
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const direction = useRef(1);

  const [internal, setInternal] = useState(
    () => defaultValue ?? items.find((i) => !i.disabled)?.value ?? items[0]?.value ?? '',
  );

  const value = controlled ?? internal;

  const emit = useRef(onValueChange);
  emit.current = onValueChange;

  const select = useCallback(
    (next: string) => {
      if (next === value) return;
      const from = items.findIndex((i) => i.value === value);
      const to = items.findIndex((i) => i.value === next);
      direction.current = to < from ? -1 : 1;
      if (controlled === undefined) setInternal(next);
      emit.current?.(next);
    },
    [controlled, items, value],
  );

  const focusAt = useCallback(
    (i: number) => {
      const item = items[i];
      if (!item) return;
      nodes.current.get(item.value)?.focus();
    },
    [items],
  );

  const nextEnabled = useCallback(
    (from: number, dir: number) => {
      const n = items.length;
      let i = from < 0 ? 0 : from;
      for (let k = 0; k < n; k += 1) {
        i = (i + dir + n) % n;
        if (!items[i].disabled) return i;
      }
      return from;
    },
    [items],
  );

  const endStop = useCallback(
    (dir: number) => {
      const n = items.length;
      if (dir > 0) {
        for (let i = 0; i < n; i += 1) if (!items[i].disabled) return i;
      } else {
        for (let i = n - 1; i >= 0; i -= 1) if (!items[i].disabled) return i;
      }
      return 0;
    },
    [items],
  );

  const getTabProps = useCallback(
    (item: TabItem, index: number) => ({
      id: `${base}-tab-${item.value}`,
      role: 'tab' as const,
      type: 'button' as const,
      'aria-selected': item.value === value,
      'aria-controls': `${base}-panel-${item.value}`,
      'aria-disabled': item.disabled ? (true as const) : undefined,
      tabIndex: item.value === value ? 0 : -1,
      ref: (node: HTMLButtonElement | null) => {
        if (node) nodes.current.set(item.value, node);
        else nodes.current.delete(item.value);
      },
      onClick: () => {
        if (!item.disabled) select(item.value);
      },
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const to = nextEnabled(index, e.key === 'ArrowRight' ? 1 : -1);
          focusAt(to);
          if (activation === 'automatic') select(items[to].value);
          return;
        }
        if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          const to = endStop(e.key === 'Home' ? 1 : -1);
          focusAt(to);
          if (activation === 'automatic') select(items[to].value);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!item.disabled) select(item.value);
        }
      },
    }),
    [activation, base, endStop, focusAt, items, nextEnabled, select, value],
  );

  const getPanelProps = useCallback(
    (panelValue: string) => ({
      id: `${base}-panel-${panelValue}`,
      role: 'tabpanel' as const,
      'aria-labelledby': `${base}-tab-${panelValue}`,
      tabIndex: 0,
    }),
    [base],
  );

  const tabListProps = {
    role: 'tablist' as const,
    'aria-orientation': 'horizontal' as const,
  };

  return {
    value,
    select,
    direction: direction.current,
    tabListProps,
    getTabProps,
    getPanelProps,
  };
}

export type UseTabsReturn = ReturnType<typeof useTabs>;

export type TabsVariant = 'merged' | 'segmented' | 'underline';

export type TabsProps = {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  activation?: TabsActivation;
  /** 文档站新增形态（比 vendor 基线新）：segmented=卡片+浮起块（demo 同款），underline=细线+2px 滑杆。 */
  variant?: TabsVariant;
  renderPanel?: (value: string) => ReactNode;
  label?: string;
  panelClassName?: string;
  className?: string;
};

export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  activation = 'automatic',
  variant = 'merged',
  renderPanel,
  label = 'Tabs',
  panelClassName = '',
  className = '',
}: TabsProps) {
  const tabs = useTabs({ items, value, defaultValue, onValueChange, activation });
  const reduced = useReducedMotion();

  const rowRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [plateau, setPlateau] = useState({ x: 0, width: 0, ready: false });

  const selectedIndex = items.findIndex((item) => item.value === tabs.value);

  useIsoLayoutEffect(() => {
    const node = tabRefs.current[selectedIndex];
    if (!node) return;

    const read = () => {
      setPlateau((prev) =>
        prev.x === node.offsetLeft && prev.width === node.offsetWidth && prev.ready
          ? prev
          : { x: node.offsetLeft, width: node.offsetWidth, ready: true },
      );
    };

    read();
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(read);
    observer.observe(row);
    return () => observer.disconnect();
  }, [selectedIndex, items]);

  return (
    <div
      className={`mh-tabs ${className}`}
      data-variant={variant}
      data-standalone={renderPanel ? undefined : 'true'}
    >
      <div {...tabs.tabListProps} ref={rowRef} aria-label={label} className="mh-tabs__row">
        <motion.span
          layout
          aria-hidden
          style={{
            left: plateau.x,
            width: plateau.width,
            opacity: plateau.ready ? 1 : 0,
          }}
          className="mh-tabs__indicator"
          transition={reduced ? { duration: 0 } : INDICATOR}
        >
          <motion.span
            layout
            aria-hidden
            transition={reduced ? { duration: 0 } : INDICATOR}
            className="mh-tabs__indicator-border"
          />
        </motion.span>

        {items.map((item, index) => {
          const selected = item.value === tabs.value;
          const { ref: hookRef, ...tabProps } = tabs.getTabProps(item, index);
          return (
            <button
              key={item.value}
              {...tabProps}
              ref={(node) => {
                tabRefs.current[index] = node;
                hookRef(node);
              }}
              data-selected={selected}
              data-disabled={item.disabled ? true : undefined}
              className="mh-tabs__tab"
            >
              <span className="mh-tabs__tab-label">
                <span aria-hidden className="mh-tabs__tab-ghost">
                  {item.icon}
                  {item.label}
                </span>
                <span className="mh-tabs__tab-text" data-selected={selected}>
                  {item.icon}
                  {item.label}
                </span>
              </span>
              {item.badge != null && <span className="mh-tabs__badge">{item.badge}</span>}
            </button>
          );
        })}
      </div>

      {renderPanel ? (
        <motion.div
          key={tabs.value}
          custom={tabs.direction}
          {...tabs.getPanelProps(tabs.value)}
          initial={reduced ? false : { opacity: 0, x: tabs.direction * 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduced ? { duration: 0 } : PANEL}
          className={`mh-tabs__panel ${panelClassName}`}
        >
          {renderPanel(tabs.value)}
        </motion.div>
      ) : null}
    </div>
  );
}
