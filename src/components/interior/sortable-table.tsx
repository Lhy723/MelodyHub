// MelodyHub interior — sortable-table（已换肤）
// 来源：ddoemonn/interior components/interior/sortable-table.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useSortableRows 受控/非受控排序、
// 空值沉底 + Intl.Collator 稳定排序、三态 toggle asc/desc/restore、aria-sort、
// 绝对定位行 FLIP 位移动画 + 网格线淡入淡出、markable 跟随勾选、aria-live 播报、
// reduced-motion）原样保留，仅做：删 "use client"、删 Tailwind className 改走
// sortable-table.css（CSS Vars）、内联 svg 箭头/check 换成 lucide-react
// ArrowUp/Check（旋转/缩放动画保留）。
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUp, Check } from 'lucide-react';
import './sortable-table.css';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

const SMALL = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;

const EASE = [0.23, 1, 0.32, 1] as const;
const LEAVE = [0.4, 0, 1, 1] as const;
const HIDE = { duration: 0.12, ease: LEAVE } as const;
const SHOW = { duration: 0.25, ease: EASE } as const;

const STEP = 0.018;
const STEP_CAP = 8;
const SETTLE_MS = 380;

export type SortDirection = 'asc' | 'desc';

export type SortState = { columnId: string; direction: SortDirection };

export type SortableColumn<T> = {
  id: string;
  header: string;
  width?: string;
  align?: 'start' | 'end';
  numeric?: boolean;
  sortable?: boolean;
  value?: (row: T) => string | number | null | undefined;
  cell?: (row: T) => ReactNode;
};

export type OrderedRow<T> = { id: string; row: T; index: number };

export type UseSortableRowsOptions<T> = {
  rows: T[];
  getRowId: (row: T) => string;
  getValue: (row: T, columnId: string) => string | number | null | undefined;
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (next: SortState | null) => void;
  restoreOriginal?: boolean;
};

export function useSortableRows<T>({
  rows,
  getRowId,
  getValue,
  sort,
  defaultSort = null,
  onSortChange,
  restoreOriginal = true,
}: UseSortableRowsOptions<T>) {
  const [internal, setInternal] = useState<SortState | null>(defaultSort);

  const controlled = sort !== undefined;
  const current = controlled ? sort : internal;

  const collator = useMemo(
    () => new Intl.Collator('en', { numeric: true, sensitivity: 'base' }),
    [],
  );

  const ordered = useMemo<OrderedRow<T>[]>(() => {
    const base = rows.map((row, i) => ({ id: getRowId(row), row, i }));

    if (current) {
      const dir = current.direction === 'asc' ? 1 : -1;
      base.sort((x, y) => {
        const a = getValue(x.row, current.columnId);
        const b = getValue(y.row, current.columnId);
        const emptyA = a === null || a === undefined || a === '';
        const emptyB = b === null || b === undefined || b === '';
        if (emptyA || emptyB) {
          if (emptyA && emptyB) return x.i - y.i;
          return emptyA ? 1 : -1;
        }
        const d =
          typeof a === 'number' && typeof b === 'number'
            ? a - b
            : collator.compare(String(a), String(b));
        return d === 0 ? x.i - y.i : d * dir;
      });
    }

    return base.map(({ id, row }, index) => ({ id, row, index }));
  }, [rows, current, getRowId, getValue, collator]);

  const toggle = useCallback(
    (columnId: string) => {
      const next: SortState | null =
        !current || current.columnId !== columnId
          ? { columnId, direction: 'asc' }
          : current.direction === 'asc'
            ? { columnId, direction: 'desc' }
            : restoreOriginal
              ? null
              : { columnId, direction: 'asc' };

      if (!controlled) setInternal(next);
      onSortChange?.(next);
    },
    [current, controlled, onSortChange, restoreOriginal],
  );

  const ariaSort = useCallback(
    (columnId: string): 'ascending' | 'descending' | 'none' =>
      current?.columnId === columnId
        ? current.direction === 'asc'
          ? 'ascending'
          : 'descending'
        : 'none',
    [current],
  );

  return { sort: current, ordered, toggle, ariaSort };
}

export type SortableTableProps<T> = {
  rows: T[];
  columns: SortableColumn<T>[];
  getRowId: (row: T) => string;
  label: string;
  rowHeight?: number;
  maxHeight?: number;
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (next: SortState | null) => void;
  markable?: boolean;
  onMarkChange?: (id: string | null) => void;
  getRowLabel?: (row: T) => string;
  className?: string;
};

export function SortableTable<T>({
  rows,
  columns,
  getRowId,
  label,
  rowHeight = 44,
  maxHeight,
  sort,
  defaultSort = null,
  onSortChange,
  markable = false,
  onMarkChange,
  getRowLabel,
  className = '',
}: SortableTableProps<T>) {
  const reduced = useReducedMotion();
  const [marked, setMarked] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [moving, setMoving] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const getValue = useCallback(
    (row: T, columnId: string) => {
      const column = columns.find((c) => c.id === columnId);
      return column?.value ? column.value(row) : null;
    },
    [columns],
  );

  const { sort: current, ordered, toggle, ariaSort } = useSortableRows<T>({
    rows,
    getRowId,
    getValue,
    sort,
    defaultSort,
    onSortChange,
  });

  const template = useMemo(
    () =>
      (markable ? '28px ' : '') +
      columns.map((c) => c.width ?? 'minmax(0, 1fr)').join(' '),
    [columns, markable],
  );

  const onToggle = (columnId: string) => {
    setTouched(true);
    toggle(columnId);
    if (reduced) return;
    setMoving(true);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setMoving(false), SETTLE_MS);
  };

  const onMark = (id: string) => {
    const next = marked === id ? null : id;
    setMarked(next);
    onMarkChange?.(next);
  };

  const nameOf = (row: T) =>
    getRowLabel?.(row) ?? String(columns[0]?.value?.(row) ?? getRowId(row));

  const activeHeader = columns.find((c) => c.id === current?.columnId)?.header;

  const message = !touched
    ? ''
    : current && activeHeader
      ? `Sorted by ${activeHeader}, ${
          current.direction === 'asc' ? 'ascending' : 'descending'
        }. ${rows.length} rows.`
      : `Original order restored. ${rows.length} rows.`;

  return (
    <div className={`mh-sortable-table ${className}`}>
      <div
        role="table"
        aria-label={label}
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length + (markable ? 1 : 0)}
      >
        <div role="rowgroup">
          <div
            role="row"
            aria-rowindex={1}
            className="mh-sortable-table__header-row"
            style={{ gridTemplateColumns: template }}
          >
            {markable && (
              <div role="columnheader" className="mh-sortable-table__mark-head">
                <span className="mh-sortable-table__sr">Follow</span>
              </div>
            )}

            {columns.map((column) => {
              const state = ariaSort(column.id);
              const active = state !== 'none';
              const end = column.align === 'end';

              return (
                <div
                  key={column.id}
                  role="columnheader"
                  aria-sort={column.sortable === false ? undefined : state}
                  className="mh-sortable-table__col-head"
                >
                  {column.sortable === false ? (
                    <span
                      className={`mh-sortable-table__col-label${end ? ' mh-sortable-table__col-label--end' : ''}`}
                    >
                      {column.header}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggle(column.id)}
                      className={`mh-sortable-table__sort-btn${end ? ' mh-sortable-table__sort-btn--end' : ''}`}
                    >
                      <span
                        className={`mh-sortable-table__sort-label${active ? ' mh-sortable-table__sort-label--active' : ''}`}
                      >
                        {column.header}
                      </span>
                      <motion.span
                        aria-hidden
                        className="mh-sortable-table__sort-icon"
                        initial={false}
                        animate={{
                          rotate: state === 'descending' ? 180 : 0,
                          opacity: active ? 1 : 0,
                          scale: active ? 1 : 0.72,
                        }}
                        transition={reduced ? { duration: 0 } : SMALL}
                      >
                        <ArrowUp size={11} strokeWidth={2} aria-hidden="true" />
                      </motion.span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div
          role="rowgroup"
          className={`mh-sortable-table__body${maxHeight ? ' mh-sortable-table__body--scrollable' : ''}`}
          style={{
            height: (rows.length || 1) * rowHeight,
            maxHeight,
          }}
        >
          {rows.length === 0 && (
            <div
              role="row"
              className="mh-sortable-table__empty-row"
              style={{ height: rowHeight }}
            >
              <span role="cell" className="mh-sortable-table__empty-cell">
                No rows
              </span>
            </div>
          )}

          {ordered.map(({ id, row, index }) => {
            const isMarked = markable && marked === id;

            return (
              <motion.div
                key={id}
                role="row"
                aria-rowindex={index + 2}
                aria-current={isMarked ? true : undefined}
                initial={false}
                animate={{ y: index * rowHeight }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { ...CELL, delay: Math.min(index, STEP_CAP) * STEP }
                }
                className={`mh-sortable-table__row${isMarked ? ' mh-sortable-table__row--marked' : ''}`}
                style={{ height: rowHeight, gridTemplateColumns: template }}
              >
                {markable && (
                  <div role="cell" className="mh-sortable-table__mark-cell">
                    <button
                      type="button"
                      aria-pressed={marked === id}
                      onClick={() => onMark(id)}
                      className={`mh-sortable-table__mark-btn${marked === id ? ' mh-sortable-table__mark-btn--checked' : ''}`}
                    >
                      <span className="mh-sortable-table__sr">Follow {nameOf(row)}</span>
                      <motion.span
                        aria-hidden
                        className="mh-sortable-table__check"
                        initial={false}
                        animate={{ scale: marked === id ? 1 : 0.4 }}
                        transition={reduced ? { duration: 0 } : CELL}
                      >
                        <Check size={11} strokeWidth={2.4} aria-hidden="true" />
                      </motion.span>
                    </button>
                  </div>
                )}

                {columns.map((column, c) => {
                  const raw = column.value?.(row);
                  const content = column.cell
                    ? column.cell(row)
                    : raw === null || raw === undefined || raw === ''
                      ? '—'
                      : String(raw);

                  return (
                    <div
                      key={column.id}
                      role="cell"
                      className={`mh-sortable-table__cell${column.align === 'end' ? ' mh-sortable-table__cell--end' : ''}${column.numeric ? ' mh-sortable-table__cell--numeric' : ''}${c === 0 ? ' mh-sortable-table__cell--primary' : ' mh-sortable-table__cell--secondary'}`}
                    >
                      {content}
                    </div>
                  );
                })}
              </motion.div>
            );
          })}

          <motion.div
            aria-hidden
            initial={false}
            animate={{ opacity: moving ? 0 : 1 }}
            transition={moving ? HIDE : SHOW}
            className="mh-sortable-table__gridlines"
          >
            {Array.from({ length: Math.max(0, rows.length - 1) }, (_, i) => (
              <div
                key={i}
                className="mh-sortable-table__gridline"
                style={{ top: (i + 1) * rowHeight }}
              />
            ))}
          </motion.div>
        </div>
      </div>
      <div role="status" aria-live="polite" className="mh-sortable-table__sr">
        {message}
      </div>
    </div>
  );
}
