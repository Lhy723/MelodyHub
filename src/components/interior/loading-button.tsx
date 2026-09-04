// MelodyHub interior — loading-button（已换肤）
// 来源：ddoemonn/interior components/interior/loading-button.tsx
// 上游 commit 见 _vendor/SOURCE.txt；useAsyncAction 状态机原样保留（pending 防重入、runId 竞态保护、成功/失败后自动回 idle），
// 仅做：删 "use client"、删 Tailwind 改走 loading-button.css（CSS Vars）。
// 说明：文本型异步操作按钮优先用 LoadingButton；必须保留原铬（图标按钮、主 CTA、玻璃开关）时用 useAsyncAction 无头接入。
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './loading-button.css';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

export type AsyncActionStatus = 'idle' | 'pending' | 'success' | 'error';

export type UseAsyncActionOptions = {
  action: () => unknown;
  resetAfter?: number;
  onError?: (error: unknown) => void;
};

export function useAsyncAction({ action, resetAfter = 1400, onError }: UseAsyncActionOptions) {
  const [status, setStatus] = useState<AsyncActionStatus>('idle');
  const phase = useRef<AsyncActionStatus>('idle');
  const runId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const act = useRef(action);
  const fail = useRef(onError);

  useEffect(() => {
    act.current = action;
    fail.current = onError;
  });

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    runId.current += 1;
    clear();
    phase.current = 'idle';
    setStatus('idle');
  }, [clear]);

  const run = useCallback(() => {
    if (phase.current === 'pending') return;
    clear();
    const id = ++runId.current;
    phase.current = 'pending';
    setStatus('pending');
    const settle = (next: 'success' | 'error') => {
      if (!alive.current || id !== runId.current) return;
      clear();
      phase.current = next;
      setStatus(next);
      timer.current = setTimeout(() => {
        if (!alive.current || id !== runId.current) return;
        phase.current = 'idle';
        setStatus('idle');
      }, resetAfter);
    };
    Promise.resolve()
      .then(() => act.current())
      .then(
        () => settle('success'),
        (error: unknown) => {
          fail.current?.(error);
          settle('error');
        },
      );
  }, [clear, resetAfter]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clear();
    };
  }, [clear]);

  return { status, run, reset, pending: status === 'pending' };
}

function Spinner({ still }: { still: boolean }) {
  return (
    <motion.svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="mh-loading-btn__icon"
      animate={still ? undefined : { rotate: 360 }}
      transition={still ? undefined : { duration: 0.85, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.22" />
      <path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </motion.svg>
  );
}

function CheckMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="mh-loading-btn__icon">
      <path d="M2.6 6.3 4.9 8.6 9.4 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="mh-loading-btn__icon">
      <path d="M6 2.9v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M6 9.05h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export type LoadingButtonProps = {
  onAction: () => unknown;
  children: string;
  pendingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  resetAfter?: number;
  disabled?: boolean;
  onError?: (error: unknown) => void;
  className?: string;
};

export function LoadingButton({
  onAction,
  children,
  pendingLabel = children,
  successLabel = 'Done',
  errorLabel = 'Try again',
  resetAfter = 1400,
  disabled = false,
  onError,
  className = '',
}: LoadingButtonProps) {
  const reduced = useReducedMotion();
  const { status, run, pending } = useAsyncAction({ action: onAction, resetAfter, onError });
  const fade = reduced ? INSTANT : CROSSFADE;

  const label = status === 'pending' ? pendingLabel : status === 'success' ? successLabel : status === 'error' ? errorLabel : children;

  const faces = [
    { key: 'idle', text: children, icon: null },
    { key: 'pending', text: pendingLabel, icon: <Spinner still={reduced === true || status !== 'pending'} /> },
    { key: 'success', text: successLabel, icon: <CheckMark /> },
    { key: 'error', text: errorLabel, icon: <AlertMark /> },
  ] as const;

  return (
    <>
      <motion.button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-busy={pending || undefined}
        aria-disabled={pending || undefined}
        data-status={status}
        whileTap={disabled || pending || reduced ? undefined : { y: 1 }}
        transition={CELL}
        onClick={(event) => {
          if (pending) {
            event.preventDefault();
            return;
          }
          run();
        }}
        className={`mh-loading-btn ${className}`}
      >
        <span aria-hidden className="mh-loading-btn__faces">
          {faces.map((face) => (
            <motion.span
              key={face.key}
              initial={false}
              animate={face.key === status ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 3, filter: 'blur(3px)' }}
              transition={fade}
              className="mh-loading-btn__face"
            >
              {face.icon}
              {face.text}
            </motion.span>
          ))}
        </span>
      </motion.button>
      <span role="status" aria-live="polite" className="mh-loading-btn__sr">
        {status === 'success' ? successLabel : status === 'error' ? errorLabel : ''}
      </span>
    </>
  );
}
