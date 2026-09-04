import React, { useRef } from 'react';
import { Modal } from '../interior/modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      titleVariant={variant === 'danger' ? 'danger' : 'default'}
      description={message}
      maxWidth={360}
      initialFocusRef={variant === 'danger' ? cancelRef : confirmRef}
      footer={
        <>
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacer-6)',
              height: 28,
              padding: '0 var(--spacer-12)',
              borderRadius: 'var(--radius-8)',
              border: '1px solid var(--border-neutral-l1)',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--text-default)',
              fontSize: 'var(--body-base-strong-font-size)',
              fontWeight: 'var(--body-base-strong-font-weight)',
              fontFamily: 'inherit',
              transition: 'background var(--transition-fast, 0.12s ease)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-overlay-l1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacer-6)',
              height: 28,
              padding: '0 var(--spacer-12)',
              borderRadius: 'var(--radius-8)',
              border: 'none',
              cursor: 'pointer',
              background: variant === 'danger' ? 'var(--status-error-default)' : 'var(--bg-brand)',
              color: 'var(--text-onbrand)',
              fontSize: 'var(--body-base-strong-font-size)',
              fontWeight: 'var(--body-base-strong-font-weight)',
              fontFamily: 'inherit',
              transition: 'background var(--transition-fast, 0.12s ease)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                variant === 'danger' ? 'var(--status-error-hover)' : 'var(--bg-brand-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                variant === 'danger' ? 'var(--status-error-default)' : 'var(--bg-brand)';
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  );
};
