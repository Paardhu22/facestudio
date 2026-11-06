import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NumericField } from '@/features/adjustments/numeric-field';
import { ADJUSTMENT_SPEC } from '@/lib/image-processing/adjustment-spec';

function setup(key: 'exposure' | 'tint', value = 0) {
  const onCommit = vi.fn();
  render(<NumericField definition={ADJUSTMENT_SPEC[key]} value={value} onCommit={onCommit} />);
  const input = screen.getByRole('textbox', { name: `${ADJUSTMENT_SPEC[key].label} value` }) as HTMLInputElement;
  return { input, onCommit, user: userEvent.setup() };
}

describe('NumericField', () => {
  it('shows the value at the control precision, with a true minus sign', () => {
    expect(setup('exposure', 0.5).input.value).toBe('0.50');
    expect(setup('tint', -12).input.value).toBe('−12');
  });

  it('Enter commits the typed value', async () => {
    const { input, onCommit, user } = setup('exposure');
    await user.click(input);
    await user.keyboard('{Control>}a{/Control}1.25{Enter}');
    expect(onCommit).toHaveBeenCalledWith(1.25);
  });

  it('accepts a typed true minus sign and a decimal comma', async () => {
    const { input, onCommit, user } = setup('exposure');
    await user.click(input);
    await user.keyboard('{Control>}a{/Control}−0,5{Enter}');
    expect(onCommit).toHaveBeenCalledWith(-0.5);
  });

  it('blur commits', async () => {
    const { input, onCommit, user } = setup('tint');
    await user.click(input);
    await user.keyboard('{Control>}a{/Control}30');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(30);
  });

  it('Escape reverts WITHOUT committing, and the field shows the original value again', async () => {
    const { input, onCommit, user } = setup('tint', 7);
    await user.click(input);
    await user.keyboard('{Control>}a{/Control}99{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('7');
  });

  it('unparseable text reverts instead of committing garbage', async () => {
    const { input, onCommit, user } = setup('tint', 7);
    await user.click(input);
    await user.keyboard('{Control>}a{/Control}abc{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('7');
  });

  it('ArrowUp/ArrowDown step by the spec step; Shift steps ten times as far', async () => {
    const { input, onCommit, user } = setup('exposure', 1);
    await user.click(input);
    await user.keyboard('{ArrowUp}');
    expect(onCommit).toHaveBeenLastCalledWith(1.01);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(onCommit).toHaveBeenLastCalledWith(0.9);
    const tint = setup('tint', 0);
    await tint.user.click(tint.input);
    await tint.user.keyboard('{ArrowUp}');
    expect(tint.onCommit).toHaveBeenLastCalledWith(1);
  });
});
