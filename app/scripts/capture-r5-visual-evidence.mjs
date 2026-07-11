/* global document, window */
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const outputDir = path.join(repoDir, 'artifacts/react-refactor/r5-candidate/visual');
const baseUrl = process.env.R5_BASE_URL ?? 'http://127.0.0.1:4173';

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function waitForHold(page, scene) {
  await page.waitForFunction((expected) => {
    const snapshot = window.__storyApp?.snapshot();
    return snapshot?.phase === 'hold' && snapshot.current === expected;
  }, scene, { timeout: 30_000 });
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();

  await page.goto(`${baseUrl}/`);
  await waitForHold(page, 'hero');
  await page.screenshot({ path: path.join(outputDir, 'desktop-home.png') });

  await page.goto(`${baseUrl}/#pattern`);
  await waitForHold(page, 'pattern');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputDir, 'desktop-pattern.png') });

  await page.goto(`${baseUrl}/#ttg-animation`);
  await waitForHold(page, 'ttg-animation');
  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => window.__storyApp?.snapshot().phase === 'staged-paused');
  await page.screenshot({ path: path.join(outputDir, 'desktop-ttg-forward.png') });

  await page.keyboard.press('PageDown');
  await waitForHold(page, 'lab');
  await page.keyboard.press('PageUp');
  await page.waitForFunction(() => window.__storyApp?.snapshot().phase === 'staged-paused');
  await page.keyboard.press('PageUp');
  await page.waitForFunction(() => {
    const scene = document.querySelector('[data-r4-scene="ttg-animation"]');
    return scene?.dataset.ttgPlaybackDirection === '-1';
  });
  await page.screenshot({ path: path.join(outputDir, 'desktop-ttg-reverse.png') });
  await desktop.close();

  const mobile = await browser.newContext({ ...devices['Pixel 7'] });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${baseUrl}/#services`);
  await waitForHold(mobilePage, 'services');
  await mobilePage.screenshot({ path: path.join(outputDir, 'mobile-services.png') });
  await mobile.close();
} finally {
  await browser.close();
}

process.stdout.write(`${outputDir}\n`);
