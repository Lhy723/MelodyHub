import React from 'react';
import './chip.css';

// 页面级共享 chip：AddProvider/ProviderModelsTab 远端模型、QuickAddPanel 目标、
// ProviderCard/ModelDetailPage 能力标签统一走这里，形态对齐 filter-grid chip。
export type ChipProps = {
  children?: React.ReactNode;
  /** 选中态：--bg-brand-popup 底 + 品牌文本 */
  selected?: boolean;
  /** 弱化态：--bg-overlay-l1 底 + tertiary 文本（已加入 / 只读标签） */
  muted?: boolean;
  /** md=28px（默认），sm=22px（能力标签等紧凑场景） */
  size?: 'md' | 'sm';
  /** 虚线边框（远端模型“点击加入”暗示） */
  dashed?: boolean;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  'aria-pressed'?: boolean;
};

export const Chip: React.FC<ChipProps> = ({
  children,
  selected = false,
  muted = false,
  size = 'md',
  dashed = false,
  onClick,
  disabled,
  title,
  className = '',
  style,
  'aria-pressed': ariaPressed,
}) => {
  const cls = [
    'mh-chip',
    selected ? 'mh-chip--on' : '',
    muted ? 'mh-chip--muted' : '',
    size === 'sm' ? 'mh-chip--sm' : '',
    dashed ? 'mh-chip--dashed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (onClick && !disabled) {
    return (
      <button type="button" className={cls} style={style} title={title} aria-pressed={ariaPressed} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <span className={cls} style={style} title={title}>
      {children}
    </span>
  );
};
