import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '4174', 10);
const baseURL = `http://127.0.0.1:${port}`;

/** R5 acceptance runs the built production artifact on phone-class contexts. */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/r5-phone-story.spec.ts',
  timeout: 120_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
      name: 'phone-chromium',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        channel: 'chrome',
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      }
    },
    {
      name: 'phone-webkit',
      use: {
        ...devices['iPhone 15'],
        browserName: 'webkit'
      }
    }
  ]
});
