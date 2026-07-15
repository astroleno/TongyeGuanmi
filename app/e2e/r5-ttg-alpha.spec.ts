import { expect, test, type Page } from '@playwright/test';
import { hostname } from 'node:os';
import { bootStory, storySnapshot, waitForHold } from './r5-helpers';

type TtgMediaState = Readonly<{
  videoCount: number;
  reverseSurfaceCount: number;
  terminalSurfaceCount: number;
  mediaKey: string | undefined;
  source: string;
  poster: string;
  direction: string | undefined;
  progress: number;
  currentTime: number;
  paused: boolean;
  frameReady: boolean;
  staticFallback: boolean;
  opacity: number;
}>;

type PresentedFrameReport = Readonly<{
  samples: number;
  presentedFrames: number;
  elapsedMs: number;
  fps: number;
  descendingSteps: number;
}>;

async function ttgMediaState(page: Page): Promise<TtgMediaState> {
  return page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const videos = [...(scene?.querySelectorAll<HTMLVideoElement>('[data-ttg-figure-video]') ?? [])];
    const video = videos[0];
    if (!scene || !video) {
      throw new Error('TTG canonical media surface is missing');
    }
    return {
      videoCount: videos.length,
      reverseSurfaceCount: scene.querySelectorAll('[data-ttg-figure-video-reverse]').length,
      terminalSurfaceCount: scene.querySelectorAll('[data-ttg-figure-terminal], [data-ttg-figure-start]').length,
      mediaKey: video.dataset.mediaKey,
      source: video.currentSrc || video.src,
      poster: video.poster,
      direction: scene.dataset.ttgPlaybackDirection,
      progress: Number.parseFloat(scene.dataset.ttgRawProgress ?? '0'),
      currentTime: video.currentTime,
      paused: video.paused,
      frameReady: video.dataset.timelineVideoFrameReady === 'true',
      staticFallback: video.dataset.timelineVideoStaticFallback === 'true',
      opacity: Number.parseFloat(getComputedStyle(video).opacity)
    };
  });
}

async function sampleReversePresentedFrames(page: Page, durationMs: number): Promise<PresentedFrameReport> {
  const samples = await page.evaluate(async (duration) => {
    const video = document.querySelector<HTMLVideoElement>(
      '[data-r4-scene="ttg-animation"] [data-ttg-figure-video]'
    );
    if (!video || typeof video.requestVideoFrameCallback !== 'function') {
      throw new Error('requestVideoFrameCallback is unavailable for TTG');
    }
    return new Promise<Array<{ now: number; mediaTime: number; presentedFrames: number }>>((resolve) => {
      const frames: Array<{ now: number; mediaTime: number; presentedFrames: number }> = [];
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve(frames);
        }
      };
      const collect = (now: number, metadata: VideoFrameCallbackMetadata) => {
        frames.push({
          now,
          mediaTime: metadata.mediaTime,
          presentedFrames: metadata.presentedFrames
        });
        if (!settled) {
          video.requestVideoFrameCallback(collect);
        }
      };
      video.requestVideoFrameCallback(collect);
      window.setTimeout(finish, duration);
    });
  }, durationMs);
  expect(samples.length).toBeGreaterThanOrEqual(10);
  const first = samples[0]!;
  const last = samples.at(-1)!;
  const elapsedMs = last.now - first.now;
  const presentedFrames = last.presentedFrames - first.presentedFrames;
  return {
    samples: samples.length,
    presentedFrames,
    elapsedMs,
    fps: presentedFrames / (elapsedMs / 1000),
    descendingSteps: samples.slice(1).filter((sample, index) => (
      sample.mediaTime < samples[index]!.mediaTime - 0.0005
    )).length
  };
}

test('TTG uses one canonical media surface for native forward and same-file timeline reverse', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Batch B cadence gate uses mobile Chromium');
  test.setTimeout(60_000);
  await bootStory(page, '/#ttg-animation');
  await page.waitForFunction(() => document
    .querySelector<HTMLVideoElement>('[data-r4-scene="ttg-animation"] [data-ttg-figure-video]')
    ?.dataset.timelineVideoFrameReady === 'true');

  const initial = await ttgMediaState(page);
  expect(initial).toMatchObject({
    videoCount: 1,
    reverseSurfaceCount: 0,
    terminalSurfaceCount: 0,
    mediaKey: 'ttg-figure-motion',
    poster: '',
    frameReady: true
  });
  expect(initial.source).toMatch(/ttg-figure-motion-[^/]+\.webm$/);
  expect(initial.currentTime).toBeLessThan(0.05);
  const response = await page.request.get(initial.source);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('video/webm');

  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const video = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    return scene?.dataset.ttgPlaybackDirection === '1'
      && video?.dataset.timelineVideoFrameReady === 'true'
      && video.currentTime > 0.05
      && video.currentTime < 2.4
      && !video.paused;
  });
  const forward = await ttgMediaState(page);
  expect(forward).toMatchObject({ direction: '1', videoCount: 1, frameReady: true, staticFallback: false });
  expect(forward.currentTime).toBeGreaterThan(0.05);
  expect(forward.opacity).toBeGreaterThan(0.9);
  await waitForHold(page, 'lab');
  await page.keyboard.press('PageUp');
  await page.waitForFunction(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const video = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    return scene?.dataset.ttgPlaybackDirection === '-1'
      && video?.dataset.timelineVideoFrameReady === 'true'
      && video.currentTime > 2.4;
  });
  const reverseStart = await ttgMediaState(page);

  await page.waitForFunction(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const video = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    return scene?.dataset.ttgPlaybackDirection === '-1'
      && video?.dataset.timelineVideoFrameReady === 'true'
      && video.currentTime > 0.05
      && video.currentTime < 2.4;
  });
  const reverse = await ttgMediaState(page);
  expect(reverse).toMatchObject({ direction: '-1', videoCount: 1, frameReady: true, staticFallback: false });
  expect(reverse.currentTime).toBeLessThan(reverseStart.currentTime - 0.05);
  expect(reverse.paused).toBe(true);

  const presentation = await sampleReversePresentedFrames(page, 750);
  const cadence = {
    project: testInfo.project.name,
    host: hostname(),
    browserVersion: page.context().browser()?.version() ?? 'unknown',
    userAgent: await page.evaluate(() => navigator.userAgent),
    ...presentation
  };
  console.log(`BATCH_B_REVERSE_PRESENTED_CADENCE ${JSON.stringify(cadence)}`);
  await testInfo.attach('batch-b-reverse-presented-cadence.json', {
    body: Buffer.from(JSON.stringify(cadence, null, 2)),
    contentType: 'application/json'
  });
  expect(presentation.presentedFrames).toBeGreaterThanOrEqual(12);
  expect(presentation.descendingSteps).toBeGreaterThanOrEqual(10);
  expect(presentation.fps).toBeGreaterThanOrEqual(20);

  await waitForHold(page, 'ttg-animation');
  const restored = await ttgMediaState(page);
  expect(restored).toMatchObject({ videoCount: 1, reverseSurfaceCount: 0, terminalSurfaceCount: 0, frameReady: true });
  expect(restored.currentTime).toBeLessThan(0.05);
  expect((await storySnapshot(page)).lastError).toBeUndefined();
});

test('TTG decode failure hides the video surface and retains its static composition', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Batch B fallback gate uses mobile Chromium');
  await bootStory(page, '/#ttg-animation');
  await page.waitForFunction(() => document
    .querySelector<HTMLVideoElement>('[data-r4-scene="ttg-animation"] [data-ttg-figure-video]')
    ?.dataset.timelineVideoFrameReady === 'true');

  const fallback = await page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    const video = scene?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    if (!scene || !video) {
      throw new Error('TTG canonical media surface is missing');
    }
    video.dispatchEvent(new Event('error'));
    const visibleLayers = [...scene.querySelectorAll<HTMLImageElement>('.ttg-layer-stack img')]
      .filter((image) => image.naturalWidth > 0)
      .filter((image) => {
        const style = getComputedStyle(image);
        return style.visibility !== 'hidden' && Number.parseFloat(style.opacity) > 0;
      });
    return {
      frameReady: video.dataset.timelineVideoFrameReady === 'true',
      staticFallback: video.dataset.timelineVideoStaticFallback === 'true',
      videoOpacity: Number.parseFloat(getComputedStyle(video).opacity),
      visibleLayers: visibleLayers.length
    };
  });

  expect(fallback).toEqual({
    frameReady: false,
    staticFallback: true,
    videoOpacity: 0,
    visibleLayers: 3
  });
});
