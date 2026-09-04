// MelodyHub interior — floating-label（已换肤）
// 来源：ddoemonn/interior components/interior/floating-label.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useFloatingLabel 浮动标签/聚焦/填充态 +
// mounted 首帧 instant + 非受控 input/change 监听 + disabled 失焦 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 floating-label.css（CSS Vars）。
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './floating-label.css';

const INSTANT = { duration: 0 } as const;

const LIFT = { type: 'spring', stiffness: 760, damping: 46, mass: 0.5 } as const;

const RAISE = -32;
const SLIDE = -12;
const SHRINK = 0.92;

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type UseFloatingLabelOptions = {
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
};

export type UseFloatingLabelReturn = {
  ref: React.RefObject<HTMLInputElement | null>;
  raised: boolean;
  focused: boolean;
  filled: boolean;
  length: number;
  instant: boolean;
  fieldProps: {
    onFocus: () => void;
    onBlur: () => void;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  };
};

type Fill = { length: number; instant: boolean };

export function useFloatingLabel({
  value,
  defaultValue,
  disabled = false,
}: UseFloatingLabelOptions = {}): UseFloatingLabelReturn {
  const ref = useRef<HTMLInputElement | null>(null);
  const mounted = useRef(false);

  const [focused, setFocused] = useState(false);
  const [fill, setFill] = useState<Fill>({
    length: (value ?? defaultValue ?? '').length,
    instant: true,
  });

  const settle = useCallback((next: number, instant: boolean) => {
    setFill((prev) =>
      prev.length === next && prev.instant === instant ? prev : { length: next, instant },
    );
  }, []);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    const next = value !== undefined ? value.length : el ? el.value.length : 0;
    settle(next, !mounted.current);
    mounted.current = true;
  }, [value, settle]);

  useEffect(() => {
    setFill((prev) => (prev.instant ? { ...prev, instant: false } : prev));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || value !== undefined) return;
    const read = () => settle(el.value.length, false);
    el.addEventListener('input', read);
    el.addEventListener('change', read);
    return () => {
      el.removeEventListener('input', read);
      el.removeEventListener('change', read);
    };
  }, [value, settle]);

  useEffect(() => {
    if (disabled) setFocused(false);
  }, [disabled]);

  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      settle(event.currentTarget.value.length, false),
    [settle],
  );

  return {
    ref,
    raised: focused || fill.length > 0,
    focused,
    filled: fill.length > 0,
    length: fill.length,
    instant: fill.instant && !focused,
    fieldProps: { onFocus, onBlur, onChange },
  };
}

export type FloatingLabelInputProps = {
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  hint?: string;
  invalid?: boolean;
  id?: string;
  name?: string;
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url';
  autoComplete?: string;
  inputMode?: React.ComponentProps<'input'>['inputMode'];
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
};

export function FloatingLabelInput({
  label,
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  hint,
  invalid = false,
  id,
  name,
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
  required = false,
  disabled = false,
  readOnly = false,
  inputRef,
  className = '',
}: FloatingLabelInputProps) {
  const auto = useId();
  const fieldId = id ?? `${auto}-field`;
  const hintId = `${auto}-hint`;

  const reduced = useReducedMotion();
  const { ref, raised, focused, length, instant, fieldProps } = useFloatingLabel({
    value,
    defaultValue,
    disabled,
  });

  const move = reduced || instant ? INSTANT : LIFT;

  const attach = useCallback(
    (node: HTMLInputElement | null) => {
      ref.current = node;
      if (typeof inputRef === 'function') inputRef(node);
      else if (inputRef) inputRef.current = node;
    },
    [ref, inputRef],
  );

  return (
    <div
      className={`mh-floating-label ${className}`}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
    >
      <div className="mh-floating-label__body">
        <div
          className="mh-floating-label__shell"
          data-focused={focused || undefined}
          data-invalid={invalid || undefined}
        >
          <input
            ref={attach}
            id={fieldId}
            name={name}
            type={type}
            value={value}
            defaultValue={defaultValue}
            autoComplete={autoComplete}
            inputMode={inputMode}
            maxLength={maxLength}
            required={required}
            disabled={disabled}
            readOnly={readOnly}
            aria-required={required || undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? hintId : undefined}
            onFocus={() => {
              fieldProps.onFocus();
              onFocus?.();
            }}
            onBlur={() => {
              fieldProps.onBlur();
              onBlur?.();
            }}
            onChange={(event) => {
              fieldProps.onChange(event);
              onChange?.(event.currentTarget.value, event);
            }}
            className="mh-floating-label__input"
          />
        </div>

        <motion.label
          htmlFor={fieldId}
          initial={false}
          animate={{
            y: raised ? RAISE : 0,
            x: raised ? SLIDE : 0,
            scale: raised ? SHRINK : 1,
          }}
          transition={move}
          style={{ originX: 0, originY: 0, willChange: 'transform' }}
          className="mh-floating-label__label"
          data-raised={raised || undefined}
          data-invalid={invalid || undefined}
        >
          {label}
          {required ? (
            <span aria-hidden className="mh-floating-label__required">
              *
            </span>
          ) : null}
        </motion.label>
      </div>

      <div className="mh-floating-label__footer">
        <p aria-hidden className="mh-floating-label__hint" data-invalid={invalid || undefined}>
          {hint}
        </p>

        {maxLength !== undefined ? (
          <span aria-hidden className="mh-floating-label__count">
            <span className="mh-floating-label__count-ghost">
              {maxLength} / {maxLength}
            </span>
            <span className="mh-floating-label__count-value">
              {length} / {maxLength}
            </span>
          </span>
        ) : null}

        {hint ? (
          <span id={hintId} className="mh-floating-label__sr">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}
