import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.FRAME_LOCK_PLAYWRIGHT_PORT ?? '4174', 10);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/frame-lock-spike.spec.ts',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/frame-lock-spike.json' }]
  ],
  timeout: 45_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' }
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'phone-chromium',
      use: { ...devices['Pixel 7'] }
    },
    {
      name: 'phone-webkit',
      use: { ...devices['iPhone 13'] }
    }
  ]
});
