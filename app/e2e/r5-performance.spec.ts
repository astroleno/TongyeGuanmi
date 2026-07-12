import { expect, test, type Page } from '@playwright/test';
import { navigateStory, storySnapshot, waitForHold } from './r5-helpers';

test.use({ video: 'off', trace: 'off', screenshot: 'off' });

type PerformanceWindow = Window & {
  __r5Lcp?: number;
  __r5LcpElement?: string;
  __r5StopFrames?: () => number[];
};

function summarizeFrames(frameIntervals: number[]) {
  const sorted = [...frameIntervals].sort((left, right) => left - right);
  const p95FrameIntervalMs = sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
  ] ?? 0;
  const longFramesOver50Ms = frameIntervals.filter((value) => value > 50).length;
  return {
    samples: frameIntervals.length,
    p95FrameIntervalMs,
    longFramesOver50Ms,
    longFrameRatio: longFramesOver50Ms / frameIntervals.length
  };
}

async function startFrameSampling(page: Page): Promise<void> {
  await page.evaluate(() => {
    const intervals: number[] = [];
    let active = true;
    let previous = performance.now();
    const tick = (now: number) => {
      if (!active) return;
      intervals.push(now - previous);
      previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    (window as PerformanceWindow).__r5StopFrames = () => {
      active = false;
      return intervals;
    };
  });
}

async function stopFrameSampling(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as PerformanceWindow).__r5StopFrames?.() ?? []);
}

test('LCP, frame pacing, memory, GPU surfaces, and dispose stay inside R5 budgets', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name),
    'performance sampling is Chromium-only'
  );
  test.setTimeout(60_000);

  await page.addInitScript(() => {
    (window as PerformanceWindow).__r5Lcp = 0;
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) {
        const entry = last as PerformanceEntry & { element?: Element | null };
        (window as PerformanceWindow).__r5Lcp = last.startTime;
        (window as PerformanceWindow).__r5LcpElement = entry.element
          ? `${entry.element.tagName.toLowerCase()}.${entry.element.className}`
          : 'unknown';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__storyApp?.snapshot().phase === 'hold');
  const runtimeReadyMs = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => window.__storyApp?.snapshot().presentationReady === true, undefined, {
    timeout: 15_000
  });
  const presentationReadyMs = await page.evaluate(() => performance.now());
  await page.waitForTimeout(1_200);
  const observedBootMetrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const gpuRenderer = gl
      ? String(rendererInfo
        ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER))
      : 'unavailable';
    return {
      lcpMs: (window as PerformanceWindow).__r5Lcp ?? 0,
      lcpElement: (window as PerformanceWindow).__r5LcpElement ?? 'unknown',
      initialResourceBytes: resources.reduce(
        (sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0),
        0
      ),
      usedJsHeapBytes: memory.memory?.usedJSHeapSize,
      gpuRenderer
    };
  });
  const bootMetrics = {
    ...observedBootMetrics,
    runtimeReadyMs,
    presentationReadyMs
  };
  const idleFrameIntervals = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const intervals: number[] = [];
    const startedAt = performance.now();
    let previous = startedAt;
    const tick = (now: number) => {
      intervals.push(now - previous);
      previous = now;
      if (now - startedAt >= 1_000) {
        resolve(intervals);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  const idlePlayback = summarizeFrames(idleFrameIntervals);

  await startFrameSampling(page);
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'pattern');
  const heroPatternIntervals = await stopFrameSampling(page);

  await startFrameSampling(page);
  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => window.__storyApp?.snapshot().phase === 'staged-paused');
  const patternCollapseIntervals = await stopFrameSampling(page);

  await startFrameSampling(page);
  await page.keyboard.press('PageDown');
  await waitForHold(page, 'star-map');
  const patternInkIntervals = await stopFrameSampling(page);
  const patternStarMapIntervals = [...patternCollapseIntervals, ...patternInkIntervals];
  const frameIntervals = [...heroPatternIntervals, ...patternStarMapIntervals];
  const playback = summarizeFrames(frameIntervals);

  await navigateStory(page, 'contact');
  await page.waitForTimeout(250);
  const disposed = await storySnapshot(page);
  const finalHeap = await page.evaluate(() => {
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return memory.memory?.usedJSHeapSize;
  });

  const report = {
    boot: bootMetrics,
    idlePlayback,
    playback,
    playbackSegments: {
      heroPattern: summarizeFrames(heroPatternIntervals),
      patternStarMap: summarizeFrames(patternStarMapIntervals),
      patternCollapse: summarizeFrames(patternCollapseIntervals),
      patternInk: summarizeFrames(patternInkIntervals)
    },
    dispose: disposed,
    finalHeapBytes: finalHeap
  };
  console.log(`R5_RUNTIME_PERFORMANCE ${JSON.stringify(report)}`);
  await testInfo.attach('r5-runtime-performance.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json'
  });

  expect(bootMetrics.lcpMs).toBeGreaterThan(0);
  expect(bootMetrics.lcpMs).toBeLessThanOrEqual(2_500);
  expect(runtimeReadyMs).toBeLessThanOrEqual(
    testInfo.project.name.startsWith('mobile-') ? 4_000 : 2_500
  );
  expect(presentationReadyMs).toBeLessThanOrEqual(
    testInfo.project.name.startsWith('mobile-') ? 11_000 : 9_500
  );
  expect(bootMetrics.initialResourceBytes).toBeLessThanOrEqual(40 * 1024 * 1024);
  if (bootMetrics.usedJsHeapBytes !== undefined) {
    expect(bootMetrics.usedJsHeapBytes).toBeLessThanOrEqual(160 * 1024 * 1024);
  }
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(bootMetrics.gpuRenderer);
  const hardwareP95BudgetMs = testInfo.project.name.startsWith('mobile-') ? 34 : 20;
  expect(frameIntervals.length).toBeGreaterThan(30);
  expect(playback.p95FrameIntervalMs).toBeLessThanOrEqual(
    softwareRenderer ? 300 : hardwareP95BudgetMs
  );
  expect(playback.longFrameRatio).toBeLessThan(softwareRenderer ? 0.25 : 0.01);
  expect(disposed.mountedLayers).toBeLessThanOrEqual(3);
  expect(disposed.webglCanvases).toBeLessThanOrEqual(1);
  expect(disposed.videos).toBeLessThanOrEqual(4);
  expect(disposed.lifecycle.releasedCanvases).toBeGreaterThanOrEqual(1);
  expect(disposed.lifecycle.releasedVideos).toBeGreaterThanOrEqual(1);
  if (finalHeap !== undefined) {
    expect(finalHeap).toBeLessThanOrEqual(192 * 1024 * 1024);
  }
});
