import { describe, expect, it } from 'vitest';

import {
  applyImageClick,
  clearSelection,
  pruneSelection,
  selectAll,
  type SelectionState,
  toggleImage,
} from '@/lib/library/selection';

import { imageId } from '../../fixtures/source-image';

const ids = [1, 2, 3, 4, 5, 6].map(imageId);
const [i1, i2, i3, i4, i5, i6] = ids as [
  ReturnType<typeof imageId>,
  ReturnType<typeof imageId>,
  ReturnType<typeof imageId>,
  ReturnType<typeof imageId>,
  ReturnType<typeof imageId>,
  ReturnType<typeof imageId>,
];
const empty: SelectionState = { selection: new Set(), anchorId: null, activeId: null };
const plain = { shift: false, toggle: false };

describe('applyImageClick', () => {
  it('plain click selects only that image and makes it active and the anchor', () => {
    const state = applyImageClick({ selection: new Set([i1, i2]), anchorId: i1, activeId: i1 }, i4, plain, ids);
    expect([...state.selection]).toEqual([i4]);
    expect(state).toMatchObject({ anchorId: i4, activeId: i4 });
  });

  it('Ctrl/Cmd+click toggles membership', () => {
    let state = applyImageClick(empty, i2, { shift: false, toggle: true }, ids);
    state = applyImageClick(state, i4, { shift: false, toggle: true }, ids);
    expect([...state.selection].sort()).toEqual([i2, i4].sort());
    state = applyImageClick(state, i2, { shift: false, toggle: true }, ids);
    expect([...state.selection]).toEqual([i4]);
  });

  it('Shift+click selects the inclusive range from the anchor, in either direction', () => {
    const anchored = applyImageClick(empty, i2, plain, ids);
    const forward = applyImageClick(anchored, i5, { shift: true, toggle: false }, ids);
    expect([...forward.selection]).toEqual([i2, i3, i4, i5]);
    expect(forward.anchorId).toBe(i2); // the anchor stays put

    const backward = applyImageClick(applyImageClick(empty, i5, plain, ids), i2, { shift: true, toggle: false }, ids);
    expect([...backward.selection].sort()).toEqual([i2, i3, i4, i5].sort());
  });

  it('Shift+click replaces the selection; Ctrl+Shift+click adds the range to it', () => {
    const base: SelectionState = { selection: new Set([i1, i2]), anchorId: i2, activeId: i2 };
    expect([...applyImageClick(base, i4, { shift: true, toggle: false }, ids).selection]).toEqual([i2, i3, i4]);
    expect([...applyImageClick(base, i4, { shift: true, toggle: true }, ids).selection].sort()).toEqual(
      [i1, i2, i3, i4].sort(),
    );
  });

  it('Shift+click without a usable anchor behaves like a plain click', () => {
    const noAnchor = applyImageClick(empty, i3, { shift: true, toggle: false }, ids);
    expect([...noAnchor.selection]).toEqual([i3]);
    // Anchor exists but is hidden by a filter: also plain.
    const hidden = applyImageClick(
      { selection: new Set([i1]), anchorId: i1, activeId: i1 },
      i3,
      { shift: true, toggle: false },
      [i2, i3, i4],
    );
    expect([...hidden.selection]).toEqual([i3]);
  });

  it('ranges follow the VISIBLE order, so filters do not select hidden images', () => {
    const visible = [i1, i3, i6]; // 2, 4, 5 are filtered out
    const state = applyImageClick(
      applyImageClick(empty, i1, plain, visible),
      i6,
      { shift: true, toggle: false },
      visible,
    );
    expect([...state.selection]).toEqual([i1, i3, i6]);
  });

  it('never mutates the previous selection set', () => {
    const before: SelectionState = { selection: new Set([i1]), anchorId: i1, activeId: i1 };
    applyImageClick(before, i2, { shift: false, toggle: true }, ids);
    expect([...before.selection]).toEqual([i1]);
  });
});

describe('other selection operations', () => {
  it('toggleImage changes membership without changing the active image', () => {
    const state = toggleImage({ selection: new Set([i1]), anchorId: i1, activeId: i1 }, i3);
    expect([...state.selection].sort()).toEqual([i1, i3].sort());
    expect(state.activeId).toBe(i1);
    expect(state.anchorId).toBe(i3);
  });

  it('selectAll covers exactly the visible ids; clearSelection empties but keeps the active image', () => {
    const all = selectAll({ ...empty, activeId: i2 }, [i1, i3]);
    expect([...all.selection]).toEqual([i1, i3]);
    expect(all.activeId).toBe(i2);
    const cleared = clearSelection(all);
    expect(cleared.selection.size).toBe(0);
    expect(cleared).toMatchObject({ anchorId: null, activeId: i2 });
  });

  it('pruneSelection removes deleted ids from selection, anchor, and active', () => {
    const state = pruneSelection({ selection: new Set([i1, i2, i3]), anchorId: i2, activeId: i3 }, new Set([i2, i3]));
    expect([...state.selection]).toEqual([i1]);
    expect(state).toMatchObject({ anchorId: null, activeId: null });
  });
});
