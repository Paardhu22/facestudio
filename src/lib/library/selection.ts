import type { ImageId } from '@/types/domain';

export type SelectionState = {
  selection: ReadonlySet<ImageId>;
  /** Origin of range selections (Shift+click / Shift+arrows). */
  anchorId: ImageId | null;
  /** The image open on the canvas. */
  activeId: ImageId | null;
};

export type ClickModifiers = { shift: boolean; toggle: boolean };

/**
 * Pointer/keyboard selection rules, matching desktop file managers:
 * - plain click: select only this image, make it active and the anchor
 * - Ctrl/Cmd+click: toggle this image
 * - Shift+click: select the range from the anchor to this image (within the visible, filtered order)
 * - Ctrl/Cmd+Shift+click: add that range to the existing selection
 * A Shift click with no usable anchor behaves like a plain click.
 */
export function applyImageClick(
  state: SelectionState,
  id: ImageId,
  modifiers: ClickModifiers,
  visibleIds: readonly ImageId[],
): SelectionState {
  const targetIndex = visibleIds.indexOf(id);
  const anchorIndex = state.anchorId === null ? -1 : visibleIds.indexOf(state.anchorId);

  if (modifiers.shift && targetIndex !== -1 && anchorIndex !== -1) {
    const [from, to] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    const range = visibleIds.slice(from, to + 1);
    const selection = new Set<ImageId>(modifiers.toggle ? state.selection : []);
    for (const rangeId of range) selection.add(rangeId);
    return { selection, anchorId: state.anchorId, activeId: id };
  }

  if (modifiers.toggle) {
    const selection = new Set(state.selection);
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    return { selection, anchorId: id, activeId: id };
  }

  return { selection: new Set([id]), anchorId: id, activeId: id };
}

/** Toggle one image's membership without changing which image is active (the thumbnail checkbox). */
export function toggleImage(state: SelectionState, id: ImageId): SelectionState {
  const selection = new Set(state.selection);
  if (selection.has(id)) selection.delete(id);
  else selection.add(id);
  return { selection, anchorId: id, activeId: state.activeId };
}

export function selectAll(state: SelectionState, visibleIds: readonly ImageId[]): SelectionState {
  return { selection: new Set(visibleIds), anchorId: visibleIds[0] ?? null, activeId: state.activeId };
}

export function clearSelection(state: SelectionState): SelectionState {
  return { selection: new Set(), anchorId: null, activeId: state.activeId };
}

/** Drop removed ids from every part of the selection state. */
export function pruneSelection(state: SelectionState, removed: ReadonlySet<ImageId>): SelectionState {
  const selection = new Set<ImageId>();
  for (const id of state.selection) if (!removed.has(id)) selection.add(id);
  return {
    selection,
    anchorId: state.anchorId !== null && removed.has(state.anchorId) ? null : state.anchorId,
    activeId: state.activeId !== null && removed.has(state.activeId) ? null : state.activeId,
  };
}
