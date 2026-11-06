import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = process.env.FS_REVIEW_OUTPUT ?? '/tmp/facestudio-ui-review';
const origin = process.env.FS_REVIEW_ORIGIN ?? 'http://localhost:3100';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const runtimeMessages = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  if (msg.text() === 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.') runtimeMessages.push(msg.text());
  else errors.push(msg.text());
});
await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
await page.locator('.studio-footer').scrollIntoViewIfNeeded();
await page.evaluate(() => {
  for (const img of document.images) img.loading = 'eager';
});
await page.evaluate(async () => {
  await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => {})));
});
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await page.screenshot({ path: `${output}/landing-desktop.png`, fullPage: true });
await page.screenshot({ path: `${output}/hero-desktop.png` });
await page.getByRole('button', { name: 'Face-only', exact: true }).click();
await page.screenshot({ path: `${output}/crop-demo.png` });
const widths = [];
for (const width of [360, 375, 390, 768, 1024, 1280]) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  widths.push({ width, overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) });
  if (width === 390) await page.locator('.studio-footer').scrollIntoViewIfNeeded();
  // Hidden/off-screen lazy images may never resolve decode() until explicitly loaded.
  await page.evaluate(() => {
    for (const img of document.images) img.loading = 'eager';
  });
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => {})));
  });
  if (width === 390) await page.screenshot({ path: `${output}/landing-mobile.png`, fullPage: true });
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${origin}/editor`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${output}/editor-empty.png` });
await page
  .getByTestId('file-input')
  .setInputFiles(new URL('../public/images/studio/portrait-01.webp', import.meta.url).pathname);
await expect(page.getByTestId('library-count')).toHaveText('1 image');
await page.getByRole('option', { name: 'portrait-01.webp', exact: true }).click();
const stage = page.getByTestId('crop-stage');
await expect(stage).toHaveAttribute('data-phase', 'ready');
await expect(page.getByTestId('crop-mode-custom')).toHaveCSS('font-size', '12px');
await expect(page.getByTestId('adjust-exposure-input')).toHaveCSS('font-size', '12px');
const pixel = () =>
  stage.evaluate((el) => {
    const canvas = el.querySelector('canvas');
    if (!canvas) return 0;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const x =
      ((Number(el.dataset.viewX) + (Number(el.dataset.imageWidth) * Number(el.dataset.viewScale)) / 2) * canvas.width) /
      el.clientWidth;
    const y =
      ((Number(el.dataset.viewY) + (Number(el.dataset.imageHeight) * Number(el.dataset.viewScale)) / 2) *
        canvas.height) /
      el.clientHeight;
    const data = context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return (data[0] + data[1] + data[2]) / 3;
  });
await expect.poll(pixel).toBeGreaterThan(10);
const before = await pixel();
const exposure = page.getByTestId('adjust-exposure-input');
await exposure.fill('0.5');
await exposure.press('Enter');
await expect.poll(pixel).toBeGreaterThan(before + 3);
await expect
  .poll(async () => {
    const data = await (await page.request.get(`${origin}/api/edits`)).json();
    return Object.values(data.edits)[0]?.adjustments.exposure;
  })
  .toBe(0.5);
const after = await pixel();
await page.screenshot({ path: `${output}/editor-photo.png` });
await page.getByTestId('undo').click();
await expect(exposure).toHaveValue('0.00');
await expect.poll(pixel).toBeLessThan(before + 2);
const liveEdit = {
  import: true,
  adjustmentPixelBefore: before,
  adjustmentPixelAfter: after,
  persistedExposure: 0.5,
  undo: true,
};
await writeFile(`${output}/report.json`, JSON.stringify({ errors, runtimeMessages, widths, liveEdit }, null, 2));
console.log(JSON.stringify({ errors, runtimeMessages, widths, liveEdit }));
expect(errors).toEqual([]);
expect(widths.every((entry) => entry.overflow === 0)).toBe(true);
await browser.close();
