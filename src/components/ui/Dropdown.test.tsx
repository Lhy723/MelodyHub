import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Dropdown } from './Dropdown';

const options = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
];

function renderDropdown() {
  return render(<Dropdown options={options} value="one" onChange={vi.fn()} />);
}

describe('Dropdown motion', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('uses motion for pointer interaction and waits for its own opacity transition before cleanup', async () => {
    const user = userEvent.setup();
    renderDropdown();

    const trigger = screen.getByRole('button');
    await user.click(trigger);
    const popup = await screen.findByRole('listbox');

    expect(popup).toHaveAttribute('data-open', 'true');
    expect(popup).toHaveAttribute('data-motion', 'true');

    await user.click(trigger);
    expect(popup).toHaveAttribute('data-open', 'false');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.transitionEnd(popup, { propertyName: 'transform' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.transitionEnd(popup, { propertyName: 'opacity' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('can reverse a pointer close before transition cleanup', async () => {
    const user = userEvent.setup();
    renderDropdown();

    const trigger = screen.getByRole('button');
    await user.click(trigger);
    const popup = await screen.findByRole('listbox');

    await user.click(trigger);
    await user.click(trigger);
    expect(popup).toHaveAttribute('data-open', 'true');

    fireEvent.transitionEnd(popup, { propertyName: 'opacity' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it.each(['Enter', ' ', 'ArrowDown'])('opens instantly with the %s key', async (key) => {
    const user = userEvent.setup();
    renderDropdown();

    const trigger = screen.getByRole('button');
    trigger.focus();
    await user.keyboard(key === ' ' ? ' ' : `{${key}}`);

    const popup = await screen.findByRole('listbox');
    expect(popup).toHaveAttribute('data-open', 'true');
    expect(popup).toHaveAttribute('data-motion', 'false');
  });

  it('removes the popup immediately when Escape closes it', async () => {
    const user = userEvent.setup();
    renderDropdown();

    const trigger = screen.getByRole('button');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('Dropdown interior behaviors', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('skips disabled options in keyboard nav and blocks selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Dropdown
        options={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two', disabled: true },
          { value: 'three', label: 'Three' },
        ]}
        value="one"
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('button');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    // ArrowDown from One skips disabled Two and lands on Three.
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('three');
  });

  it('marks disabled options with aria-disabled and ignores pointer selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Dropdown
        options={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two', disabled: true },
        ]}
        value="one"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button'));
    const disabled = await screen.findByText('Two');
    expect(disabled.closest('[role="option"]')).toHaveAttribute('aria-disabled', 'true');
    await user.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('jumps to a matching option on typeahead', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Dropdown
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta' },
          { value: 'gamma', label: 'Gamma' },
        ]}
        value="alpha"
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('button');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await user.keyboard('g');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('gamma');
  });
});
