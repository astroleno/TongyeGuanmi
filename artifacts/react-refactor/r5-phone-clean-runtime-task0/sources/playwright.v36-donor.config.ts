import { defineConfig, devices } from '@playwright/test';

const port = 4186;

export default defineConfig({
  testDir: './e2e',
  testMatch: /v36-donor-capture\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on',
    screenshot: 'off',
    video: 'on'
  },
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000
  },
  projects: [{
    name: 'donor-v36-mobile-webkit',
    use: {
      ...devices['iPhone 15 landscape'],
      browserName: 'webkit'
    }
  }]
});
