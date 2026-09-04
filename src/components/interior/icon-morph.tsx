// MelodyHub interior — icon-morph（已换肤）
// 来源：ddoemonn/interior components/interior/icon-morph.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useIconMorph 路径变形 + 旋转 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 icon-morph.css（CSS Vars）。
// 图标说明：保留内联 svg + motion.path 变形载体（d 属性插值做图标变形，lucide-react 为静态路径无法替代），
// 颜色已走 currentColor，随 CSS Vars 换肤。
import { useCallback, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Transition } from 'motion/react';
import './icon-morph.css';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

const NUMBER = /-?\d*\.?\d+/g;
const CENTER = '12';

export type MorphShape = {
  d: readonly string[];
  rotate?: number;
};

export type IconMorphMode = 'stroke' | 'fill';

export type IconMorphPreset =
  | 'menu-close'
  | 'play-pause'
  | 'plus-minus'
  | 'check-close'
  | 'chevron'
  | 'eye'
  | 'power'
  | 'copy-check'
  | 'plus-check';

export type IconMorphSlot = {
  key: number;
  d: string;
  visible: boolean;
};

export type IconMorphSemantics = 'label' | 'pressed' | 'expanded';

export const iconMorphPresets: Record<
  IconMorphPreset,
  { mode: IconMorphMode; labels: readonly string[]; shapes: readonly MorphShape[] }
> = {
  'menu-close': {
    mode: 'stroke',
    labels: ['Menu', 'Close'],
    shapes: [
      {
        rotate: 0,
        d: ['M 4 7 L 20 7', 'M 4 12 L 20 12', 'M 4 17 L 20 17'],
      },
      {
        rotate: 90,
        d: ['M 6.5 6.5 L 17.5 17.5', 'M 12 12 L 12 12', 'M 6.5 17.5 L 17.5 6.5'],
      },
    ],
  },
  'play-pause': {
    mode: 'fill',
    labels: ['Play', 'Pause'],
    shapes: [
      {
        d: ['M 8 5 L 14 8.5 L 14 15.5 L 8 19 Z', 'M 14 8.5 L 20 12 L 20 12 L 14 15.5 Z'],
      },
      {
        d: ['M 8 5 L 11.5 5 L 11.5 19 L 8 19 Z', 'M 15 5 L 18.5 5 L 18.5 19 L 15 19 Z'],
      },
    ],
  },
  'plus-minus': {
    mode: 'stroke',
    labels: ['Add', 'Remove'],
    shapes: [
      { rotate: 0, d: ['M 5 12 L 19 12', 'M 12 5 L 12 19'] },
      { rotate: 180, d: ['M 5 12 L 19 12', 'M 5 12 L 19 12'] },
    ],
  },
  'check-close': {
    mode: 'stroke',
    labels: ['Confirm', 'Cancel'],
    shapes: [
      { d: ['M 5 12.5 L 10 17.5 L 19.5 7', 'M 12 12 L 12 12 L 12 12'] },
      { d: ['M 6.5 6.5 L 12 12 L 17.5 17.5', 'M 17.5 6.5 L 12 12 L 6.5 17.5'] },
    ],
  },
  // ── MelodyHub 新增：页面内的双图标切换统一走路径变形 ──
  // 约定：同 slot 两帧的数字个数必须相等（motion 才能插值 d）；收拢帧把全部数字写 12，
  // isCollapsed 会识别为单点并淡出。缺省的末尾 slot 由 normalize 自动收拢，无需手写。
  'chevron': {
    mode: 'stroke',
    labels: ['Collapsed', 'Expanded'],
    shapes: [
      { rotate: 0, d: ['M 9 6 L 15 12 L 9 18'] },
      { rotate: 90, d: ['M 9 6 L 15 12 L 9 18'] },
    ],
  },
  'eye': {
    mode: 'stroke',
    labels: ['Visible', 'Hidden'],
    shapes: [
      {
        d: [
          'M 2 12 s 3 -7 10 -7 10 7 10 7 -3 7 -10 7 -10 -7 -10 -7 Z',
          'M 9 12 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0',
        ],
      },
      {
        d: [
          'M 2 12 s 3 -7 10 -7 10 7 10 7 -3 7 -10 7 -10 -7 -10 -7 Z',
          'M 12 12 a 12 12 12 12 12 12 12 a 12 12 12 12 12 12 12',
          'M 2 2 l 20 20',
        ],
      },
    ],
  },
  'power': {
    mode: 'stroke',
    labels: ['On', 'Off'],
    shapes: [
      {
        d: ['M 12 2 L 12 12', 'M 18.36 6.64 A 9 9 0 1 1 5.64 6.64'],
      },
      {
        d: ['M 12 2 L 12 12', 'M 18.36 6.64 A 9 9 0 1 1 5.64 6.64', 'M 4 4 L 20 20'],
      },
    ],
  },
  'copy-check': {
    mode: 'stroke',
    labels: ['Copy', 'Copied'],
    shapes: [
      {
        d: [
          'M 8 8 h 14 v 14 H 8 Z',
          'M 4 16 c -1.1 0 -2 -0.9 -2 -2 V 4 c 0 -1.1 0.9 -2 2 -2 h 10 c 1.1 0 2 0.9 2 2',
        ],
      },
      {
        d: [
          'M 12 12 h 12 v 12 H 12 Z',
          'M 12 12 c 12 12 12 12 12 12 V 12 c 12 12 12 12 12 12 h 12 c 12 12 12 12 12 12',
          'M 4.5 12.5 L 10 18 L 19.5 6.5',
        ],
      },
    ],
  },
  'plus-check': {
    mode: 'stroke',
    labels: ['Add', 'Added'],
    shapes: [
      {
        d: ['M 5 12 L 19 12', 'M 12 5 L 12 19', 'M 12 12 L 12 12 L 12 12'],
      },
      {
        d: ['M 12 12 L 12 12', 'M 12 12 L 12 12', 'M 4.5 12.5 L 10 18 L 19.5 6.5'],
      },
    ],
  },
};

// 无头渲染：调用方保留自己的按钮铬，只把图标区换成路径变形（含旋转包装，与 IconMorph 同构）。
export function MorphGlyph({
  slots,
  rotate,
  transition,
  mode,
  size = 16,
  strokeWidth = 2,
}: {
  slots: IconMorphSlot[];
  rotate: number;
  transition: Transition;
  mode: IconMorphMode;
  size?: number;
  strokeWidth?: number;
}) {
  const stroked = mode === 'stroke';
  return (
    <motion.span
      aria-hidden="true"
      initial={false}
      animate={{ rotate }}
      transition={transition}
      style={{ display: 'flex', width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        focusable="false"
        fill={stroked ? 'none' : 'currentColor'}
        stroke={stroked ? 'currentColor' : 'none'}
        strokeWidth={stroked ? strokeWidth : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block' }}
      >
        {slots.map((slot) => (
          <motion.path
            key={slot.key}
            initial={false}
            animate={{ d: slot.d, opacity: slot.visible ? 1 : 0 }}
            transition={transition}
          />
        ))}
      </svg>
    </motion.span>
  );
}

function isCollapsed(d: string): boolean {
  const nums = d.match(NUMBER);
  if (!nums || nums.length < 4) return false;
  return nums.every((n, i) => n === nums[i % 2]);
}

function normalize(shapes: readonly MorphShape[]): IconMorphSlot[][] {
  const slots = shapes.reduce((most, s) => Math.max(most, s.d.length), 0);

  return shapes.map((shape) =>
    Array.from({ length: slots }, (_, i) => {
      const own = shape.d[i];
      const sibling = shapes.find((s) => s.d[i] !== undefined)?.d[i] ?? '';
      const d = own ?? sibling.replace(NUMBER, CENTER);
      return { key: i, d, visible: !isCollapsed(d) };
    }),
  );
}

function toIndex(value: number | boolean): number {
  return typeof value === 'boolean' ? (value ? 1 : 0) : Math.trunc(value);
}

export type UseIconMorphOptions = {
  preset?: IconMorphPreset;
  shapes?: readonly MorphShape[];
  mode?: IconMorphMode;
  labels?: readonly string[];
  active?: number | boolean;
  defaultActive?: number | boolean;
  onActiveChange?: (index: number) => void;
};

export function useIconMorph({
  preset = 'menu-close',
  shapes,
  mode,
  labels,
  active,
  defaultActive = 0,
  onActiveChange,
}: UseIconMorphOptions = {}) {
  const base = iconMorphPresets[preset];
  const source = shapes ?? base.shapes;
  const names = labels ?? base.labels;
  const count = source.length;

  const [internal, setInternal] = useState(() => toIndex(defaultActive));
  const reduced = useReducedMotion();

  const raw = active === undefined ? internal : toIndex(active);
  const index = count === 0 ? 0 : Math.min(Math.max(raw, 0), count - 1);

  const frames = useMemo(() => normalize(source), [source]);

  const setIndex = useCallback(
    (next: number) => {
      if (count === 0) return;
      const wrapped = ((next % count) + count) % count;
      if (active === undefined) setInternal(wrapped);
      onActiveChange?.(wrapped);
    },
    [active, count, onActiveChange],
  );

  const toggle = useCallback(() => setIndex(index + 1), [setIndex, index]);

  return {
    index,
    count,
    slots: frames[index] ?? [],
    rotate: source[index]?.rotate ?? 0,
    mode: mode ?? base.mode,
    label: names[index] ?? '',
    labels: names,
    transition: reduced ? INSTANT : CELL,
    labelTransition: reduced ? INSTANT : CROSSFADE,
    setIndex,
    toggle,
  };
}

export type IconMorphProps = UseIconMorphOptions & {
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  semantics?: IconMorphSemantics;
  disabled?: boolean;
  className?: string;
};

export function IconMorph({
  size = 20,
  strokeWidth = 1.75,
  showLabel = false,
  semantics = 'label',
  disabled = false,
  className = '',
  ...options
}: IconMorphProps) {
  const { index, slots, rotate, mode, label, labels, transition, labelTransition, toggle } =
    useIconMorph(options);

  const stroked = mode === 'stroke';

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={toggle}
      aria-label={label}
      aria-pressed={semantics === 'pressed' ? index === 1 : undefined}
      aria-expanded={semantics === 'expanded' ? index === 1 : undefined}
      whileTap={disabled ? undefined : { y: 1 }}
      transition={transition}
      className={`mh-icon-morph${showLabel ? ' mh-icon-morph--with-label' : ''} ${className}`}
      style={{ touchAction: 'manipulation' }}
    >
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ rotate }}
        transition={transition}
        className="mh-icon-morph__icon"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          focusable="false"
          fill={stroked ? 'none' : 'currentColor'}
          stroke={stroked ? 'currentColor' : 'none'}
          strokeWidth={stroked ? strokeWidth : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: 'block' }}
        >
          {slots.map((slot) => (
            <motion.path
              key={slot.key}
              initial={false}
              animate={{ d: slot.d, opacity: slot.visible ? 1 : 0 }}
              transition={transition}
            />
          ))}
        </svg>
      </motion.span>

      {showLabel && (
        <span aria-hidden="true" className="mh-icon-morph__labels">
          {labels.map((text, i) => (
            <motion.span
              key={i}
              initial={false}
              animate={{
                opacity: i === index ? 1 : 0,
                y: i === index ? 0 : i < index ? -3 : 3,
              }}
              transition={labelTransition}
              className="mh-icon-morph__label"
            >
              {text}
            </motion.span>
          ))}
        </span>
      )}
    </motion.button>
  );
}
