import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '4173', 10);
const baseURL = `http://127.0.0.1:${port}`;
const specs = (...names: string[]) => names.map((name) => `**/${name}.spec.ts`);

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
      testMatch: specs(
        'r5-production', 'r5-performance', 'r5-homepage-media',
        'r5-matrix', 'r5-nojs'
      ),
      grep: /r5-(?:production|performance|nojs)\.spec\.ts|Batch C|desktop wheel|desktop typography/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'desktop-webkit',
      testMatch: specs('r5-production', 'r5-nojs'),
      grep: /r5-nojs\.spec\.ts|public root boots|Contact renders|full canonical spine|critical reverse chains|legacy and harness URLs/,
      use: { ...devices['Desktop Safari'], browserName: 'webkit', viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'mobile-chromium',
      testMatch: specs(
        'r5-crane-media', 'r5-ttg-alpha', 'r5-homepage-media',
        'r5-matrix', 'r5-nojs'
      ),
      grep: /r5-(?:crane-media|ttg-alpha|nojs)\.spec\.ts|Hero clean entry|clean direct media entries|mobile pointer swipe|portrait phones|mobile menu|mobile rotation|compact phone landscape/,
      use: { ...devices['Pixel 7 landscape'], channel: 'chrome' }
    },
    {
      name: 'mobile-webkit',
      testMatch: specs(
        'r5-crane-media', 'r5-ttg-alpha', 'r5-homepage-media',
        'r5-matrix', 'r5-nojs'
      ),
      grep: /r5-(?:crane-media|ttg-alpha|nojs)\.spec\.ts|Hero clean entry|clean direct media entries|iPhone and iPad WebKit|iPhone WebKit decodes|mobile pointer swipe|portrait phones|iPhone bypasses|iPhone WebKit clean direct-entry|mobile menu|mobile rotation|compact phone landscape/,
      use: { ...devices['iPhone 15 landscape'], browserName: 'webkit' }
    },
    {
      name: 'phone-portrait-chromium',
      testMatch: specs(
        'r5-phone-clean-runtime', 'r5-phone-clean-presentation',
        'r5-phone-rendering-lifecycle', 'r5-phone-story', 'r5-crane-media',
        'r5-ttg-alpha', 'r5-homepage-media', 'r5-matrix', 'r5-nojs'
      ),
      grep: /r5-(?:phone-clean-runtime|phone-clean-presentation|phone-rendering-lifecycle|phone-story|crane-media|ttg-alpha|nojs)\.spec\.ts|Hero clean entry|clean direct media entries|mobile pointer swipe|portrait phones|mobile menu|mobile rotation|compact phone landscape/,
      use: { ...devices['Pixel 7'], browserName: 'chromium', channel: 'chrome' }
    },
    {
      name: 'phone-portrait-webkit',
      testMatch: specs(
        'r5-phone-clean-runtime', 'r5-phone-clean-presentation',
        'r5-phone-rendering-lifecycle', 'r5-phone-story', 'r5-crane-media',
        'r5-ttg-alpha', 'r5-homepage-media', 'r5-matrix', 'r5-nojs'
      ),
      grep: /r5-(?:phone-clean-runtime|phone-clean-presentation|phone-rendering-lifecycle|phone-story|crane-media|ttg-alpha|nojs)\.spec\.ts|Hero clean entry|clean direct media entries|iPhone and iPad WebKit|iPhone WebKit decodes|mobile pointer swipe|portrait phones|iPhone bypasses|iPhone WebKit clean direct-entry|mobile menu|mobile rotation|compact phone landscape/,
      use: { ...devices['iPhone 15'], browserName: 'webkit' }
    }
  ]
});
