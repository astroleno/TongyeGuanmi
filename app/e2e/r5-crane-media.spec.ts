import { expect, test } from '@playwright/test';
import {
  assertSinglePhoneAuthority,
  readPhoneStoryDiagnostic,
  waitForDirectEntryCommit
} from './r5-phone-clean-assertions';

test('Crane clean leaf proves two canonical decoded surfaces without duplicate owners', async ({
  page
}) => {
  test.setTimeout(75_000);
  await page.addInitScript(() => {
    (window as typeof window & { __r5PhoneRuntimeLog?: unknown[] }).__r5PhoneRuntimeLog = [];
  });
  await page.goto('/#crane-animation', { waitUntil: 'domcontentloaded' });
  try {
    await waitForDirectEntryCommit(page, 'crane-animation', 0);
  } catch (error) {
    const diagnostic = await readPhoneStoryDiagnostic(page);
    const trace = await page.evaluate(() => {
      const snapshots = (
        window as typeof window & { __r5PhoneRuntimeLog?: Array<Record<string, unknown>> }
      ).__r5PhoneRuntimeLog ?? [];
      return snapshots.map((snapshot) => {
        const transaction = snapshot.transaction as Record<string, unknown> | null;
        const attempt = transaction?.attempt as Record<string, unknown> | undefined;
        const deadline = transaction?.deadline as Record<string, unknown> | undefined;
        const failure = transaction?.failure as Record<string, unknown> | undefined;
        return {
          status: snapshot.status,
          revision: snapshot.stateRevision,
          candidate: transaction?.candidateSceneId,
          generation: attempt?.transactionGeneration,
          phase: transaction?.phase,
          deadline: deadline?.operation,
          activation: transaction?.activation,
          failure: failure?.code
        };
      });
    });
    throw new Error(`Cold Crane direct entry failed: ${JSON.stringify({ diagnostic, trace })}`, {
      cause: error
    });
  }
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
