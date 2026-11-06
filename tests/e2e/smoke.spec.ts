import { type ConsoleMessage, type Page, expect, test } from '@playwright/test';

/** Collect console errors and page errors so every smoke test can assert a clean console. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('Landing page', () => {
  test('renders hero and sections with a clean console', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Precision Cropping.');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Powerful Batch Editing.');
    await expect(page.locator('#features')).toBeVisible();
    await expect(page.locator('#how-it-works')).toBeAttached();
    await expect(page.getByRole('img', { name: /illustration of the facestudio editor/i })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Get Started navigates to the editor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: 'Get Started' }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByTestId('editor-shell')).toBeVisible();
  });

  test('Explore Features jumps to the features section', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Explore Features' }).click();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.getByRole('heading', { name: 'Every crop, exactly where it belongs.' })).toBeInViewport();
  });

  test('crop preview changes framing and supports keyboard with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const portrait = page.getByRole('button', { name: 'Portrait / Headshot', exact: true });
    const face = page.getByRole('button', { name: 'Face-only', exact: true });
    const custom = page.getByRole('button', { name: 'Custom bounding box', exact: true });
    const frame = page.getByTestId('crop-preview-frame');
    await expect(portrait).toHaveAttribute('aria-pressed', 'true');
    const before = await frame.boundingBox();
    await face.focus();
    await page.keyboard.press('Enter');
    await expect(face).toHaveAttribute('aria-pressed', 'true');
    await expect(portrait).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('A closer frame, with the face at the center.')).toBeVisible();
    const after = await frame.boundingBox();
    expect(after?.height ?? 0).toBeLessThan(before?.height ?? 0);
    await custom.click();
    await expect(custom).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Your composition. Your exact dimensions.')).toBeVisible();
  });

  test('has no horizontal overflow at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('link', { name: 'Get Started' }).first()).toBeVisible();
  });
});

test.describe('Editor shell', () => {
  test('renders toolbar, three panels, status bar, and resize handles', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/editor');
    await expect(page.getByRole('link', { name: 'FaceStudio home' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Library' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Canvas' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Ready');
    await expect(page.getByRole('separator', { name: 'Resize library panel' })).toBeVisible();
    await expect(page.getByRole('separator', { name: 'Resize controls panel' })).toBeVisible();
    // Fits the viewport without page scroll.
    const scroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(scroll).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('library panel can be resized with the keyboard within its limits', async ({ page }) => {
    await page.goto('/editor');
    const library = page.getByRole('complementary', { name: 'Library' });
    const before = (await library.boundingBox())?.width ?? 0;
    expect(Math.round(before)).toBe(280);
    const handle = page.getByRole('separator', { name: 'Resize library panel' });
    await handle.focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
    const after = (await library.boundingBox())?.width ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(Math.round(after)).toBeLessThanOrEqual(420);
  });

  test('remembers a resized library panel across reloads without hydration errors', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/editor');
    const library = page.getByRole('complementary', { name: 'Library' });
    await page.getByRole('separator', { name: 'Resize library panel' }).focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
    const resized = Math.round((await library.boundingBox())?.width ?? 0);
    expect(resized).toBeGreaterThan(280);

    await page.reload();
    await expect
      .poll(async () => Math.round((await library.boundingBox())?.width ?? 0), { timeout: 5000 })
      .toBe(resized);
    expect(errors).toEqual([]);
  });

  test('shows the larger-screen notice under 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/editor');
    await expect(page.getByRole('heading', { name: 'The editor needs a larger screen' })).toBeVisible();
    await expect(page.getByTestId('editor-shell')).toBeHidden();
  });
});

test.describe('Server', () => {
  test('health endpoint confirms sqlite and sharp load in the Next.js runtime', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, checks: { sqlite: true, sharp: true } });
  });

  test('security headers are present', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['x-powered-by']).toBeUndefined();
  });
});
