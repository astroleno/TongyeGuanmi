import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
export default defineConfig({
  testDir: './e2e', testMatch: ['continuous-scroll.spec.ts', 'scroll-pose-equivalence.spec.ts'], workers: 1, timeout: 60000,
  expect: { timeout: 10000 },
  use: { baseURL: `http://127.0.0.1:${port}`, screenshot: 'off', trace: 'off', video: 'off' },
  webServer: { command: `pnpm dev --host 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ]
});
