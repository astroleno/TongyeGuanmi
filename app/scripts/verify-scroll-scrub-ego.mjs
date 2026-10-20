/* global taskSpace, window */
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { cpus, loadavg, release } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectScrollBrowserEvents } from './scroll-browser-events.mjs';
import { isScrollMemoryPoseReady, seekScrollMemoryPose } from './r5-scroll-memory.mjs';
import { measureScrollBaseline, measureScrollSegment } from './scroll-performance-probe.mjs';
import { percentile95, SCROLL_PERFORMANCE_SEGMENTS, summarizeScrollPerformance } from './scroll-performance-metrics.mjs';

const repoDir = fileURLToPath(new URL('../../', import.meta.url));

export function validateEgoScrollOptions(options) {
  if (!Number.isSafeInteger(options?.taskSpaceId) || options.taskSpaceId <= 0) {
    throw new Error('An existing, user-authorized agent TaskSpace ID is required');
  }
  const pageLabel = options.pageLabel ?? 'p1';
  if (typeof pageLabel !== 'string' || !/^p[1-9]\d*$/.test(pageLabel)) throw new Error('An existing managed Page label is required');
  if (!['desktop', 'phone'].includes(options.platform)) throw new Error('platform must be desktop or phone');
  const url = new URL(options.baseURL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('baseURL must be an HTTP(S) entry without credentials, query or fragment');
  }
  if (!path.isAbsolute(options.outputPath ?? '')) throw new Error('An absolute, new outputPath is required');
  const outputPath = path.resolve(options.outputPath);
  const relative = path.relative(repoDir, outputPath);
  if (relative === '' || !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) {
    throw new Error('Diagnostic evidence must stay outside the source repository');
  }
  return { taskSpaceId: options.taskSpaceId, pageLabel, platform: options.platform,
    baseURL: url.href.replace(/\/+$/, ''), outputPath };
}

export function summarizeEgoScrollResult(result, expectedViewport) {
  const summary = summarizeScrollPerformance(result);
  const samples = Array.isArray(result.samples) ? result.samples : [];
  const fixedViewport = ['width', 'height', 'dpr'].every(key => Number.isFinite(expectedViewport?.[key]) && expectedViewport[key] > 0)
    && samples.length > 0 && samples.every(sample => (
    Object.entries(expectedViewport).every(([key, value]) => sample.viewport?.[key] === value)
  ));
  const focusedSampling = samples.length > 0 && samples.every(sample => sample.viewport?.focused === true);
  const extraFailures = [!fixedViewport && 'fixedViewport', !focusedSampling && 'focusedSampling'].filter(Boolean);
  return { ...summary,
    checks: { ...summary.checks, fixedViewport, focusedSampling },
    failures: [...summary.failures, ...extraFailures],
    passed: summary.passed && extraFailures.length === 0,
    measuredPassed: summary.measuredPassed && extraFailures.length === 0 };
}

// Execute inside `ego-browser nodejs`; it supplies the documented taskSpace API.
// Never creates/claims a space, chooses a profile, installs a browser or finishes
// the caller's ongoing task. These diagnostics cannot grant release qualification.
export async function runEgoScrollVerification(input) {
  const options = validateEgoScrollOptions(input);
  const phone = options.platform === 'phone';
  const viewport = { width: phone ? 390 : 1440, height: phone ? 844 : 900, dpr: 1 };
  const report = {
    kind: 'ego-scroll-performance-diagnostics',
    timestamp: new Date().toISOString(),
    engine: 'chromium', browserProduct: 'ego-lite',
    source: 'synthetic native-document scroll; not physical device input',
    platform: phone ? 'phone-emulation' : 'desktop',
    baseURL: options.baseURL, taskSpaceId: options.taskSpaceId,
    requestedSegments: [...SCROLL_PERFORMANCE_SEGMENTS],
    measurementSha256: createHash('sha256').update(JSON.stringify([
      measureScrollBaseline, measureScrollSegment, summarizeScrollPerformance,
      summarizeEgoScrollResult, collectScrollBrowserEvents
    ].map(fn => fn.toString()))).digest('hex'),
    releaseQualified: false, memoryQualified: false,
    environment: {
      headless: false, sharedBrowser: true, focusEmulation: true, viewport,
      deadlinesMs: { navigation: 30000, ready: 30000, prepare: 25000 },
      input: 'synthetic scrollTo once per RAF',
      cache: 'each segment prepared at 20% before measurement',
      powerMode: 'unknown; no global system setting changed', physicalDisplayRefreshRate: 'unknown',
      host: { platform: process.platform, arch: process.arch, osRelease: release(),
        logicalCpus: cpus().length, loadAtStart: loadavg() }
    },
    identity: null, baseline: null, errors: [], externalBrowserErrors: [], results: [],
    passed: false, measuredPassed: false, failure: null
  };
  // Claim only the new report path; preserve earlier failed rounds. Use atomic
  // snapshots so an ENOSPC cannot truncate the last complete saved result.
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, JSON.stringify(report, null, 2), { flag: 'wx' });
  const save = async () => {
    const temporary = `${options.outputPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(report, null, 2), { flag: 'wx' });
    await rename(temporary, options.outputPath);
  };
  let eventState;
  let currentSegment = null;
  const identity = async () => {
    const response = await fetch(`${options.baseURL}/r5-release-manifest.json`);
    if (!response.ok) throw new Error('A production build manifest is required for performance evidence');
    const output = await response.text();
    const manifest = JSON.parse(output);
    if (manifest.schemaVersion !== 3 || !manifest.sourceCommit || !manifest.artifactTreeSha256) {
      throw new Error('The preview does not expose a valid production build identity');
    }
    return { sourceCommit: manifest.sourceCommit, sourceDirty: manifest.sourceDirty,
      artifactTreeSha256: manifest.artifactTreeSha256, qualification: manifest.qualification?.status,
      manifestSha256: createHash('sha256').update(output).digest('hex') };
  };
  try {
    report.identity = await identity();
    const task = await taskSpace(options.taskSpaceId);
    const page = task.page(options.pageLabel);
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: viewport.width,
      height: viewport.height, deviceScaleFactor: viewport.dpr, mobile: phone });
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: phone, maxTouchPoints: 1 });
    await page.cdp('Page.bringToFront');
    await page.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.cdp('Runtime.enable');
    await page.cdp('Log.enable');
    report.environment.userAgent = await page.evaluate(() => navigator.userAgent);
    try { report.environment.browserVersion = await task.cdp('Browser.getVersion'); }
    catch (error) { report.environment.browserVersion = null; report.environment.browserVersionUnavailable = String(error); }
    const collect = async () => {
      eventState = collectScrollBrowserEvents(eventState, await page.events());
      report.errors = eventState.errors;
      report.externalBrowserErrors = eventState.externalBrowserErrors;
    };
    await page.goto('about:blank', { timeout: 30000 });
    report.baseline = await page.evaluate(measureScrollBaseline);
    report.baseline.rafIntervalP95 = percentile95(report.baseline.intervals.slice(2));
    await collect();
    await save();
    await page.goto(`${options.baseURL}/#method`, { timeout: 30000 });
    await page.waitForFunction(() => window.__r5ScrollStory?.snapshot().view.status === 'ready',
      undefined, { timeout: 30000 });
    await page.waitForSelector('.story-loader', { state: 'hidden', timeout: 30000 });
    await collect();
    for (const segment of SCROLL_PERFORMANCE_SEGMENTS) {
      currentSegment = segment;
      if (JSON.stringify(await identity()) !== JSON.stringify(report.identity)) {
        throw new Error('Artifact identity changed during measurement');
      }
      const goal = await page.evaluate(seekScrollMemoryPose, { rangeId: segment, progress: .2 });
      await page.waitForFunction(isScrollMemoryPoseReady, goal, { timeout: 25000 });
      const result = await page.evaluate(measureScrollSegment, segment);
      Object.assign(result, summarizeEgoScrollResult(result, viewport));
      report.results.push(result);
      await collect();
      await save();
      console.log(JSON.stringify({ segment, passed: result.passed, failures: result.failures,
        unavailable: result.unavailable, convergenceMs: result.convergenceMs, ...result.metrics }));
    }
    // Include drift after the final sweep, not just between preceding segments.
    if (JSON.stringify(await identity()) !== JSON.stringify(report.identity)) {
      throw new Error('Artifact identity changed during the final measurement');
    }
    const complete = report.results.length === SCROLL_PERFORMANCE_SEGMENTS.length;
    report.passed = complete && !report.errors.length && report.results.every(result => result.passed);
    report.measuredPassed = complete && !report.errors.length && report.results.every(result => result.measuredPassed);
  } catch (error) {
    // Do not issue further browser calls after user-control or ownership errors.
    report.failure = { segment: currentSegment, message: String(error) };
    report.passed = false; report.measuredPassed = false;
  }
  report.loadAtEnd = loadavg();
  await save();
  return report;
}
