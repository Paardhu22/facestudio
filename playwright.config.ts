import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.FS_E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// Each run uses its own storage directory, so tests never touch real data and runs never collide.
// Workers inherit this value because it is assigned in the main process before they spawn.
process.env.FS_E2E_STORAGE ??= path.join('.data', 'e2e', String(Date.now()));

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  // Each Chrome context loads a WASM detector; bound parallelism on the 16 GiB development host.
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome-desktop',
      // Uses the system Google Chrome install (SKILLS.md §D.9).
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `node scripts/run.mjs dev --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { FS_STORAGE_DIR: process.env.FS_E2E_STORAGE },
  },
});
