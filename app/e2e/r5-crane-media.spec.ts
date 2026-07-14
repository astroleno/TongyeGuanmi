import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { bootStory, waitForHold } from './r5-helpers';

type FrameSample = Readonly<{
  now: number;
  mediaTime: number;
  presentedFrames: number;
}>;

function summarize(samples: readonly FrameSample[]) {
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

test('Crane prepares two canonical surfaces and sustains dual reverse presented-frame cadence', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Batch B Crane cadence gate uses mobile Chromium');
  test.setTimeout(60_000);
  await bootStory(page, '/#crane-animation');
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'contact');
  await page.keyboard.press('PageUp');

  const samples = await page.evaluate(async (durationMs) => {
    const videos = [...document.querySelectorAll<HTMLVideoElement>(
      '[data-crane-figure-video], [data-crane-figure-front-video]'
    )];
    if (videos.length !== 2 || videos.some((video) => typeof video.requestVideoFrameCallback !== 'function')) {
      throw new Error('Crane canonical media callbacks unavailable');
    }
    const byRole: Record<'figure' | 'flock', FrameSample[]> = { figure: [], flock: [] };
    return new Promise<typeof byRole>((resolveSamples) => {
      let settled = false;
      const collect = (video: HTMLVideoElement, role: 'figure' | 'flock') => (
        now: number,
        metadata: VideoFrameCallbackMetadata
      ) => {
        byRole[role].push({
          now,
          mediaTime: metadata.mediaTime,
          presentedFrames: metadata.presentedFrames
        });
        if (!settled) {
          video.requestVideoFrameCallback(collect(video, role));
        }
      };
      for (const video of videos) {
        const role = video.hasAttribute('data-crane-figure-front-video') ? 'flock' : 'figure';
        video.requestVideoFrameCallback(collect(video, role));
      }
      window.setTimeout(() => {
        settled = true;
        resolveSamples(byRole);
      }, durationMs);
    });
  }, 1400);

  const sourceCommit = (JSON.parse(readFileSync(
    resolve(process.cwd(), '..', 'dist', 'r5-release-manifest.json'),
    'utf8'
  )) as { sourceCommit: string }).sourceCommit;
  const cadence = {
    sourceCommit,
    project: testInfo.project.name,
    host: hostname(),
    browserVersion: page.context().browser()?.version() ?? 'unknown',
    userAgent: await page.evaluate(() => navigator.userAgent),
    figure: summarize(samples.figure),
    flock: summarize(samples.flock)
  };
  console.log(`BATCH_B_CRANE_REVERSE_PRESENTED_CADENCE ${JSON.stringify(cadence)}`);
  await testInfo.attach('batch-b-crane-reverse-presented-cadence.json', {
    body: Buffer.from(JSON.stringify(cadence, null, 2)),
    contentType: 'application/json'
  });

  for (const [role, report] of Object.entries({ figure: cadence.figure, flock: cadence.flock })) {
    expect(report.samples, `${role} sample count`).toBeGreaterThanOrEqual(10);
    expect(report.presentedFrames, `${role} presented frames`).toBeGreaterThanOrEqual(10);
    expect(report.descendingSteps, `${role} descending media-time steps`).toBeGreaterThanOrEqual(8);
    expect(report.fps, `${role} reverse presented fps`).toBeGreaterThanOrEqual(20);
  }
});
