// MelodyHub interior — segmented-control（已换肤）
// 来源：ddoemonn/interior components/interior/segmented-control.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（滑动指示器 useMotionValue/useTransform +
// animate spring、键盘导航 Arrow/Home/End + 禁用项跳过、useReducedMotion 瞬切）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 segmented-control.css（CSS Vars）。
// 上游无图标依赖，无 phosphor → lucide-react 替换。
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import './segmented-control.css';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;

export type SegmentedOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** MelodyHub 扩展（上游无）：段内的前置图标，如主题切换的 Sun/Moon。 */
  icon?: ReactNode;
};

export type SegmentedControlProps = {
  options: SegmentedOption[];
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** MelodyHub 扩展：sm 收紧成 13px，用于设置行内密集场景。 */
  size?: 'sm' | 'md';
  className?: string;
};

export function SegmentedControl({
  options,
  label,
  value,
  defaultValue,
  onValueChange,
  size = 'md',
  className = '',
}: SegmentedControlProps) {
  const count = Math.max(1, options.length);
  const template = `repeat(${count}, minmax(0, 1fr))`;

  const [internal, setInternal] = useState(() => defaultValue ?? options[0]?.value ?? '');
  const [hovered, setHovered] = useState(-1);

  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const found = options.findIndex((o) => o.value === current);
  const index = found < 0 ? 0 : found;

  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const emit = useRef(onValueChange);
  emit.current = onValueChange;

  const reduced = useReducedMotion();
  const pos = useMotionValue(index);
  const thumbX = useTransform(pos, (v) => `${v * 100}%`);
  const maskX = useTransform(pos, (v) => `${v * -100}%`);

  useEffect(() => {
    if (reduced) {
      pos.set(index);
      return;
    }
    const controls = animate(pos, index, CELL);
    return () => controls.stop();
  }, [index, reduced, pos]);

  const select = useCallback(
    (next: string) => {
      if (!controlled) setInternal(next);
      if (next !== current) emit.current?.(next);
    },
    [controlled, current],
  );

  const seek = useCallback(
    (from: number, dir: number) => {
      let i = from;
      for (let k = 0; k < count; k++) {
        i = (i + dir + count) % count;
        if (!options[i]?.disabled) return i;
      }
      return from;
    },
    [count, options],
  );

  const go = useCallback(
    (i: number) => {
      const option = options[i];
      if (!option || option.disabled) return;
      buttons.current[i]?.focus();
      select(option.value);
    },
    [options, select],
  );

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      go(seek(i, 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      go(seek(i, -1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(seek(count - 1, 1));
    } else if (e.key === 'End') {
      e.preventDefault();
      go(seek(0, -1));
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`mh-segmented${size === 'sm' ? ' is-sm' : ''} ${className}`}
    >
      <div className="mh-segmented__grid" style={{ gridTemplateColumns: template, touchAction: 'manipulation' }}>
        {options.map((option, i) => (
          <span
            key={option.value}
            aria-hidden
            className={
              'mh-segmented__cell mh-segmented__ghost' +
              (option.disabled ? ' is-disabled' : hovered === i && i !== index ? ' is-hovered' : '')
            }
          >
            {option.icon && (
              <span aria-hidden className="mh-segmented__icon">
                {option.icon}
              </span>
            )}
            {option.label}
          </span>
        ))}

        <motion.div
          aria-hidden
          className="mh-segmented__thumb"
          style={{ width: `${100 / count}%`, x: thumbX }}
          initial={false}
        >
          <motion.div className="mh-segmented__thumb-mask" style={{ x: maskX }} initial={false}>
            <div
              className="mh-segmented__thumb-row"
              style={{ width: `${count * 100}%`, gridTemplateColumns: template }}
            >
              {options.map((option) => (
                <span key={option.value} className="mh-segmented__cell mh-segmented__thumb-label">
                  {option.icon && (
                    <span aria-hidden className="mh-segmented__icon">
                      {option.icon}
                    </span>
                  )}
                  {option.label}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
        <div
          className="mh-segmented__hitzone"
          style={{ gridTemplateColumns: template }}
          onPointerLeave={() => setHovered(-1)}
        >
          {options.map((option, i) => (
            <button
              key={option.value}
              ref={(node) => {
                buttons.current[i] = node;
              }}
              type="button"
              role="radio"
              aria-checked={i === index}
              aria-disabled={option.disabled || undefined}
              tabIndex={i === index ? 0 : -1}
              onClick={() => !option.disabled && select(option.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onPointerEnter={() => !option.disabled && setHovered(i)}
              className="mh-segmented__hit"
            >
              <span className="mh-segmented__sr">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
