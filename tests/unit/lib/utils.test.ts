import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

describe('FaceStudio class merging', () => {
  it.each(['ui-xs', 'ui-sm', 'ui', 'ui-lg', 'display-sm', 'display', 'display-lg'])(
    'preserves text-%s sizing alongside a text color',
    (size) => {
      const fontSize = `text-${size}`;
      expect(cn(fontSize, 'text-fg').split(' ')).toEqual([fontSize, 'text-fg']);
      expect(cn('text-fg-secondary', fontSize).split(' ')).toEqual(['text-fg-secondary', fontSize]);
    },
  );

  it('lets a later font size replace the size while preserving the color', () => {
    expect(cn('text-ui-sm text-fg', 'text-ui-lg')).toBe('text-fg text-ui-lg');
    expect(cn('text-ui-sm text-fg', 'text-sm')).toBe('text-fg text-sm');
  });

  it('lets a later color replace the color while preserving custom typography', () => {
    expect(cn('text-ui text-fg', 'text-fg-muted')).toBe('text-ui text-fg-muted');
  });
});
