import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_LIMITS } from '@/lib/config/limits';
import { useLibraryStore } from '@/stores/library-store';

import { imageId, makeSourceImage } from '../../fixtures/source-image';

const store = () => useLibraryStore.getState();
const names = () => store().order.map((id) => store().images[id]?.originalFilename);

beforeEach(() => {
  store().beginLoad();
  store().finishLoad([], { ...DEFAULT_LIMITS });
});

describe('library store', () => {
  it('keeps images in natural filename order regardless of arrival order', () => {
    store().addImages([makeSourceImage(10), makeSourceImage(2), makeSourceImage(1)]);
    store().addImages([makeSourceImage(100)]);
    expect(names()).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg', 'IMG_100.jpg']);
  });

  it('orders folder uploads by relative path', () => {
    store().addImages([
      makeSourceImage(1, { originalFilename: 'a.jpg', relativePath: 'zeta/a.jpg' }),
      makeSourceImage(2, { originalFilename: 'b.jpg', relativePath: 'alpha/b.jpg' }),
    ]);
    expect(names()).toEqual(['b.jpg', 'a.jpg']);
  });

  it('ignores an image it already has (initial load racing upload flushes)', () => {
    store().addImages([makeSourceImage(1)]);
    store().addImages([makeSourceImage(1), makeSourceImage(2)]);
    expect(store().order).toHaveLength(2);
  });

  it('finishLoad merges images added during the load instead of dropping them', () => {
    store().beginLoad();
    store().addImages([makeSourceImage(7)]); // uploaded while the list request was in flight
    store().finishLoad([makeSourceImage(1)], { ...DEFAULT_LIMITS, maxBatchImages: 50 });
    expect(store().order).toHaveLength(2);
    expect(store().loadState).toBe('ready');
    expect(store().limits.maxBatchImages).toBe(50);
  });

  it('beginLoad resets everything, including selection', () => {
    store().addImages([makeSourceImage(1)]);
    store().clickImage(imageId(1), { shift: false, toggle: false }, store().order);
    store().beginLoad();
    expect(store().order).toEqual([]);
    expect(store().selection.size).toBe(0);
    expect(store().activeId).toBeNull();
    expect(store().loadState).toBe('loading');
  });

  it('removeImages drops images, prunes selection/active, and clears dependent duplicate flags', () => {
    store().addImages([makeSourceImage(1), makeSourceImage(2, { duplicateOfId: imageId(1) }), makeSourceImage(3)]);
    store().clickImage(imageId(1), { shift: false, toggle: false }, store().order);
    store().clickImage(imageId(3), { shift: false, toggle: true }, store().order);

    store().removeImages([imageId(1)]);

    expect(store().order).toEqual([imageId(2), imageId(3)]);
    expect(store().images[imageId(1)]).toBeUndefined();
    expect(store().images[imageId(2)]?.duplicateOfId).toBeNull();
    expect([...store().selection]).toEqual([imageId(3)]);
    expect(store().activeId).toBe(imageId(3)); // the active image was 3 (last clicked), so it survives
  });

  it('removeImages with unknown ids changes nothing', () => {
    store().addImages([makeSourceImage(1)]);
    const before = store().order;
    store().removeImages([imageId(99)]);
    expect(store().order).toBe(before);
  });

  it('selectAll and clearSelection operate on the given visible ids only', () => {
    store().addImages([makeSourceImage(1), makeSourceImage(2), makeSourceImage(3)]);
    store().selectAll([imageId(1), imageId(3)]);
    expect([...store().selection]).toEqual([imageId(1), imageId(3)]);
    store().clearSelection();
    expect(store().selection.size).toBe(0);
  });

  it('records a load failure with its message', () => {
    store().beginLoad();
    store().failLoad('Could not reach the server');
    expect(store()).toMatchObject({ loadState: 'error', loadError: 'Could not reach the server' });
  });
});
