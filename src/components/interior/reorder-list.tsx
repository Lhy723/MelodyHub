// MelodyHub interior — reorder-list（已换肤）
// 来源：ddoemonn/interior components/interior/reorder-list.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useReorderList 拖拽排序/键盘/reduced-motion + 实时播报）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 reorder-list.css（CSS Vars）、
// 内联圆点 grip svg 换成 lucide-react GripVertical。
import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { GripVertical } from 'lucide-react';
import { Reorder, useReducedMotion } from 'motion/react';
import './reorder-list.css';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const INSTANT = { duration: 0 } as const;

const moveItem = <T,>(list: readonly T[], from: number, to: number): T[] => {
  const next = [...list];
  const [taken] = next.splice(from, 1);
  next.splice(to, 0, taken);
  return next;
};

export type UseReorderListOptions<T> = {
  items: readonly T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onReorder: (next: T[]) => void;
  onCommit?: (next: T[]) => void;
  disabled?: boolean;
};

export function useReorderList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  onCommit,
  disabled = false,
}: UseReorderListOptions<T>) {
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [spoken, setSpoken] = useState('');

  const emit = useRef(onReorder);
  emit.current = onReorder;
  const settle = useRef(onCommit);
  settle.current = onCommit;
  const live = useRef(items);
  live.current = items;
  const snapshot = useRef<readonly T[] | null>(null);

  const indexOf = useCallback(
    (id: string) => live.current.findIndex((item) => getId(item) === id),
    [getId],
  );

  const grab = useCallback(
    (id: string) => {
      snapshot.current = live.current;
      setGrabbed(id);
      const at = indexOf(id);
      const item = live.current[at];
      setSpoken(
        `${getLabel(item)} grabbed, position ${at + 1} of ${live.current.length}.`,
      );
    },
    [getLabel, indexOf],
  );

  const drop = useCallback(
    (id: string) => {
      snapshot.current = null;
      setGrabbed(null);
      const at = indexOf(id);
      const item = live.current[at];
      setSpoken(`${getLabel(item)} dropped at position ${at + 1}.`);
      settle.current?.([...live.current]);
    },
    [getLabel, indexOf],
  );

  const cancel = useCallback(() => {
    if (snapshot.current) emit.current([...snapshot.current]);
    snapshot.current = null;
    setGrabbed(null);
    setSpoken('Reorder cancelled, original order restored.');
  }, []);

  const step = useCallback(
    (id: string, delta: -1 | 1) => {
      const from = indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= live.current.length) return;
      const next = moveItem(live.current, from, to);
      emit.current(next);
      const item = next[to];
      setSpoken(`${getLabel(item)}, position ${to + 1} of ${next.length}.`);
      if (snapshot.current === null) settle.current?.(next);
    },
    [getLabel, indexOf],
  );

  const rowKeyDown = useCallback(
    (id: string) => (event: KeyboardEvent<HTMLElement>) => {
      if (disabled || event.target !== event.currentTarget) return;
      const held = grabbed === id;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (held) drop(id);
        else grab(id);
        return;
      }
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && held) {
        event.preventDefault();
        step(id, event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (event.key === 'Escape' && held) {
        event.preventDefault();
        cancel();
      }
    },
    [disabled, grabbed, grab, drop, step, cancel],
  );

  const onDragStart = useCallback((id: string) => {
    snapshot.current = live.current;
    setDragging(id);
  }, []);

  const onDragEnd = useCallback(
    (id: string) => {
      snapshot.current = null;
      setDragging(null);
      const at = indexOf(id);
      const item = live.current[at];
      setSpoken(`${getLabel(item)} dropped at position ${at + 1}.`);
      settle.current?.([...live.current]);
    },
    [getLabel, indexOf],
  );

  return {
    grabbed,
    dragging,
    spoken,
    grab,
    drop,
    cancel,
    step,
    rowKeyDown,
    onDragStart,
    onDragEnd,
  };
}

export type ReorderListProps<T> = UseReorderListOptions<T> & {
  children: (item: T) => ReactNode;
  label: string;
  className?: string;
};

export function ReorderList<T>({
  children,
  label,
  className = '',
  ...options
}: ReorderListProps<T>) {
  const { items, getId, getLabel, onReorder, disabled = false } = options;
  const list = useReorderList(options);
  const reduced = useReducedMotion() === true;
  const hintId = useId();

  return (
    <div className={`mh-reorder-list ${className}`}>
      <Reorder.Group
        axis="y"
        values={items as T[]}
        onReorder={onReorder}
        aria-label={label}
        className="mh-reorder-list__group"
      >
        {items.map((item) => {
          const id = getId(item);
          const held = list.grabbed === id;
          const lifted = held || list.dragging === id;
          return (
            <Reorder.Item
              key={id}
              value={item}
              drag={disabled ? false : 'y'}
              dragListener={!disabled}
              tabIndex={disabled ? -1 : 0}
              aria-describedby={hintId}
              aria-pressed={held}
              role="button"
              onKeyDown={list.rowKeyDown(id)}
              onDragStart={() => list.onDragStart(id)}
              onDragEnd={() => list.onDragEnd(id)}
              onBlur={() => held && list.cancel()}
              transition={reduced ? INSTANT : CELL}
              whileDrag={reduced ? undefined : { scale: 1.02 }}
              style={{ touchAction: 'pan-x' }}
              className={`mh-reorder-list__item${lifted ? ' mh-reorder-list__item--lifted' : ''}${held ? ' mh-reorder-list__item--held' : ''}`}
            >
              <span aria-hidden="true" className="mh-reorder-list__grip">
                <GripVertical size={14} aria-hidden="true" />
              </span>
              <span className="mh-reorder-list__sr">{getLabel(item)}</span>
              <div aria-hidden="true" className="mh-reorder-list__content">
                {children(item)}
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
      <span id={hintId} className="mh-reorder-list__sr">
        Drag to reorder. With the keyboard, Space grabs the row, the arrow keys
        move it, Space drops it, and Escape puts everything back.
      </span>
      <span role="status" aria-live="polite" className="mh-reorder-list__sr">
        {list.spoken}
      </span>
    </div>
  );
}
