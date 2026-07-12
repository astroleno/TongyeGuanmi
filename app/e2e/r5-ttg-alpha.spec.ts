import { expect, test } from '@playwright/test';
import { bootStory, storySnapshot, waitForHold } from './r5-helpers';

type TtgMediaState = {
  direction: string | undefined;
  progress: string | undefined;
  forward: {
    readyState: number;
    width: number;
    height: number;
    duration: number;
    currentTime: number;
    poster: string;
    active: boolean;
    opacity: number;
  };
  reverse: {
    readyState: number;
    width: number;
    height: number;
    duration: number;
    currentTime: number;
    poster: string;
    active: boolean;
    opacity: number;
  };
};

async function ttgMediaState(page: import('@playwright/test').Page): Promise<TtgMediaState> {
  return page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const forward = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    const reverse = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video-reverse]');
    if (!scene || !forward || !reverse) throw new Error('TTG media pair missing');
    const describe = (video: HTMLVideoElement) => ({
      readyState: video.readyState,
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
      currentTime: video.currentTime,
      poster: video.poster,
      active: video.classList.contains('is-active'),
      opacity: Number.parseFloat(getComputedStyle(video).opacity)
    });
    return {
      direction: scene.dataset.ttgPlaybackDirection,
      progress: scene.dataset.ttgRawProgress,
      forward: describe(forward),
      reverse: describe(reverse)
    };
  });
}

test('TTG alpha pair plays the canonical forward and reverse assets on every device class', async ({ page }) => {
  test.setTimeout(60_000);
  await bootStory(page, '/#ttg-animation');
  const initial = await ttgMediaState(page);
  expect(initial.forward.poster).toMatch(/ttg_figure-alpha-scrub-poster-[^/]+\.png$/);
  expect(initial.forward.currentTime).toBeLessThan(0.05);
  expect(initial.forward.active).toBe(true);
  const posterResponse = await page.request.get(initial.forward.poster);
  expect(posterResponse.ok()).toBe(true);
  expect(posterResponse.headers()['content-type']).toContain('image/png');

  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => window.__storyApp?.snapshot().phase === 'staged-paused');

  const forward = await ttgMediaState(page);
  expect(forward.direction).toBe('1');
  expect(Number(forward.progress)).toBeGreaterThan(0.99);
  expect(forward.forward.readyState).toBeGreaterThanOrEqual(1);
  expect(forward.reverse.readyState).toBeGreaterThanOrEqual(1);
  expect(forward.forward.width).toBe(720);
  expect(forward.forward.height).toBe(1280);
  expect(forward.reverse.width).toBe(720);
  expect(forward.reverse.height).toBe(1280);
  expect(forward.forward.duration).toBeGreaterThan(2.4);
  expect(forward.forward.duration).toBeLessThan(2.6);
  expect(forward.reverse.duration).toBeGreaterThan(2.4);
  expect(forward.reverse.duration).toBeLessThan(2.6);
  expect(forward.forward.active).toBe(true);
  expect(forward.forward.opacity).toBeGreaterThan(0.9);

  await page.keyboard.press('PageDown');
  await waitForHold(page, 'lab');
  await page.keyboard.press('PageUp');
  await page.waitForFunction(() => window.__storyApp?.snapshot().phase === 'staged-paused');
  await page.waitForFunction(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    return scene?.dataset.ttgPlaybackDirection === '-1';
  });

  const reverse = await ttgMediaState(page);
  expect(reverse.direction).toBe('-1');
  expect(reverse.forward.active).toBe(true);
  expect(reverse.forward.opacity).toBeGreaterThan(0.9);
  expect(reverse.reverse.active).toBe(false);

  await page.keyboard.press('PageUp');
  await page.waitForFunction(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const video = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video-reverse]');
    return scene?.dataset.ttgActiveSurface === 'reverse'
      && video?.classList.contains('is-active')
      && (video.currentTime ?? 0) > 0.05
      && (video.currentTime ?? 0) < 2.4;
  });
  const reversePlayback = await ttgMediaState(page);
  expect(reversePlayback.reverse.active).toBe(true);
  expect(reversePlayback.reverse.opacity).toBeGreaterThan(0.9);
  const reverseTime = reversePlayback.reverse.currentTime;
  await expect.poll(async () => (await ttgMediaState(page)).reverse.currentTime).toBeGreaterThan(reverseTime + 0.05);

  await waitForHold(page, 'ttg-animation');
  const restored = await ttgMediaState(page);
  expect(restored.forward.active).toBe(true);
  expect(restored.forward.currentTime).toBeLessThan(0.05);
  expect(restored.reverse.active).toBe(false);
  expect((await storySnapshot(page)).lastError).toBeUndefined();
});
