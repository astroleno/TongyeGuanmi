import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '4173', 10);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/r5-*.spec.ts',
  timeout: 30_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' }
    }
  ]
});
