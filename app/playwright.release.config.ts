import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'off',
    video: 'off'
  },
  webServer: {
    command: 'pnpm preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
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
      use: { ...devices['Pixel 7'], channel: 'chrome' }
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 15'], browserName: 'webkit' }
    }
  ]
});
