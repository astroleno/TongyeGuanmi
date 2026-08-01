import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '4173', 10);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/r5-*.spec.ts',
  timeout: 120_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'off',
    video: 'off'
  },
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'], browserName: 'webkit', viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7 landscape'], channel: 'chrome' }
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 15 landscape'], browserName: 'webkit' }
    },
    {
      name: 'phone-portrait-chromium',
      use: { ...devices['Pixel 7'], browserName: 'chromium' }
    },
    {
      name: 'phone-portrait-webkit',
      use: { ...devices['iPhone 15'], browserName: 'webkit' }
    }
  ]
});
