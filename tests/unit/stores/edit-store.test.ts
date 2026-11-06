import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_ADJUSTMENTS } from '@/lib/image-processing/adjustment-spec';
import { DEFAULT_OUTPUT } from '@/lib/cropping/output';
import {
  DEFAULT_EDIT,
  HISTORY_LIMIT,
  resetEditStore,
  selectAdjustments,
  selectCrop,
  selectOutput,
  useEditStore,
} from '@/stores/edit-store';
import type { CropRegion, ImageAdjustments, ImageEdit, OutputSettings } from '@/types/domain';

import { imageId } from '../../fixtures/source-image';

const store = () => useEditStore.getState();
const [a, b, c] = [imageId(1), imageId(2), imageId(3)] as const;
const adj = (patch: Partial<ImageAdjustments>): ImageAdjustments => ({ ...DEFAULT_ADJUSTMENTS, ...patch });
const valueOf = (id: typeof a) => selectAdjustments(id)(store());
const edit = (patch: Partial<ImageAdjustments>): ImageEdit => ({ ...DEFAULT_EDIT, adjustments: adj(patch) });
const cropOf = (x: number, y = 10, width = 100, height = 80): CropRegion => ({
  id: 'crp_aaaaaaaaaaaaaaaaaaaaaa',
  mode: 'custom',
  rect: { x, y, width, height },
  aspect: { preset: 'free', value: null },
  faceId: null,
  framing: { faceFill: 0.42, headroom: 0.18, padding: 0.25 },
  manual: true,
  constrained: false,
  label: null,
});

beforeEach(resetEditStore);

describe('gestures', () => {
  it('a slider drag updates live without history, then commits exactly ONE undoable step', () => {
    for (const exposure of [0.1, 0.2, 0.3, 0.45, 0.5]) store().setLive(a, { exposure });
    expect(valueOf(a).exposure).toBe(0.5);
    expect(store().undoStack).toHaveLength(0);
    expect(store().dirty.has(a)).toBe(true);

    store().commitGesture('Exposure');
    expect(store().undoStack).toHaveLength(1);
    expect(store().undoStack[0]?.label).toBe('Exposure');

    store().undo();
    expect(valueOf(a).exposure).toBe(0); // back to the value BEFORE the whole drag, not before the last tick
  });

  it('committing a gesture that ended where it began records nothing', () => {
    store().setLive(a, { exposure: 1 });
    store().commitGesture('Exposure');
    store().setLive(a, { exposure: 2 });
    store().setLive(a, { exposure: 1 });
    store().commitGesture('Exposure');
    expect(store().undoStack).toHaveLength(1);
  });

  it('clamps and snaps live values to the shared spec', () => {
    store().setLive(a, { exposure: 99, tint: 12.6 });
    expect(valueOf(a)).toMatchObject({ exposure: 3, tint: 13 });
  });

  it('only non-default values are stored: returning to default removes the entry', () => {
    store().setLive(a, { saturation: 30 });
    expect(Object.keys(store().edits)).toEqual([a]);
    store().setLive(a, { saturation: 0 });
    expect(store().edits).toEqual({});
    expect(valueOf(a)).toBe(DEFAULT_ADJUSTMENTS); // stable reference, so unedited images never re-render
  });
});

describe('undo and redo', () => {
  it('walks back and forward through operations, and a new edit clears the redo stack', () => {
    store().setLive(a, { exposure: 1 });
    store().commitGesture('Exposure');
    store().setLive(a, { tint: -20 });
    store().commitGesture('Tint');

    store().undo();
    expect(valueOf(a)).toMatchObject({ exposure: 1, tint: 0 });
    store().undo();
    expect(valueOf(a)).toEqual(DEFAULT_ADJUSTMENTS);
    expect(store().redoStack).toHaveLength(2);

    store().redo();
    expect(valueOf(a)).toMatchObject({ exposure: 1, tint: 0 });

    store().setLive(a, { saturation: 10 });
    store().commitGesture('Saturation');
    expect(store().redoStack).toHaveLength(0);
  });

  it('undo with nothing to undo (or redo with nothing to redo) is harmless', () => {
    store().undo();
    store().redo();
    expect(store().edits).toEqual({});
  });

  it('undo closes an open gesture first, so a half-dragged slider is undoable too', () => {
    store().setLive(a, { exposure: 2 });
    store().undo();
    expect(valueOf(a)).toEqual(DEFAULT_ADJUSTMENTS);
    expect(store().redoStack).toHaveLength(1);
  });

  it('caps history so memory stays bounded', () => {
    for (let i = 1; i <= HISTORY_LIMIT + 30; i++) {
      store().setLive(a, { exposure: (i % 300) / 100 });
      store().commitGesture('Exposure');
    }
    expect(store().undoStack.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });

  it('history holds only small adjustment values (no pixels or object URLs)', () => {
    store().setLive(a, { exposure: 1 });
    store().commitGesture('Exposure');
    expect(JSON.stringify(store().undoStack).length).toBeLessThan(500);
  });
});

describe('batch operations', () => {
  it('"apply to" many images is ONE logical operation, undone and redone together', () => {
    const source = adj({ exposure: 0.5, temperature: 20 });
    store().applyTo([a, b, c], source, 'Apply to all');
    expect([a, b, c].map((id) => valueOf(id).exposure)).toEqual([0.5, 0.5, 0.5]);
    expect(store().undoStack).toHaveLength(1);
    expect(store().dirty.size).toBe(3);

    store().undo();
    expect([a, b, c].map((id) => valueOf(id))).toEqual([DEFAULT_ADJUSTMENTS, DEFAULT_ADJUSTMENTS, DEFAULT_ADJUSTMENTS]);
    store().redo();
    expect(valueOf(c)).toEqual(source);
  });

  it('restores each image to ITS OWN previous value on undo', () => {
    store().setLive(a, { saturation: 40 });
    store().commitGesture('Saturation');
    store().applyTo([a, b], adj({ exposure: 1 }), 'Apply to selected');
    store().undo();
    expect(valueOf(a)).toMatchObject({ saturation: 40, exposure: 0 });
    expect(valueOf(b)).toEqual(DEFAULT_ADJUSTMENTS);
  });

  it('skips images that already have the target value, and records nothing if all do', () => {
    const target = adj({ tint: 10 });
    store().applyTo([a], target, 'Apply');
    store().applyTo([a], target, 'Apply');
    expect(store().undoStack).toHaveLength(1);
    store().applyTo([a, a, b], target, 'Apply'); // duplicates in the list are applied once
    expect(store().undoStack[1]?.changes).toHaveLength(1);
  });

  it('applying neutral adjustments resets images (and removes their entries)', () => {
    store().applyTo([a, b], adj({ exposure: 1 }), 'Apply');
    store().applyTo([a, b], DEFAULT_ADJUSTMENTS, 'Reset');
    expect(store().edits).toEqual({});
  });
});

describe('sync bookkeeping', () => {
  it('markSaved clears dirty only for images unchanged since the save was sent', () => {
    store().setLive(a, { exposure: 1 });
    store().setLive(b, { exposure: 2 });
    const sent = { [a]: store().edits[a]!, [b]: store().edits[b]! };
    store().setLive(b, { exposure: 2.5 }); // edited again while the request was in flight
    store().markSaved(sent);
    expect(store().dirty.has(a)).toBe(false);
    expect(store().dirty.has(b)).toBe(true);
  });

  it('hydrate replaces state from the server and starts with clean history', () => {
    store().setLive(a, { exposure: 1 });
    store().commitGesture('Exposure');
    store().hydrate({ [b]: edit({ tint: 5 }) });
    expect(store().edits).toEqual({ [b]: edit({ tint: 5 }) });
    expect(store().undoStack).toHaveLength(0);
    expect(store().dirty.size).toBe(0);
  });

  it('pruneImages drops removed images and clears history (deleting is not undoable)', () => {
    store().applyTo([a, b], adj({ exposure: 1 }), 'Apply');
    store().pruneImages([a]);
    expect(Object.keys(store().edits)).toEqual([b]);
    expect(store().dirty.has(a)).toBe(false);
    expect(store().undoStack).toHaveLength(0);
  });
});

describe('crops and output settings share the same history and sync rules', () => {
  it('a crop drag is live, then ONE undoable step', () => {
    for (const x of [10, 30, 55, 80]) store().setCropLive(a, cropOf(x));
    expect(selectCrop(a)(store())?.rect.x).toBe(80);
    expect(store().undoStack).toHaveLength(0);
    expect(store().dirty.has(a)).toBe(true);
    store().commitGesture('Move crop');
    expect(store().undoStack).toHaveLength(1);
    store().undo();
    expect(selectCrop(a)(store())).toBeNull();
    expect(store().edits).toEqual({}); // back to fully default → no entry
    store().redo();
    expect(selectCrop(a)(store())?.rect.x).toBe(80);
  });

  it('adjustments and a crop on the same image are independent but share one snapshot', () => {
    store().setLive(a, { exposure: 1 });
    store().commitGesture('Exposure');
    store().setCrop(a, cropOf(5), 'Crop');
    expect(valueOf(a).exposure).toBe(1);
    expect(selectCrop(a)(store())?.rect.x).toBe(5);
    store().undo(); // removes the crop only
    expect(valueOf(a).exposure).toBe(1);
    expect(selectCrop(a)(store())).toBeNull();
    store().undo(); // then the exposure
    expect(store().edits).toEqual({});
  });

  it('applyCrops sets a DIFFERENT crop on each image as one operation', () => {
    store().applyCrops(
      [
        { id: a, crop: cropOf(10) },
        { id: b, crop: cropOf(200) },
        { id: c, crop: null },
      ],
      'Apply crop to all',
    );
    expect(selectCrop(a)(store())?.rect.x).toBe(10);
    expect(selectCrop(b)(store())?.rect.x).toBe(200);
    expect(selectCrop(c)(store())).toBeNull();
    expect(store().undoStack).toHaveLength(1);
    expect(store().undoStack[0]?.changes).toHaveLength(2); // c was already crop-less: nothing to record
    store().undo();
    expect(store().edits).toEqual({});
  });

  it('removing a crop with setCrop(null) is undoable and drops the entry when nothing else is edited', () => {
    store().setCrop(a, cropOf(5), 'Crop');
    store().setCrop(a, null, 'Remove crop');
    expect(store().edits).toEqual({});
    store().undo();
    expect(selectCrop(a)(store())).not.toBeNull();
  });

  it('output settings: default output counts as unedited; a real change is stored, undone, and applied to many', () => {
    store().setOutput(a, { ...DEFAULT_OUTPUT }, 'Output');
    expect(store().edits).toEqual({}); // equal to the defaults → not stored
    const web: OutputSettings = {
      ...DEFAULT_OUTPUT,
      format: 'webp',
      quality: 80,
      resize: { mode: 'width', width: 1200 },
    };
    store().applyOutputTo([a, b], web, 'Apply output');
    expect(selectOutput(a)(store())).toEqual(web);
    expect(selectOutput(b)(store())).toEqual(web);
    expect(store().undoStack).toHaveLength(1);
    store().undo();
    expect(store().edits).toEqual({});
  });

  it('a quality-slider style output drag is one undo step', () => {
    for (const quality of [85, 80, 70, 60]) store().setOutputLive(a, { ...DEFAULT_OUTPUT, quality });
    store().commitGesture('Quality');
    expect(store().undoStack).toHaveLength(1);
    store().undo();
    expect(selectOutput(a)(store())).toBeNull();
  });

  it('markSaved compares the WHOLE edit, crop included', () => {
    store().setCropLive(a, cropOf(10));
    const sent = { [a]: store().edits[a]! };
    store().setCropLive(a, cropOf(40)); // moved again while the save was in flight
    store().markSaved(sent);
    expect(store().dirty.has(a)).toBe(true);
    store().markSaved({ [a]: store().edits[a]! });
    expect(store().dirty.has(a)).toBe(false);
  });
});
