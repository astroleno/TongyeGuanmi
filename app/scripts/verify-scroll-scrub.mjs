import { chromium, webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { cpus, loadavg, release } from 'node:os';
import { isScrollMemoryPoseReady, seekScrollMemoryPose } from './r5-scroll-memory.mjs';
import { percentile95, SCROLL_PERFORMANCE_SEGMENTS, summarizeScrollPerformance } from './scroll-performance-metrics.mjs';
/* global window, document, requestAnimationFrame */

// Local repeatable diagnostics, not a substitute for real touch/device evidence.
const engine = process.env.SCROLL_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const phone = process.env.SCROLL_PLATFORM === 'phone';
const baseURL = process.env.SCROLL_URL ?? 'http://127.0.0.1:4173';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chromium' ? { channel: 'chrome' } : {});
const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: phone, hasTouch: phone });
const segments = process.env.SCROLL_SEGMENTS?.split(',') ?? SCROLL_PERFORMANCE_SEGMENTS;
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' || /GL_INVALID|WebGL.*(lost|failed)/i.test(message.text())) errors.push(message.text());
});
const results = [];
let currentSegment = null;
const environment = { browserVersion: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent),
  input: 'synthetic scrollTo once per RAF', cache: 'each segment prepared at 20% before measurement',
  powerMode: process.env.SCROLL_POWER_MODE ?? 'unknown', physicalDisplayRefreshRate: 'unknown',
  host: { platform: process.platform, arch: process.arch, osRelease: release(), logicalCpus: cpus().length, loadAtStart: loadavg() } };
let identity = null;
let baseline = null;
const output = process.env.SCROLL_REPORT ?? `/tmp/tongye-scroll-${engine}-${phone ? 'phone' : 'desktop'}.json`;
const saveReport = async (failure = null) => {
  await writeFile(output, JSON.stringify({ engine, environment, identity, baseline,
    loadAtEnd: loadavg(), platform: phone ? 'phone-emulation' : 'desktop',
    source: 'synthetic native-document scroll; not physical device input', baseURL,
    timestamp: new Date().toISOString(), requestedSegments: segments,
    passed: !failure && !errors.length && results.length === segments.length && results.every((result) => result.passed),
    measuredPassed: !failure && !errors.length && results.length === segments.length && results.every((result) => result.measuredPassed),
    errors, results, failure }, null, 2));
};
try {
  const manifestResponse = await page.request.get(`${baseURL}/r5-release-manifest.json`);
  if (!manifestResponse.ok()) throw new Error('A production build manifest is required for performance evidence');
  const manifest = await manifestResponse.json();
  if (manifest.schemaVersion !== 3 || !manifest.sourceCommit || !manifest.artifactTreeSha256) {
    throw new Error('The preview does not expose a valid production build identity');
  }
  identity = { sourceCommit: manifest.sourceCommit, sourceDirty: manifest.sourceDirty,
    artifactTreeSha256: manifest.artifactTreeSha256, qualification: manifest.qualification?.status };
  baseline = await page.evaluate(async () => {
    const intervals = [];
    let start;
    let previous;
    await new Promise((resolve) => {
      const tick = (now) => {
        start ??= now; previous ??= now;
        intervals.push(now - previous); previous = now;
        if (now - start < 10000) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    return { url: window.location.href, visible: !document.hidden, intervals,
      longTasksSupported: typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask') };
  });
  baseline.rafIntervalP95 = percentile95(baseline.intervals.slice(2));
  console.log(JSON.stringify({ baseline: { rafIntervalP95: baseline.rafIntervalP95, visible: baseline.visible,
    longTasksSupported: baseline.longTasksSupported }, identity }));
  await page.goto(`${baseURL}/#method`);
  await page.waitForFunction(() => window.__r5ScrollStory?.snapshot().view.status === 'ready');
  // The opening loader is a cold-entry overlay, not a prepared visible scene.
  // Covered video can be compositor-throttled even after its media is decoded.
  await page.locator('.story-loader').waitFor({ state: 'hidden' });
  for (const segment of segments) {
    currentSegment = segment;
    const goal = await page.evaluate(seekScrollMemoryPose, { rangeId: segment, progress: .2 });
    await page.waitForFunction(isScrollMemoryPoseReady, goal, { timeout: 25000 });
    const result = await page.evaluate(async (id) => {
      const api = window.__r5ScrollStory;
      const range = api.index().ranges.find((range) => range.id === id);
      const samples = [], longTasks = [];
      const longTasksSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask');
      const observer = longTasksSupported
        ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))) : null;
      observer?.observe({ type: 'longtask', buffered: false });
      const duration = 10000;
      let start;
      let previous;
      await new Promise((resolve) => {
        const tick = (now) => {
          // RAF's frame timestamp can predate performance.now() in the task
          // scheduling this callback. Use one clock for the entire sweep.
          start ??= now; previous ??= now;
          const progress = .2 + .6 * Math.min(1, (now - start) / duration);
          window.scrollTo(0, range.start + (range.end - range.start) * progress);
          const state = api.snapshot();
          samples.push({ time: now - start, interval: now - previous,
            rangeId: state.desired.rangeId, epoch: state.intent.epoch, presentedEpoch: state.presented?.epoch ?? null,
            visible: !document.hidden,
            documentScroll: window.scrollY, desiredScroll: state.desired.scroll,
            documentPose: (window.scrollY - range.start) / (range.end - range.start),
            desired: state.desired.progress, presented: state.presented?.progress ?? null,
            status: state.view.status,
            videos: [...document.querySelectorAll('.story-scroll video')].map((video) => ({
              time: video.currentTime, target: Number(video.dataset.timelineVideoTarget),
              seeking: video.seeking, readyState: video.readyState,
              presentedTime: Number(video.dataset.timelineVideoPresentedTime),
              sourceTime: video.dataset.timelineVideoSourceTime === undefined ? null : Number(video.dataset.timelineVideoSourceTime),
              evidence: video.dataset.timelineVideoFrameEvidence, paused: video.paused
            })),
            canvases: [...document.querySelectorAll('.story-scroll canvas[data-packed-alpha-media-time], .story-scroll canvas[data-scroll-video-media-time]')].map((canvas) => ({
              time: Number(canvas.dataset.packedAlphaMediaTime ?? canvas.dataset.scrollVideoMediaTime),
              kind: canvas.dataset.scrollVideoMediaTime === undefined ? 'packed-alpha' : 'native-decoded',
              generation: canvas.dataset.packedAlphaGeneration === undefined ? null : Number(canvas.dataset.packedAlphaGeneration),
              frame: canvas.dataset.packedAlphaFrame ?? null, ready: canvas.dataset.packedAlphaFrameReady ?? 'true'
            })) });
          previous = now;
          if (now - start < duration) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
      const stopped = performance.now();
      await new Promise((resolve) => {
        const check = () => {
          const state = api.snapshot();
          if (Math.abs((state.presented?.progress ?? -1) - .8) < .002 || performance.now() - stopped >= 2000) resolve();
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
      const convergenceMs = performance.now() - stopped;
      if (observer) longTasks.push(...observer.takeRecords().map(({ startTime, duration }) => ({ startTime, duration })));
      observer?.disconnect();
      return { id, convergenceMs, final: api.snapshot(), samples, longTasks, longTasksSupported,
        resources: { videos: document.querySelectorAll('.story-scroll video').length, canvases: document.querySelectorAll('.story-scroll canvas').length } };
    }, segment);
    Object.assign(result, summarizeScrollPerformance(result));
    results.push(result);
    await saveReport();
    console.log(JSON.stringify({ segment, passed: result.passed, measuredPassed: result.measuredPassed,
      failures: result.failures, unavailable: result.unavailable,
      convergenceMs: result.convergenceMs, ...result.metrics, resources: result.resources }));
  }
  await saveReport();
  console.log(JSON.stringify({ report: output, errors }));
  if (errors.length || results.some(({ passed }) => !passed)) process.exitCode = 1;
} catch (error) {
  const state = await page.evaluate(() => ({ state: window.__r5ScrollStory?.snapshot(),
    videos: [...document.querySelectorAll('.story-scroll video')].map((video) => ({
      time: video.currentTime, seeking: video.seeking, readyState: video.readyState, data: { ...video.dataset }
    })) })).catch(() => null);
  const failure = { segment: currentSegment, message: String(error), state };
  await saveReport(failure);
  console.error(JSON.stringify({ report: output, failure })); process.exitCode = 1;
} finally { await browser.close(); }
