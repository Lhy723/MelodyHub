// MelodyHub interior — drawer（已换肤）
// 来源：ddoemonn/interior components/interior/drawer.tsx
// 上游 commit 见 _vendor/SOURCE.txt；useDrawer hook 原样保留（含拖拽手势/吸附关闭、
// Escape 关闭、焦点陷阱 Tab/恢复焦点、panel inert、滚动锁、背景 inert、reduced-motion），
// 仅做：删 "use client"、删 Tailwind 改走 drawer.css（CSS Vars）、关闭图标改 lucide X。
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { X } from 'lucide-react';
import './drawer.css';

const DISCLOSE = {
  type: 'spring',
  stiffness: 150,
  damping: 27,
  mass: 1,
} as const;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Inertable = HTMLElement & { inert?: boolean };

type DragInfo = {
  offset: { x: number; y: number };
  velocity: { x: number; y: number };
};

export type DrawerSide = 'left' | 'right';

export type UseDrawerOptions = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: DrawerSide;
  width?: number;
  dismissRatio?: number;
  modal?: boolean;
};

export function useDrawer({
  open: controlled,
  defaultOpen = false,
  onOpenChange,
  side = 'right',
  width = 320,
  dismissRatio = 0.38,
  modal = true,
}: UseDrawerOptions = {}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const [dragging, setDragging] = useState(false);

  const open = controlled ?? uncontrolled;
  const sign = side === 'right' ? 1 : -1;
  const away = sign * (width + 24);

  const x = useMotionValue(open ? 0 : away);
  const veil = useTransform(x, (v) => 1 - Math.min(1, Math.abs(v) / width));

  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const anim = useRef<{ stop: () => void } | null>(null);
  const live = useRef(open);
  live.current = open;

  const changed = useRef(onOpenChange);
  changed.current = onOpenChange;

  const reduced = useReducedMotion();
  const controls = useDragControls();

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlled === undefined) setUncontrolled(next);
      changed.current?.(next);
    },
    [controlled],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  const glide = useCallback(
    (to: number) => {
      anim.current?.stop();
      anim.current = animate(x, to, reduced ? { duration: 0 } : DISCLOSE);
    },
    [x, reduced],
  );

  useEffect(() => {
    glide(open ? 0 : away);
    return () => anim.current?.stop();
  }, [open, away, glide]);

  useEffect(() => {
    const panel = panelRef.current as Inertable | null;
    if (!panel) return;
    panel.inert = !open;
    return () => {
      panel.inert = false;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const active = document.activeElement;
      returnTo.current = active instanceof HTMLElement ? active : null;
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
      return;
    }
    const target = returnTo.current;
    returnTo.current = null;
    if (target && target.isConnected) target.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!modal || !open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    const padding = root.style.paddingRight;
    const gutter = window.innerWidth - root.clientWidth;

    root.style.overflow = 'hidden';
    if (gutter > 0) root.style.paddingRight = `${gutter}px`;

    return () => {
      root.style.overflow = overflow;
      root.style.paddingRight = padding;
    };
  }, [modal, open]);

  useEffect(() => {
    const shell = rootRef.current;
    if (!modal || !open || !shell) return;
    const muted: Inertable[] = [];

    for (const node of Array.from(document.body.children)) {
      if (!(node instanceof HTMLElement) || node.contains(shell)) continue;
      const el = node as Inertable;
      if (el.inert) continue;
      el.inert = true;
      muted.push(el);
    }

    return () => {
      for (const el of muted) el.inert = false;
    };
  }, [modal, open]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [close],
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent) => {
      if (!live.current) return;
      controls.start(event);
    },
    [controls],
  );

  const onDragStart = useCallback(() => setDragging(true), []);

  const onDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: DragInfo) => {
      setDragging(false);
      const travel = sign * info.offset.x;
      const speed = sign * info.velocity.x;
      if (travel > width * dismissRatio || speed > 520) {
        close();
        return;
      }
      glide(0);
    },
    [sign, width, dismissRatio, glide, close],
  );

  const panelProps = {
    tabIndex: -1,
    role: 'dialog' as const,
    'aria-modal': modal,
    onKeyDown,
    drag: 'x' as const,
    dragControls: controls,
    dragListener: false,
    dragMomentum: false,
    dragConstraints: { left: 0, right: 0 },
    dragElastic:
      side === 'right'
        ? { top: 0, bottom: 0, left: 0, right: 1 }
        : { top: 0, bottom: 0, left: 1, right: 0 },
    onDragStart,
    onDragEnd,
  };

  return {
    open,
    side,
    width,
    dragging,
    x,
    veil,
    setOpen,
    close,
    rootRef,
    panelRef,
    panelProps,
    gripProps: { onPointerDown: startDrag },
  };
}

export type UseDrawerResult = ReturnType<typeof useDrawer>;

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  side?: DrawerSide;
  width?: number;
  container?: 'viewport' | 'parent';
  closeLabel?: string;
  dismissOnScrimClick?: boolean;
  className?: string;
};

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  description,
  footer,
  side = 'right',
  width = 320,
  container = 'viewport',
  closeLabel = 'Close panel',
  dismissOnScrimClick = true,
  className = '',
}: DrawerProps) {
  const titleId = useId();
  const hintId = useId();

  const drawer = useDrawer({
    open,
    onOpenChange,
    side,
    width,
    modal: container === 'viewport',
  });

  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(container === 'viewport' ? document.body : null);
  }, [container]);

  const tree = (
    <div
      ref={drawer.rootRef}
      data-container={container}
      data-side={side}
      data-open={open ? 'true' : 'false'}
      className="mh-drawer__root"
    >
      <motion.div
        aria-hidden
        style={{ opacity: drawer.veil }}
        onClick={dismissOnScrimClick ? drawer.close : undefined}
        className="mh-drawer__scrim"
      />
      <motion.div
        ref={drawer.panelRef}
        aria-labelledby={titleId}
        aria-describedby={hintId}
        style={{ x: drawer.x, width, maxWidth: 'calc(100% - 40px)', touchAction: 'pan-y' }}
        data-side={side}
        data-dragging={drawer.dragging ? 'true' : 'false'}
        className={`mh-drawer__panel ${className}`}
        {...drawer.panelProps}
      >
        <header
          onPointerDown={drawer.gripProps.onPointerDown}
          data-dragging={drawer.dragging ? 'true' : 'false'}
          className="mh-drawer__header"
        >
          <div className="mh-drawer__titles">
            <h2 id={titleId} className="mh-drawer__title">
              {title}
            </h2>
            {description ? <p className="mh-drawer__description">{description}</p> : null}
          </div>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={drawer.close}
            aria-label={closeLabel}
            className="mh-drawer__close"
          >
            <X size={13} />
          </button>
        </header>
        <div className="mh-drawer__body">{children}</div>

        {footer ? <div className="mh-drawer__footer">{footer}</div> : null}

        <span id={hintId} className="mh-drawer__hint">
          Press Escape to close this panel, or drag its handle toward the edge.
        </span>
      </motion.div>
    </div>
  );

  if (container !== 'viewport') return tree;
  return host ? createPortal(tree, host) : null;
}
