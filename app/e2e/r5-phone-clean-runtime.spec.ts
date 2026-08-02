import { expect, test } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  readCommitSequence,
  readPlaneRevision,
  waitForCommitSequence
} from './r5-phone-clean-assertions';

test('formal contract keeps one route-local authority under the opaque Loader', async ({
  page
}) => {
  let releaseVideo = () => undefined;
  const videoGate = new Promise<void>((resolve) => { releaseVideo = resolve; });
  await page.route(/figure1-rgb-alpha.*\.mp4/, async (route) => {
    await videoGate;
    await route.continue();
  });
  await page.goto('/#hero', { waitUntil: 'domcontentloaded' });
  await assertSinglePhoneAuthority(page);
  await expect(page.locator('.phone-story')).toHaveAttribute('data-phone-scope', 'formal');
  await expect(page.locator('[data-story-loader="true"]')).toBeVisible();
  expect(await readPlaneRevision(page)).toBeGreaterThanOrEqual(0);
  expect(await readCommitSequence(page)).toBe(0);
  releaseVideo();
});

test('AOD direct activation requires a causal packed Canvas draw', async ({ page }) => {
  await page.goto('/#aod-animation', {
    waitUntil: 'domcontentloaded'
  });
  await waitForCommitSequence(page, 'aod-animation', 0);
  await assertSinglePhoneAuthority(page);
  const video = page.locator('[data-aod-figure-video]');
  const canvas = page.locator('[data-aod-figure-canvas]');
  await expect(video).toHaveJSProperty('muted', true);
  await expect(video).toHaveJSProperty('playsInline', true);
  await expect(canvas).toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  await expect(page.locator('.portrait-scroll-spike__scene--aod'))
    .toHaveAttribute('data-phone-aod-frame', 'verified');
  await expect(page.locator('[data-story-loader="true"]'))
    .toHaveAttribute('data-loader-status', 'hidden');
});

test('AOD rejected autoplay stays inert until one real activation gesture', async ({ page }) => {
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    let rejected = false;
    HTMLMediaElement.prototype.play = function patchedPlay() {
      if (!rejected && this.matches('[data-aod-figure-video]')) {
        rejected = true;
        return Promise.reject(new DOMException('gesture required', 'NotAllowedError'));
      }
      return originalPlay.call(this);
    };
  });
  await page.goto('/#aod-animation', {
    waitUntil: 'domcontentloaded'
  });
  const shell = page.locator('.phone-story');
  const activation = page.locator('[data-phone-activation]');
  await expect(shell).toHaveAttribute('data-phone-status', 'transaction');
  await expect(page.locator('[data-aod-figure-video]')).toBeAttached();
  await expect(page.locator('[data-aod-figure-canvas]')).toBeAttached();
  await expect(activation).toBeVisible();
  await expect(page.locator('[data-phone-plane="receiver"]'))
    .toHaveAttribute('data-phone-exposed', 'false');
  expect(await readCommitSequence(page)).toBe(0);

  await activation.click();
  await waitForCommitSequence(page, 'aod-animation', 0);
  await expect(page.locator('[data-aod-figure-canvas]'))
    .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  await expect(activation).toBeHidden();
});
