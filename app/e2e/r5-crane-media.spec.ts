import { expect, test } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  waitForDirectEntryCommit
} from './r5-phone-clean-assertions';

test('Crane clean leaf proves two canonical decoded surfaces without duplicate owners', async ({
  page
}) => {
  await page.goto('/#crane-animation', { waitUntil: 'domcontentloaded' });
  await waitForDirectEntryCommit(page, 'crane-animation', 0);
  await assertSinglePhoneAuthority(page);

  const videos = page.locator(
    '[data-crane-figure-video], [data-crane-figure-front-video]'
  );
  const canvases = page.locator(
    '[data-phone-packed-alpha-canvas="crane-figure"], '
      + '[data-phone-packed-alpha-canvas="crane-flock"]'
  );
  await expect(videos).toHaveCount(2);
  await expect(canvases).toHaveCount(2);
  for (const role of ['crane-figure', 'crane-flock']) {
    await expect(page.locator(`[data-phone-packed-alpha-canvas="${role}"]`))
      .toHaveAttribute('data-packed-alpha-frame-ready', 'true');
  }
  const media = await videos.evaluateAll((elements) => elements.map((element) => {
    const video = element as HTMLVideoElement;
    return {
      source: video.currentSrc || video.src,
      callbacks: typeof video.requestVideoFrameCallback === 'function',
      muted: video.muted,
      inline: video.playsInline
    };
  }));
  expect(media.every((entry) => entry.callbacks && entry.muted && entry.inline)).toBe(true);
  expect(media.some((entry) => /crane-figure-motion/.test(entry.source))).toBe(true);
  expect(media.some((entry) => /crane-flock-motion/.test(entry.source))).toBe(true);
});
