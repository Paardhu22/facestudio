import { describe, expect, it } from 'vitest';

import { PANEL_SIZES, parseSidePanelSizes, serializeSidePanelSizes } from '@/features/editor-shell/panel-sizes';

describe('parseSidePanelSizes', () => {
  it('round-trips valid sizes', () => {
    expect(parseSidePanelSizes(serializeSidePanelSizes({ library: 300.4, controls: 320 }))).toEqual({
      library: 300,
      controls: 320,
    });
  });

  it('clamps out-of-range values to panel limits', () => {
    expect(parseSidePanelSizes(JSON.stringify({ library: 5, controls: 9999 }))).toEqual({
      library: PANEL_SIZES.library.min,
      controls: PANEL_SIZES.controls.max,
    });
  });

  it.each([
    null,
    '',
    'not json',
    '42',
    'null',
    '{"library":"300","controls":300}',
    '{"library":300}',
    '{"library":NaN}',
  ])('returns null for untrusted or malformed input %s', (raw) => {
    expect(parseSidePanelSizes(raw)).toBeNull();
  });
});
