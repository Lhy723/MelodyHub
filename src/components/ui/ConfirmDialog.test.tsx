import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// @ts-expect-error Node types are not included in the browser application's tsconfig.
import { readFileSync } from 'node:fs';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

const modalStyles = readFileSync('src/components/interior/modal.css', 'utf8');

function Harness({ onCancel = vi.fn(), onConfirm = vi.fn() }: { onCancel?: () => void; onConfirm?: () => void }) {
  const [open, setOpen] = React.useState(true);

  return (
    <>
      <button data-testid="reopen" onClick={() => setOpen(true)}>
        重新打开
      </button>
      <ConfirmDialog
        open={open}
        title="确认操作"
        message="此操作无法撤销"
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
      />
    </>
  );
}

describe('ConfirmDialog (interior modal)', () => {
  it('renders title, message and both actions when open', () => {
    render(<Harness />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('确认操作')).toBeInTheDocument();
    expect(screen.getByText('此操作无法撤销')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确定' })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog open={false} title="确认操作" message="此操作无法撤销" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onCancel on cancel click and onConfirm on confirm click', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('reopen'));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(onConfirm).toHaveBeenCalledOnce();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('dismisses with Escape and backdrop click', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<Harness onCancel={onCancel} />);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('reopen'));
    // Backdrop is the overlay behind the panel.
    const dialog = screen.getByRole('dialog');
    const overlay = dialog.parentElement;
    if (!overlay) throw new Error('Expected modal overlay');
    fireEvent.pointerDown(overlay, { button: 0 });
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('marks danger titles and keeps reduced-motion honest', () => {
    render(
      <ConfirmDialog
        open
        variant="danger"
        title="删除聚合"
        message="删后不可恢复"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('删除聚合')).toHaveAttribute('data-variant', 'danger');
    expect(modalStyles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
