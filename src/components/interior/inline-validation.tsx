// MelodyHub interior — inline-validation（已换肤）
// 来源：ddoemonn/interior components/interior/inline-validation.tsx
// 上游 commit 见 _vendor/SOURCE.txt；行为（useInlineValidation 校验信息/debounce 错误抖动/
// commit 即时校验/reset/fieldProps、hint 与 error 交叉淡入、状态图标交叉淡入 + reduced-motion）原样保留，
// 仅做：删 "use client"、删 Tailwind className 改走 inline-validation.css（CSS Vars）、
// 内联 check/感叹号 svg 换成 lucide-react Check / CircleAlert（尺寸与交叉淡入保留）。
// 取舍：上游 invalid 图标是无外框的裸感叹号（竖线 + 方点）；lucide 无裸感叹号，
// 故用带圆框的 CircleAlert 近似，语义（错误态）不变，外观由裸 glyph 变为圆框 glyph。
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, CircleAlert } from 'lucide-react';
import './inline-validation.css';

const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

const LINE = 16;

export type ValidationStatus = 'idle' | 'pending' | 'valid' | 'invalid';

export type Validator = (value: string) => string | null;

export type UseInlineValidationOptions = {
  value: string;
  validate: Validator;
  debounce?: number;
};

export type UseInlineValidationReturn = {
  status: ValidationStatus;
  error: string | null;
  message: string;
  touched: boolean;
  commit: () => void;
  reset: () => void;
  fieldProps: {
    onBlur: () => void;
    'aria-invalid': boolean;
  };
};

type Settled = {
  status: ValidationStatus;
  error: string | null;
  message: string;
};

const CLEAN: Settled = { status: 'idle', error: null, message: '' };

export function useInlineValidation({
  value,
  validate,
  debounce = 400,
}: UseInlineValidationOptions): UseInlineValidationReturn {
  const [touched, setTouched] = useState(false);
  const [settled, setSettled] = useState<Settled>(CLEAN);

  const check = useRef(validate);
  const latest = useRef(value);

  useEffect(() => {
    check.current = validate;
    latest.current = value;
  });

  useEffect(() => {
    if (!touched) return;

    const next = check.current(value);
    const resolved: ValidationStatus = value.length > 0 ? 'valid' : 'idle';

    if (next === null) {
      setSettled((prev) =>
        prev.status === resolved && prev.error === null
          ? prev
          : { status: resolved, error: null, message: prev.message },
      );
      return;
    }

    setSettled((prev) =>
      prev.status === 'invalid'
        ? prev
        : { status: 'pending', error: null, message: prev.message },
    );

    const t = setTimeout(() => {
      setSettled((prev) =>
        prev.error === next ? prev : { status: 'invalid', error: next, message: next },
      );
    }, debounce);

    return () => clearTimeout(t);
  }, [value, touched, debounce]);

  const commit = useCallback(() => {
    setTouched(true);
    const v = latest.current;
    const next = check.current(v);
    setSettled((prev) =>
      next === null
        ? { status: v.length > 0 ? 'valid' : 'idle', error: null, message: prev.message }
        : { status: 'invalid', error: next, message: next },
    );
  }, []);

  const reset = useCallback(() => {
    setTouched(false);
    setSettled(CLEAN);
  }, []);

  return {
    status: settled.status,
    error: settled.error,
    message: settled.message,
    touched,
    commit,
    reset,
    fieldProps: { onBlur: commit, 'aria-invalid': settled.status === 'invalid' },
  };
}

export type InlineValidationProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  validate: Validator;
  hint?: string;
  id?: string;
  name?: string;
  type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'search';
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.ComponentProps<'input'>['inputMode'];
  debounce?: number;
  reserveLines?: number;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function InlineValidation({
  label,
  value,
  onChange,
  validate,
  hint,
  id,
  name,
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
  debounce = 400,
  reserveLines = 1,
  disabled = false,
  required = false,
  className = '',
}: InlineValidationProps) {
  const reduced = useReducedMotion();
  const fade = reduced ? INSTANT : CROSSFADE;

  const auto = useId();
  const fieldId = id ?? `${auto}-field`;
  const hintId = `${auto}-hint`;
  const errorId = `${auto}-error`;

  const { status, error, message, fieldProps } = useInlineValidation({
    value,
    validate,
    debounce,
  });

  const invalid = status === 'invalid';
  const valid = status === 'valid';

  const described = [hint ? hintId : null, invalid ? errorId : null]
    .filter(Boolean)
    .join(' ');

  const clamp = {
    display: '-webkit-box' as const,
    WebkitBoxOrient: 'vertical' as const,
    WebkitLineClamp: reserveLines,
    overflow: 'hidden' as const,
  };

  return (
    <div data-status={status} className={`mh-inline-validation ${className}`}>
      <label htmlFor={fieldId} className="mh-inline-validation__label">
        {label}
      </label>

      <div className="mh-inline-validation__field">
        <input
          id={fieldId}
          name={name}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          disabled={disabled}
          required={required}
          aria-required={required || undefined}
          aria-describedby={described || undefined}
          onChange={(e) => onChange(e.target.value)}
          {...fieldProps}
          data-status={status}
          className="mh-inline-validation__input"
        />

        <span aria-hidden className="mh-inline-validation__status">
          <motion.span
            initial={false}
            animate={{ opacity: valid ? 1 : 0, scale: valid ? 1 : 0.7 }}
            transition={fade}
            className="mh-inline-validation__icon mh-inline-validation__icon--valid"
          >
            <Check size={14} strokeWidth={2} aria-hidden />
          </motion.span>
          <motion.span
            initial={false}
            animate={{ opacity: invalid ? 1 : 0, scale: invalid ? 1 : 0.7 }}
            transition={fade}
            className="mh-inline-validation__icon mh-inline-validation__icon--invalid"
          >
            <CircleAlert size={14} strokeWidth={2} aria-hidden />
          </motion.span>
        </span>
      </div>

      <div className="mh-inline-validation__messages" style={{ height: reserveLines * LINE }}>
        {hint ? (
          <motion.p
            aria-hidden
            style={clamp}
            className="mh-inline-validation__hint"
            initial={false}
            animate={{ opacity: invalid ? 0 : 1, y: invalid ? 3 : 0 }}
            transition={fade}
          >
            {hint}
          </motion.p>
        ) : null}

        <motion.p
          aria-hidden
          style={clamp}
          className="mh-inline-validation__error"
          initial={false}
          animate={{ opacity: invalid ? 1 : 0, y: invalid ? 0 : -3 }}
          transition={fade}
        >
          {error ?? message}
        </motion.p>

        {hint ? (
          <span id={hintId} className="mh-inline-validation__sr">
            {hint}
          </span>
        ) : null}

        <span
          id={errorId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mh-inline-validation__sr"
        >
          {error ?? ''}
        </span>
      </div>
    </div>
  );
}
