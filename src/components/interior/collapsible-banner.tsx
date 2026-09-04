// MelodyHub interior — collapsible-banner（已换肤）
// 来源：ddoemonn/interior components/interior/collapsible-banner.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useCollapsibleBanner 受控/非受控折叠+关闭、
// 高度/透明度 disclose 动画、Escape 折叠、reduced-motion 瞬时过渡、关闭后 live-region 通告）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 collapsible-banner.css（CSS Vars）、
// phosphor 风格内联 svg（NOTICE_GLYPH / CARET_DOWN / CLOSE）换成 lucide-react（Info / ChevronDown / X）。
import { useCallback, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Info, X } from 'lucide-react';
import './collapsible-banner.css';

const EASE = [0.23, 1, 0.32, 1] as const;
const DISCLOSE = { type: 'spring', stiffness: 190, damping: 30, mass: 1 } as const;
const NUDGE = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;
const INSTANT = { duration: 0 } as const;

export type BannerState = 'open' | 'folded' | 'dismissed';

export type UseCollapsibleBannerOptions = {
  state?: BannerState;
  defaultState?: BannerState;
  onStateChange?: (state: BannerState) => void;
  onDismiss?: () => void;
};

export type UseCollapsibleBannerResult = {
  state: BannerState;
  open: boolean;
  folded: boolean;
  dismissed: boolean;
  fold: () => void;
  expand: () => void;
  toggle: () => void;
  dismiss: () => void;
  restore: () => void;
};

export function useCollapsibleBanner({
  state: controlled,
  defaultState = 'open',
  onStateChange,
  onDismiss,
}: UseCollapsibleBannerOptions = {}): UseCollapsibleBannerResult {
  const [uncontrolled, setUncontrolled] = useState<BannerState>(defaultState);
  const state = controlled ?? uncontrolled;

  const changed = useRef(onStateChange);
  changed.current = onStateChange;
  const closed = useRef(onDismiss);
  closed.current = onDismiss;

  const commit = useCallback((next: BannerState) => {
    setUncontrolled(next);
    changed.current?.(next);
  }, []);

  const fold = useCallback(() => commit('folded'), [commit]);
  const expand = useCallback(() => commit('open'), [commit]);
  const restore = useCallback(() => commit('open'), [commit]);

  const toggle = useCallback(() => commit(state === 'open' ? 'folded' : 'open'), [commit, state]);

  const dismiss = useCallback(() => {
    commit('dismissed');
    closed.current?.();
  }, [commit]);

  return {
    state,
    open: state === 'open',
    folded: state === 'folded',
    dismissed: state === 'dismissed',
    fold,
    expand,
    toggle,
    dismiss,
    restore,
  };
}

export type CollapsibleBannerProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;

  dismissible?: boolean;
  state?: BannerState;
  defaultState?: BannerState;
  onStateChange?: (state: BannerState) => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  dismissedMessage?: string;
  className?: string;
};

export function CollapsibleBanner({
  title,
  description,
  children,
  action,
  icon,
  dismissible = true,
  state: controlled,
  defaultState = 'open',
  onStateChange,
  onDismiss,
  dismissLabel = 'Dismiss notice',
  dismissedMessage = 'Notice dismissed.',
  className = '',
}: CollapsibleBannerProps) {
  const reduced = useReducedMotion();
  const uid = useId();
  const bodyId = `${uid}-body`;
  const titleId = `${uid}-title`;

  const { state, open, dismissed, toggle, fold, dismiss } = useCollapsibleBanner({
    state: controlled,
    defaultState,
    onStateChange,
    onDismiss,
  });

  const hasBody = Boolean(description || children || action);

  const disclose = reduced
    ? INSTANT
    : {
        height: DISCLOSE,
        opacity: { duration: 0.14, ease: EASE, delay: open ? 0.05 : 0 },
        y: DISCLOSE,
      };

  return (
    <>
      <motion.div
        initial={false}
        animate={{ height: dismissed ? 0 : 'auto', opacity: dismissed ? 0 : 1 }}
        transition={reduced ? INSTANT : { height: DISCLOSE, opacity: { duration: 0.14, ease: EASE } }}
        style={{ overflow: 'hidden' }}
        className={`mh-collapsible-banner ${className}`}
      >
        <div role="region" aria-labelledby={titleId} className="mh-collapsible-banner__card">
          <div className="mh-collapsible-banner__header">
            <span aria-hidden="true" className="mh-collapsible-banner__icon">
              {icon ?? <Info size={16} aria-hidden="true" />}
            </span>

            {hasBody ? (
              <button
                type="button"
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape' || !open) return;
                  e.stopPropagation();
                  fold();
                }}
                aria-expanded={open}
                aria-controls={bodyId}
                className="mh-collapsible-banner__toggle"
              >
                <span id={titleId} className="mh-collapsible-banner__title">
                  {title}
                </span>
                <motion.span
                  aria-hidden="true"
                  className="mh-collapsible-banner__caret"
                  initial={false}
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={reduced ? INSTANT : NUDGE}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                </motion.span>
              </button>
            ) : (
              <span id={titleId} className="mh-collapsible-banner__title">
                {title}
              </span>
            )}

            {dismissible ? (
              <button
                type="button"
                onClick={dismiss}
                aria-label={dismissLabel}
                className="mh-collapsible-banner__dismiss"
              >
                <X size={13} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {hasBody ? (
            <motion.div
              id={bodyId}
              inert={!open}
              initial={false}
              animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
              transition={disclose}
              style={{ overflow: 'hidden' }}
              className="mh-collapsible-banner__body"
            >
              <motion.div
                initial={false}
                animate={{ y: open ? 0 : -6 }}
                transition={reduced ? INSTANT : DISCLOSE}
                className="mh-collapsible-banner__body-inner"
              >
                {description ? <p className="mh-collapsible-banner__description">{description}</p> : null}

                {children}

                {action ? <div className="mh-collapsible-banner__action">{action}</div> : null}
              </motion.div>
            </motion.div>
          ) : null}
        </div>
      </motion.div>
      <span role="status" aria-live="polite" className="mh-collapsible-banner__sr">
        {state === 'dismissed' ? dismissedMessage : ''}
      </span>
    </>
  );
}
