// MelodyHub interior — modal（已换肤）
// 来源：ddoemonn/interior components/interior/modal.tsx
// 上游 commit 见 _vendor/SOURCE.txt；useModal hook 原样保留（含滚动锁、inert 背景、焦点陷阱与恢复、多层栈、backdrop 判定），
// 仅做：删 "use client"、删 Tailwind 改走 modal.css（CSS Vars）、关闭图标改 lucide X、标题支持 danger 变体以便 ConfirmDialog 换底座。
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import './modal.css';

const EASE = [0.23, 1, 0.32, 1] as const;
const LEAVE = [0.4, 0, 1, 1] as const;
const SURFACE = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const;

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const FOCUSABLE = [
  'a[href]',
  "area[href]",
  'button:not([disabled])',
  "input:not([disabled]):not([type='hidden'])",
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'summary',
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(',');

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex !== -1 && !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0,
  );
}

let locks = 0;
let releaseLock: (() => void) | null = null;

function lockDocumentScroll() {
  locks += 1;
  if (locks > 1) return;
  const body = document.body;
  const gap = window.innerWidth - document.documentElement.clientWidth;
  const overflow = body.style.overflow;
  const paddingRight = body.style.paddingRight;
  const base = Number.parseFloat(window.getComputedStyle(body).paddingRight);
  body.style.overflow = 'hidden';
  if (gap > 0) {
    body.style.paddingRight = `${(Number.isFinite(base) ? base : 0) + gap}px`;
  }
  releaseLock = () => {
    body.style.overflow = overflow;
    body.style.paddingRight = paddingRight;
  };
}

function unlockDocumentScroll() {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  releaseLock?.();
  releaseLock = null;
}

const stack: object[] = [];

export type UseModalOptions = {
  open: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  lockScroll?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  container?: HTMLElement | null;
};

export type ModalOverlayProps = {
  ref: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (event: React.PointerEvent) => void;
  onClick: (event: React.MouseEvent) => void;
};

export type ModalPanelProps = {
  ref: React.RefObject<HTMLDivElement | null>;
  role: 'dialog';
  'aria-modal': true;
  'aria-labelledby': string;
  tabIndex: -1;
  onKeyDown: (event: React.KeyboardEvent) => void;
};

export type UseModalResult = {
  target: HTMLElement | null;
  titleId: string;
  descriptionId: string;
  overlayProps: ModalOverlayProps;
  panelProps: ModalPanelProps;
  close: () => void;
};

export function useModal({
  open,
  onClose,
  closeOnEscape = true,
  closeOnBackdrop = true,
  lockScroll = true,
  initialFocusRef,
  container,
}: UseModalOptions): UseModalResult {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const downedOutside = useRef(false);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const latest = useRef({ onClose, closeOnEscape, closeOnBackdrop, initialFocusRef });
  latest.current = { onClose, closeOnEscape, closeOnBackdrop, initialFocusRef };
  const close = useCallback(() => latest.current.onClose(), []);

  useEffect(() => {
    setTarget(container === undefined ? document.body : container);
  }, [container]);

  useIsomorphicLayoutEffect(() => {
    if (!open || !lockScroll) return;
    lockDocumentScroll();
    return () => unlockDocumentScroll();
  }, [open, lockScroll]);

  useEffect(() => {
    if (!open || !target) return;
    const overlay = overlayRef.current;
    const parent = overlay?.parentElement;
    if (!overlay || !parent) return;
    const changed: Array<[Element, string | null]> = [];
    for (const child of Array.from(parent.children)) {
      if (child === overlay) continue;
      changed.push([child, child.getAttribute('inert')]);
      child.setAttribute('inert', '');
    }
    return () => {
      for (const [child, previous] of changed) {
        if (previous === null) child.removeAttribute('inert');
        else child.setAttribute('inert', previous);
      }
    };
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const token = {};
    stack.push(token);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (stack[stack.length - 1] !== token) return;
      if (!latest.current.closeOnEscape) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = stack.indexOf(token);
      if (index > -1) stack.splice(index, 1);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    const onFocusIn = (event: FocusEvent) => {
      const panel = panelRef.current;
      const node = event.target as Node | null;
      if (!panel || !node || panel.contains(node)) return;
      panel.focus({ preventScroll: true });
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [open, target]);

  useEffect(() => {
    if (!open || !target) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const preferred = latest.current.initialFocusRef?.current;
    (preferred ?? focusableWithin(panel)[0] ?? panel).focus({ preventScroll: true });
    return () => {
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, target]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = focusableWithin(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    const panel = panelRef.current;
    downedOutside.current = !panel?.contains(event.target as Node);
  }, []);

  const onClick = useCallback((event: React.MouseEvent) => {
    const panel = panelRef.current;
    if (!latest.current.closeOnBackdrop) return;
    if (panel?.contains(event.target as Node)) return;
    if (!downedOutside.current) return;
    downedOutside.current = false;
    latest.current.onClose();
  }, []);

  return {
    target,
    titleId,
    descriptionId,
    overlayProps: { ref: overlayRef, onPointerDown, onClick },
    panelProps: { ref: panelRef, role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, tabIndex: -1, onKeyDown },
    close,
  };
}

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleVariant?: 'default' | 'danger';
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  showClose?: boolean;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  lockScroll?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  container?: HTMLElement | null;
  maxWidth?: number;
  maxHeight?: string;
  className?: string;
};

export function Modal({
  open,
  onClose,
  title,
  titleVariant = 'default',
  description,
  children,
  footer,
  closeLabel = '关闭对话框',
  showClose = true,
  closeOnEscape = true,
  closeOnBackdrop = true,
  lockScroll = true,
  initialFocusRef,
  container,
  maxWidth = 440,
  maxHeight = 'min(78vh, 620px)',
  className = '',
}: ModalProps) {
  const reduced = useReducedMotion();
  const { target, titleId, descriptionId, overlayProps, panelProps } = useModal({
    open,
    onClose,
    closeOnEscape,
    closeOnBackdrop,
    lockScroll,
    initialFocusRef,
    container,
  });

  const variants = useMemo(() => {
    if (reduced) {
      return {
        backdrop: {
          closed: { opacity: 0 },
          open: { opacity: 1, transition: { duration: 0 } },
          gone: { opacity: 0, transition: { duration: 0 } },
        },
        panel: {
          closed: { opacity: 0 },
          open: { opacity: 1, transition: { duration: 0 } },
          gone: { opacity: 0, transition: { duration: 0 } },
        },
      };
    }
    return {
      backdrop: {
        closed: { opacity: 0 },
        open: { opacity: 1, transition: { duration: 0.2, ease: EASE } },
        gone: { opacity: 0, transition: { duration: 0.15, ease: LEAVE } },
      },
      panel: {
        closed: { opacity: 0, scale: 0.96, y: 12 },
        open: { opacity: 1, scale: 1, y: 0, transition: { ...SURFACE, opacity: { duration: 0.16, ease: EASE } } },
        gone: { opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.15, ease: LEAVE } },
      },
    };
  }, [reduced]);

  if (!target) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div key="modal" {...overlayProps} initial="closed" animate="open" exit="gone" variants={{ closed: {}, open: {}, gone: {} }} className="mh-modal__overlay">
          <motion.div aria-hidden="true" variants={variants.backdrop} className="mh-modal__backdrop" />
          <motion.div
            {...panelProps}
            aria-describedby={description ? descriptionId : undefined}
            variants={variants.panel}
            style={{ maxWidth, maxHeight }}
            className={`mh-modal__panel ${className}`}
          >
            <div className="mh-modal__header">
              <div className="mh-modal__titles">
                <h2 id={titleId} className="mh-modal__title" data-variant={titleVariant}>
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mh-modal__description">
                    {description}
                  </p>
                ) : null}
              </div>
              {showClose ? (
                <button type="button" onClick={onClose} aria-label={closeLabel} className="mh-modal__close">
                  <X size={14} />
                </button>
              ) : null}
            </div>
            {children ? <div className="mh-modal__body">{children}</div> : null}
            {footer ? <div className="mh-modal__footer">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    target,
  );
}
