// MelodyHub interior — pagination（已换肤，暂不接入页面）
// 来源：ddoemonn/interior components/interior/pagination.tsx
// 上游 commit 见 _vendor/SOURCE.txt；paginate 纯函数 + usePagination（受控/非受控、方向感知）原样保留，
// 仅做：删 "use client"、删 Tailwind 改走 pagination.css（CSS Vars）、箭头图标改 lucide。
// 注意：上游是 1-indexed；RecentRequests 的 statsStore.page 是 0-indexed，接入时需 page+1 / onPageChange(p => setPage(p-1)) 适配，
// 且视觉从朴素分页变为滑块分页，待确认后再换。
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './pagination.css';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const EASE = [0.23, 1, 0.32, 1] as const;
const ROLL = { duration: 0.18, ease: EASE } as const;
const STILL = { duration: 0 } as const;

const slotFor = (digits: number) => Math.max(32, 18 + digits * 8);
const GAP = 4;

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export type PaginationItem = number | 'gap-l' | 'gap-r';

export function paginate(page: number, count: number, siblings: number, boundaries: number): PaginationItem[] {
  const total = 2 * boundaries + 2 * siblings + 3;
  if (count <= total) return range(1, count);
  const nearStart = page < boundaries + siblings + 2;
  const nearEnd = page > count - boundaries - siblings - 1;
  if (nearStart) {
    return [...range(1, 2 * siblings + boundaries + 2), 'gap-r', ...range(count - boundaries + 1, count)];
  }
  if (nearEnd) {
    return [...range(1, boundaries), 'gap-l', ...range(count - 2 * siblings - boundaries - 1, count)];
  }
  return [...range(1, boundaries), 'gap-l', ...range(page - siblings, page + siblings), 'gap-r', ...range(count - boundaries + 1, count)];
}

export type UsePaginationOptions = {
  count: number;
  page?: number;
  defaultPage?: number;
  siblings?: number;
  boundaries?: number;
  onPageChange?: (page: number) => void;
};

export function usePagination({ count, page, defaultPage = 1, siblings = 1, boundaries = 1, onPageChange }: UsePaginationOptions) {
  const clampTo = useCallback((value: number) => Math.min(Math.max(1, value), Math.max(1, count)), [count]);
  const [internal, setInternal] = useState(() => clampTo(defaultPage));
  const controlled = page !== undefined;
  const current = clampTo(controlled ? page : internal);
  const emit = useRef(onPageChange);
  emit.current = onPageChange;
  const previous = useRef(current);
  const direction = current >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = current;
  }, [current]);
  const goTo = useCallback(
    (value: number) => {
      const next = clampTo(value);
      if (next === previous.current) return;
      if (!controlled) setInternal(next);
      emit.current?.(next);
    },
    [clampTo, controlled],
  );
  const items = paginate(current, count, siblings, boundaries);
  return {
    page: current,
    count,
    items,
    direction,
    thumbIndex: items.indexOf(current),
    canPrev: current > 1,
    canNext: current < count,
    goTo,
    prev: () => goTo(current - 1),
    next: () => goTo(current + 1),
  };
}

export type PaginationProps = {
  count: number;
  page?: number;
  defaultPage?: number;
  siblings?: number;
  boundaries?: number;
  onPageChange?: (page: number) => void;
  label?: string;
  className?: string;
};

export function Pagination({
  count,
  page,
  defaultPage,
  siblings,
  boundaries,
  onPageChange,
  label = 'Pagination',
  className = '',
}: PaginationProps) {
  const pagination = usePagination({ count, page, defaultPage, siblings, boundaries, onPageChange });
  const { items, direction, thumbIndex, canPrev, canNext } = pagination;
  const current = pagination.page;
  const reduced = useReducedMotion();
  const digits = String(Math.max(1, count)).length;
  const slot = slotFor(digits);

  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSpoken(`Page ${current} of ${Math.max(1, count)}`), 500);
    return () => clearTimeout(t);
  }, [current, count]);

  return (
    <nav aria-label={label} className={`mh-pagination ${className}`}>
      <div className="mh-pagination__row">
        <button
          type="button"
          aria-label="Previous page"
          aria-disabled={!canPrev}
          onClick={() => canPrev && pagination.prev()}
          data-enabled={canPrev}
          className="mh-pagination__arrow"
        >
          <ChevronLeft size={12} />
        </button>
        <div className="mh-pagination__slots">
          <motion.span
            aria-hidden
            initial={false}
            animate={{ x: thumbIndex * (slot + GAP) }}
            transition={reduced ? STILL : CELL}
            style={{ width: slot }}
            className="mh-pagination__thumb"
          />
          <ol className="mh-pagination__list">
            {items.map((item) => {
              if (typeof item !== 'number') {
                return (
                  <li key={item} aria-hidden style={{ width: slot }} className="mh-pagination__gap">
                    &hellip;
                  </li>
                );
              }
              const selected = item === current;
              return (
                <li key={`slot-${item}`} style={{ width: slot }}>
                  <button
                    type="button"
                    aria-label={`Page ${item}`}
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => pagination.goTo(item)}
                    data-selected={selected}
                    className="mh-pagination__page"
                  >
                    <motion.span
                      key={item}
                      initial={reduced ? false : { opacity: 0, x: 8 * direction }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={reduced ? STILL : ROLL}
                    >
                      {item}
                    </motion.span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <button
          type="button"
          aria-label="Next page"
          aria-disabled={!canNext}
          onClick={() => canNext && pagination.next()}
          data-enabled={canNext}
          className="mh-pagination__arrow"
        >
          <ChevronRight size={12} />
        </button>
      </div>
      <span role="status" className="mh-pagination__sr">
        {spoken}
      </span>
    </nav>
  );
}
