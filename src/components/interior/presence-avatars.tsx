// 上游来源: ddoemonn/interior · commit 52988dcc82c9ef2c21bc6b288207a2b850f9b318 (2026-09-02)
// MelodyHub 换肤: 删 "use client"；Tailwind → CSS Vars + presence-avatars.css；
// motion/react 保持不变；toSorted 改 ES2020 切片 sort；useIsomorphicLayoutEffect 本地定义。
// 扩展(供应商模型叠堆用): PresencePerson.sigil / .accent；describe 可注入(默认上游英文播报)。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './presence-avatars.css';

const SLOT = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const FADE = { duration: 0.24, ease: [0.23, 1, 0.32, 1] } as const;
const INSTANT = { duration: 0 } as const;

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type PresencePerson = {
  id: string;
  name: string;
  src?: string;
  /** 显式双字符缩写(如模型 "G4")，缺省走姓名首字母。 */
  sigil?: string;
  /** 头像底色(任意 CSS 颜色)，缺省中性底。 */
  accent?: string;
};

export type UsePresenceOptions = {
  people: PresencePerson[];
  max?: number;
  announceAfter?: number;
  describe?: (names: string[]) => string;
};

export type UsePresenceResult = {
  ordered: PresencePerson[];
  visible: PresencePerson[];
  hidden: PresencePerson[];
  overflow: number;
  total: number;
  summary: string;
  announcement: string;
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function defaultDescribe(names: string[]): string {
  if (names.length === 0) return 'Nobody here';
  if (names.length === 1) return `${names[0]} is here`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are here`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'} are here`;
}

export function usePresence({
  people,
  max = 5,
  announceAfter = 900,
  describe = defaultDescribe,
}: UsePresenceOptions): UsePresenceResult {
  const seen = useRef(new Map<string, number>());
  const next = useRef(0);

  const ordered = useMemo(() => {
    const order = seen.current;
    for (const person of people) {
      if (!order.has(person.id)) {
        order.set(person.id, next.current);
        next.current += 1;
      }
    }
    return people
      .slice()
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }, [people]);

  const slots = Math.max(1, max);
  const visible = ordered.slice(0, slots);
  const hidden = ordered.slice(slots);
  const summary = describe(ordered.map((person) => person.name));

  const [announcement, setAnnouncement] = useState(summary);

  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(summary), announceAfter);
    return () => clearTimeout(timer);
  }, [summary, announceAfter]);

  return {
    ordered,
    visible,
    hidden,
    overflow: hidden.length,
    total: ordered.length,
    summary,
    announcement,
  };
}

type FaceStatus = 'loading' | 'ready' | 'error';

function useFace(src?: string) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<{ status: FaceStatus; instant: boolean }>({
    status: 'loading',
    instant: false,
  });

  useIsomorphicLayoutEffect(() => {
    const img = ref.current;

    const set = (status: FaceStatus, instant: boolean) =>
      setState((prev) =>
        prev.status === status && prev.instant === instant
          ? prev
          : { status, instant },
      );

    if (!img || !src) {
      set('loading', false);
      return;
    }

    const cached = img.complete && img.naturalWidth > 0;
    if (img.complete) {
      set(cached ? 'ready' : 'error', cached);
      return;
    }

    set('loading', false);

    let alive = true;
    const onLoad = () => {
      if (alive) set('ready', false);
    };
    const onError = () => {
      if (alive) set('error', false);
    };

    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);

    return () => {
      alive = false;
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
    };
  }, [src]);

  return { ref, status: state.status, instant: state.instant };
}

type TileProps = {
  person: PresencePerson;
  index: number;
  step: number;
  size: number;
  zIndex: number;
  reduced: boolean;
};

function PresenceTile({ person, index, step, size, zIndex, reduced }: TileProps) {
  const { ref, status, instant } = useFace(person.src);

  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0, scale: 0.86, x: index * step }}
      animate={{ opacity: 1, scale: 1, x: index * step }}
      exit={{ opacity: 0, scale: 0.86 }}
      transition={reduced ? INSTANT : SLOT}
      title={person.name}
      style={{ width: size, height: size, zIndex, fontSize: Math.round(size * 0.34) }}
      className="mh-presence__tile"
    >
      <span
        className="mh-presence__well"
        style={person.accent ? { background: person.accent, color: '#fff' } : undefined}
      >
        {person.sigil ?? initials(person.name)}

        {person.src ? (
          <motion.img
            ref={ref}
            src={person.src}
            alt=""
            width={size}
            height={size}
            decoding="async"
            initial={false}
            animate={{ opacity: status === 'ready' ? 1 : 0 }}
            transition={reduced || instant ? INSTANT : FADE}
            className="mh-presence__face"
          />
        ) : null}
      </span>
    </motion.span>
  );
}

export type PresenceAvatarsProps = {
  people: PresencePerson[];
  max?: number;
  size?: number;
  overlap?: number;
  label?: string;
  announceAfter?: number;
  describe?: (names: string[]) => string;
  onOverflowSelect?: (hidden: PresencePerson[]) => void;
  className?: string;
};

export function PresenceAvatars({
  people,
  max = 5,
  size = 28,
  overlap = 9,
  label = 'People here',
  announceAfter,
  describe,
  onOverflowSelect,
  className = '',
}: PresenceAvatarsProps) {
  const reduced = useReducedMotion();
  const { ordered, visible, hidden, overflow, announcement } = usePresence({
    people,
    max,
    announceAfter,
    describe,
  });

  const slots = Math.max(1, max);
  const step = size - overlap;
  const chip = size + 8;

  const rail =
    visible.length === 0
      ? 0
      : overflow > 0
        ? visible.length * step + chip
        : (visible.length - 1) * step + size;

  const chipCount = `+${Math.min(overflow, 99)}`;
  const chipMotion = {
    initial: { opacity: 0, scale: 0.86 },
    animate: { opacity: 1, scale: 1, x: visible.length * step },
    exit: { opacity: 0, scale: 0.86 },
    transition: reduced ? INSTANT : SLOT,
  };

  return (
    <div role="group" aria-label={label} className={`mh-presence ${className}`}>
      <motion.div
        className="mh-presence__rail"
        style={{ height: size }}
        initial={false}
        animate={{ width: rail }}
        transition={reduced ? INSTANT : SLOT}
      >
        <AnimatePresence initial={false}>
          {visible.map((person, i) => (
            <PresenceTile
              key={person.id}
              person={person}
              index={i}
              step={step}
              size={size}
              zIndex={slots - i}
              reduced={Boolean(reduced)}
            />
          ))}

          {overflow > 0 &&
            (onOverflowSelect ? (
              <motion.button
                key="overflow"
                type="button"
                onClick={() => onOverflowSelect(hidden)}
                aria-label={`Show ${overflow} more`}
                title={hidden.map((p) => p.name).join('\n')}
                style={{ width: chip, height: size, zIndex: 0 }}
                className="mh-presence__chip mh-presence__chip--button"
                {...chipMotion}
              >
                <span aria-hidden>{chipCount}</span>
              </motion.button>
            ) : (
              <motion.span
                key="overflow"
                aria-hidden
                title={hidden.map((p) => p.name).join('\n')}
                style={{ width: chip, height: size, zIndex: 0 }}
                className="mh-presence__chip"
                {...chipMotion}
              >
                {chipCount}
              </motion.span>
            ))}
        </AnimatePresence>
      </motion.div>
      <ul className="mh-presence__sr">
        {ordered.map((person) => (
          <li key={person.id}>{person.name}</li>
        ))}
      </ul>
      <span role="status" aria-live="polite" aria-atomic="true" className="mh-presence__sr">
        {announcement}
      </span>
    </div>
  );
}
