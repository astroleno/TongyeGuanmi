import { expect, test } from '@playwright/test';
import { bootStory, storySnapshot, waitForHold } from './r5-helpers';

type TtgMediaState = {
  activeSurface: string | undefined;
  direction: string | undefined;
  progress: string | undefined;
  start: {
    src: string;
    complete: boolean;
    width: number;
    height: number;
    active: boolean;
    opacity: number;
  };
  forward: {
    src: string;
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
    src: string;
    readyState: number;
    width: number;
    height: number;
    duration: number;
    currentTime: number;
    poster: string;
    active: boolean;
    opacity: number;
  };
  terminal: {
    src: string;
    complete: boolean;
    width: number;
    height: number;
    active: boolean;
    opacity: number;
  };
};

async function ttgMediaState(page: import('@playwright/test').Page): Promise<TtgMediaState> {
  return page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const forward = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    const reverse = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video-reverse]');
    const start = scene?.querySelector<HTMLImageElement>('[data-ttg-figure-start]');
    const terminal = scene?.querySelector<HTMLImageElement>('[data-ttg-figure-terminal]');
    if (!scene || !forward || !reverse || !start || !terminal) throw new Error('TTG media surfaces missing');
    const describe = (video: HTMLVideoElement) => ({
      src: video.currentSrc || video.src,
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
      activeSurface: scene.dataset.ttgActiveSurface,
      direction: scene.dataset.ttgPlaybackDirection,
      progress: scene.dataset.ttgRawProgress,
      start: {
        src: start.currentSrc || start.src,
        complete: start.complete,
        width: start.naturalWidth,
        height: start.naturalHeight,
        active: start.classList.contains('is-active'),
        opacity: Number.parseFloat(getComputedStyle(start).opacity)
      },
      forward: describe(forward),
      reverse: describe(reverse),
      terminal: {
        src: terminal.currentSrc || terminal.src,
        complete: terminal.complete,
        width: terminal.naturalWidth,
        height: terminal.naturalHeight,
        active: terminal.classList.contains('is-active'),
        opacity: Number.parseFloat(getComputedStyle(terminal).opacity)
      }
    };
  });
}

function activeSurfaceCount(state: TtgMediaState): number {
  return Number(state.start.active) + Number(state.forward.active) + Number(state.reverse.active) + Number(state.terminal.active);
}

test('TTG alpha pair plays the canonical forward and reverse assets on every device class', async ({ page }) => {
  test.setTimeout(60_000);
  await bootStory(page, '/#ttg-animation');
  const initial = await ttgMediaState(page);
  expect(initial.forward.poster).toMatch(/ttg_figure-alpha-scrub-poster-[^/]+\.png$/);
  expect(initial.forward.src).toMatch(/ttg_figure-alpha-scrub-[^/]+\.webm$/);
  expect(initial.reverse.src).toMatch(/ttg_figure-alpha-scrub-reverse-[^/]+\.webm$/);
  expect(initial.forward.currentTime).toBeLessThan(0.05);
  expect(initial.start.src).toMatch(/ttg_figure-alpha-scrub-poster-[^/]+\.png$/);
  expect(initial.start.complete).toBe(true);
  expect(initial.start.active).toBe(true);
  expect(initial.start.opacity).toBeGreaterThan(0.9);
  expect(initial.forward.active).toBe(false);
  expect(activeSurfaceCount(initial)).toBe(1);
  const [posterResponse, forwardResponse, reverseResponse] = await Promise.all([
    page.request.get(initial.forward.poster),
    page.request.get(initial.forward.src),
    page.request.get(initial.reverse.src)
  ]);
  expect(posterResponse.ok()).toBe(true);
  expect(posterResponse.headers()['content-type']).toContain('image/png');
  expect(forwardResponse.ok()).toBe(true);
  expect(forwardResponse.headers()['content-type']).toContain('video/webm');
  expect(reverseResponse.ok()).toBe(true);
  expect(reverseResponse.headers()['content-type']).toContain('video/webm');

  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const video = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    return scene?.dataset.ttgActiveSurface === 'forward'
      && video?.classList.contains('is-active')
      && (video.currentTime ?? 0) > 0.05
      && (video.currentTime ?? 0) < 2.4;
  });
  const forwardPlayback = await ttgMediaState(page);
  expect(forwardPlayback.direction).toBe('1');
  expect(forwardPlayback.activeSurface).toBe('forward');
  expect(forwardPlayback.forward.readyState).toBeGreaterThanOrEqual(1);
  expect(forwardPlayback.forward.width).toBe(720);
  expect(forwardPlayback.forward.height).toBe(1280);
  expect(forwardPlayback.forward.duration).toBeGreaterThan(2.4);
  expect(forwardPlayback.forward.duration).toBeLessThan(2.6);
  expect(forwardPlayback.forward.active).toBe(true);
  expect(forwardPlayback.forward.opacity).toBeGreaterThan(0.9);
  expect(forwardPlayback.start.active).toBe(false);
  expect(forwardPlayback.terminal.active).toBe(false);
  expect(activeSurfaceCount(forwardPlayback)).toBe(1);
  await page.waitForFunction(() => window.__storyApp?.snapshot().phase === 'staged-paused');

  const forward = await ttgMediaState(page);
  expect(forward.direction).toBe('1');
  expect(Number(forward.progress)).toBeGreaterThan(0.99);
  expect(forward.activeSurface).toBe('terminal');
  expect(forward.terminal.src).toMatch(/ttg_figure-terminal-[^/]+\.png$/);
  expect(forward.terminal.complete).toBe(true);
  expect(forward.terminal.width).toBe(720);
  expect(forward.terminal.height).toBe(1280);
  expect(forward.terminal.active).toBe(true);
  expect(forward.terminal.opacity).toBeGreaterThan(0.9);
  expect(forward.forward.active).toBe(false);
  expect(forward.reverse.active).toBe(false);
  expect(activeSurfaceCount(forward)).toBe(1);

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
  expect(reverse.activeSurface).toBe('terminal');
  expect(reverse.terminal.active).toBe(true);
  expect(reverse.terminal.opacity).toBeGreaterThan(0.9);
  expect(reverse.forward.active).toBe(false);
  expect(reverse.reverse.active).toBe(false);
  expect(activeSurfaceCount(reverse)).toBe(1);

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
  expect(reversePlayback.activeSurface).toBe('reverse');
  expect(reversePlayback.reverse.readyState).toBeGreaterThanOrEqual(1);
  expect(reversePlayback.reverse.width).toBe(720);
  expect(reversePlayback.reverse.height).toBe(1280);
  expect(reversePlayback.reverse.duration).toBeGreaterThan(2.4);
  expect(reversePlayback.reverse.duration).toBeLessThan(2.6);
  expect(reversePlayback.reverse.active).toBe(true);
  expect(reversePlayback.reverse.opacity).toBeGreaterThan(0.9);
  expect(reversePlayback.terminal.active).toBe(false);
  expect(activeSurfaceCount(reversePlayback)).toBe(1);
  const reverseTime = reversePlayback.reverse.currentTime;
  await expect.poll(async () => (await ttgMediaState(page)).reverse.currentTime).toBeGreaterThan(reverseTime + 0.05);

  await waitForHold(page, 'ttg-animation');
  const restored = await ttgMediaState(page);
  expect(restored.activeSurface).toBeUndefined();
  expect(restored.start.active).toBe(true);
  expect(restored.start.opacity).toBeGreaterThan(0.9);
  expect(restored.forward.active).toBe(false);
  expect(restored.reverse.active).toBe(false);
  expect(restored.terminal.active).toBe(false);
  expect(activeSurfaceCount(restored)).toBe(1);
  expect((await storySnapshot(page)).lastError).toBeUndefined();
});
