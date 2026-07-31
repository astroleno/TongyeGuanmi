import { defineConfig, devices } from '/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/app/node_modules/@playwright/test/index.js';

const port = 4187;

export default defineConfig({
  testDir: '/private/tmp/r5-formal-capture',
  testMatch: /formal-route-reference\.spec\.ts/,
  outputDir: '/private/tmp/r5-phone-clean-runtime-task0-evidence/formal/supplemental-results',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on',
    screenshot: 'off',
    video: 'off'
  },
  webServer: {
    command: 'pnpm -C /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/app preview --host 127.0.0.1 --port 4187',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000
  },
  projects: [{
    name: 'supplemental-mobile-webkit',
    use: {
      ...devices['iPhone 15'],
      browserName: 'webkit'
    }
  }]
});
