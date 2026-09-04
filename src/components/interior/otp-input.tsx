// MelodyHub interior — otp-input（已换肤备用，本项目暂无 OTP 场景未接入页面）
// 来源：ddoemonn/interior components/interior/otp-input.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useOtpInput 分格输入/粘贴填充/键盘导航/完成回调 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 otp-input.css（mh-otp-input__* + CSS Vars）。
// 上游无 phosphor/内联 svg 图标，无图标替换。
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './otp-input.css';

const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const EASE = [0.23, 1, 0.32, 1] as const;

export type OtpMode = 'numeric' | 'alphanumeric';

const ALLOW: Record<OtpMode, RegExp> = {
  numeric: /^[0-9]$/,
  alphanumeric: /^[0-9a-zA-Z]$/,
};

export type UseOtpInputOptions = {
  length?: number;
  mode?: OtpMode;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
};

export type OtpCellProps = {
  ref: (el: HTMLInputElement | null) => void;
  value: string;
  disabled: boolean;
  type: 'text';
  inputMode: 'numeric' | 'text';
  autoComplete: string;
  autoCorrect: 'off';
  autoCapitalize: 'off';
  spellCheck: false;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => void;
  onFocus: (e: FocusEvent<HTMLInputElement>) => void;
  onBlur: (e: FocusEvent<HTMLInputElement>) => void;
};

export type UseOtpInputReturn = {
  chars: string[];
  value: string;
  length: number;
  complete: boolean;
  focusedIndex: number;
  getCellProps: (index: number) => OtpCellProps;
  focusAt: (index: number) => void;
  clear: () => void;
};

export function useOtpInput({
  length = 6,
  mode = 'numeric',
  defaultValue = '',
  disabled = false,
  onChange,
  onComplete,
}: UseOtpInputOptions = {}): UseOtpInputReturn {
  const allow = ALLOW[mode];

  const keep = useCallback(
    (text: string) =>
      text
        .split('')
        .filter((c) => allow.test(c))
        .join(''),
    [allow],
  );

  const [chars, setChars] = useState<string[]>(() => {
    const seed = defaultValue
      .split('')
      .filter((c) => ALLOW[mode].test(c))
      .slice(0, length);
    return Array.from({ length }, (_, i) => seed[i] ?? '');
  });
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const charsRef = useRef(chars);
  charsRef.current = chars;

  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const changed = useRef(onChange);
  changed.current = onChange;
  const completed = useRef(onComplete);
  completed.current = onComplete;

  useEffect(() => {
    setChars((prev) =>
      prev.length === length
        ? prev
        : Array.from({ length }, (_, i) => prev[i] ?? ''),
    );
    refs.current.length = length;
  }, [length]);

  const commit = useCallback((next: string[]) => {
    charsRef.current = next;
    setChars(next);
    const value = next.join('');
    changed.current?.(value);
    if (next.length > 0 && next.every((c) => c !== '')) completed.current?.(value);
  }, []);

  const focusAt = useCallback(
    (index: number) => {
      const el = refs.current[Math.max(0, Math.min(length - 1, index))];
      if (!el) return;
      el.focus();
      el.select();
    },
    [length],
  );

  const fillFrom = useCallback(
    (index: number, text: string) => {
      const incoming = keep(text);
      if (incoming.length === 0) return;
      const next = [...charsRef.current];
      let cursor = index;
      for (const c of incoming) {
        if (cursor >= length) break;
        next[cursor] = c;
        cursor += 1;
      }
      commit(next);
      focusAt(cursor);
    },
    [commit, focusAt, keep, length],
  );

  const clear = useCallback(() => {
    commit(Array.from({ length }, () => ''));
    focusAt(0);
  }, [commit, focusAt, length]);

  const getCellProps = useCallback(
    (index: number): OtpCellProps => ({
      ref: (el) => {
        refs.current[index] = el;
      },
      value: chars[index] ?? '',
      disabled,
      type: 'text',
      inputMode: mode === 'numeric' ? 'numeric' : 'text',
      autoComplete: index === 0 ? 'one-time-code' : 'off',
      autoCorrect: 'off',
      autoCapitalize: 'off',
      spellCheck: false,
      onChange: (e) => {
        const previous = charsRef.current[index] ?? '';
        const raw = e.currentTarget.value;
        const trimmed =
          raw.length > 1 && previous && raw.startsWith(previous)
            ? raw.slice(previous.length)
            : raw;
        const incoming = keep(trimmed);

        if (incoming.length === 0) {
          if (raw.length === 0 && previous) {
            const next = [...charsRef.current];
            next[index] = '';
            commit(next);
          }
          e.currentTarget.value = charsRef.current[index] ?? '';
          return;
        }

        if (incoming.length === 1) {
          const next = [...charsRef.current];
          next[index] = incoming;
          e.currentTarget.value = incoming;
          commit(next);
          if (index < length - 1) focusAt(index + 1);
          return;
        }

        fillFrom(index, incoming);
      },
      onKeyDown: (e) => {
        if (e.key === 'Backspace') {
          e.preventDefault();
          const current = charsRef.current;
          const next = [...current];
          if (current[index]) {
            next[index] = '';
            commit(next);
            return;
          }
          if (index > 0) {
            next[index - 1] = '';
            commit(next);
            focusAt(index - 1);
          }
          return;
        }
        if (e.key === 'Delete') {
          e.preventDefault();
          const next = [...charsRef.current];
          next[index] = '';
          commit(next);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          focusAt(index - 1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          focusAt(index + 1);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          focusAt(0);
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          focusAt(length - 1);
        }
      },
      onPaste: (e) => {
        e.preventDefault();
        const text = keep(e.clipboardData.getData('text'));
        fillFrom(text.length >= length ? 0 : index, text);
      },
      onFocus: (e) => {
        e.currentTarget.select();
        const firstEmpty = charsRef.current.findIndex((c) => c === '');
        if (firstEmpty !== -1 && firstEmpty < index) {
          focusAt(firstEmpty);
          return;
        }
        setFocusedIndex(index);
      },
      onBlur: (e) => {
        const to = e.relatedTarget as HTMLInputElement | null;
        if (to && refs.current.includes(to)) return;
        setFocusedIndex(-1);
      },
    }),
    [chars, commit, disabled, fillFrom, focusAt, keep, length, mode],
  );

  const value = chars.join('');

  return {
    chars,
    value,
    length,
    complete: chars.length > 0 && chars.every((c) => c !== ''),
    focusedIndex,
    getCellProps,
    focusAt,
    clear,
  };
}

export type OtpStatus = 'idle' | 'error' | 'success';

export type OtpInputHandle = {
  clear: () => void;
  focus: () => void;
};

export type OtpInputProps = {
  length?: number;
  mode?: OtpMode;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  status?: OtpStatus;
  errorMessage?: string;
  successMessage?: string;
  hint?: string;
  label?: string;
  groupEvery?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  focusOnError?: boolean;
  className?: string;
  ref?: React.Ref<OtpInputHandle>;
};

export function OtpInput({
  length = 6,
  mode = 'numeric',
  defaultValue = '',
  onChange,
  onComplete,
  status = 'idle',
  errorMessage = '',
  successMessage = '',
  hint = '',
  label = 'Verification code',
  groupEvery = 3,
  disabled = false,
  autoFocus = false,
  focusOnError = true,
  className = '',
  ref,
}: OtpInputProps) {
  const reduced = useReducedMotion();
  const statusId = useId();

  const { chars, focusedIndex, getCellProps, focusAt, clear } = useOtpInput({
    length,
    mode,
    defaultValue,
    disabled,
    onChange,
    onComplete,
  });

  const wasError = useRef(false);
  const error = status === 'error';
  const success = status === 'success';

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        clear();
        focusAt(0);
      },
      focus: () => focusAt(0),
    }),
    [clear, focusAt],
  );

  useEffect(() => {
    if (error && !wasError.current && focusOnError && !disabled) focusAt(0);
    wasError.current = error;
  }, [error, focusOnError, disabled, focusAt]);

  useEffect(() => {
    if (autoFocus && !disabled) focusAt(0);
  }, [autoFocus, disabled, focusAt]);

  const enter = reduced ? { duration: 0 } : { duration: 0.22, ease: EASE };
  const swap = reduced ? { duration: 0 } : CROSSFADE;
  const hasStatus =
    hint.length > 0 || errorMessage.length > 0 || successMessage.length > 0;

  const message = error ? errorMessage : success ? successMessage : hint;
  const tone = error ? 'error' : success ? 'success' : 'hint';

  return (
    <div className={`mh-otp-input ${className}`}>
      <motion.div
        role="group"
        aria-label={label}
        className="mh-otp-input__cells"
        initial={false}
        variants={{ idle: { x: 0 }, wrong: { x: [0, -5, 4, -3, 0] } }}
        animate={error && !reduced ? 'wrong' : 'idle'}
        transition={{ duration: 0.32, ease: EASE }}
      >
        {Array.from({ length }, (_, i) => {
          const char = chars[i] ?? '';
          const active = focusedIndex === i;
          const gap = groupEvery > 0 && i > 0 && i % groupEvery === 0;
          const state = error
            ? 'error'
            : success
              ? 'success'
              : active
                ? 'active'
                : char
                  ? 'filled'
                  : 'empty';

          return (
            <div
              key={i}
              className={`mh-otp-input__slot${gap ? ' mh-otp-input__slot--gap' : ''}`}
            >
              <input
                {...getCellProps(i)}
                aria-label={`${label}, character ${i + 1} of ${length}`}
                aria-invalid={error || undefined}
                aria-describedby={hasStatus ? statusId : undefined}
                data-state={state}
                className="mh-otp-input__cell"
              />

              <span aria-hidden className="mh-otp-input__ghost">
                <AnimatePresence initial={false} mode="popLayout">
                  {char ? (
                    <motion.span
                      key={char}
                      initial={
                        reduced
                          ? false
                          : { opacity: 0, scale: 0.97, y: 10, filter: 'blur(6px)' }
                      }
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={
                        reduced
                          ? { opacity: 0 }
                          : { opacity: 0, scale: 0.98, y: -6, filter: 'blur(3px)' }
                      }
                      transition={enter}
                      className="mh-otp-input__char"
                    >
                      {char}
                    </motion.span>
                  ) : null}
                </AnimatePresence>

                {active && !char && !disabled ? (
                  <motion.span
                    className="mh-otp-input__caret"
                    initial={{ opacity: 1 }}
                    animate={reduced ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            duration: 1.06,
                            times: [0, 0.5, 0.5, 1],
                            repeat: Infinity,
                            ease: 'linear',
                          }
                    }
                  />
                ) : null}
              </span>
            </div>
          );
        })}
      </motion.div>

      {hasStatus && (
        <>
          <div aria-hidden className="mh-otp-input__message">
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={status}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -3 }}
                transition={swap}
                data-tone={tone}
                className="mh-otp-input__message-text"
              >
                {message}
              </motion.span>
            </AnimatePresence>
          </div>
          <span id={statusId} role="status" className="mh-otp-input__sr">
            {message}
          </span>
        </>
      )}
    </div>
  );
}
