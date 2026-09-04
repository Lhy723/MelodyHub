// MelodyHub interior — new-items-pill（已换肤）
// 来源：ddoemonn/interior components/interior/new-items-pill.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useNewItems 新条目提示/点击滚动/reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 new-items-pill.css（CSS Vars）、内联 svg 换 lucide-react ArrowUp。
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import './new-items-pill.css';

const EASE = [0.23, 1, 0.32, 1] as const;

const ARRIVE = { type: 'spring', stiffness: 540, damping: 34, mass: 0.5 } as const;
const INSTANT = { duration: 0 } as const;

const useIsoLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type NewItemsAnchor = 'top' | 'bottom';

export type UseNewItemsOptions = {
  itemCount: number;
  anchor?: NewItemsAnchor;
  threshold?: number;
};

export type UseNewItemsResult<T extends HTMLElement> = {
  scrollProps: {
    ref: RefObject<T | null>;
    tabIndex: number;
    style: CSSProperties;
  };
  unread: number;
  pinned: boolean;
  jump: () => number;
};

export function useNewItems<T extends HTMLElement = HTMLDivElement>({
  itemCount,
  anchor = 'top',
  threshold = 24,
}: UseNewItemsOptions): UseNewItemsResult<T> {
  const ref = useRef<T | null>(null);
  const pinnedRef = useRef(true);
  const prevCount = useRef(itemCount);
  const bottomGap = useRef(0);

  const [unread, setUnread] = useState(0);
  const [pinned, setPinned] = useState(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const read = () =>
      anchor === 'bottom'
        ? el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
        : el.scrollTop <= threshold;

    const onScroll = () => {
      bottomGap.current = el.scrollHeight - el.scrollTop;
      const next = read();
      if (next === pinnedRef.current) return;
      pinnedRef.current = next;
      setPinned(next);
      if (next) setUnread(0);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [anchor, threshold]);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    const added = itemCount - prevCount.current;
    prevCount.current = itemCount;
    if (!el || added <= 0) return;

    if (pinnedRef.current) {
      el.scrollTop = anchor === 'bottom' ? el.scrollHeight : 0;
      bottomGap.current = el.scrollHeight - el.scrollTop;
      return;
    }

    if (anchor === 'top') {
      const target = el.scrollHeight - bottomGap.current;
      if (target > el.scrollTop) el.scrollTop = target;
    }
    setUnread((n) => n + added);
  }, [itemCount, anchor]);

  const unreadRef = useRef(0);
  unreadRef.current = unread;

  const jump = useCallback(() => {
    const el = ref.current;
    const caught = unreadRef.current;
    if (!el) return caught;
    pinnedRef.current = true;
    setPinned(true);
    setUnread(0);

    el.focus({ preventScroll: true });
    el.scrollTo({
      top: anchor === 'bottom' ? el.scrollHeight : 0,
      behavior: reduced ? 'auto' : 'smooth',
    });
    return caught;
  }, [anchor, reduced]);

  return {
    scrollProps: { ref, tabIndex: 0, style: { overflowAnchor: 'none' } },
    unread,
    pinned,
    jump,
  };
}

export type NewItemsPillProps = {
  count: number;
  onJump: () => void;
  anchor?: NewItemsAnchor;
  label?: (count: number) => string;
  max?: number;
  className?: string;
};

const defaultLabel = (n: number) => `${n} new ${n === 1 ? 'item' : 'items'}`;

export function NewItemsPill({
  count,
  onJump,
  anchor = 'top',
  label = defaultLabel,
  max = 99,
  className = '',
}: NewItemsPillProps) {
  const reduced = useReducedMotion();
  const [announced, setAnnounced] = useState(0);

  useEffect(() => {
    if (count === 0) {
      setAnnounced(0);
      return;
    }
    const t = setTimeout(() => setAnnounced(count), 700);
    return () => clearTimeout(t);
  }, [count]);

  const phrase = (n: number) => (n > max ? `${max}+ new items` : label(n));
  const text = phrase(count);
  const off = anchor === 'bottom' ? 10 : -10;

  return (
    <div
      className={`mh-new-items-pill ${anchor === 'bottom' ? 'mh-new-items-pill--bottom' : 'mh-new-items-pill--top'} ${className}`}
    >
      <AnimatePresence initial={false}>
        {count > 0 && (
          <motion.button
            type="button"
            onClick={onJump}
            aria-label={text}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: off }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduced
                ? { opacity: 0, transition: INSTANT }
                : {
                    opacity: 0,
                    scale: 0.96,
                    y: off * 0.5,
                    transition: { duration: 0.16, ease: EASE },
                  }
            }
            transition={
              reduced
                ? INSTANT
                : { ...ARRIVE, opacity: { duration: 0.16, ease: EASE } }
            }
            className="mh-new-items-pill__button"
          >
            <ArrowUp
              size={14}
              aria-hidden="true"
              className={
                anchor === 'bottom' ? 'mh-new-items-pill__icon mh-new-items-pill__icon--flip' : 'mh-new-items-pill__icon'
              }
            />
            <span className="mh-new-items-pill__text" aria-hidden="true">
              {text}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
      <span role="status" aria-live="polite" className="mh-new-items-pill__sr">
        {announced > 0 ? phrase(announced) : ''}
      </span>
    </div>
  );
}
