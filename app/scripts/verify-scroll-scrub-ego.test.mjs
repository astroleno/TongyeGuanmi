import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCROLL_PERFORMANCE_SEGMENTS } from './scroll-performance-metrics.mjs';
import { runEgoScrollVerification, summarizeEgoScrollResult, validateEgoScrollOptions } from './verify-scroll-scrub-ego.mjs';

const storageFailure = vi.hoisted(() => ({ temporaryWrite: false }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, writeFile: (...args) => {
    if (storageFailure.temporaryWrite && args[0].endsWith('.tmp')) {
      throw Object.assign(new Error('ENOSPC: simulated diagnostic snapshot failure'), { code: 'ENOSPC' });
    }
    return actual.writeFile(...args);
  } };
});

const directories = [];
const viewport = { width: 1440, height: 900, dpr: 1 };
const options = { taskSpaceId: 12, platform: 'desktop', baseURL: 'http://127.0.0.1:4197/experience/', outputPath: path.join(tmpdir(), 'ego-options-only.json') };
function healthy(id = 'hero-pattern') {
  const samples = Array.from({ length: 601 }, (_, i) => ({ time: i * 10000 / 600, interval: i ? 10000 / 600 : 0,
    desired: .2 + .6 * i / 600, documentPose: .2 + .6 * i / 600, presented: .2 + .6 * i / 600,
    rangeId: id, epoch: 1, presentedEpoch: 1, visible: true, videos: [],
    viewport: { ...viewport, focused: true } }));
  return { id, samples, longTasks: [], longTasksSupported: true, convergenceMs: 20,
    final: { desired: { rangeId: id, progress: .8 }, presented: { progress: .8, epoch: 1 }, intent: { epoch: 1 },
      pending: false, view: { status: 'ready', error: null } } };
}
async function setup({ drift = false, driftAt = drift ? 3 : null, stop = false, slowRaf = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tongye-ego-driver-test-'));
  directories.push(directory);
  let requests = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    requests++;
    return new Response(JSON.stringify({ schemaVersion: 3, sourceCommit: 'frozen-source', sourceDirty: false,
      artifactTreeSha256: requests === driftAt ? 'changed-tree' : 'frozen-tree', qualification: { status: 'pending-memory' } }));
  }));
  const calls = [];
  const page = {
    cdp: vi.fn(async method => { calls.push(method); }),
    goto: vi.fn(async () => { if (stop) throw Error('EGO_USER_CONTROL'); }),
    waitForFunction: vi.fn(async () => {}), waitForSelector: vi.fn(async () => {}),
    events: vi.fn(async () => []),
    evaluate: vi.fn(async (fn, arg) => {
      if (fn.name === 'measureScrollBaseline') return { intervals: [0, 16.7, 16.7], visible: true, longTasksSupported: true };
      if (fn.name === 'measureActiveScrollBaseline') return { intervals: [0, 50, 50], visible: true };
      if (fn.name === 'measureScrollSegment') {
        const result = healthy(arg);
        if (slowRaf) for (const sample of result.samples.slice(1)) sample.interval = 50;
        return result;
      }
      if (fn.name === 'seekScrollMemoryPose') return arg;
      return 'Ego test UA';
    })
  };
  const task = { page: vi.fn(() => page), cdp: vi.fn(async () => { throw Error('Browser.getVersion unavailable'); }) };
  vi.stubGlobal('taskSpace', vi.fn(async () => task));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  return { page, task, calls, input: { ...options, outputPath: path.join(directory, 'report.json') } };
}

afterEach(async () => {
  storageFailure.temporaryWrite = false;
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('Ego verification boundaries', () => {
  it('records a slow active blank control without excusing slow application frames', async () => {
    const { input } = await setup({ slowRaf: true });
    const report = await runEgoScrollVerification(input);
    expect(report.activeBlankBaseline.rafIntervalP95).toBe(50);
    expect(report.results).toHaveLength(8);
    expect(report.results.every(result => result.failures.includes('rafInterval'))).toBe(true);
    expect(report.passed).toBe(false);
  });
  it('requires an explicit existing space, managed page, platform and new external report path', () => {
    expect(validateEgoScrollOptions(options)).toMatchObject({ baseURL: 'http://127.0.0.1:4197/experience', pageLabel: 'p1' });
    for (const invalid of [{ taskSpaceId: 0 }, { taskSpaceId: '12' }, { pageLabel: 'userPage' }, { pageLabel: ['p1'] }, { platform: 'webkit' },
      { outputPath: 'relative.json' }, { outputPath: fileURLToPath(new URL('../evidence.json', import.meta.url)) },
      { baseURL: 'file:///tmp/page.html' }, { baseURL: 'https://user:secret@example.com/' }, { baseURL: 'https://example.com/#contact' }]) {
      expect(() => validateEgoScrollOptions({ ...options, ...invalid })).toThrow();
    }
  });
  it('adds viewport and focus checks without changing the original numeric gates', () => {
    expect(summarizeEgoScrollResult(healthy(), viewport).passed).toBe(true);
    for (const [field, value] of [['width', 1470], ['height', 733], ['dpr', 2], ['focused', false]]) {
      const result = healthy(); result.samples[50].viewport[field] = value;
      expect(summarizeEgoScrollResult(result, viewport).passed).toBe(false);
    }
    expect(summarizeEgoScrollResult(healthy(), {}).passed).toBe(false);
    expect(summarizeEgoScrollResult({ ...healthy(), samples: [] }, viewport).passed).toBe(false);
    expect(summarizeEgoScrollResult({ ...healthy(), convergenceMs: 151 }, viewport).failures).toContain('convergence');
    expect(summarizeEgoScrollResult({ ...healthy(), longTasksSupported: false }, viewport)).toMatchObject({ passed: false, unavailable: ['longTasks'] });
  });
  it('runs all eight original segments, records unsupported metadata and never grants release or memory qualification', async () => {
    const { input, calls, page } = await setup();
    const report = await runEgoScrollVerification(input);
    expect(report.passed).toBe(true);
    expect(report.results.map(result => result.id)).toEqual(SCROLL_PERFORMANCE_SEGMENTS);
    expect(report).toMatchObject({ engine: 'chromium', browserProduct: 'ego-lite', releaseQualified: false, memoryQualified: false,
      environment: { headless: false, focusEmulation: true, sharedBrowser: true, browserVersion: null } });
    expect(calls).toContain('Emulation.setFocusEmulationEnabled');
    expect(page.goto).toHaveBeenCalledWith('about:blank', { timeout: 30000 });
    expect(page.goto).toHaveBeenCalledWith('http://127.0.0.1:4197/experience/#method', { timeout: 30000 });
    expect(JSON.parse(await readFile(input.outputPath, 'utf8')).results).toHaveLength(8);
  });
  it('refuses to overwrite a previous report before touching the browser', async () => {
    const { input, task } = await setup();
    await writeFile(input.outputPath, 'original evidence');
    await expect(runEgoScrollVerification(input)).rejects.toThrow();
    expect(task.page).not.toHaveBeenCalled();
    expect(await readFile(input.outputPath, 'utf8')).toBe('original evidence');
  });
  it('fails closed when the frozen served manifest changes during a round', async () => {
    const { input } = await setup({ drift: true });
    const report = await runEgoScrollVerification(input);
    expect(report).toMatchObject({ passed: false, failure: { segment: SCROLL_PERFORMANCE_SEGMENTS[1] } });
    expect(report.failure.message).toContain('identity changed');
    expect(report.results).toHaveLength(1);
  });
  it('also detects identity drift after the last complete sweep', async () => {
    const { input } = await setup({ driftAt: 10 });
    const report = await runEgoScrollVerification(input);
    expect(report.results).toHaveLength(8);
    expect(report.passed).toBe(false);
    expect(report.failure.message).toContain('final measurement');
  });
  it('preserves the last complete report when an atomic snapshot runs out of space', async () => {
    const { input, page } = await setup();
    storageFailure.temporaryWrite = true;
    await expect(runEgoScrollVerification(input)).rejects.toThrow('ENOSPC');
    const previous = JSON.parse(await readFile(input.outputPath, 'utf8'));
    expect(previous).toMatchObject({ passed: false, baseline: null, results: [] });
    expect(page.goto).toHaveBeenCalledOnce();
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });
  it('stops browser operations immediately after a user-control error', async () => {
    const { input, page } = await setup({ stop: true });
    const report = await runEgoScrollVerification(input);
    expect(report).toMatchObject({ passed: false, failure: { message: 'Error: EGO_USER_CONTROL' } });
    expect(page.goto).toHaveBeenCalledOnce();
    expect(page.waitForFunction).not.toHaveBeenCalled();
    expect(page.events).not.toHaveBeenCalled();
    expect(page.evaluate).toHaveBeenCalledOnce();
  });
});
