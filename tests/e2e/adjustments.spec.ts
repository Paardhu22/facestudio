import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';

import { makeJpeg } from '../fixtures/images';

type Upload = { name: string; mimeType: string; buffer: Buffer };

/** A flat-color JPEG: the expected output of every adjustment is then a single, computable value. */
async function solid(name: string, [r, g, b]: [number, number, number], width = 64, height = 48): Promise<Upload> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r, g, b } } })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return { name, mimeType: 'image/jpeg', buffer };
}

// Independent reference for the sRGB transfer functions (the kernel's own LUTs are not reused).
const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l: number) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255;

/**
 * Expected output for a flat color, written straight from the formulas in SKILLS.md §C.6 (an independent reference,
 * not the kernel's own tables): exposure × luminance-normalized white balance in linear light, then the brightness curve.
 */
function expectedPixel(
  rgb: [number, number, number],
  a: { exposure?: number; temperature?: number; tint?: number; brightness?: number },
): [number, number, number] {
  const exposure = 2 ** (a.exposure ?? 0);
  const t = (a.temperature ?? 0) / 100;
  const u = (a.tint ?? 0) / 100;
  const w = [2 ** (0.35 * t), 2 ** (-0.3 * u), 2 ** (-0.35 * t)] as const;
  const norm = 0.2126 * w[0] + 0.7152 * w[1] + 0.0722 * w[2];
  const curve = 2 ** (-0.8 * ((a.brightness ?? 0) / 100));
  const channel = (value: number, weight: number) => {
    const linear = Math.min(1, toLinear(value) * ((exposure * weight) / norm));
    return 255 * (toSrgb(linear) / 255) ** curve;
  };
  return [channel(rgb[0], w[0]), channel(rgb[1], w[1]), channel(rgb[2], w[2])];
}

async function openEditorWith(page: Page, files: Upload[]): Promise<void> {
  await page.goto('/editor');
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(page.getByTestId('library-count')).toHaveText(files.length === 1 ? '1 image' : `${files.length} images`);
}

async function openImage(page: Page, name: string): Promise<void> {
  await page.getByRole('option', { name }).click();
  await expect(page.getByTestId('crop-stage')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('adjustments-panel')).toBeVisible();
}

/**
 * Mean RGB of the middle of the IMAGE as drawn on the stage. The stage fits the image into a larger viewport, so the sample
 * region is found from the published view transform (scale and offset), and converted to canvas pixels (device pixel ratio).
 */
async function canvasMean(page: Page): Promise<[number, number, number]> {
  return page.getByTestId('crop-stage').evaluate((stage) => {
    const el = stage as HTMLElement;
    const canvas = el.querySelector('canvas') as HTMLCanvasElement | null;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || canvas.width === 0) return [-1, -1, -1] as [number, number, number];
    const ratio = canvas.width / el.clientWidth;
    const scale = Number(el.dataset.viewScale);
    const left = Number(el.dataset.viewX) + Number(el.dataset.imageWidth) * scale * 0.4;
    const top = Number(el.dataset.viewY) + Number(el.dataset.imageHeight) * scale * 0.4;
    const w = Math.max(1, Math.floor(Number(el.dataset.imageWidth) * scale * 0.2 * ratio));
    const h = Math.max(1, Math.floor(Number(el.dataset.imageHeight) * scale * 0.2 * ratio));
    const { data } = context.getImageData(Math.floor(left * ratio), Math.floor(top * ratio), w, h);
    let r = 0;
    let g = 0;
    let b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
    }
    return [r / n, g / n, b / n] as [number, number, number];
  });
}

const near = (value: number, expected: number, tolerance = 3) => Math.abs(value - expected) <= tolerance;

async function setValue(page: Page, key: string, text: string): Promise<void> {
  const input = page.getByTestId(`adjust-${key}-input`);
  await input.fill(text);
  await input.press('Enter');
}

const value = (page: Page, key: string) => page.getByTestId(`adjust-${key}-input`);

test.describe('Adjustment controls', () => {
  test('the Edit panel shows all five controls for the open image, at their defaults', async ({ page }) => {
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await expect(page.getByText('Nothing selected')).toBeVisible();
    await openImage(page, 'gray.jpg');

    for (const [key, label, shown] of [
      ['exposure', 'Exposure', '0.00'],
      ['temperature', 'Temperature', '0'],
      ['tint', 'Tint', '0'],
      ['saturation', 'Saturation', '0'],
      ['brightness', 'Brightness', '0'],
    ] as const) {
      await expect(page.getByTestId(`adjust-${key}`)).toContainText(label);
      await expect(value(page, key)).toHaveValue(shown);
      await expect(page.getByTestId(`adjust-${key}-thumb`)).toHaveAttribute('role', 'slider');
    }
    await expect(page.getByTestId('adjust-exposure-thumb')).toHaveAttribute('aria-valuemin', '-3');
    await expect(page.getByTestId('adjust-exposure-thumb')).toHaveAttribute('aria-valuemax', '3');
    await expect(page.getByTestId('adjust-exposure-reset')).toBeHidden(); // no reset until it differs from default
    await expect(page.getByTestId('reset-adjustments')).toBeDisabled();
    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect(page.getByTestId('apply-selected')).toBeDisabled();
    await expect(page.getByTestId('apply-all')).toBeDisabled(); // a single image: nothing to apply to
  });

  test('exposure changes the live preview by the specified linear-light math, and reset restores it', async ({
    page,
  }) => {
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await openImage(page, 'gray.jpg');
    await expect.poll(async () => near((await canvasMean(page))[0], 128, 2)).toBe(true);

    await setValue(page, 'exposure', '1');
    const expected = toSrgb(toLinear(128) * 2); // +1 EV = twice the linear light
    await expect.poll(async () => near((await canvasMean(page))[0], expected, 3), { timeout: 8000 }).toBe(true);
    await expect(page.getByTestId('adjust-exposure-reset')).toBeVisible();

    await setValue(page, 'exposure', '-1');
    const darker = toSrgb(toLinear(128) / 2);
    await expect.poll(async () => near((await canvasMean(page))[0], darker, 3)).toBe(true);

    await page.getByTestId('adjust-exposure-reset').click();
    await expect(value(page, 'exposure')).toHaveValue('0.00');
    await expect.poll(async () => near((await canvasMean(page))[0], 128, 2)).toBe(true);
  });

  test('temperature, tint, saturation, and brightness produce the specified pixel values', async ({ page }) => {
    await openEditorWith(page, [
      await solid('gray.jpg', [128, 128, 128]),
      await solid('color.jpg', [200, 80, 40], 70, 50),
    ]);
    const matches = async (expected: [number, number, number], tolerance = 3) => {
      const actual = await canvasMean(page);
      return expected.every((value, i) => near(actual[i] ?? -1, value, tolerance));
    };

    await openImage(page, 'gray.jpg');
    await setValue(page, 'temperature', '60'); // warm: red up, blue down, luminance preserved
    await expect.poll(() => matches(expectedPixel([128, 128, 128], { temperature: 60 }))).toBe(true);
    const warm = expectedPixel([128, 128, 128], { temperature: 60 });
    expect(warm[0]).toBeGreaterThan(128);
    expect(warm[2]).toBeLessThan(128);

    await setValue(page, 'temperature', '0');
    await setValue(page, 'tint', '60'); // magenta: green falls below red and blue
    await expect.poll(() => matches(expectedPixel([128, 128, 128], { tint: 60 }))).toBe(true);
    const magenta = await canvasMean(page);
    expect(magenta[1]).toBeLessThan(magenta[0] - 4);
    expect(magenta[1]).toBeLessThan(magenta[2] - 4);

    await setValue(page, 'tint', '-60'); // green: green rises above red and blue
    await expect.poll(() => matches(expectedPixel([128, 128, 128], { tint: -60 }))).toBe(true);
    const green = await canvasMean(page);
    expect(green[1]).toBeGreaterThan(green[0] + 4);
    await setValue(page, 'tint', '0');

    await setValue(page, 'brightness', '60');
    await expect.poll(() => matches(expectedPixel([128, 128, 128], { brightness: 60 }))).toBe(true);
    await setValue(page, 'brightness', '-60');
    await expect.poll(() => matches(expectedPixel([128, 128, 128], { brightness: -60 }))).toBe(true);

    await openImage(page, 'color.jpg');
    await expect(value(page, 'saturation')).toHaveValue('0'); // each image has its own settings
    await setValue(page, 'saturation', '-100'); // grayscale: all channels equal the linear Rec.709 luminance
    const luma = 0.2126 * toLinear(200) + 0.7152 * toLinear(80) + 0.0722 * toLinear(40);
    await expect.poll(() => matches([toSrgb(luma), toSrgb(luma), toSrgb(luma)], 4)).toBe(true);
  });

  test('switching images rapidly always shows each image at its own size (worker load race)', async ({ page }) => {
    await openEditorWith(page, [
      await solid('small.jpg', [128, 128, 128], 64, 40),
      await solid('large.jpg', [128, 128, 128], 120, 90),
      await solid('tall.jpg', [128, 128, 128], 50, 140),
    ]);
    const stageSize = () =>
      page.getByTestId('crop-stage').evaluate((el) => ({
        w: Number((el as HTMLElement).dataset.imageWidth),
        h: Number((el as HTMLElement).dataset.imageHeight),
        phase: (el as HTMLElement).dataset.phase,
      }));

    // Click through the images with no waiting in between, several times over.
    for (let round = 0; round < 3; round++) {
      for (const name of ['small.jpg', 'large.jpg', 'tall.jpg', 'large.jpg']) {
        await page.getByRole('option', { name }).click({ noWaitAfter: true });
      }
    }
    // The last click was large.jpg: the canvas must settle on ITS size, not an earlier image's.
    await expect.poll(stageSize, { timeout: 10_000 }).toEqual({ w: 120, h: 90, phase: 'ready' });

    await page.getByRole('option', { name: 'tall.jpg' }).click();
    await expect.poll(stageSize, { timeout: 10_000 }).toEqual({ w: 50, h: 140, phase: 'ready' });
    await page.getByRole('option', { name: 'small.jpg' }).click();
    await expect.poll(stageSize, { timeout: 10_000 }).toEqual({ w: 64, h: 40, phase: 'ready' });
  });

  test('numeric field: clamps to range, Escape reverts, arrows step, Shift+arrow steps ×10', async ({ page }) => {
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await openImage(page, 'gray.jpg');

    await setValue(page, 'exposure', '9');
    await expect(value(page, 'exposure')).toHaveValue('3.00'); // clamped to the spec maximum

    await value(page, 'exposure').fill('1.5');
    await value(page, 'exposure').press('Escape');
    await expect(value(page, 'exposure')).toHaveValue('3.00'); // reverted, not committed

    await setValue(page, 'tint', '10');
    await value(page, 'tint').focus();
    await page.keyboard.press('ArrowUp');
    await expect(value(page, 'tint')).toHaveValue('11');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(value(page, 'tint')).toHaveValue('1');

    await setValue(page, 'saturation', 'abc'); // garbage is ignored
    await expect(value(page, 'saturation')).toHaveValue('0');
  });

  test('slider keyboard control steps by the spec step and announces a unit-aware value', async ({ page }) => {
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await openImage(page, 'gray.jpg');
    const thumb = page.getByTestId('adjust-exposure-thumb');
    await thumb.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await expect(value(page, 'exposure')).toHaveValue('0.05');
    await expect(thumb).toHaveAttribute('aria-valuetext', '+0.05 EV');
    await page.keyboard.press('Home');
    await expect(value(page, 'exposure')).toHaveValue('−3.00');
    await expect(thumb).toHaveAttribute('aria-valuetext', '−3.00 EV');
  });

  test('double-clicking a label resets that control', async ({ page }) => {
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await openImage(page, 'gray.jpg');
    await setValue(page, 'saturation', '40');
    await page.getByTestId('adjust-saturation').locator('label').dblclick();
    await expect(value(page, 'saturation')).toHaveValue('0');
  });
});

test.describe('Undo, redo, and compare', () => {
  test('toolbar and keyboard undo/redo walk through edits; labels name the action', async ({ page }) => {
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await openImage(page, 'gray.jpg');
    await setValue(page, 'exposure', '1');
    await setValue(page, 'tint', '20');

    await expect(page.getByTestId('undo')).toBeEnabled();
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', 'Undo tint');
    await page.getByTestId('undo').click();
    await expect(value(page, 'tint')).toHaveValue('0');
    await expect(value(page, 'exposure')).toHaveValue('1.00');
    await expect(page.getByTestId('redo')).toBeEnabled();
    await expect(page.getByTestId('redo')).toHaveAttribute('aria-label', 'Redo tint');

    await page.getByTestId('redo').click();
    await expect(value(page, 'tint')).toHaveValue('20');

    // Keyboard shortcuts work from the canvas area (focus not in a text field).
    await page.getByTestId('crop-stage').click();
    await page.keyboard.press('Control+z');
    await expect(value(page, 'tint')).toHaveValue('0');
    await page.keyboard.press('Control+z');
    await expect(value(page, 'exposure')).toHaveValue('0.00');
    await expect(page.getByTestId('undo')).toBeDisabled();
    await page.keyboard.press('Control+Shift+z');
    await expect(value(page, 'exposure')).toHaveValue('1.00');
    await page.keyboard.press('Control+y');
    await expect(value(page, 'tint')).toHaveValue('20');
  });

  test('a dragged slider is ONE undo step, however many values it passed through', async ({ page }) => {
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await openImage(page, 'gray.jpg');
    const thumb = page.getByTestId('adjust-exposure-thumb');
    const box = (await thumb.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 12 });
    await page.mouse.move(box.x + 70, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(value(page, 'exposure')).not.toHaveValue('0.00');

    await page.getByTestId('undo').click();
    await expect(value(page, 'exposure')).toHaveValue('0.00'); // one click undoes the entire drag
    await expect(page.getByTestId('undo')).toBeDisabled();
  });

  test('hold to compare shows the original, and the button only exists for edited images', async ({ page }) => {
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await openImage(page, 'gray.jpg');
    await expect(page.getByTestId('compare-button')).toHaveCount(0);

    await setValue(page, 'exposure', '1');
    const edited = toSrgb(toLinear(128) * 2);
    await expect.poll(async () => near((await canvasMean(page))[0], edited, 3)).toBe(true);
    await expect(page.getByTestId('compare-button')).toBeVisible();

    const compare = page.getByTestId('compare-button');
    const box = (await compare.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(compare).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => near((await canvasMean(page))[0], 128, 2)).toBe(true); // original while held
    await page.mouse.up();
    await expect.poll(async () => near((await canvasMean(page))[0], edited, 3)).toBe(true); // adjusted again

    await page.getByTestId('crop-stage').click();
    await page.keyboard.down('Backslash');
    await expect.poll(async () => near((await canvasMean(page))[0], 128, 2)).toBe(true);
    await page.keyboard.up('Backslash');
    await expect.poll(async () => near((await canvasMean(page))[0], edited, 3)).toBe(true);
  });
});

test.describe('Scope: apply to selected and all', () => {
  async function three(page: Page): Promise<void> {
    await openEditorWith(page, [
      await solid('a.jpg', [128, 128, 128], 60, 40),
      await solid('b.jpg', [128, 128, 128], 61, 40),
      await solid('c.jpg', [128, 128, 128], 62, 40),
    ]);
  }

  const savedEdits = async (page: Page) =>
    (
      (await (await page.request.get('/api/edits')).json()) as {
        edits: Record<string, { adjustments: { exposure: number } }>;
      }
    ).edits;

  test('Apply to selected copies the open image’s settings to the checked images as one undo step', async ({
    page,
  }) => {
    await three(page);
    await openImage(page, 'a.jpg');
    await setValue(page, 'exposure', '1');

    // The thumbnail checkbox adds b without opening it, so the sliders keep showing a's settings.
    const b = page.getByRole('option', { name: 'b.jpg' });
    await b.hover();
    await b.getByTestId('thumbnail-check').click();
    await expect(page.getByTestId('apply-selected')).toHaveText('Apply to selected (2)');
    await page.getByTestId('apply-selected').click();

    await expect.poll(async () => Object.keys(await savedEdits(page)).length).toBe(2);
    await b.click();
    await expect(value(page, 'exposure')).toHaveValue('1.00');
    await page.getByRole('option', { name: 'c.jpg' }).click();
    await expect(value(page, 'exposure')).toHaveValue('0.00'); // c was not in scope

    await page.getByTestId('undo').click(); // ONE undo reverts the whole batch
    await expect.poll(async () => Object.keys(await savedEdits(page)).length).toBe(1); // only a's own edit remains
    await page.getByRole('option', { name: 'b.jpg' }).click();
    await expect(value(page, 'exposure')).toHaveValue('0.00');
  });

  test('Apply to all names its scope, edits every image, persists, and undoes in one step', async ({ page }) => {
    await three(page);
    await openImage(page, 'b.jpg');
    await setValue(page, 'tint', '25');
    await expect(page.getByTestId('apply-all')).toHaveText('Apply to all (3)');
    await page.getByTestId('apply-all').click();

    await expect.poll(async () => Object.keys(await savedEdits(page)).length).toBe(3);
    for (const name of ['a.jpg', 'c.jpg']) {
      await page.getByRole('option', { name }).click();
      await expect(value(page, 'tint')).toHaveValue('25');
    }
    await page.getByTestId('undo').click();
    await expect.poll(async () => Object.keys(await savedEdits(page)).length).toBe(1);
  });

  test('Reset adjustments clears the open image only', async ({ page }) => {
    await three(page);
    await openImage(page, 'a.jpg');
    await setValue(page, 'exposure', '1');
    await setValue(page, 'tint', '20');
    await page.getByTestId('apply-all').click();
    await page.getByTestId('reset-adjustments').click();
    await expect(value(page, 'exposure')).toHaveValue('0.00');
    await expect(page.getByTestId('reset-adjustments')).toBeDisabled();
    await page.getByRole('option', { name: 'b.jpg' }).click();
    await expect(value(page, 'exposure')).toHaveValue('1.00'); // untouched
    await page.getByTestId('undo').click();
    await page.getByRole('option', { name: 'a.jpg' }).click();
    await expect(value(page, 'exposure')).toHaveValue('1.00'); // the reset was undone
  });
});

test.describe('Persistence and sync', () => {
  test('edits are saved to the server and survive a reload, preview included', async ({ page }) => {
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await openImage(page, 'gray.jpg');
    await setValue(page, 'exposure', '0.5');
    await setValue(page, 'tint', '-20');
    await expect(page.getByTestId('edit-sync-status')).toHaveText('Saved');

    await page.reload();
    await expect(page.getByTestId('library-count')).toHaveText('1 image');
    await openImage(page, 'gray.jpg');
    await expect(value(page, 'exposure')).toHaveValue('0.50');
    await expect(value(page, 'tint')).toHaveValue('−20');
    const expected = toSrgb(toLinear(128) * 2 ** 0.5);
    await expect
      .poll(async () => (await canvasMean(page))[0] > 128 && near((await canvasMean(page))[0], expected + 0, 12))
      .toBe(true);
    await expect(page.getByTestId('undo')).toBeDisabled(); // history is per page session
  });

  test('a failed save is shown, retried, and then succeeds without losing the edit', async ({ page }) => {
    let failures = 0;
    await page.route('**/api/edits', async (route) => {
      if (route.request().method() === 'PATCH' && failures < 1) {
        failures += 1;
        await route.abort();
      } else await route.continue();
    });
    await openEditorWith(page, [await solid('gray.jpg', [128, 128, 128])]);
    await openImage(page, 'gray.jpg');
    await setValue(page, 'saturation', '35');

    await expect(page.getByTestId('edit-sync-status')).toHaveText('Could not save, retrying…');
    await expect(page.getByTestId('edit-sync-status')).toHaveText('Saved', { timeout: 10_000 });
    const saved = (await (await page.request.get('/api/edits')).json()) as {
      edits: Record<string, { adjustments: { saturation: number } }>;
    };
    expect(Object.values(saved.edits)[0]?.adjustments.saturation).toBe(35);
  });

  test('removing an image removes its saved edit', async ({ page }) => {
    await openEditorWith(page, [
      await solid('a.jpg', [128, 128, 128], 60, 40),
      await solid('b.jpg', [128, 128, 128], 61, 40),
    ]);
    await openImage(page, 'a.jpg');
    await setValue(page, 'exposure', '1');
    await expect(page.getByTestId('edit-sync-status')).toHaveText('Saved');
    await page.getByTestId('remove-selected').click();
    await page.getByTestId('confirm-remove').click();
    await expect(page.getByTestId('library-count')).toHaveText('1 image');
    const saved = (await (await page.request.get('/api/edits')).json()) as { edits: object };
    expect(Object.keys(saved.edits)).toHaveLength(0);
    await expect(page.getByTestId('undo')).toBeDisabled(); // deleting is not undoable, so history is cleared
  });
});

test.describe('Edits API', () => {
  const origin = `http://localhost:${process.env.FS_E2E_PORT ?? 3100}`;
  const body = (exposure: number) => ({ exposure, temperature: 0, tint: 0, saturation: 0, brightness: 0 });

  test('validates ranges, requires same-origin, and scopes edits to the caller’s own images', async ({ browser }) => {
    const owner = await browser.newContext({ baseURL: origin });
    const created = await owner.request.post('/api/images', {
      headers: { origin, 'content-type': 'application/octet-stream', 'x-fs-filename': 'a.jpg' },
      data: await makeJpeg({ width: 30, height: 30 }),
    });
    const { id } = (await created.json()) as { id: string };

    // Out-of-range, malformed, and foreign-origin requests are rejected.
    expect(
      (
        await owner.request.patch('/api/edits', {
          headers: { origin },
          data: { items: [{ id, adjustments: body(9) }] },
        })
      ).status(),
    ).toBe(400);
    expect((await owner.request.patch('/api/edits', { headers: { origin }, data: { items: [] } })).status()).toBe(400);
    expect(
      (
        await owner.request.patch('/api/edits', {
          headers: { origin },
          data: { items: [{ id: '../x', adjustments: body(1) }] },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await owner.request.patch('/api/edits', {
          headers: { origin: 'https://evil.example' },
          data: { items: [{ id, adjustments: body(1) }] },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await owner.request.patch('/api/edits', { data: { items: [{ id, adjustments: body(1) }] } })).status(),
    ).toBe(403);

    // A valid save works, and is visible only to the owner.
    const ok = await owner.request.patch('/api/edits', {
      headers: { origin },
      data: { items: [{ id, adjustments: body(1.5) }] },
    });
    expect(await ok.json()).toEqual({ updated: 1 });
    const stranger = await browser.newContext({ baseURL: origin });
    expect(await (await stranger.request.get('/api/edits')).json()).toEqual({ edits: {} });
    const hijack = await stranger.request.patch('/api/edits', {
      headers: { origin },
      data: { items: [{ id, adjustments: body(-3) }] },
    });
    expect(await hijack.json()).toEqual({ updated: 0 });
    const mine = (await (await owner.request.get('/api/edits')).json()) as {
      edits: Record<string, { adjustments: { exposure: number } }>;
    };
    expect(mine.edits[id]?.adjustments.exposure).toBe(1.5);

    await owner.close();
    await stranger.close();
  });
});
