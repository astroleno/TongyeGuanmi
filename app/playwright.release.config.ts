import { defineConfig } from '@playwright/test';
import continuous from './playwright.scroll.config';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
export default defineConfig({
  ...continuous,
  testMatch: ['continuous-scroll.spec.ts', 'scroll-pose-equivalence.spec.ts', 'r5-nojs.spec.ts'],
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 60000
  }
});
