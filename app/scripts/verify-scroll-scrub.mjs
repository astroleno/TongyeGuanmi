import { chromium, webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
/* global window, document, requestAnimationFrame */

// Local repeatable diagnostics, not a substitute for real touch/device evidence.
const engine = process.env.SCROLL_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const phone = process.env.SCROLL_PLATFORM === 'phone';
const baseURL = process.env.SCROLL_URL ?? 'http://127.0.0.1:4173';
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chromium' ? { channel: 'chrome' } : {});
const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: phone, hasTouch: phone });
const segments = (process.env.SCROLL_SEGMENTS ?? 'hero-pattern,aod-method-top,figure2-distance-expand,figure3-services,ttg-lab,ph-education,crane-contact').split(',');
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
let currentSegment = null;
const environment = { browserVersion: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent),
  input: 'synthetic scrollTo once per RAF', cache: 'each segment prepared at 20% before measurement',
  powerMode: 'unknown', physicalDisplayRefreshRate: 'unknown' };
const output = process.env.SCROLL_REPORT ?? `/tmp/tongye-scroll-${engine}-${phone ? 'phone' : 'desktop'}.json`;
const saveReport = async (failure = null) => {
  await writeFile(output, JSON.stringify({ engine, environment, platform: phone ? 'phone-emulation' : 'desktop',
    source: 'synthetic native-document scroll; not physical device input', baseURL,
    timestamp: new Date().toISOString(), errors, results, failure }, null, 2));
};
try {
  await page.goto(`${baseURL}/#method`);
  await page.waitForFunction(() => window.__r5ScrollStory?.snapshot().view.status === 'ready');
  // The opening loader is a cold-entry overlay, not a prepared visible scene.
  // Covered video can be compositor-throttled even after its media is decoded.
  await page.locator('.story-loader').waitFor({ state: 'hidden' });
  for (const segment of segments) {
    currentSegment = segment;
    await page.evaluate((id) => {
      const api = window.__r5ScrollStory;
      const range = api.index().ranges.find((range) => range.id === id);
      if (!range) throw new Error(`Missing segment ${id}`);
      api.seek(range.start + (range.end - range.start) * .2);
    }, segment);
    await page.waitForFunction(() => {
      const state = window.__r5ScrollStory.snapshot();
      return state.view.status === 'ready' && Math.abs((state.presented?.progress ?? -1) - .2) < .002;
    }, undefined, { timeout: 25000 });
    const result = await page.evaluate(async (id) => {
      const api = window.__r5ScrollStory;
      const range = api.index().ranges.find((range) => range.id === id);
      const samples = [], longTasks = [];
      const observer = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')
        ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))) : null;
      observer?.observe({ type: 'longtask', buffered: false });
      const start = performance.now(), duration = 10000;
      let previous = start;
      await new Promise((resolve) => {
        const tick = (now) => {
          const progress = .2 + .6 * Math.min(1, (now - start) / duration);
          window.scrollTo(0, range.start + (range.end - range.start) * progress);
          const state = api.snapshot();
          samples.push({ time: now - start, interval: now - previous,
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
      observer?.disconnect();
      return { id, convergenceMs, final: api.snapshot(), samples, longTasks,
        resources: { videos: document.querySelectorAll('.story-scroll video').length, canvases: document.querySelectorAll('.story-scroll canvas').length } };
    }, segment);
    const percentile = (values) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] : null;
    result.metrics = {
      rafIntervalP95: percentile(result.samples.slice(2).map((sample) => sample.interval)),
      poseLagP95: percentile(result.samples.filter((sample) => sample.presented !== null).map((sample) => Math.max(0, sample.desired - sample.presented) * 10000 / .6)),
      documentPoseLagP95: percentile(result.samples.filter((sample) => sample.presented !== null).map((sample) => Math.max(0, sample.documentPose - sample.presented) * 10000 / .6)),
      sourceFrameErrorSecondsP95: percentile(result.samples.flatMap((sample) => sample.videos.filter((video) => video.sourceTime !== null).map((video) => Math.abs(video.target - video.sourceTime)))),
      allVideosPaused: result.samples.every((sample) => sample.videos.every((video) => video.paused)),
      over50msTasks: result.longTasks.filter(({ duration }) => duration > 50).length
    };
    result.passed = result.metrics.rafIntervalP95 <= 20 && result.metrics.poseLagP95 <= 100
      && result.convergenceMs <= 150 && result.metrics.over50msTasks === 0 && result.metrics.allVideosPaused
      && result.final.view.status === 'ready' && Math.abs((result.final.presented?.progress ?? -1) - .8) < .002;
    results.push(result);
    console.log(JSON.stringify({ segment, passed: result.passed, convergenceMs: result.convergenceMs, ...result.metrics, resources: result.resources }));
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
