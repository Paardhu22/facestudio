import { expect, test, type Page, type Download } from '@playwright/test';
import { readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fromBuffer, type Entry } from 'yauzl';
import { buffer } from 'node:stream/consumers';
import sharp from 'sharp';

import { DEFAULT_ADJUSTMENTS } from '../../src/lib/image-processing/adjustment-spec';
import { DEFAULT_OUTPUT } from '../../src/lib/cropping/output';
import type { ExportJob } from '../../src/lib/api/jobs-schemas';

const origin = `http://localhost:${process.env.FS_E2E_PORT ?? 3100}`;
async function photo(name: string, r = 128, width = 1200, height = 800) {
  return {
    name,
    mimeType: 'image/png',
    buffer: await sharp({ create: { width, height, channels: 3, background: { r, g: 80, b: 40 } } })
      .png()
      .toBuffer(),
  };
}
async function importPhotos(page: Page, names = ['photo.png']) {
  await page.goto('/editor');
  await page.getByTestId('file-input').setInputFiles(await Promise.all(names.map((name, i) => photo(name, 128 + i))));
  await expect(page.getByTestId('library-count')).toHaveText(names.length === 1 ? '1 image' : `${names.length} images`);
}
async function fields(page: Page, id: string, value: string) {
  const input = page.getByTestId(id);
  await input.fill(value);
  await input.press('Enter');
}
async function start(
  page: Page,
  scope: 'Current image' | 'Selected' | 'All images' = 'All images',
  format = 'individual',
) {
  await page.getByTestId('open-export').click();
  await page.getByRole('radio', { name: new RegExp(`^${scope}`) }).check();
  await page.getByLabel('File format', { exact: true }).selectOption(format);
  await page.getByTestId('start-export').click();
  await expect(page.getByTestId('export-progress')).toBeVisible();
}
async function entries(download: Download): Promise<Map<string, Buffer>> {
  const bytes = await readFile((await download.path())!);
  return new Promise((resolve, reject) =>
    fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error);
        return;
      }
      const files = new Map<string, Buffer>();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry: Entry) =>
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) {
            reject(err);
            return;
          }
          void buffer(stream)
            .then((data) => {
              files.set(entry.fileName, data);
              zip.readEntry();
            })
            .catch(reject);
        }),
      );
      zip.readEntry();
    }),
  );
}
async function download(page: Page) {
  const link = page.getByRole('link', { name: 'Download ZIP' });
  await expect(link).toBeVisible({ timeout: 30_000 });
  const waiting = page.waitForEvent('download');
  await link.click();
  return entries(await waiting);
}

test.describe('Full-resolution export', () => {
  test('downloads the current crop with exact sizing, unadjusted padding, and the shared exposure math', async ({
    page,
  }) => {
    await importPhotos(page);
    await page.getByRole('option', { name: 'photo.png', exact: true }).click();
    await expect(page.getByTestId('crop-stage')).toHaveAttribute('data-phase', 'ready');
    await page.getByTestId('crop-mode-custom').click();
    await fields(page, 'crop-w', '600');
    await fields(page, 'crop-h', '400');
    await fields(page, 'crop-x', '100');
    await fields(page, 'crop-y', '80');
    await fields(page, 'adjust-exposure-input', '1');
    await page.getByTestId('output-format').selectOption('png');
    await page.getByTestId('output-size-mode').selectOption('exact');
    await fields(page, 'output-width', '300');
    await fields(page, 'output-height', '300');
    await page.getByTestId('output-fit').selectOption('pad');
    await start(page, 'Current image');
    const files = await download(page);
    expect([...files.keys()]).toEqual(['photo.png']);
    const result = await sharp(files.get('photo.png')!).raw().toBuffer({ resolveWithObject: true });
    expect([result.info.width, result.info.height]).toEqual([300, 300]);
    expect([...result.data.subarray(0, 3)]).toEqual([255, 255, 255]);
    const linear = ((128 / 255 + 0.055) / 1.055) ** 2.4;
    const expected = Math.round((1.055 * (linear * 2) ** (1 / 2.4) - 0.055) * 255);
    expect(Math.abs(result.data[(150 * 300 + 150) * result.info.channels]! - expected)).toBeLessThanOrEqual(1);
  });
  test('exports only selected photos, resolves duplicate names, and restores progress after reload', async ({
    page,
  }) => {
    await importPhotos(page, ['a.png', 'b.png', 'c.png']);
    await page.getByRole('option', { name: 'a.png', exact: true }).click();
    await page.getByRole('option', { name: 'b.png', exact: true }).click({ modifiers: ['Control'] });
    await page.getByTestId('open-export').click();
    await page.getByRole('radio', { name: /^Selected/ }).check();
    await page.getByLabel('File format', { exact: true }).selectOption('webp');
    await page.getByLabel('File naming', { exact: false }).fill('portrait');
    await page.getByTestId('start-export').click();
    await expect(page.getByTestId('export-progress')).toBeVisible();
    await page.reload();
    await page.getByTestId('open-export').click();
    await expect(page.getByTestId('export-progress')).toBeVisible();
    const files = await download(page);
    expect([...files.keys()]).toEqual(['portrait.webp', 'portrait_2.webp']);
    for (const file of files.values()) expect((await sharp(file).metadata()).format).toBe('webp');
  });
  test('exports all photos as JPEG and enforces download/job ownership and byte ranges', async ({ page, browser }) => {
    await importPhotos(page, ['a.png', 'b.png']);
    await start(page, 'All images', 'jpeg');
    const files = await download(page);
    expect([...files.keys()]).toEqual(['a.jpg', 'b.jpg']);
    for (const file of files.values()) expect((await sharp(file).metadata()).format).toBe('jpeg');
    const { job } = (await (await page.request.get('/api/jobs')).json()) as { job: ExportJob };
    const stranger = await browser.newContext({ baseURL: origin });
    expect((await stranger.request.get(`/api/jobs/${job.id}`)).status()).toBe(404);
    expect((await stranger.request.get(`/api/artifacts/${job.artifact!.id}/download`)).status()).toBe(404);
    expect((await page.request.post(`/api/jobs/${job.id}/cancel`)).status()).toBe(403);
    const range = await page.request.get(`/api/artifacts/${job.artifact!.id}/download`, {
      headers: { range: 'bytes=0-9' },
    });
    expect(range.status()).toBe(206);
    expect((await range.body()).length).toBe(10);
    expect(range.headers()['accept-ranges']).toBe('bytes');
    await stranger.close();
  });
  test('shows a real per-image failure and retries successfully once the original is restored', async ({ page }) => {
    await importPhotos(page);
    const { images } = (await (await page.request.get('/api/images')).json()) as { images: { id: string }[] };
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'fs_session')).toBe(true);
    // Locate only this run's uploaded fixture. No user storage is touched.
    const { readdir } = await import('node:fs/promises');
    const storage = process.env.FS_E2E_STORAGE!;
    const sessions = await readdir(path.join(storage, 'files', 'sessions'));
    let original = '';
    for (const session of sessions) {
      const candidate = path.join(storage, 'files', 'sessions', session, 'originals', images[0]!.id);
      try {
        await readFile(candidate);
        original = candidate;
        break;
      } catch {}
    }
    expect(original).not.toBe('');
    await rename(original, `${original}.hold`);
    try {
      await start(page);
      await expect(page.getByRole('button', { name: 'Retry failed' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Images needing attention')).toBeVisible();
    } finally {
      await rename(`${original}.hold`, original);
    }
    await page.getByRole('button', { name: 'Retry failed' }).click();
    expect((await download(page)).size).toBe(1);
  });
  test('cancel stops remaining work without creating a download', async ({ page }) => {
    await importPhotos(page, ['a.png', 'b.png', 'c.png']);
    const { images } = (await (await page.request.get('/api/images')).json()) as { images: { id: string }[] };
    const created = await page.request.post('/api/jobs', {
      headers: { origin },
      data: {
        items: images.map((image) => ({
          id: image.id,
          adjustments: { ...DEFAULT_ADJUSTMENTS, saturation: 50 },
          crop: null,
          output: {
            ...DEFAULT_OUTPUT,
            format: 'png',
            allowUpscale: true,
            resize: { mode: 'exact', width: 3500, height: 3500, fit: 'stretch' },
          },
        })),
        preserveFolders: false,
      },
    });
    expect(created.status()).toBe(202);
    const { job } = (await created.json()) as { job: ExportJob };
    const cancelled = await page.request.post(`/api/jobs/${job.id}/cancel`, { headers: { origin } });
    expect(cancelled.status()).toBe(200);
    await expect
      .poll(
        async () => ((await (await page.request.get(`/api/jobs/${job.id}`)).json()) as { job: ExportJob }).job.status,
        { timeout: 30_000 },
      )
      .toBe('cancelled');
    const final = (await (await page.request.get(`/api/jobs/${job.id}`)).json()) as { job: ExportJob };
    expect(final.job.artifact).toBeNull();
    expect(final.job.totals.cancelled).toBeGreaterThan(0);
  });
});

for (const shape of ['circle', 'hexagon'] as const) {
  test(`downloads a real transparent ${shape} crop`, async ({ page }) => {
    await importPhotos(page, ['shaped.png']);
    await page.getByRole('option', { name: 'shaped.png', exact: true }).click();
    await expect(page.getByTestId('crop-stage')).toHaveAttribute('data-phase', 'ready');
    await page.getByTestId(`crop-shape-${shape}`).click();
    if (shape === 'hexagon') await page.getByTestId('aspect-1-1').click();
    await fields(page, 'crop-w', '400');
    await page.getByTestId('output-format').selectOption('png');
    await start(page, 'Current image');
    const files = await download(page);
    const result = await sharp(files.get('shaped.png')!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(result.info.width).toBe(400);
    expect(result.info.height).toBe(400);
    expect(result.data[3]).toBe(0);
    const center = (200 * 400 + 200) * 4;
    expect([...result.data.subarray(center, center + 4)]).toEqual([128, 80, 40, 255]);
  });
}
