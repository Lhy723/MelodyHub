// MelodyHub interior — wizard-steps（已换肤）
// 来源：ddoemonn/interior components/interior/wizard-steps.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useWizard 受控/非受控 + furthest 校验门控 + 方向动画 + reduced-motion + 键盘导航 + 焦点意图）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 wizard-steps.css（CSS Vars）、完成态内联 svg 换 lucide-react Check。
// MelodyHub 扩展：canNext（下一步禁用门控）、height="auto"（量面板自适应高）、bare（去卡片铬）、railNavigation（关轨道跳转）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import './wizard-steps.css';

const EASE = [0.23, 1, 0.32, 1] as const;
const EXIT_EASE = [0.4, 0, 1, 1] as const;

const RAIL = { type: 'spring', stiffness: 520, damping: 40, mass: 0.5 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

export type WizardDirection = 1 | -1;

export type UseWizardOptions = {
  total: number;
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number, direction: WizardDirection) => void;
  onComplete?: () => void;
};

export type UseWizardReturn = {
  index: number;
  direction: WizardDirection;
  furthest: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  back: () => void;
  goTo: (index: number) => void;
};

function clampIndex(value: number, total: number) {
  if (total < 1) return 0;
  return Math.max(0, Math.min(total - 1, Math.trunc(value)));
}

export function useWizard({
  total,
  index,
  defaultIndex = 0,
  onIndexChange,
  onComplete,
}: UseWizardOptions): UseWizardReturn {
  const [internal, setInternal] = useState(() => clampIndex(defaultIndex, total));
  const current = clampIndex(index ?? internal, total);

  const [seen, setSeen] = useState<{ index: number; direction: WizardDirection }>({
    index: current,
    direction: 1,
  });
  if (seen.index !== current) {
    setSeen({ index: current, direction: current > seen.index ? 1 : -1 });
  }

  const [furthest, setFurthest] = useState(current);
  if (furthest < current) setFurthest(current);

  const emit = useRef(onIndexChange);
  emit.current = onIndexChange;
  const finish = useRef(onComplete);
  finish.current = onComplete;

  const controlled = index !== undefined;

  const goTo = useCallback(
    (to: number) => {
      const target = clampIndex(to, total);
      if (target === current) return;
      const direction: WizardDirection = target > current ? 1 : -1;
      if (!controlled) setInternal(target);
      emit.current?.(target, direction);
    },
    [controlled, current, total],
  );

  const next = useCallback(() => {
    if (current >= total - 1) {
      finish.current?.();
      return;
    }
    goTo(current + 1);
  }, [current, goTo, total]);

  const back = useCallback(() => goTo(current - 1), [current, goTo]);

  return {
    index: current,
    direction: seen.direction,
    furthest: Math.min(furthest, Math.max(total - 1, 0)),
    total,
    isFirst: current === 0,
    isLast: current === total - 1,
    next,
    back,
    goTo,
  };
}

export type WizardStep = {
  id: string;
  label: string;
  content: ReactNode;
};

export type WizardStepsProps = {
  steps: WizardStep[];
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number, direction: WizardDirection) => void;
  onComplete?: () => void;

  complete?: boolean;
  /** MelodyHub 扩展：'auto' 时测量当前面板内容高度（ResizeObserver 跟随动态内容），长表单不再关进滚动盒。 */
  height?: number | 'auto';
  /** MelodyHub 扩展：下一步/完成按钮是否可点（如下一步校验 canProceed）。 */
  canNext?: boolean;
  /** MelodyHub 扩展：去掉视口的卡片铬（边框/底色/阴影/内边距），由调用方提供容器。 */
  bare?: boolean;
  /** MelodyHub 扩展：false 时轨道只做进度展示、不可点击跳转（前进只走下一步按钮，保证校验不被绕过）。 */
  railNavigation?: boolean;
  backLabel?: string;
  nextLabel?: string;
  finishLabel?: string;
  completeLabel?: string;
  completeHint?: string;
  label?: string;
  className?: string;
};

export function WizardSteps({
  steps,
  index,
  defaultIndex = 0,
  onIndexChange,
  onComplete,
  complete = false,
  height = 184,
  canNext = true,
  bare = false,
  railNavigation = true,
  backLabel = 'Back',
  nextLabel = 'Next',
  finishLabel = 'Finish',
  completeLabel = 'All set',
  completeHint = 'Step back to change anything',
  label = 'Steps',
  className = '',
}: WizardStepsProps) {
  const wizard = useWizard({
    total: steps.length,
    index,
    defaultIndex,
    onIndexChange,
    onComplete,
  });
  const reduced = useReducedMotion();

  const listRef = useRef<HTMLOListElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const intent = useRef<'list' | 'panel' | null>(null);

  const { index: at, direction, furthest, total, isFirst, isLast, next, back, goTo } = wizard;

  // 'auto' 高度：量当前进入面板的 scrollHeight（面板 absolute + overflow-y，rect 量出来是视口高，必须用 scroll）。
  const autoHeight = height === 'auto';
  const panelNode = useRef<HTMLDivElement | null>(null);
  const [autoH, setAutoH] = useState(0);
  useEffect(() => {
    if (!autoHeight) return;
    const el = panelNode.current;
    if (!el) return;
    const read = () => {
      const h = el.scrollHeight;
      setAutoH((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [at, autoHeight, complete]);

  useEffect(() => {
    const move = intent.current;
    intent.current = null;
    if (move === 'list') {
      listRef.current?.querySelector<HTMLButtonElement>('button[data-current="true"]')?.focus();
      return;
    }
    if (move === 'panel') viewportRef.current?.focus({ preventScroll: true });
  }, [at]);

  const variants = useMemo(
    () => ({
      enter: (d: WizardDirection) => (reduced ? { opacity: 0 } : { opacity: 0, x: d * 22 }),
      center: reduced ? { opacity: 1 } : { opacity: 1, x: 0 },
      exit: (d: WizardDirection) =>
        reduced
          ? { opacity: 0, transition: { duration: 0 } }
          : {
              opacity: 0,
              x: d * -22,
              transition: { duration: 0.14, ease: EXIT_EASE },
            },
    }),
    [reduced],
  );

  const panelTransition = reduced ? { duration: 0 } : CROSSFADE;

  const onStepKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    let target: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = at + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = at - 1;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = furthest;
    else return;
    e.preventDefault();
    target = Math.min(clampIndex(target, total), furthest);
    if (target === at) return;
    intent.current = 'list';
    goTo(target);
  };

  const step = steps[at];
  if (!step) return null;

  const position = `Step ${at + 1} of ${total}: ${step.label}`;

  return (
    <div className={`mh-wizard-steps${bare ? ' is-bare' : ''} ${className}`}>
      <p aria-live="polite" className="mh-wizard-steps__sr">
        {position}
      </p>
      <span aria-hidden className="mh-wizard-steps__title">
        {steps.map((s, i) => (
          <motion.span
            key={s.id}
            className="mh-wizard-steps__title-item"
            initial={false}
            animate={{ opacity: i === at ? 1 : 0 }}
            transition={reduced ? { duration: 0 } : CROSSFADE}
          >
            {s.label}
          </motion.span>
        ))}
      </span>
      <ol ref={listRef} aria-label={label} className="mh-wizard-steps__rail">
        {steps.map((s, i) => {
          const done = complete || i < at;
          const here = !complete && i === at;

          const tile = (
            <motion.span
              aria-hidden
              data-tone={done ? 'done' : here ? 'current' : 'idle'}
              className="mh-wizard-steps__tile"
              initial={false}
              animate={{ scale: here ? 1 : 0.92 }}
              transition={reduced ? { duration: 0 } : RAIL}
            >
              {done ? <Check aria-hidden="true" className="mh-wizard-steps__check" /> : i + 1}
            </motion.span>
          );

          return (
            <li key={s.id} className="mh-wizard-steps__node">
              {railNavigation && i <= furthest ? (
                <button
                  type="button"
                  data-current={here ? 'true' : undefined}
                  tabIndex={here ? 0 : -1}
                  aria-current={here ? 'step' : undefined}
                  aria-label={`Step ${i + 1} of ${total}: ${s.label}`}
                  onKeyDown={onStepKeyDown}
                  onClick={() => {
                    if (here) return;
                    intent.current = 'list';
                    goTo(i);
                  }}
                  className="mh-wizard-steps__step-btn"
                >
                  {tile}
                </button>
              ) : (
                <span className="mh-wizard-steps__locked">
                  <span className="mh-wizard-steps__sr">{`Step ${i + 1} of ${total}: ${s.label}`}</span>
                  {tile}
                </span>
              )}

              {i < total - 1 ? (
                <span aria-hidden className="mh-wizard-steps__link">
                  <motion.span
                    className="mh-wizard-steps__link-fill"
                    initial={false}
                    animate={{ scaleX: complete || i < at ? 1 : 0 }}
                    transition={reduced ? { duration: 0 } : RAIL}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div
        ref={viewportRef}
        tabIndex={-1}
        role="group"
        aria-label={position}
        style={autoHeight ? { height: autoH || 'auto' } : { height }}
        className="mh-wizard-steps__viewport"
      >
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={complete ? '__complete' : step.id}
            ref={panelNode}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={panelTransition}
            className="mh-wizard-steps__panel"
          >
            {complete ? (
              <div className="mh-wizard-steps__complete">
                <p className="mh-wizard-steps__complete-title">{completeLabel}</p>
                <p className="mh-wizard-steps__complete-hint">{completeHint}</p>
              </div>
            ) : (
              step.content
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mh-wizard-steps__footer">
        <AnimatePresence initial={false}>
          {isFirst ? null : (
            <motion.button
              key="back"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: reduced ? { duration: 0 } : { duration: 0.12, ease: EXIT_EASE },
              }}
              transition={reduced ? { duration: 0 } : { duration: 0.16, ease: EASE }}
              onClick={() => {
                intent.current = 'panel';
                back();
              }}
              className="mh-wizard-steps__back"
            >
              {backLabel}
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {complete ? null : (
            <motion.button
              key="advance"
              type="button"
              disabled={!canNext}
              aria-label={isLast ? finishLabel : nextLabel}
              onClick={() => {
                if (!isLast) intent.current = 'panel';
                next();
              }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: 0.96,
                transition: reduced ? { duration: 0 } : { duration: 0.14, ease: EXIT_EASE },
              }}
              transition={reduced ? { duration: 0 } : CROSSFADE}
              className="mh-wizard-steps__advance"
            >
              <span aria-hidden className="mh-wizard-steps__advance-sizer">
                {finishLabel.length > nextLabel.length ? finishLabel : nextLabel}
              </span>
              <motion.span
                aria-hidden
                className="mh-wizard-steps__advance-label"
                initial={false}
                animate={{ opacity: isLast ? 0 : 1 }}
                transition={reduced ? { duration: 0 } : CROSSFADE}
              >
                {nextLabel}
              </motion.span>
              <motion.span
                aria-hidden
                className="mh-wizard-steps__advance-label"
                initial={false}
                animate={{ opacity: isLast ? 1 : 0 }}
                transition={reduced ? { duration: 0 } : CROSSFADE}
              >
                {finishLabel}
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
