import type { CSSProperties, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';

/**
 * ApplicationSettings 共享设置行。
 * 行节奏对齐 Settings 页：padding var(--spacer-12) 0、minHeight 48。
 * `last` 控制末行去分隔线（默认每行都有发丝线）。
 */
export function SettingRow({
  label,
  hint,
  children,
  last = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--spacer-16)',
        minHeight: 48,
        padding: 'var(--spacer-12) 0',
        borderBottom: last ? 'none' : '1px solid var(--border-neutral-l1)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div
          style={{
            color: 'var(--text-secondary)',
            fontSize: 'var(--body-sm-font-size)',
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              marginTop: 4,
              color: 'var(--text-tertiary)',
              fontSize: 'var(--body-xs-font-size)',
              lineHeight: 1.45,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div style={{ flex: '0 1 380px', minWidth: 220, display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

/**
 * 折叠分组箭头：motion/react 弹簧旋转 + useReducedMotion 门控。
 * interior/accordion 的 CSS 是独立卡片形态（自带边框/底色/内边距），
 * 与设置页 Card 内的平铺分组结构不合用，故保留本地结构、只统一旋转动效。
 */
export function GroupChevron({ open, size = 14 }: { open: boolean; size?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      initial={false}
      animate={{ rotate: open ? 0 : -90 }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 40, mass: 0.6 }}
      style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--icon-tertiary)' }}
    >
      <ChevronDown size={size} />
    </motion.span>
  );
}

type StatusTone = 'error' | 'warning' | 'success';

const STATUS_TEXT: Record<StatusTone, string> = {
  error: 'var(--status-error-default)',
  warning: 'var(--status-warning-default)',
  success: 'var(--status-success-default)',
};

const STATUS_SURFACE: Record<StatusTone, string> = {
  error: 'var(--status-error-surface-l1)',
  warning: 'var(--status-warning-surface-l1)',
  success: 'var(--status-success-surface-l1)',
};

/**
 * 状态横幅：底色 --status-*-surface-l1、radius-8、文字 --status-*-default，间距走 token。
 * 外边距由调用方通过 style 传入。
 */
export function StatusBanner({
  tone = 'error',
  icon,
  children,
  style,
}: {
  tone?: StatusTone;
  icon?: React.ComponentType<{ size?: number; style?: CSSProperties }>;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const Icon = icon;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{
        padding: 'var(--spacer-8) var(--spacer-10)',
        borderRadius: 'var(--radius-8)',
        background: STATUS_SURFACE[tone],
        color: STATUS_TEXT[tone],
        fontSize: 'var(--body-sm-font-size)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacer-6)',
        ...style,
      }}
    >
      {Icon && <Icon size={14} style={{ flexShrink: 0 }} />}
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}
