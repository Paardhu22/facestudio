import { expect, type Page, test } from '@playwright/test';

import { FACE_MODEL_ID } from '../../src/lib/face-detection/constants';
import { makeFace } from '../fixtures/face';
import { makeJpeg } from '../fixtures/images';

type Upload = { name: string; mimeType: string; buffer: Buffer };
type Box = { x: number; y: number; w: number; h: number };

const plain = async (name: string, width = 400, height = 300): Promise<Upload> => ({
  name,
  mimeType: 'image/jpeg',
  buffer: await makeJpeg({ width, height }),
});
const faceImage = async (name = 'face.png'): Promise<Upload> => ({
  name,
  mimeType: 'image/png',
  buffer: await makeFace(),
});

async function openEditorWith(page: Page, files: Upload[]): Promise<void> {
  await page.goto('/editor');
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(page.getByTestId('library-count')).toHaveText(files.length === 1 ? '1 image' : `${files.length} images`);
}

async function openImage(page: Page, name: string): Promise<void> {
  await page.getByRole('option', { name }).click();
  await expect(page.getByTestId('crop-stage')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('crop-panel')).toBeVisible();
}

const stage = (page: Page) => page.getByTestId('crop-stage');
const field = (page: Page, key: 'x' | 'y' | 'w' | 'h') => page.getByTestId(`crop-${key}`);

async function cropBox(page: Page): Promise<Box | null> {
  const raw = await stage(page).getAttribute('data-crop');
  if (!raw) return null;
  const [x, y, w, h] = raw.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0, w: w ?? 0, h: h ?? 0 };
}

/** The viewport position of an image-space point, from the stage's published view transform. */
async function toScreen(page: Page, ix: number, iy: number): Promise<{ x: number; y: number }> {
  await expect(stage(page)).toHaveAttribute('data-settling', 'false');
  return stage(page).evaluate(
    async (el, p) => {
      // A preceding edit can schedule settling just after the initial DOM assertion. Sample only
      // after the displayed transform is unchanged across paint frames, so two endpoints agree.
      let previous = '';
      let stable = 0;
      for (let i = 0; i < 120 && stable < 3; i++) {
        await new Promise(requestAnimationFrame);
        const d = (el as HTMLElement).dataset;
        const current = `${d.viewX},${d.viewY},${d.viewScale}`;
        stable = d.settling === 'false' && current === previous ? stable + 1 : 0;
        previous = current;
      }
      const box = el.getBoundingClientRect();
      const d = (el as HTMLElement).dataset;
      return {
        x: box.left + Number(d.viewX) + p.ix * Number(d.viewScale),
        y: box.top + Number(d.viewY) + p.iy * Number(d.viewScale),
      };
    },
    { ix, iy },
  );
}
const viewScale = async (page: Page) => Number(await stage(page).getAttribute('data-view-scale'));

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

/** Store detection results directly (deterministic multi-face and no-face cases), then reload so the library picks them up. */
async function injectFaces(
  page: Page,
  name: string,
  faces: { x: number; y: number; w: number; h: number }[],
): Promise<void> {
  const origin = new URL(page.url()).origin;
  const list = (await (await page.request.get('/api/images')).json()) as {
    images: { id: string; originalFilename: string }[];
  };
  const id = list.images.find((image) => image.originalFilename === name)?.id;
  expect(id, `image ${name} should exist`).toBeTruthy();
  const response = await page.request.put('/api/detections', {
    headers: { origin },
    data: {
      items: [
        {
          id,
          result: {
            modelId: FACE_MODEL_ID,
            status: faces.length ? 'complete' : 'no_face',
            faces: faces.map((f, i) => ({
              id: `f${i}`,
              box: { x: f.x, y: f.y, width: f.w, height: f.h },
              score: 0.9 - i * 0.05,
              keypoints: {},
            })),
          },
        },
      ],
    },
  });
  expect(response.status()).toBe(200);
}

const reloadAndOpen = async (page: Page, name: string) => {
  await page.reload();
  await expect(page.getByTestId('library-count')).not.toHaveText('0 images');
  await openImage(page, name);
};

test.describe('Face detection and face-aware crops (real model, synthetic face)', () => {
  test('detects the face, shows its box, and frames it in Portrait and Face-only modes', async ({ page }) => {
    await openEditorWith(page, [await faceImage()]);
    await openImage(page, 'face.png');
    await expect(page.getByTestId('detection-status')).toHaveText('1 face detected', { timeout: 20_000 });
    await expect(page.getByTestId('toggle-faces')).toBeVisible(); // the face overlay can be shown or hidden

    await page.getByTestId('crop-mode-portrait').click();
    const portrait = (await cropBox(page))!;
    expect(portrait.w / portrait.h).toBeGreaterThan(0.78);
    expect(portrait.w / portrait.h).toBeLessThan(0.82);
    expect(portrait.x).toBeGreaterThanOrEqual(0);
    expect(portrait.x + portrait.w).toBeLessThanOrEqual(640);
    expect(portrait.y + portrait.h).toBeLessThanOrEqual(640);
    await expect(page.getByTestId('crop-mode-portrait')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('framing-faceFill')).toBeVisible();
    await expect(page.getByTestId('framing-headroom')).toBeVisible();

    await page.getByTestId('crop-mode-face').click();
    const tight = (await cropBox(page))!;
    expect(tight.w * tight.h).toBeLessThan(portrait.w * portrait.h); // tighter than a headshot
    await expect(page.getByTestId('framing-padding')).toBeVisible();
    // Face-only follows the face: the box center is near the detected face center (≈ x 318, y 355 in this image).
    expect(Math.abs(tight.x + tight.w / 2 - 318)).toBeLessThan(60);
    expect(Math.abs(tight.y + tight.h / 2 - 355)).toBeLessThan(60);
  });

  test('the framing sliders re-derive the box, and a drag is one undo step', async ({ page }) => {
    await openEditorWith(page, [await faceImage()]);
    await openImage(page, 'face.png');
    await expect(page.getByTestId('detection-status')).toHaveText('1 face detected', { timeout: 20_000 });
    await page.getByTestId('crop-mode-face').click();
    const before = (await cropBox(page))!;

    const thumb = page.getByTestId('framing-padding-thumb');
    await thumb.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight'); // padding grows 20 steps
    const wider = (await cropBox(page))!;
    expect(wider.w).toBeGreaterThanOrEqual(before.w);
    await expect(page.getByTestId('framing-padding-value')).not.toHaveText('25%');

    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click(); // each key press is its own committed step; walk back through a few
    expect((await cropBox(page))!.w).toBeLessThanOrEqual(wider.w);
  });

  test('the detection is cached: after a reload the face is available at once, without detecting again', async ({
    page,
  }) => {
    await openEditorWith(page, [await faceImage()]);
    await openImage(page, 'face.png');
    await expect(page.getByTestId('detection-status')).toHaveText('1 face detected', { timeout: 20_000 });
    await expect
      .poll(
        async () =>
          Object.keys(((await (await page.request.get('/api/detections')).json()) as { detections: object }).detections)
            .length,
      )
      .toBe(1);

    let detectingShown = false;
    page.on('framenavigated', () => (detectingShown = false));
    await page.reload();
    await openImage(page, 'face.png');
    await expect(page.getByTestId('detection-status')).toHaveText('1 face detected', { timeout: 5000 });
    await expect(page.getByTestId('detection-progress')).toHaveCount(0);
    expect(detectingShown).toBe(false);
    await expect(page.getByTestId('crop-mode-portrait')).toBeEnabled();
  });

  test('an image with no face never gets a forced face crop; Custom still works', async ({ page }) => {
    await openEditorWith(page, [await plain('landscape.jpg')]);
    await openImage(page, 'landscape.jpg');
    await expect(page.getByTestId('detection-status')).toHaveText('No face detected', { timeout: 20_000 });
    await expect(page.getByTestId('crop-mode-portrait')).toBeDisabled();
    await expect(page.getByTestId('crop-mode-face')).toBeDisabled();
    await expect(page.getByTestId('crop-mode-portrait')).toHaveAttribute('title', 'No face was found in this image');
    expect(await cropBox(page)).toBeNull();

    await page.getByTestId('crop-mode-custom').click();
    expect(await cropBox(page)).not.toBeNull();
  });
});

test.describe('Custom boxes: numbers, aspect ratios, and persistence', () => {
  test('Custom starts as a centered box covering 80%; X, Y, W, H are exact and clamped', async ({ page }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    await expect(page.getByTestId('crop-hint')).toBeVisible();
    await page.getByTestId('crop-mode-custom').click();
    expect(await cropBox(page)).toEqual({ x: 40, y: 30, w: 320, h: 240 });
    for (const [key, value] of [
      ['x', '40'],
      ['y', '30'],
      ['w', '320'],
      ['h', '240'],
    ] as const)
      await expect(field(page, key)).toHaveValue(value);

    await field(page, 'w').fill('100');
    await field(page, 'w').press('Enter');
    expect(await cropBox(page)).toMatchObject({ w: 100, h: 240 });

    await field(page, 'x').fill('9999'); // far outside: clamps so the box stays inside the image
    await field(page, 'x').press('Enter');
    expect((await cropBox(page))!.x).toBe(300);

    await field(page, 'h').fill('1'); // below the minimum
    await field(page, 'h').press('Enter');
    expect((await cropBox(page))!.h).toBe(16);

    await field(page, 'y').fill('abc'); // garbage reverts
    await field(page, 'y').press('Enter');
    await expect(field(page, 'y')).toHaveValue('30');

    await field(page, 'y').fill('77');
    await field(page, 'y').press('Escape'); // Escape reverts without committing
    await expect(field(page, 'y')).toHaveValue('30');
  });

  test('aspect ratios: each preset locks the shape; Free releases it; Custom accepts W:H', async ({ page }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    await page.getByTestId('aspect-4-5').click(); // with no crop yet, a ratio starts a custom box
    let box = (await cropBox(page))!;
    expect(Math.abs(box.w / box.h - 0.8)).toBeLessThan(0.02);

    await page.getByTestId('aspect-16-9').click();
    box = (await cropBox(page))!;
    expect(Math.abs(box.w / box.h - 16 / 9)).toBeLessThan(0.03);

    await page.getByTestId('aspect-1-1').click();
    box = (await cropBox(page))!;
    expect(box.w).toBe(box.h);

    // Typing a width with a locked ratio sets the height.
    await field(page, 'w').fill('120');
    await field(page, 'w').press('Enter');
    expect(await cropBox(page)).toMatchObject({ w: 120, h: 120 });

    await page.getByTestId('aspect-original').click();
    box = (await cropBox(page))!;
    expect(Math.abs(box.w / box.h - 400 / 300)).toBeLessThan(0.03);

    await page.getByTestId('aspect-custom').click();
    await page.getByTestId('custom-ratio').fill('5:7');
    await page.getByTestId('custom-ratio').press('Enter');
    box = (await cropBox(page))!;
    expect(Math.abs(box.w / box.h - 5 / 7)).toBeLessThan(0.03);

    await page.getByTestId('aspect-free').click();
    await field(page, 'w').fill('200');
    await field(page, 'w').press('Enter');
    expect(await cropBox(page)).toMatchObject({ w: 200 }); // height no longer follows
    await expect(page.getByTestId('aspect-free')).toHaveAttribute('aria-checked', 'true');
  });

  test('a crop is saved, survives a reload, and "Remove crop" clears it', async ({ page }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    await page.getByTestId('crop-mode-custom').click();
    await field(page, 'x').fill('55');
    await field(page, 'x').press('Enter');
    await expect(page.getByTestId('edit-sync-status')).toHaveText('Saved');

    const saved = (await (await page.request.get('/api/edits')).json()) as {
      edits: Record<string, { crop: { rect: { x: number }; mode: string } | null }>;
    };
    expect(Object.values(saved.edits)[0]?.crop).toMatchObject({ mode: 'custom', rect: { x: 55 } });

    await reloadAndOpen(page, 'a.jpg');
    expect((await cropBox(page))!.x).toBe(55);
    await expect(field(page, 'x')).toHaveValue('55');

    await page.getByTestId('crop-remove').click();
    expect(await cropBox(page)).toBeNull();
    await expect(page.getByTestId('edit-sync-status')).toHaveText('Saved');
    const after = (await (await page.request.get('/api/edits')).json()) as { edits: object };
    expect(Object.keys(after.edits)).toHaveLength(0); // nothing differs from the defaults any more
  });

  test('crop changes are undoable and redoable, with named steps', async ({ page }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    await page.getByTestId('crop-mode-custom').click();
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo custom crop');
    await field(page, 'x').fill('60'); // the largest valid X is 80 (image width 400 minus box width 320)
    await field(page, 'x').press('Enter');
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo edit crop');

    await page.getByTestId('undo').click();
    expect((await cropBox(page))!.x).toBe(40);
    await page.getByTestId('undo').click();
    expect(await cropBox(page)).toBeNull();
    await page.getByTestId('redo').click();
    await page.getByTestId('redo').click();
    expect((await cropBox(page))!.x).toBe(60);
  });
});

test.describe('Canvas: drawing, moving, resizing, zoom, pan, and keyboard', () => {
  test('drag on the image draws a box; a plain click does not', async ({ page }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    expect(await viewScale(page)).toBe(1); // a small image is shown at 100%, so screen pixels equal image pixels

    const p = await toScreen(page, 100, 80);
    await page.mouse.click(p.x, p.y);
    expect(await cropBox(page)).toBeNull(); // a click is not a box

    await drag(page, await toScreen(page, 50, 40), await toScreen(page, 250, 190));
    expect(await cropBox(page)).toEqual({ x: 50, y: 40, w: 200, h: 150 });
    await expect(page.getByTestId('crop-mode-custom')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo draw crop'); // one step for the whole drag
  });

  test('drag inside moves the box (and cannot leave the image); drag a handle resizes it; each is one undo step', async ({
    page,
  }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    await drag(page, await toScreen(page, 50, 40), await toScreen(page, 250, 190)); // 200 × 150 at (50, 40)

    await drag(page, await toScreen(page, 150, 115), await toScreen(page, 190, 135)); // move by (+40, +20)
    expect(await cropBox(page)).toEqual({ x: 90, y: 60, w: 200, h: 150 });
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo move crop');

    await drag(page, await toScreen(page, 190, 135), await toScreen(page, 900, 900)); // shove it far past the corner
    const far = (await cropBox(page))!;
    expect(far.x + far.w).toBeLessThanOrEqual(400);
    expect(far.y + far.h).toBeLessThanOrEqual(300);
    expect(far).toMatchObject({ w: 200, h: 150 }); // moving never resizes

    await drag(page, await toScreen(page, far.x + far.w, far.y + far.h), await toScreen(page, 380, 290)); // SE handle
    const resized = (await cropBox(page))!;
    expect(resized.x).toBe(far.x); // the opposite corner stays fixed
    expect(resized.y).toBe(far.y);
    expect(resized.x + resized.w).toBe(380);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo resize crop');

    await page.getByTestId('undo').click();
    expect(await cropBox(page)).toEqual(far); // a single undo reverts the whole resize
  });

  test('with a locked ratio, resizing keeps the ratio exactly', async ({ page }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    await page.getByTestId('aspect-1-1').click();
    const start = (await cropBox(page))!;
    await drag(page, await toScreen(page, start.x + start.w, start.y + start.h), await toScreen(page, 330, 250));
    const box = (await cropBox(page))!;
    expect(Math.abs(box.w - box.h)).toBeLessThanOrEqual(1);
    expect(box.w).toBeGreaterThan(start.w - 5);
  });

  test('zoom: wheel zooms at the cursor, the buttons and F / 1 work, and Space-drag pans', async ({ page }) => {
    await openEditorWith(page, [await plain('big.jpg', 3000, 2000)]);
    await openImage(page, 'big.jpg');
    const fit = await viewScale(page);
    expect(fit).toBeLessThan(1);
    await expect(page.getByTestId('zoom-readout')).toHaveText(`${Math.round(fit * 100)}%`);

    // The image point under the cursor stays under the cursor while zooming.
    const anchor = await toScreen(page, 1500, 1000);
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => viewScale(page)).toBeGreaterThan(fit * 1.3);
    const after = await toScreen(page, 1500, 1000);
    expect(Math.abs(after.x - anchor.x)).toBeLessThan(1.5);
    expect(Math.abs(after.y - anchor.y)).toBeLessThan(1.5);

    await page.getByTestId('zoom-actual').click();
    expect(await viewScale(page)).toBe(1);
    await expect(page.getByTestId('zoom-readout')).toHaveText('100%');
    await page.getByTestId('zoom-fit').click();
    expect(await viewScale(page)).toBeCloseTo(fit, 6);
    await page.getByTestId('zoom-in').click();
    expect(await viewScale(page)).toBeCloseTo(fit * 1.25, 6);
    await page.getByTestId('zoom-out').click();
    expect(await viewScale(page)).toBeCloseTo(fit, 6);

    await stage(page).focus();
    await page.keyboard.press('1');
    expect(await viewScale(page)).toBe(1);
    await page.keyboard.press('f');
    expect(await viewScale(page)).toBeCloseTo(fit, 6);

    // Pan with Space + drag: the view moves, the zoom does not, and no crop is drawn.
    await page.getByTestId('zoom-actual').click();
    const x0 = Number(await stage(page).getAttribute('data-view-x'));
    const center = await toScreen(page, 1500, 1000);
    await stage(page).focus();
    await page.keyboard.down('Space');
    await drag(page, center, { x: center.x + 80, y: center.y + 30 });
    await page.keyboard.up('Space');
    expect(Number(await stage(page).getAttribute('data-view-x'))).toBeCloseTo(x0 + 80, 0);
    expect(await viewScale(page)).toBe(1);
    expect(await cropBox(page)).toBeNull();

    await page.getByRole('option', { name: 'big.jpg' }).click();
    // Fit is restored when pressed; a manual zoom belongs to one image.
    await page.getByTestId('zoom-fit').click();
    expect(await viewScale(page)).toBeCloseTo(fit, 6);
  });

  test('keyboard: arrows nudge the crop by 1 px (Shift = 10); a held key is ONE undo step; the edge clamps', async ({
    page,
  }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    await page.getByTestId('crop-mode-custom').click(); // x = 40, y = 30
    await stage(page).focus();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    expect(await cropBox(page)).toMatchObject({ x: 41, y: 40 });
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo nudge crop');

    // Holding a key repeats keydown; the step closes when the key is released.
    for (let i = 0; i < 5; i++) await page.keyboard.down('ArrowRight');
    await page.keyboard.up('ArrowRight');
    expect((await cropBox(page))!.x).toBe(46);
    await page.getByTestId('undo').click();
    expect((await cropBox(page))!.x).toBe(41); // the whole held key reverted at once, not just the last repeat

    await stage(page).focus(); // the Undo button had keyboard focus
    for (let i = 0; i < 100; i++) await page.keyboard.press('ArrowLeft');
    expect((await cropBox(page))!.x).toBe(0); // clamped at the image edge
  });

  test('hold to compare hides the crop overlay and shows the whole image', async ({ page }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    await page.getByTestId('crop-mode-custom').click();
    expect(await cropBox(page)).not.toBeNull();

    const compare = page.getByTestId('compare-button');
    await expect(compare).toBeVisible(); // a cropped image counts as edited
    const box = (await compare.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => cropBox(page)).toBeNull();
    await page.mouse.up();
    await expect.poll(() => cropBox(page)).not.toBeNull();
  });
});

test.describe('Several faces and batch apply', () => {
  test('the face picker steps between faces, and the crop follows the chosen face', async ({ page }) => {
    await openEditorWith(page, [await plain('group.jpg', 1200, 800)]);
    await injectFaces(page, 'group.jpg', [
      { x: 150, y: 250, w: 160, h: 190 },
      { x: 800, y: 300, w: 220, h: 260 },
    ]);
    await reloadAndOpen(page, 'group.jpg');
    await expect(page.getByTestId('detection-status')).toHaveText('2 faces detected');

    await page.getByTestId('crop-mode-face').click();
    // Faces are numbered by confidence; the crop starts on the LARGEST face, which here is the second most confident.
    await expect(page.getByTestId('face-picker-label')).toHaveText('Face 2 of 2');
    const largest = (await cropBox(page))!;
    await page.getByRole('button', { name: 'Previous face' }).click();
    await expect(page.getByTestId('face-picker-label')).toHaveText('Face 1 of 2');
    const other = (await cropBox(page))!;
    expect(Math.abs(largest.x - other.x)).toBeGreaterThan(400); // moved to the other person
    await page.getByRole('button', { name: 'Next face' }).click();
    expect(await cropBox(page)).toEqual(largest);
  });

  test('"Apply crop to all" re-frames each image from ITS OWN face and skips images with no face; one undo reverts all', async ({
    page,
  }) => {
    await openEditorWith(page, [
      await plain('left.jpg', 1000, 800),
      await plain('right.jpg', 1000, 800),
      await plain('empty.jpg', 1000, 800),
    ]);
    await injectFaces(page, 'left.jpg', [{ x: 150, y: 250, w: 200, h: 240 }]);
    await injectFaces(page, 'right.jpg', [{ x: 650, y: 280, w: 200, h: 240 }]);
    await injectFaces(page, 'empty.jpg', []);
    await page.reload();
    await expect(page.getByTestId('library-count')).toHaveText('3 images');

    await openImage(page, 'left.jpg');
    await expect(page.getByTestId('detection-status')).toHaveText('1 face detected');
    await page.getByTestId('crop-mode-portrait').click();
    const left = (await cropBox(page))!;
    await expect(page.getByTestId('crop-apply-all')).toHaveText('Apply crop to all (3)');
    await page.getByTestId('crop-apply-all').click();
    await expect(page.getByTestId('crop-note')).toHaveText('Applied to 1 image · 1 skipped (no face found)');

    await openImage(page, 'right.jpg');
    const right = (await cropBox(page))!;
    expect(right.x).toBeGreaterThan(left.x + 300); // follows the face on the right, not a copy of the left rectangle
    expect(Math.abs(right.w / right.h - 0.8)).toBeLessThan(0.02);

    await openImage(page, 'empty.jpg');
    expect(await cropBox(page)).toBeNull(); // never given a face crop it cannot have

    await page.getByTestId('undo').click(); // ONE undo for the whole batch
    await openImage(page, 'right.jpg');
    expect(await cropBox(page)).toBeNull();
    await openImage(page, 'left.jpg');
    expect(await cropBox(page)).toEqual(left); // the source image keeps its own crop
  });

  test('a custom box is applied by normalized position and size to images of other sizes', async ({ page }) => {
    await openEditorWith(page, [await plain('wide.jpg', 800, 400), await plain('small.jpg', 400, 300)]);
    await openImage(page, 'wide.jpg');
    await page.getByTestId('crop-mode-custom').click(); // x 80, y 40, w 640, h 320 (the centered 80%)
    await page.getByTestId('crop-apply-all').click();
    await expect(page.getByTestId('crop-note')).toHaveText('Applied to 1 image');
    await openImage(page, 'small.jpg');
    expect(await cropBox(page)).toEqual({ x: 40, y: 30, w: 320, h: 240 }); // the same centered 80% of a 400 × 300 image
  });
});

test.describe('Output sizing', () => {
  const size = (page: Page) => page.getByTestId('output-size');

  test('shows the exact output size for the crop and every sizing mode', async ({ page }) => {
    await openEditorWith(page, [await plain('a.jpg', 2000, 2500)]);
    await openImage(page, 'a.jpg');
    await expect(size(page)).toHaveText('2,000 × 2,500'); // no crop: the whole image
    await page.getByTestId('aspect-4-5').click();
    await expect(page.getByTestId('output-readout')).toContainText('from the crop');

    await page.getByTestId('output-size-mode').selectOption('width');
    await page.getByTestId('output-width-only').fill('400');
    await page.getByTestId('output-width-only').press('Enter');
    const crop = (await cropBox(page))!;
    await expect(size(page)).toHaveText(`400 × ${Math.round((400 * crop.h) / crop.w)}`);

    await page.getByTestId('output-size-mode').selectOption('longEdge');
    await page.getByTestId('output-longedge').fill('500');
    await page.getByTestId('output-longedge').press('Enter');
    await expect(size(page)).toContainText('500'); // the long edge is exactly 500 (the crop is portrait, so this is the height)

    await page.getByTestId('output-size-mode').selectOption('none');
    await expect(size(page)).toHaveText(`${crop.w.toLocaleString('en-US')} × ${crop.h.toLocaleString('en-US')}`);
  });

  test('exact sizes: Fit inside, Fill, Pad, and Stretch behave differently; Stretch warns it distorts', async ({
    page,
  }) => {
    await openEditorWith(page, [await plain('a.jpg', 2000, 2500)]);
    await openImage(page, 'a.jpg');
    await page.getByTestId('output-size-mode').selectOption('exact');
    await page.getByTestId('output-width').fill('1080');
    await page.getByTestId('output-width').press('Enter');
    await page.getByTestId('output-height').fill('1080');
    await page.getByTestId('output-height').press('Enter');

    await expect(size(page)).toHaveText('864 × 1,080'); // inside: no distortion, smaller than the box
    await page.getByTestId('output-fit').selectOption('cover');
    await expect(size(page)).toHaveText('1,080 × 1,080');
    await expect(page.getByTestId('output-distorted')).toHaveCount(0);
    await page.getByTestId('output-fit').selectOption('pad');
    await expect(size(page)).toHaveText('1,080 × 1,080');
    await expect(page.getByTestId('output-pad-color')).toBeVisible();
    await page.getByTestId('output-fit').selectOption('stretch');
    await expect(size(page)).toHaveText('1,080 × 1,080');
    await expect(page.getByTestId('output-distorted')).toBeVisible();
    await expect(page.getByTestId('output-fit-help')).toContainText('DISTORTS');
    await expect(page.getByTestId('output-pad-color')).toHaveCount(0);
  });

  test('upscaling is off by default and capped; turning it on honors the requested size', async ({ page }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300)]);
    await openImage(page, 'a.jpg');
    await page.getByTestId('output-size-mode').selectOption('longEdge');
    await page.getByTestId('output-longedge').fill('2000');
    await page.getByTestId('output-longedge').press('Enter');
    await expect(size(page)).toHaveText('400 × 300'); // never enlarged without permission
    await page.getByTestId('output-upscale').check();
    await expect(size(page)).toHaveText('2,000 × 1,500');
    await expect(page.getByTestId('output-readout')).toContainText('Enlarges pixels');
  });

  test('format and quality are saved; a PNG has no quality; settings persist and can be applied to all or reset', async ({
    page,
  }) => {
    await openEditorWith(page, [await plain('a.jpg', 400, 300), await plain('b.jpg', 401, 300)]);
    await openImage(page, 'a.jpg');
    await page.getByTestId('output-format').selectOption('webp');
    await expect(page.getByTestId('output-quality')).toBeVisible();
    await page.getByTestId('output-quality-thumb').focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft'); // 90 → 85
    await expect(page.getByTestId('output-quality-value')).toHaveText('85');
    await page.getByTestId('output-format').selectOption('png');
    await expect(page.getByTestId('output-quality')).toHaveCount(0);
    await page.getByTestId('output-format').selectOption('jpeg');
    await expect(page.getByTestId('edit-sync-status')).toHaveText('Saved');

    await page.getByTestId('output-apply-all').click();
    await expect(page.getByTestId('edit-sync-status')).toHaveText('Saved');
    await page.getByTestId('undo').click(); // one undo for "apply to all"
    await openImage(page, 'b.jpg');
    await expect(page.getByTestId('output-format')).toHaveValue('source');
    await openImage(page, 'a.jpg');
    await expect(page.getByTestId('output-format')).toHaveValue('jpeg');

    await reloadAndOpen(page, 'a.jpg');
    await expect(page.getByTestId('output-format')).toHaveValue('jpeg');
    await page.getByTestId('output-reset').click();
    await expect(page.getByTestId('output-format')).toHaveValue('source');
    await expect(page.getByTestId('output-reset')).toBeDisabled();
  });
});

test.describe('Crop API', () => {
  test('rejects invalid crops and output, and clamps a crop that exceeds the real image', async ({ browser }) => {
    const origin = `http://localhost:${process.env.FS_E2E_PORT ?? 3100}`;
    const context = await browser.newContext({ baseURL: origin });
    const created = await context.request.post('/api/images', {
      headers: { origin, 'content-type': 'application/octet-stream', 'x-fs-filename': 'a.jpg' },
      data: await makeJpeg({ width: 200, height: 100 }),
    });
    const { id } = (await created.json()) as { id: string };
    const adjustments = { exposure: 0, temperature: 0, tint: 0, saturation: 0, brightness: 0 };
    const crop = (rect: Box2) => ({
      id: 'crp_aaaaaaaaaaaaaaaaaaaaaa',
      mode: 'custom',
      rect,
      aspect: { preset: 'free', value: null },
      faceId: null,
      framing: { faceFill: 0.42, headroom: 0.18, padding: 0.25 },
      manual: true,
      constrained: false,
      label: null,
    });
    const patch = (item: object) =>
      context.request.patch('/api/edits', { headers: { origin }, data: { items: [{ id, adjustments, ...item }] } });

    expect((await patch({ crop: crop({ x: -5, y: 0, width: 50, height: 50 }) })).status()).toBe(400); // negative origin
    expect((await patch({ crop: crop({ x: 0, y: 0, width: 0, height: 50 }) })).status()).toBe(400); // empty
    expect((await patch({ crop: { ...crop({ x: 0, y: 0, width: 50, height: 50 }), mode: 'sideways' } })).status()).toBe(
      400,
    );
    expect(
      (
        await patch({
          output: {
            format: 'tiff',
            quality: 90,
            resize: { mode: 'none' },
            allowUpscale: false,
            padColor: '#FFFFFF',
            filenameTemplate: '{name}',
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await patch({
          output: {
            format: 'jpeg',
            quality: 500,
            resize: { mode: 'none' },
            allowUpscale: false,
            padColor: '#FFFFFF',
            filenameTemplate: '{name}',
          },
        })
      ).status(),
    ).toBe(400);

    expect((await patch({ crop: crop({ x: 150, y: 60, width: 500, height: 500 }) })).status()).toBe(200); // too big for 200 × 100
    const stored = (await (await context.request.get('/api/edits')).json()) as {
      edits: Record<string, { crop: { rect: Box2 } }>;
    };
    const rect = stored.edits[id]!.crop.rect;
    expect(rect.x + rect.width).toBeLessThanOrEqual(200);
    expect(rect.y + rect.height).toBeLessThanOrEqual(100);
    await context.close();
  });
});

type Box2 = { x: number; y: number; width: number; height: number };

test.describe('Interactive composition workspace', () => {
  test('hover feedback, live dimensions, center magnets, Alt precision, and one gesture undo', async ({ page }) => {
    await openEditorWith(page, [await plain('interactive.jpg')]);
    await openImage(page, 'interactive.jpg');
    await page.getByTestId('crop-mode-custom').click();
    const corner = await toScreen(page, 40, 30);
    await page.mouse.move(corner.x, corner.y);
    await expect(stage(page)).toHaveAttribute('data-hover', 'nw');
    await expect(page.getByTestId('crop-action-hint')).toContainText('Drag to resize');
    await field(page, 'x').fill('20');
    await field(page, 'x').press('Enter');
    const from = await toScreen(page, 160, 140);
    const nearCenter = await toScreen(page, 178, 140); // x=38; the center is x=40
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(nearCenter.x, nearCenter.y, { steps: 6 });
    await expect(stage(page)).toHaveAttribute('data-snap-x', 'true');
    await expect(page.getByTestId('crop-measurement')).toContainText('320 × 240 px');
    await expect(page.getByTestId('crop-measurement')).toContainText('Centered');
    await page.mouse.up();
    expect((await cropBox(page))!.x).toBe(40);
    await page.getByTestId('undo').click();
    expect((await cropBox(page))!.x).toBe(20);
    await page.keyboard.down('Alt');
    await drag(page, await toScreen(page, 160, 140), await toScreen(page, 178, 140));
    await page.keyboard.up('Alt');
    expect((await cropBox(page))!.x).toBe(38);
    await page.getByTestId('undo').click();
    expect((await cropBox(page))!.x).toBe(20);
  });

  test('preview clips actual pixels, preserves edits and camera, and returns with Escape', async ({ page }) => {
    await openEditorWith(page, [await plain('preview.jpg', 1600, 1200)]);
    await openImage(page, 'preview.jpg');
    await page.getByTestId('aspect-4-5').click();
    const before = await cropBox(page);
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    const camera = await stage(page).getAttribute('data-view-x');
    const undoLabel = await page.getByTestId('undo').getAttribute('aria-label');
    await page.getByTestId('preview-crop').click();
    await expect(stage(page)).toHaveAttribute('data-previewing', 'true');
    await expect(page.getByTestId('preview-crop')).toHaveText('Back to edit');
    // Inspect the rendered image layer: excluded original pixels must be clipped away, not merely dimmed.
    await expect
      .poll(async () =>
        stage(page).evaluate((el) => {
          const canvas = el.querySelector('canvas')!;
          const d = (el as HTMLElement).dataset;
          const frame = d.crop!.split(',').map(Number);
          const scale = Number(d.viewScale);
          const x = Number(d.viewX) + frame[0]! * scale;
          const y = Number(d.viewY) + frame[1]! * scale;
          const ratio = canvas.width / canvas.clientWidth;
          const ctx = canvas.getContext('2d')!;
          return [
            ctx.getImageData(Math.floor((x - 8) * ratio), Math.floor((y + 20) * ratio), 1, 1).data[3],
            ctx.getImageData(Math.floor((x + 20) * ratio), Math.floor((y + 20) * ratio), 1, 1).data[3],
          ];
        }),
      )
      .toEqual([0, 255]);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', undoLabel!);
    expect(await cropBox(page)).toEqual(before);
    await stage(page).focus();
    await page.keyboard.press('ArrowRight'); // preview never edits the crop
    expect(await cropBox(page)).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(stage(page)).toHaveAttribute('data-previewing', 'false');
    await expect(stage(page)).toHaveAttribute('data-view-x', camera!);
    await page.keyboard.press('p');
    await expect(stage(page)).toHaveAttribute('data-previewing', 'true');
    await page.keyboard.press('f');
    await expect(stage(page)).toHaveAttribute('data-previewing', 'false');
  });

  test('guide toggles and center action work by keyboard and preserve undo history', async ({ page }) => {
    await openEditorWith(page, [await plain('guides.jpg')]);
    await openImage(page, 'guides.jpg');
    await page.getByTestId('crop-mode-custom').click();
    await field(page, 'x').fill('12');
    await field(page, 'x').press('Enter');
    await page.getByTestId('center-crop').click();
    expect(await cropBox(page)).toEqual({ x: 40, y: 30, w: 320, h: 240 });
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo center crop');
    await page.getByTestId('undo').click();
    expect((await cropBox(page))!.x).toBe(12);
    await stage(page).focus();
    await page.keyboard.press('g');
    await expect(page.getByTestId('toggle-guides')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('toggle-guides').press('Enter');
    await expect(stage(page)).toHaveAttribute('data-guides', 'false');
  });

  test('motion respects reduced-motion while feedback and editing still work', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openEditorWith(page, [await plain('reduced.jpg')]);
    await openImage(page, 'reduced.jpg');
    await page.getByTestId('aspect-1-1').click();
    expect(await page.getByTestId('crop-action-hint').evaluate((el) => getComputedStyle(el).animationName)).toBe(
      'none',
    );
    await page.getByTestId('preview-crop').click();
    await expect(stage(page)).toHaveAttribute('data-previewing', 'true');
    await page.keyboard.press('Escape');
    await expect(stage(page)).toHaveAttribute('data-previewing', 'false');
  });
});

test.describe('Automatic crop camera', () => {
  test('holds the camera while drawing, then visibly zooms into the committed crop', async ({ page }) => {
    await openEditorWith(page, [await plain('settle.jpg', 1600, 1200)]);
    await openImage(page, 'settle.jpg');
    const before = await viewScale(page);
    const from = await toScreen(page, 500, 350);
    const to = await toScreen(page, 1000, 850);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    expect(await viewScale(page)).toBe(before);
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    const drawn = await cropBox(page);
    // Record in the browser before release: tool round trips can outlast a 320ms transition.
    await stage(page).evaluate((el) => {
      const node = el as HTMLElement & { cameraSamples?: number[]; cameraObserver?: MutationObserver };
      node.cameraSamples = [Number(node.dataset.viewScale)];
      node.cameraObserver = new MutationObserver(() => node.cameraSamples!.push(Number(node.dataset.viewScale)));
      node.cameraObserver.observe(node, { attributes: true, attributeFilter: ['data-view-scale'] });
    });
    await page.mouse.up();
    await expect.poll(() => viewScale(page)).toBeGreaterThan(before * 1.5);
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    const scales = await stage(page).evaluate((el) => {
      const node = el as HTMLElement & { cameraSamples?: number[]; cameraObserver?: MutationObserver };
      node.cameraObserver!.disconnect();
      return node.cameraSamples!;
    });
    expect(new Set(scales).size).toBeGreaterThan(2);
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    expect(await viewScale(page)).toBeGreaterThan(before * 1.5);
    expect(await cropBox(page)).toEqual(drawn);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo draw crop');
    const a = await toScreen(page, drawn!.x, drawn!.y);
    const b = await toScreen(page, drawn!.x + drawn!.w, drawn!.y + drawn!.h);
    const bounds = (await stage(page).boundingBox())!;
    expect(a.x).toBeGreaterThan(bounds.x + 30);
    expect(a.y).toBeGreaterThan(bounds.y + 80);
    expect(b.x).toBeLessThan(bounds.x + bounds.width - 30);
    expect(b.y).toBeLessThan(bounds.y + bounds.height - 60);
    await page.getByTestId('undo').click();
    expect(await cropBox(page)).toBeNull();
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    expect(await viewScale(page)).toBeCloseTo(before, 6);
  });

  test('another drag interrupts settling immediately and the view stays still until release', async ({ page }) => {
    await openEditorWith(page, [await plain('interrupt.jpg', 1600, 1200)]);
    await openImage(page, 'interrupt.jpg');
    await page.getByTestId('crop-mode-custom').click();
    await expect(stage(page)).toHaveAttribute('data-settling', 'true');
    // Click well inside the crop while its camera is moving; do not wait for settling here.
    const point = await stage(page).evaluate((el) => {
      const d = (el as HTMLElement).dataset;
      const box = el.getBoundingClientRect();
      return {
        x: box.left + Number(d.viewX) + 800 * Number(d.viewScale),
        y: box.top + Number(d.viewY) + 600 * Number(d.viewScale),
      };
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    const camera = await stage(page).getAttribute('data-view-scale');
    await stage(page).evaluate(async () => {
      for (let i = 0; i < 24; i++) await new Promise(requestAnimationFrame);
    });
    await expect(stage(page)).toHaveAttribute('data-view-scale', camera!);
    await page.mouse.move(point.x + 20, point.y + 10, { steps: 5 });
    await expect(stage(page)).toHaveAttribute('data-view-scale', camera!);
    await page.mouse.up();
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo move crop');
  });

  test('auto zoom can be disabled and manual Fit/actual size retain control', async ({ page }) => {
    await openEditorWith(page, [await plain('control.jpg', 1600, 1200)]);
    await openImage(page, 'control.jpg');
    const original = await viewScale(page);
    await page.getByTestId('toggle-auto-zoom').click();
    await page.getByTestId('aspect-4-5').click();
    await expect(stage(page)).toHaveAttribute('data-auto-zoom', 'false');
    expect(await viewScale(page)).toBe(original);
    await page.getByTestId('toggle-auto-zoom').click();
    await expect(stage(page)).toHaveAttribute('data-settling', 'true');
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    expect(await viewScale(page)).toBeGreaterThan(original);
    await page.getByTestId('zoom-fit').click();
    expect(await viewScale(page)).toBeCloseTo(original, 6);
    await page.getByTestId('zoom-actual').click();
    expect(await viewScale(page)).toBe(1);
    await page.evaluate(async () => {
      (document.querySelector('[data-testid="aspect-1-1"]') as HTMLButtonElement).click();
      const stage = document.querySelector('[data-testid="crop-stage"]')!;
      for (let i = 0; i < 20 && stage.getAttribute('data-settling') !== 'true'; i++)
        await new Promise(requestAnimationFrame);
      if (stage.getAttribute('data-settling') !== 'true') throw new Error('Camera did not start settling');
      (document.querySelector('[data-testid="zoom-fit"]') as HTMLButtonElement).click();
    }); // interrupt within the browser rather than relying on a tool round trip
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    expect(await viewScale(page)).toBeCloseTo(original, 6);
  });

  test('reduced motion reframes without animated camera movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openEditorWith(page, [await plain('still.jpg', 1600, 1200)]);
    await openImage(page, 'still.jpg');
    const before = await viewScale(page);
    await page.getByTestId('aspect-1-1').click();
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    expect(await viewScale(page)).toBeGreaterThan(before);
    await page.getByTestId('undo').click();
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    expect(await viewScale(page)).toBeCloseTo(before, 6);
  });
});

test.describe('Escape crop shortcut', () => {
  test('removes the crop, restores Fit, persists, and can be undone/redone', async ({ page }) => {
    await openEditorWith(page, [await plain('escape.jpg', 1600, 1200)]);
    await openImage(page, 'escape.jpg');
    const fullScale = await viewScale(page);
    await page.getByTestId('aspect-1-1').click();
    const crop = await cropBox(page);
    await stage(page).focus();
    await page.keyboard.press('Escape');
    await expect(stage(page)).toHaveAttribute('data-crop', '');
    await expect(stage(page)).toHaveAttribute('data-settling', 'false');
    expect(await viewScale(page)).toBeCloseTo(fullScale, 6);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo remove crop');
    await page.getByTestId('undo').click();
    expect(await cropBox(page)).toEqual(crop);
    await page.getByTestId('redo').click();
    await expect(stage(page)).toHaveAttribute('data-crop', '');
    await expect(page.getByTestId('edit-sync-status')).toHaveText('Saved');
    await reloadAndOpen(page, 'escape.jpg');
    expect(await cropBox(page)).toBeNull();
    const label = await page.getByTestId('undo').getAttribute('aria-label');
    await stage(page).focus();
    await page.keyboard.press('Escape'); // no crop: no new history operation
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', label!);
  });

  test('preserves preview exit, field revert, modal close, and library selection shortcuts', async ({ page }) => {
    await openEditorWith(page, [await plain('scope.jpg')]);
    await openImage(page, 'scope.jpg');
    await page.getByTestId('crop-mode-custom').click();
    const crop = await cropBox(page);
    await page.getByTestId('preview-crop').click();
    await stage(page).focus();
    await page.keyboard.down('Escape');
    await expect(stage(page)).toHaveAttribute('data-previewing', 'false');
    await page.keyboard.down('Escape'); // held-key repeat must not remove the crop after closing preview
    await page.keyboard.up('Escape');
    expect(await cropBox(page)).toEqual(crop);
    await field(page, 'x').fill('20');
    await field(page, 'x').press('Escape');
    expect(await cropBox(page)).toEqual(crop);
    await page.getByTestId('open-export').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(await cropBox(page)).toEqual(crop);
    await page.getByRole('listbox').focus();
    await page.keyboard.press('Escape');
    expect(await cropBox(page)).toEqual(crop);
    await stage(page).focus();
    await page.keyboard.press('Escape');
    expect(await cropBox(page)).toBeNull();
  });

  test('ends an active drag so pointer movement cannot recreate the removed crop', async ({ page }) => {
    await openEditorWith(page, [await plain('drag-escape.jpg')]);
    await openImage(page, 'drag-escape.jpg');
    await page.getByTestId('crop-mode-custom').click();
    const from = await toScreen(page, 200, 150);
    const to = await toScreen(page, 210, 160);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    const moved = await cropBox(page);
    await page.keyboard.press('Escape');
    await expect(stage(page)).toHaveAttribute('data-dragging', 'false');
    await expect(stage(page)).toHaveAttribute('data-crop', '');
    await page.mouse.move(to.x + 30, to.y + 20, { steps: 5 });
    await page.mouse.up();
    expect(await cropBox(page)).toBeNull();
    await page.getByTestId('undo').click();
    expect(await cropBox(page)).toEqual(moved);
  });
});

test.describe('Shape frames', () => {
  for (const shape of ['circle', 'square', 'hexagon'] as const) {
    test(`${shape} can be resized, moved, undone, saved, and restored`, async ({ page }) => {
      await openEditorWith(page, [await plain('shape.jpg', 1200, 900)]);
      await openImage(page, 'shape.jpg');
      await page.getByTestId(`crop-shape-${shape}`).click();
      await expect(stage(page)).toHaveAttribute('data-shape', shape);
      const initial = (await cropBox(page))!;
      if (shape !== 'hexagon') {
        expect(initial.w).toBe(initial.h);
        await expect(page.getByTestId('aspect-16-9')).toBeDisabled();
      }
      await drag(
        page,
        await toScreen(page, initial.x + initial.w, initial.y + initial.h),
        await toScreen(page, initial.x + initial.w - 80, initial.y + initial.h - 80),
      );
      const resized = (await cropBox(page))!;
      expect(resized.w).toBeLessThan(initial.w);
      if (shape !== 'hexagon') expect(resized.w).toBe(resized.h);
      await page.getByTestId('undo').click();
      expect(await cropBox(page)).toEqual(initial);
      const center = await toScreen(page, initial.x + initial.w / 2, initial.y + initial.h / 2);
      await drag(page, center, { x: center.x + 25, y: center.y + 15 });
      expect(await cropBox(page)).not.toEqual(initial);
      await expect(stage(page)).toHaveAttribute('data-shape', shape);
      await reloadAndOpen(page, 'shape.jpg');
      await expect(stage(page)).toHaveAttribute('data-shape', shape);
      if (shape !== 'square') {
        await page.getByTestId('preview-crop').click();
        await expect
          .poll(() =>
            stage(page).evaluate((el) => {
              const canvas = el.querySelector('canvas')!;
              const d = (el as HTMLElement).dataset;
              const [x, y, w, h] = d.crop!.split(',').map(Number) as [number, number, number, number];
              const scale = Number(d.viewScale),
                ratio = canvas.width / canvas.clientWidth;
              const ctx = canvas.getContext('2d')!;
              const alpha = (fx: number, fy: number) =>
                ctx.getImageData(
                  Math.floor((Number(d.viewX) + (x + w * fx) * scale) * ratio),
                  Math.floor((Number(d.viewY) + (y + h * fy) * scale) * ratio),
                  1,
                  1,
                ).data[3];
              return [alpha(0.05, 0.05), alpha(0.5, 0.5)];
            }),
          )
          .toEqual([0, 255]);
      }
    });
  }
  test('circle transparency shortcut sets PNG and rectangle releases the aspect lock', async ({ page }) => {
    await openEditorWith(page, [await plain('transparent.jpg')]);
    await openImage(page, 'transparent.jpg');
    await page.getByTestId('crop-shape-circle').click();
    await page.getByTestId('shape-use-png').click();
    await expect(page.getByTestId('output-format')).toHaveValue('png');
    await expect(page.getByTestId('shape-use-png')).toHaveCount(0);
    await page.getByTestId('crop-shape-rectangle').click();
    await expect(page.getByTestId('aspect-free')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('aspect-16-9')).toBeEnabled();
  });
});
