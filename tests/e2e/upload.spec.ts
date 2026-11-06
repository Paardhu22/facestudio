import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';

import { makeAnimatedWebp, makeJpeg, makePng, makeTinyJpeg, makeWebp } from '../fixtures/images';

type Upload = { name: string; mimeType: string; buffer: Buffer };

const jpeg = async (name: string, width = 80, height = 60): Promise<Upload> => ({
  name,
  mimeType: 'image/jpeg',
  buffer: await makeJpeg({ width, height }),
});

async function addImages(page: Page, files: Upload[]): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(files);
}

const count = (page: Page) => page.getByTestId('library-count');
const thumbs = (page: Page) => page.getByTestId('thumbnail');

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor');
  await expect(page.getByText('Add photos to get started')).toBeVisible();
}

/** Resolve once every mounted thumbnail has actually decoded pixels (not just an <img> element). */
async function expectThumbnailsLoaded(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.$$eval(
        '[data-testid=thumbnail] img',
        (images) =>
          images.length > 0 &&
          images.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);
}

async function names(page: Page): Promise<string[]> {
  return page.$$eval('[data-testid=thumbnail]', (cells) => cells.map((cell) => cell.getAttribute('aria-label') ?? ''));
}

test.describe('Upload and library', () => {
  test('the import actions are visible on a fresh editor', async ({ page }) => {
    await openEditor(page);
    for (const id of ['add-images', 'add-folder', 'canvas-add-images', 'canvas-add-folder']) {
      await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId(id)).toBeEnabled();
    }
    await expect(page.getByTestId('thumbnail-grid')).toHaveCount(0);
  });

  test('uploads images, shows loaded thumbnails in natural order, and survives a reload', async ({ page }) => {
    await openEditor(page);
    // Distinct sizes give distinct bytes; identical images would (correctly) be flagged as duplicates.
    await addImages(page, [await jpeg('IMG_10.jpg', 83), await jpeg('IMG_2.jpg', 82), await jpeg('IMG_1.jpg', 81)]);

    await expect(count(page)).toHaveText('3 images');
    await expect(page.getByTestId('upload-summary')).toContainText('Added 3 images');
    expect(await names(page)).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
    await expectThumbnailsLoaded(page);
    await expect(page.getByTestId('status-image-count')).toHaveText('3 images');
    // The empty-state call to action is gone once there are images.
    await expect(page.getByText('Add photos to get started')).toHaveCount(0);

    await page.reload();
    await expect(count(page)).toHaveText('3 images');
    expect(await names(page)).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
    await expectThumbnailsLoaded(page);
  });

  test('tiles stay square and never overlap, whatever the image aspect ratios', async ({ page }) => {
    await openEditor(page);
    // Portrait, landscape, panorama, and square images: a tall image must not inflate its row.
    await addImages(page, [
      await jpeg('a_portrait.jpg', 60, 120),
      await jpeg('b_landscape.jpg', 120, 60),
      await jpeg('c_tall.jpg', 40, 160),
      await jpeg('d_square.jpg', 90, 90),
      await jpeg('e_wide.jpg', 160, 40),
      await jpeg('f_other.jpg', 100, 70),
    ]);
    await expect(count(page)).toHaveText('6 images');

    const boxes = await page.$$eval('[data-testid=thumbnail]', (cells) =>
      cells.map((cell) => {
        const b = (cell.parentElement as HTMLElement).getBoundingClientRect(); // the grid cell wrapper
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      }),
    );
    expect(boxes).toHaveLength(6);
    for (const box of boxes) expect(Math.abs(box.w - box.h)).toBeLessThanOrEqual(1); // every tile is square
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        expect(overlap, `tiles ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  test('handles JPEG, PNG with alpha, and WebP, and shows metadata for the active image', async ({ page }) => {
    await openEditor(page);
    await addImages(page, [
      await jpeg('photo.jpg', 120, 90),
      { name: 'alpha.png', mimeType: 'image/png', buffer: await makePng({ width: 64, height: 64 }, { alpha: true }) },
      { name: 'web.webp', mimeType: 'image/webp', buffer: await makeWebp({ width: 50, height: 40 }) },
    ]);
    await expect(count(page)).toHaveText('3 images');

    await page.getByRole('option', { name: 'alpha.png' }).click();
    const details = page.getByRole('region', { name: 'Image details' });
    await expect(details).toContainText('alpha.png');
    await expect(details).toContainText('64 × 64 px');
    await expect(details).toContainText('PNG');
    await expect(details).toContainText('Transparency');

    await page.getByRole('option', { name: 'photo.jpg' }).click();
    await expect(details).toContainText('120 × 90 px');
    await expect(details).toContainText('JPEG');
    const stage = page.getByTestId('crop-stage');
    await expect(stage).toHaveAttribute('data-phase', 'ready');
    await expect(stage).toHaveAttribute('data-image-width', '120'); // the stage shows the 120 × 90 image
    await expect(stage).toHaveAttribute('data-image-height', '90');
  });

  test('records EXIF-oriented dimensions: a rotated JPEG is reported and previewed upright', async ({ page }) => {
    await openEditor(page);
    await addImages(page, [
      {
        name: 'rotated.jpg',
        mimeType: 'image/jpeg',
        buffer: await makeJpeg({ width: 120, height: 60 }, { orientation: 6 }),
      },
    ]);
    await expect(count(page)).toHaveText('1 image');
    await page.getByRole('option', { name: 'rotated.jpg' }).click();
    const details = page.getByRole('region', { name: 'Image details' });
    await expect(details).toContainText('60 × 120 px');
    await expect(details).toContainText('Rotated 90°');
    // The stage reports the EXIF-oriented size of the image it shows, once its preview has loaded.
    await expect(page.getByTestId('crop-stage')).toHaveAttribute('data-phase', 'ready');
    await expect(page.getByTestId('crop-stage')).toHaveAttribute('data-image-width', '60');
    await expect(page.getByTestId('crop-stage')).toHaveAttribute('data-image-height', '120');
  });

  test('rejects bad files with clear reasons while accepting the good ones; non-images are skipped quietly', async ({
    page,
  }) => {
    await openEditor(page);
    await addImages(page, [
      await jpeg('good.jpg'),
      { name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('definitely not an image, only text') },
      { name: 'animated.webp', mimeType: 'image/webp', buffer: await makeAnimatedWebp({ width: 32, height: 32 }) },
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    ]);

    await expect(count(page)).toHaveText('1 image');
    const failures = page.getByTestId('upload-failures');
    await expect(failures).toContainText('2 files not added');
    await failures.locator('summary').click();
    await expect(failures).toContainText('fake.jpg');
    await expect(failures).toContainText('Not a valid JPEG, PNG, or WebP image');
    await expect(failures).toContainText('animated.webp');
    await expect(failures).toContainText('Animated images are not supported');
    await expect(page.getByTestId('upload-summary')).toContainText('1 non-image file skipped');
    await expect(page.getByTestId('upload-summary')).toContainText('2 failed');

    await page.getByRole('button', { name: 'Dismiss all' }).click();
    await expect(failures).toHaveCount(0);
  });

  test('uploads a folder, keeping relative paths, and ignores unrelated files inside it', async ({ page }) => {
    const root = await mkdtemp(path.join(tmpdir(), 'fs-folder-'));
    try {
      const dir = path.join(root, 'Spring shoot');
      await mkdir(path.join(dir, 'Team A'), { recursive: true });
      await writeFile(path.join(dir, 'Team A', 'IMG_1.jpg'), (await jpeg('x')).buffer);
      await writeFile(path.join(dir, 'IMG_2.jpg'), (await jpeg('x')).buffer);
      await writeFile(path.join(dir, 'readme.txt'), 'not an image');

      await openEditor(page);
      await page.getByTestId('folder-input').setInputFiles(dir);
      await expect(count(page)).toHaveText('2 images');
      await expect(page.getByTestId('upload-summary')).toContainText('1 non-image file skipped');

      await page.getByRole('option', { name: 'IMG_1.jpg' }).click();
      await expect(page.getByRole('region', { name: 'Image details' })).toContainText('Spring shoot / Team A');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('accepts images dropped onto the window and shows the drop overlay while dragging', async ({ page }) => {
    await openEditor(page);
    const bytes = (await jpeg('dropped.jpg')).buffer.toString('base64');

    const makeTransfer = () =>
      page.evaluateHandle((b64) => {
        const data = new DataTransfer();
        const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        data.items.add(new File([raw], 'dropped.jpg', { type: 'image/jpeg' }));
        return data;
      }, bytes);

    const transfer = await makeTransfer();
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer });
    await expect(page.getByTestId('drop-overlay')).toBeVisible();
    await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
    await expect(page.getByTestId('drop-overlay')).toHaveCount(0);

    await expect(count(page)).toHaveText('1 image');
    expect(await names(page)).toEqual(['dropped.jpg']);
  });

  test('ignores non-file drags (no overlay, nothing queued)', async ({ page }) => {
    await openEditor(page);
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.setData('text/plain', 'just some text');
      return data;
    });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer });
    await expect(page.getByTestId('drop-overlay')).toHaveCount(0);
  });
});

test.describe('Selection, search, and removal', () => {
  async function loadFive(page: Page): Promise<void> {
    await openEditor(page);
    await addImages(page, await Promise.all([1, 2, 3, 4, 5].map((n) => jpeg(`IMG_${n}.jpg`, 60 + n, 50))));
    await expect(count(page)).toHaveText('5 images');
  }

  test('click, Ctrl+click, Shift+click, and Select all follow file-manager rules', async ({ page }) => {
    await loadFive(page);
    const selected = page.getByTestId('selected-count');

    await thumbs(page).nth(0).click();
    await expect(selected).toHaveText('1 selected');
    await expect(thumbs(page).nth(0)).toHaveAttribute('data-active', 'true');

    await thumbs(page)
      .nth(2)
      .click({ modifiers: ['ControlOrMeta'] });
    await expect(selected).toHaveText('2 selected');

    await thumbs(page)
      .nth(4)
      .click({ modifiers: ['Shift'] }); // range from the anchor (3rd) to the 5th
    await expect(selected).toHaveText('3 selected');
    await expect(thumbs(page).nth(1)).toHaveAttribute('data-selected', 'false');
    await expect(thumbs(page).nth(3)).toHaveAttribute('data-selected', 'true');

    await page.getByTestId('select-all').click();
    await expect(selected).toHaveText('5 selected');
    await expect(page.getByTestId('status-selected-count')).toHaveText('5 selected');
    await page.getByTestId('select-all').click(); // now "Select none"
    await expect(selected).toHaveText('');
  });

  test('the thumbnail checkbox toggles selection without changing the open image', async ({ page }) => {
    await loadFive(page);
    await thumbs(page).nth(0).click();
    await thumbs(page).nth(2).hover();
    await thumbs(page).nth(2).getByTestId('thumbnail-check').click();
    await expect(page.getByTestId('selected-count')).toHaveText('2 selected');
    await expect(thumbs(page).nth(0)).toHaveAttribute('data-active', 'true');
    await expect(thumbs(page).nth(2)).toHaveAttribute('data-active', 'false');
  });

  test('keyboard: arrows move focus, Space toggles, Enter opens, Shift+arrows extend, Ctrl+A selects all, Escape clears', async ({
    page,
  }) => {
    await loadFive(page);
    const grid = page.getByTestId('thumbnail-grid');
    await grid.focus();

    await page.keyboard.press('Space');
    await expect(thumbs(page).nth(0)).toHaveAttribute('data-selected', 'true');

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(thumbs(page).nth(1)).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('selected-count')).toHaveText('1 selected');

    await page.keyboard.press('Shift+ArrowDown'); // 2 columns → moves two tiles ahead and extends
    await expect(page.getByTestId('selected-count')).toHaveText('3 selected');

    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('selected-count')).toHaveText('5 selected');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selected-count')).toHaveText('');
    await expect(grid).toHaveAttribute('aria-multiselectable', 'true');
  });

  test('search filters by file name; "no matches" is explained; ranges only cover visible images', async ({ page }) => {
    await loadFive(page);
    await page.getByTestId('library-search').fill('img_3');
    expect(await names(page)).toEqual(['IMG_3.jpg']);

    await page.getByTestId('library-search').fill('nothing-like-this');
    await expect(page.getByText('No matching images')).toBeVisible();

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(thumbs(page)).toHaveCount(5);

    await page.getByTestId('library-search').fill('IMG_');
    await page.getByTestId('select-all').click();
    await expect(page.getByTestId('selected-count')).toHaveText('5 selected');
  });

  test('flags identical images as duplicates and can filter to them', async ({ page }) => {
    await openEditor(page);
    const same = await jpeg('same.jpg');
    await addImages(page, [same, { ...same, name: 'same copy.jpg' }, await jpeg('different.jpg', 90, 70)]);
    await expect(count(page)).toHaveText('3 images');

    const filter = page.getByRole('button', { name: 'Show only duplicates' });
    await expect(filter).toBeVisible();
    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(thumbs(page)).toHaveCount(1);
    await expect(thumbs(page).first()).toHaveAttribute('aria-label', /duplicate/);
  });

  test('removing selected images asks for confirmation, deletes them server-side, and persists', async ({ page }) => {
    await loadFive(page);
    const doomed = await thumbs(page).nth(1).getAttribute('data-id');

    await thumbs(page).nth(0).click();
    await thumbs(page)
      .nth(1)
      .click({ modifiers: ['ControlOrMeta'] });
    await page.getByTestId('remove-selected').click();
    const dialog = page.getByRole('dialog', { name: 'Remove 2 images?' });
    await expect(dialog).toBeVisible();

    // Cancelling changes nothing.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(count(page)).toHaveText('5 images');

    await page.getByTestId('remove-selected').click();
    await page.getByTestId('confirm-remove').click();
    await expect(count(page)).toHaveText('3 images');
    await expect(page.getByTestId('selected-count')).toHaveText('');
    await expect(page.getByTestId('crop-stage')).toHaveCount(0); // the open image was removed

    const gone = await page.request.get(`/api/images/${doomed}/thumb`);
    expect(gone.status()).toBe(404);

    await page.reload();
    await expect(count(page)).toHaveText('3 images');
  });
});

test.describe('Scale and virtualization (smoke, not the Phase 7 benchmark)', () => {
  test('150 images: the DOM stays bounded, every image is reachable, and select-all covers all 150', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    const files: Upload[] = [];
    for (let i = 0; i < 150; i++) {
      files.push({ name: `p${String(i).padStart(3, '0')}.jpg`, mimeType: 'image/jpeg', buffer: await makeTinyJpeg(i) });
    }
    await addImages(page, files);

    await expect(count(page)).toHaveText('150 images', { timeout: 90_000 });
    await expect(page.getByTestId('upload-summary')).toContainText('Added 150 images');

    const mounted = await thumbs(page).count();
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(60); // a few rows of 2 + overscan, never 150

    await page.getByTestId('thumbnail-grid').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.getByRole('option', { name: 'p149.jpg' })).toBeVisible();
    expect(await thumbs(page).count()).toBeLessThan(60);
    await expectThumbnailsLoaded(page);

    await page.getByTestId('select-all').click();
    await expect(page.getByTestId('selected-count')).toHaveText('150 selected');
  });
});

test.describe('Server security and isolation', () => {
  const origin = `http://localhost:${process.env.FS_E2E_PORT ?? 3100}`;

  async function sessionWithImage(browser: Browser): Promise<{ context: BrowserContext; id: string }> {
    const context = await browser.newContext({ baseURL: origin });
    const buffer = await makeJpeg({ width: 40, height: 40 });
    const res = await context.request.post('/api/images', {
      headers: { origin, 'content-type': 'application/octet-stream', 'x-fs-filename': 'mine.jpg' },
      data: buffer,
    });
    expect(res.status()).toBe(201);
    return { context, id: ((await res.json()) as { id: string }).id };
  }

  test('mutating requests need a same-origin Origin header', async ({ request }) => {
    const buffer = await makeJpeg({ width: 20, height: 20 });
    const base = { 'content-type': 'application/octet-stream', 'x-fs-filename': 'a.jpg' };

    const none = await request.post('/api/images', { headers: base, data: buffer });
    expect(none.status()).toBe(403);
    expect(((await none.json()) as { error: { code: string } }).error.code).toBe('forbidden');

    const foreign = await request.post('/api/images', {
      headers: { ...base, origin: 'https://evil.example' },
      data: buffer,
    });
    expect(foreign.status()).toBe(403);

    const del = await request.delete('/api/images', { headers: { origin: 'https://evil.example' }, data: { ids: [] } });
    expect(del.status()).toBe(403);
    const session = await request.delete('/api/session', { headers: { origin: 'https://evil.example' } });
    expect(session.status()).toBe(403);
  });

  test('the API returns typed errors for bad uploads', async ({ request }) => {
    const headers = { origin, 'content-type': 'application/octet-stream', 'x-fs-filename': 'a.jpg' };

    const text = await request.post('/api/images', { headers, data: Buffer.from('plain text, not an image') });
    expect(text.status()).toBe(415);
    expect(((await text.json()) as { error: { code: string } }).error.code).toBe('unsupported_type');

    const missingName = await request.post('/api/images', {
      headers: { origin, 'content-type': 'application/octet-stream' },
      data: await makeJpeg({ width: 20, height: 20 }),
    });
    expect(missingName.status()).toBe(400);

    const badEncoding = await request.post('/api/images', {
      headers: { ...headers, 'x-fs-filename': '%E0%A4%A' },
      data: await makeJpeg({ width: 20, height: 20 }),
    });
    expect(badEncoding.status()).toBe(400);

    const badJson = await request.delete('/api/images', {
      headers: { origin, 'content-type': 'application/json' },
      data: 'nope',
    });
    expect(badJson.status()).toBe(400);
    const badIds = await request.delete('/api/images', { headers: { origin }, data: { ids: ['../../etc/passwd'] } });
    expect(badIds.status()).toBe(400);

    const badCursor = await request.get('/api/images?cursor=!!!');
    expect(badCursor.status()).toBe(400);
  });

  test('the session cookie is HttpOnly and SameSite=Lax, and nothing is listed without one', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: origin });
    const empty = await context.request.get('/api/images');
    expect(await empty.json()).toMatchObject({ images: [], nextCursor: null });
    expect(await context.cookies()).toHaveLength(0); // GET never creates a session

    await context.request.post('/api/images', {
      headers: { origin, 'content-type': 'application/octet-stream', 'x-fs-filename': 'a.jpg' },
      data: await makeJpeg({ width: 20, height: 20 }),
    });
    const cookies = await context.cookies();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: 'fs_session', httpOnly: true, sameSite: 'Lax' });
    expect(cookies[0]?.value.length).toBeGreaterThanOrEqual(40);
    await context.close();
  });

  test('POST /api/session is idempotent: it creates one session and reuses it', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: origin });
    expect((await context.request.post('/api/session', { headers: { origin } })).status()).toBe(200);
    const [first] = await context.cookies();
    expect(first?.name).toBe('fs_session');

    // Upload something, then ask for a session again: same cookie, same data.
    await context.request.post('/api/images', {
      headers: { origin, 'content-type': 'application/octet-stream', 'x-fs-filename': 'a.jpg' },
      data: await makeJpeg({ width: 20, height: 20 }),
    });
    expect((await context.request.post('/api/session', { headers: { origin } })).status()).toBe(200);
    const cookies = await context.cookies();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.value).toBe(first?.value);
    expect(((await (await context.request.get('/api/images')).json()) as { images: unknown[] }).images).toHaveLength(1);
    await context.close();
  });

  test('one session cannot read, list, or delete another session’s images', async ({ browser }) => {
    const owner = await sessionWithImage(browser);
    const stranger = await browser.newContext({ baseURL: origin });

    // The owner can see it.
    expect((await owner.context.request.get(`/api/images/${owner.id}/thumb`)).status()).toBe(200);
    expect(
      ((await (await owner.context.request.get('/api/images')).json()) as { images: unknown[] }).images,
    ).toHaveLength(1);

    // A stranger with no cookie, and a stranger with their own session, both get the same plain 404.
    expect((await stranger.request.get(`/api/images/${owner.id}/thumb`)).status()).toBe(404);
    await stranger.request.post('/api/images', {
      headers: { origin, 'content-type': 'application/octet-stream', 'x-fs-filename': 'theirs.jpg' },
      data: await makeJpeg({ width: 20, height: 20 }),
    });
    expect((await stranger.request.get(`/api/images/${owner.id}/thumb`)).status()).toBe(404);
    expect((await stranger.request.get(`/api/images/${owner.id}/preview`)).status()).toBe(404);
    const unknown = await stranger.request.get('/api/images/img_0000000000000000000000/thumb');
    expect(unknown.status()).toBe(404);
    expect(await unknown.text()).toBe(await (await stranger.request.get(`/api/images/${owner.id}/thumb`)).text());

    // Their listing contains only their own image, and deleting the owner's id is a no-op.
    const theirs = (await (await stranger.request.get('/api/images')).json()) as { images: { id: string }[] };
    expect(theirs.images).toHaveLength(1);
    expect(theirs.images[0]?.id).not.toBe(owner.id);
    const del = await stranger.request.delete('/api/images', { headers: { origin }, data: { ids: [owner.id] } });
    expect(await del.json()).toEqual({ deleted: [] });
    expect((await owner.context.request.get(`/api/images/${owner.id}/thumb`)).status()).toBe(200);

    await owner.context.close();
    await stranger.close();
  });

  test('renditions are served as private, immutable WebP with nosniff', async ({ browser }) => {
    const { context, id } = await sessionWithImage(browser);
    const res = await context.request.get(`/api/images/${id}/thumb`);
    expect(res.headers()['content-type']).toBe('image/webp');
    expect(res.headers()['cache-control']).toContain('private');
    expect(res.headers()['cache-control']).toContain('immutable');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect((await res.body()).subarray(8, 12).toString()).toBe('WEBP');
    expect((await context.request.get(`/api/images/${id}/original`)).status()).toBe(404); // originals never leave the server
    await context.close();
  });

  test('DELETE /api/session wipes the caller’s data and cookie', async ({ browser }) => {
    const { context, id } = await sessionWithImage(browser);
    const res = await context.request.delete('/api/session', { headers: { origin } });
    expect(res.status()).toBe(204);
    expect((await context.request.get(`/api/images/${id}/thumb`)).status()).toBe(404);
    expect(((await (await context.request.get('/api/images')).json()) as { images: unknown[] }).images).toEqual([]);
    await context.close();
  });
});
