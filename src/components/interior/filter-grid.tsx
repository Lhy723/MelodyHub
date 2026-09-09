// MelodyHub interior — filter-grid（已换肤）
// 来源：ddoemonn/interior components/interior/filter-grid.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useFilterGrid + 布局动画/空状态/keyboard/reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 filter-grid.css（CSS Vars）。
// 说明：上游本文件无 phosphor/内联 svg 图标，无图标替换；motion/react 不变。
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './filter-grid.css';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const MOVE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const EASE = [0.23, 1, 0.32, 1] as const;
const LEAVE = { duration: 0.14, ease: [0.4, 0, 1, 1] } as const;
const INSTANT = { duration: 0 } as const;

export type FilterDefinition<T> = {
  id: string;
  label: string;
  match: (item: T) => boolean;
};

export type UseFilterGridOptions<T> = {
  items: readonly T[];
  filters: readonly FilterDefinition<T>[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
};

export type UseFilterGridResult<T> = {
  active: string;
  activeLabel: string;
  select: (id: string) => void;
  visible: T[];
  counts: Record<string, number>;
  total: number;
};

export function useFilterGrid<T>({
  items,
  filters,
  value,
  defaultValue,
  onValueChange,
}: UseFilterGridOptions<T>): UseFilterGridResult<T> {
  const fallback = filters[0]?.id ?? '';
  const [internal, setInternal] = useState(() => defaultValue ?? fallback);

  const requested = value ?? internal;
  const current = filters.find((f) => f.id === requested) ?? filters[0];
  const active = current?.id ?? fallback;

  const emit = useRef(onValueChange);
  emit.current = onValueChange;

  const counts = useMemo(() => {
    const next: Record<string, number> = {};
    for (const filter of filters) {
      let n = 0;
      for (const item of items) if (filter.match(item)) n += 1;
      next[filter.id] = n;
    }
    return next;
  }, [filters, items]);

  const visible = useMemo(() => {
    const filter = filters.find((f) => f.id === active);
    if (!filter) return [...items];
    return items.filter((item) => filter.match(item));
  }, [filters, items, active]);

  const select = useCallback(
    (id: string) => {
      if (value === undefined) setInternal(id);
      if (id !== active) emit.current?.(id);
    },
    [value, active],
  );

  return {
    active,
    activeLabel: current?.label ?? '',
    select,
    visible,
    counts,
    total: items.length,
  };
}

export type FilterGridProps<T> = {
  items: readonly T[];
  filters: readonly FilterDefinition<T>[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  columns?: number;
  rowHeight?: number;
  /** 行数上限：数字 = 固定行数（超出在列表内部滚动）；
   *  'auto' = 不设上限，列表随内容增长、由页面滚动（模型配置页等长列表场景）。 */
  maxRows?: number | 'auto';
  gap?: number;
  emptyLabel?: string;
  className?: string;
};

export function FilterGrid<T>({
  items,
  filters,
  getKey,
  renderItem,
  label,
  value,
  defaultValue,
  onValueChange,
  columns = 3,
  rowHeight = 72,
  maxRows = 4,
  gap = 8,
  emptyLabel = 'Nothing matches this filter',
  className = '',
}: FilterGridProps<T>) {
  const uid = useId();
  const gridId = `${uid}-grid`;
  const reduced = useReducedMotion();

  const { active, activeLabel, select, visible, counts, total } = useFilterGrid({
    items,
    filters,
    value,
    defaultValue,
    onValueChange,
  });

  const gridRef = useRef<HTMLUListElement>(null);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const heldFocus = useRef(false);

  const cols = Math.max(1, Math.floor(columns));
  const uncapped = maxRows === 'auto';
  const rows = uncapped
    ? Math.max(1, Math.ceil(total / cols))
    : Math.min(Math.max(1, Math.ceil(total / cols)), Math.max(1, maxRows as number));
  const box = rows * rowHeight + (rows - 1) * gap;

  const index = Math.max(
    0,
    filters.findIndex((f) => f.id === active),
  );

  const choose = useCallback(
    (id: string) => {
      const grid = gridRef.current;
      heldFocus.current =
        !!grid && grid.contains(document.activeElement) && grid !== document.activeElement;
      select(id);
    },
    [select],
  );

  const settle = useCallback(() => {
    if (!heldFocus.current) return;
    heldFocus.current = false;
    const grid = gridRef.current;
    if (grid && !grid.contains(document.activeElement)) grid.focus();
  }, []);

  const go = useCallback(
    (i: number) => {
      const next = filters[(i + filters.length) % filters.length];
      if (!next) return;
      chips.current[(i + filters.length) % filters.length]?.focus();
      choose(next.id);
    },
    [filters, choose],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      go(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(filters.length - 1);
    }
  };

  const swap = reduced ? INSTANT : CELL;
  const step = reduced ? INSTANT : { layout: MOVE, duration: 0.2, ease: EASE };
  const leave = reduced ? INSTANT : LEAVE;

  const capped = !uncapped && Math.ceil(total / cols) > Math.max(1, maxRows as number);

  return (
    <div className={`mh-filter-grid ${className}`}>
      <div
        role="radiogroup"
        aria-label={label}
        aria-controls={gridId}
        className="mh-filter-grid__chips"
      >
        {filters.map((filter, i) => {
          const on = i === index;
          return (
            <button
              key={filter.id}
              ref={(node) => {
                chips.current[i] = node;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-on={on}
              onClick={() => choose(filter.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="mh-filter-grid__chip"
            >
              {on ? (
                <motion.span
                  aria-hidden
                  layoutId={reduced ? undefined : `${uid}-thumb`}
                  transition={CELL}
                  className="mh-filter-grid__chip-thumb"
                />
              ) : null}

              <span
                aria-hidden
                className="mh-filter-grid__chip-ring"
              />
              <span className="mh-filter-grid__chip-text">
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ opacity: on ? 0 : 1 }}
                  transition={swap}
                  className="mh-filter-grid__chip-label"
                >
                  {filter.label}
                  <span className="mh-filter-grid__chip-count">
                    {counts[filter.id]}
                  </span>
                </motion.span>
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ opacity: on ? 1 : 0 }}
                  transition={swap}
                  className="mh-filter-grid__chip-label mh-filter-grid__chip-label--on"
                >
                  {filter.label}
                  <span className="mh-filter-grid__chip-count mh-filter-grid__chip-count--on">
                    {counts[filter.id]}
                  </span>
                </motion.span>
                <span className="mh-filter-grid__sr">
                  {filter.label}, {counts[filter.id]} of {total}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mh-filter-grid__body">
        <ul
          id={gridId}
          ref={gridRef}
          tabIndex={-1}
          className={`mh-filter-grid__list${capped ? ' mh-filter-grid__list--capped' : ''}`}
          style={
            {
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridAutoRows: `${rowHeight}px`,
              gap: `${gap}px`,
              ...(uncapped ? {} : { height: `${box}px` }),
            }
          }
        >
          <AnimatePresence initial={false} mode="popLayout" onExitComplete={settle}>
            {visible.map((item) => (
              <motion.li
                key={getKey(item)}
                layout={reduced ? false : 'position'}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: leave }}
                transition={step}
                className="mh-filter-grid__item"
              >
                {renderItem(item)}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <AnimatePresence initial={false}>
          {visible.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: leave }}
              transition={reduced ? INSTANT : { duration: 0.2, ease: EASE }}
              className="mh-filter-grid__empty"
            >
              <span className="mh-filter-grid__empty-text">
                {emptyLabel}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p aria-live="polite" className="mh-filter-grid__sr">
        {activeLabel}: {visible.length} of {total} shown
      </p>
    </div>
  );
}
