import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('fires onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Export</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('loading state disables the button and sets aria-busy', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Export
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Export' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('asChild renders the child element with button styling', () => {
    render(
      <Button asChild>
        <a href="/editor">Get Started</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Get Started' });
    expect(link).toHaveAttribute('href', '/editor');
    expect(link).toHaveAttribute('data-slot', 'button');
  });

  it('defaults to type-safe variant and size data attributes', () => {
    render(
      <Button variant="secondary" size="sm">
        Reset
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Reset' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'sm');
  });
});
