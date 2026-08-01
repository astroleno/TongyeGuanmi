import { expect, test } from '@playwright/test';
import {
  assertLayerOrderAtPoints,
  assertNoIntermediateWhiteOrBlackFrame,
  assertOpaqueViewportEdges,
  assertTargetContentVisible,
  waitForCommitSequence
} from './r5-phone-clean-assertions';

test('harness contract keeps every real viewport edge opaque', async ({ page }) => {
  await page.goto('/harness/r5-phone-clean#hero', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-story-loader="true"]')).toBeVisible();
  await assertOpaqueViewportEdges(page, [0, 0, 0], 0);
});

test('harness contract pixel decoder rejects a one-CSS-pixel edge gap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <style>
      html, body { margin: 0; min-height: 100%; background: rgb(255 255 255); }
      #cover { position: fixed; inset: 0 0 1px; background: rgb(7 17 14); }
    </style>
    <div id="cover"></div>
  `);
  await expect(assertOpaqueViewportEdges(page, [7, 17, 14], 0)).rejects.toThrow(
    /opaque viewport edge/i
  );
});

test('harness contract edge decoder permits distinct visible scene content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <style>
      html, body { margin: 0; min-height: 100%; background: rgb(7 17 14); }
      #content { position: fixed; inset: 300px 120px; background: rgb(180 20 30); }
    </style>
    <div id="content"></div>
  `);
  await assertOpaqueViewportEdges(page, [7, 17, 14], 0);
  await expect(assertOpaqueViewportEdges(page, [255, 255, 255], 255)).rejects.toThrow(
    /pixel tolerance/i
  );
});

test('harness contract helpers inspect rendered layers, content, frames, and commits', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <style>
      html, body { margin: 0; background: rgb(24 32 28); }
      [data-phone-plane] { position: fixed; inset: 0; }
      [data-phone-plane="source"] { z-index: 10; }
      [data-phone-plane="receiver"] { z-index: 30; pointer-events: none; }
      #content { position: fixed; left: 120px; top: 280px; width: 120px; height: 80px; }
    </style>
    <main class="phone-story" data-phone-scene="hero" data-phone-commit-sequence="1">
      <div data-phone-plane="source"><h1 id="content">Hero</h1></div>
      <div data-phone-plane="receiver"></div>
    </main>
  `);
  await assertLayerOrderAtPoints(page, [{ x: 180, y: 320 }], ['receiver', 'source']);
  await assertTargetContentVisible(page, ['#content']);
  await page.locator('[data-phone-plane="source"]').evaluate((plane) => {
    (plane as HTMLElement).style.opacity = '0';
  });
  await expect(assertTargetContentVisible(page, ['#content'])).rejects.toThrow(
    /required clean target content/i
  );
  await page.locator('[data-phone-plane="source"]').evaluate((plane) => {
    (plane as HTMLElement).style.opacity = '1';
  });
  const neutral = await page.screenshot();
  await assertNoIntermediateWhiteOrBlackFrame([neutral, neutral, neutral], {});
  await page.evaluate(() => {
    document.documentElement.style.background = '#000';
    document.body.replaceChildren();
    document.body.style.background = '#000';
  });
  const blackEndpoint = await page.screenshot();
  await assertNoIntermediateWhiteOrBlackFrame([blackEndpoint, neutral], {});
  await expect(
    assertNoIntermediateWhiteOrBlackFrame([neutral, blackEndpoint, neutral], {})
  ).rejects.toThrow(/Intermediate frame 1 is black/);
  await page.setContent(`
    <main class="phone-story" data-phone-scene="hero" data-phone-commit-sequence="1"></main>
  `);
  await page.evaluate(() => {
    window.setTimeout(() => {
      const root = document.querySelector<HTMLElement>('.phone-story');
      if (root) {
        root.dataset.phoneScene = 'pattern';
        root.dataset.phoneCommitSequence = '2';
      }
    }, 0);
  });
  await waitForCommitSequence(page, 'pattern', 1);
});
