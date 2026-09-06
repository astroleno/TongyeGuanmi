import { expect, test, type Page } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  waitForCommitSequence
} from './r5-phone-clean-assertions';

async function ttgState(page: Page) {
  return page.locator('[data-r4-scene="ttg-animation"]').evaluate((scene) => {
    const video = scene.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    if (!video) throw new Error('TTG canonical media surface is missing');
    const presentedFrame = Number(video.dataset.phoneTtgPresentedFrame);
    const phoneRoot = video.closest<HTMLElement>('[data-phone-scene]');
    return {
      videoCount: scene.querySelectorAll('[data-ttg-figure-video]').length,
      reverseSurfaceCount: scene.querySelectorAll('[data-ttg-figure-video-reverse]').length,
      terminalSurfaceCount: scene.querySelectorAll(
        '[data-ttg-figure-terminal], [data-ttg-figure-start]'
      ).length,
      source: video.currentSrc || video.src,
      frameReady: video.dataset.phoneGroup45FrameReady === 'true'
        && Number.isInteger(presentedFrame),
      presentedFrame: Number.isInteger(presentedFrame) ? presentedFrame : null,
      endpoint: video.dataset.phoneTtgEndpointReady,
      staticFallback: phoneRoot?.dataset.phoneMediaState === 'fallback',
      opacity: Number.parseFloat(getComputedStyle(video).opacity)
    };
  });
}

test('TTG clean leaf owns one canonical decoded surface and real endpoint frame', async ({
  page
}) => {
  await page.goto('/#ttg-animation', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'ttg-animation', 0);
  await assertSinglePhoneAuthority(page);
  const state = await ttgState(page);
  expect(state).toMatchObject({
    videoCount: 1,
    reverseSurfaceCount: 0,
    terminalSurfaceCount: 0,
    frameReady: true,
    staticFallback: false
  });
  expect(state.endpoint).toMatch(/initial|terminal/);
  expect(state.presentedFrame).toBe(state.endpoint === 'terminal' ? 74 : 0);
  expect(state.source).toMatch(/ttg-figure-motion-[^/]+\.(?:webm|mp4)$/);
  expect(state.opacity).toBeGreaterThan(.9);
});

test('TTG decode failure hides its video and preserves the authored fallback', async ({
  page
}) => {
  await page.goto('/#ttg-animation', { waitUntil: 'domcontentloaded' });
  await waitForCommitSequence(page, 'ttg-animation', 0);
  await page.locator('[data-ttg-figure-video]').evaluate((video) => {
    video.dispatchEvent(new Event('error'));
  });
  const state = await ttgState(page);
  expect(state).toMatchObject({
    videoCount: 1,
    frameReady: false,
    staticFallback: true,
    opacity: 0
  });
  await expect(page.locator('.phone-ttg__fallback')).toBeAttached();
});
