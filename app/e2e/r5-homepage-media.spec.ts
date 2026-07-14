import { expect, test, type Page } from '@playwright/test';
import { bootStory, storySnapshot, waitForHold } from './r5-helpers';

async function pressFromCurrentHold(page: Page, key: 'PageDown' | 'PageUp'): Promise<void> {
  const before = await storySnapshot(page);
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
  const after = await storySnapshot(page);
  if (after.phase === 'hold' && after.current === before.current) {
    await page.keyboard.press(key);
  }
}

test('Hero keeps the original figure deferred until the Hero to Pattern transition is accepted', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Batch B transfer gate uses mobile Chromium');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'video') {
      requests.push(new URL(request.url()).pathname);
    }
  });

  await bootStory(page, '/?presentation=direct');
  const initial = await page.locator('[data-r4-scene="hero"] [data-hero-figure-video]').evaluate((video: HTMLVideoElement) => ({
    preload: video.preload,
    source: video.currentSrc || video.src,
    poster: video.poster
  }));
  expect(initial).toMatchObject({ preload: 'none' });
  expect(initial.source).toMatch(/figure1-[^/]+\.webm$/);
  expect(initial.poster).toMatch(/figure-poster-[^/]+\.jpg$/);
  expect(initial.source).not.toContain('hero-figure-scrub');
  expect(requests.some((url) => /figure1-[^/]+\.webm$/.test(url))).toBe(false);

  await pressFromCurrentHold(page, 'PageDown');
  await page.waitForFunction(() => document
    .querySelector<HTMLVideoElement>('[data-r4-scene="hero"] [data-hero-figure-video]')
    ?.preload === 'auto');
  await waitForHold(page, 'pattern');
});

test('direct non-Hero entries expose exactly the eight canonical physical video keys', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Batch B media gate uses mobile Chromium');
  const cases = [
    {
      scene: 'figure2-animation',
      media: [
        ['figure2-left-motion', 'figure2-left-motion'],
        ['figure2-right-motion', 'figure2-right-motion']
      ]
    },
    { scene: 'ttg-animation', media: [['ttg-figure-motion', 'ttg-figure-motion']] },
    { scene: 'ph-animation', media: [['ph-figure-motion', 'ph-figure-motion']] },
    { scene: 'aod-animation', media: [['aod-figure-motion', 'aod-figure-motion']] },
    { scene: 'figure3-animation', media: [['figure3-motion', 'figure3-motion']] },
    {
      scene: 'crane-animation',
      media: [
        ['crane-figure-motion', 'crane-figure-motion'],
        ['crane-flock-motion', 'crane-flock-motion']
      ]
    }
  ] as const;

  for (const entry of cases) {
    await bootStory(page, `/?presentation=direct#${entry.scene}`);
    const videos = await page.evaluate((scene) => {
      const layer = document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`);
      return [...(layer?.querySelectorAll<HTMLVideoElement>('[data-media-key]') ?? [])].map((video) => ({
        key: video.dataset.mediaKey,
        source: video.currentSrc || video.src,
        poster: video.poster,
        playbackRate: video.playbackRate
      }));
    }, entry.scene);
    expect(videos.map((video) => video.key)).toEqual(entry.media.map(([key]) => key));
    for (const [index, [, filename]] of entry.media.entries()) {
      expect(videos[index]?.source).toMatch(new RegExp(`${filename}-[^/]+\\.webm$`));
      expect(videos[index]?.poster).toBe('');
      expect(videos[index]?.playbackRate).toBeGreaterThan(0);
    }
  }
});
