import { describe, expect, it } from 'vitest';
import { isBrowserRootCommand, validateProcessMemoryQualification, validateReleaseMemoryEnvironment } from './r5-process-memory-contract.mjs';
import { SCROLL_MEMORY_BUDGETS, SCROLL_MEMORY_SCENES, summarizeScrollMemory } from './r5-scroll-memory.mjs';
import { createEgoCdnDrainer, evaluateEgoPage, localCdnRequestURL, summarizeEgoProcessTree, validateEgoFrozenManifest, validateEgoMemoryOptions } from './run-r5-process-memory-ego.mjs';

const executable = '/Applications/ego lite.app/Contents/MacOS/ego lite';
const environment = () => ({ platform: 'darwin', arch: 'arm64', osRelease: '24.6.0',
  browserChannel: 'ego-lite', runnerClass: 'local-macos-hardware', headless: false,
  browserExecutable: executable, processScope: 'entire-shared-browser-tree' });
const identity = { candidate: 'react-refactor-r5-parity-repair-candidate-v56', candidateTagObject: '1'.repeat(40),
  sourceCommit: '2'.repeat(40), artifactTreeSha256: '3'.repeat(64), draftManifestSha256: '4'.repeat(64) };
function run(id) {
  const point = (scene, direction) => ({ scene, direction, desired: { kind: 'hold' }, usedJsHeapBytes: 100,
    mountedLayers: 2, webglCanvases: 1, canvasPixelBytes: 1000, videos: [{ paused: true, seeking: false }] });
  const holds = SCROLL_MEMORY_SCENES.map((scene, index) => point(scene, index ? 'forward' : 'boot'));
  holds.push({ ...point('contact', 'forward-settled'), usedJsHeapBytes: 80 });
  holds.push(...[...SCROLL_MEMORY_SCENES].reverse().slice(1).map(scene => point(scene, 'reverse')));
  holds.push({ ...point('hero', 'reverse-settled'), usedJsHeapBytes: 80 });
  const poses = Array.from({ length: 90 }, () => ({ ...point('hero', 'forward'), desired: { kind: 'segment' }, webglCanvases: 2 }));
  const report = { schemaVersion: 3, kind: 'r5-process-memory-run', runId: id, identity, environment: environment(),
    browserPage: { isolateId: id }, interactionModel: 'continuous-scroll', sampleIntervalMs: 250, settling: { idleMs: 5000 }, measurement: { navigationIncluded: true },
    budgets: SCROLL_MEMORY_BUDGETS, holds, poses, heapSamples: [{ usedJsHeapBytes: 100 }],
    sampling: { valid: true, sampleCount: 1 }, pass: true, errors: [], failure: null,
    processSamples: [{ browserPid: 101, browserRootRssBytes: 100, totalRssBytes: 600, processCount: 3,
      gpuProcessCount: 1, gpuRssBytes: 200, rendererProcessCount: 1, rendererRssBytes: 300 }] };
  report.actual = summarizeScrollMemory(report).actual;
  return report;
}
function qualification() {
  return { schemaVersion: 3, kind: 'r5-process-memory-qualification', identity, environment: environment(),
    requiredRunCount: 2, completedRunCount: 2, pass: true, runs: [run('fresh-1'), run('fresh-2')] };
}

describe('explicit Ego qualification, not a renamed Chrome diagnostic', () => {
  it('recognizes only the actual Ego root, never a helper, Chrome or shell wrapper', () => {
    expect(isBrowserRootCommand(executable, 'darwin', 'ego-lite')).toBe(true);
    for (const command of [executable + ' --type=renderer', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/bin/sh -c ' + executable]) expect(isBrowserRootCommand(command, 'darwin', 'ego-lite')).toBe(false);
    expect(isBrowserRootCommand(executable, 'darwin')).toBe(false);
  });
  it('requires truthful executable, whole-tree scope and the local visible browser', () => {
    expect(validateReleaseMemoryEnvironment(environment()).valid).toBe(true);
    for (const change of [{ processScope: 'owned-renderer-only' }, { headless: true }, { browserExecutable: '/usr/bin/chrome' },
      { runnerClass: 'github-hosted-macos-14' }]) expect(validateReleaseMemoryEnvironment({ ...environment(), ...change }).valid).toBe(false);
  });
  it('accepts two complete raw runs under all the unchanged budgets', () => {
    expect(validateProcessMemoryQualification(qualification())).toEqual({ valid: true, reasons: [] });
  });
  it.each(['totalRssBytes', 'gpuRssBytes', 'rendererRssBytes'])('rejects forged pass flags over the original %s cap', field => {
    const report = qualification(); report.runs[0].processSamples[0][field] = 2_000_000_000;
    expect(validateProcessMemoryQualification(report).valid).toBe(false);
  });
  it('rejects changed budgets, reused isolates, partial traversal and borrowed identity', () => {
    for (const mutate of [report => report.runs[0].budgets = { ...SCROLL_MEMORY_BUDGETS, maxVideosAtContact: 5 },
      report => report.runs[1].browserPage.isolateId = report.runs[0].browserPage.isolateId,
      report => report.runs[0].poses.pop(), report => report.runs[0].identity = { ...identity, sourceCommit: 'other' }]) {
      const report = qualification(); mutate(report); expect(validateProcessMemoryQualification(report).valid).toBe(false);
    }
  });
  it('rejects leaked Contact decoders and unrecorded raw observations even with pass=true', () => {
    const report = qualification();
    report.runs[0].holds.find(hold => hold.scene === 'contact').videos = Array.from({ length: 5 }, () => ({ paused: true, seeking: false }));
    expect(validateProcessMemoryQualification(report).valid).toBe(false);
    delete report.runs[0].holds;
    expect(validateProcessMemoryQualification(report).valid).toBe(false);
  });
});

describe('Ego memory transport and sampling boundaries', () => {
  it('omits absent evaluate arguments and preserves actual JSON arguments', async () => {
    const calls = [];
    const page = { evaluate(...args) {
      if (args.length > 1 && args[1] === undefined) throw new TypeError('argument must be JSON-serializable');
      calls.push(args); return Promise.resolve(true);
    } };
    const callback = () => true;
    await expect(evaluateEgoPage(page, callback)).resolves.toBe(true);
    await expect(evaluateEgoPage(page, callback, undefined)).resolves.toBe(true);
    await expect(evaluateEgoPage(page, callback, null)).resolves.toBe(true);
    await expect(evaluateEgoPage(page, callback, { progress: 0 })).resolves.toBe(true);
    expect(calls.map(args => args.length)).toEqual([1, 1, 2, 2]);
    expect(calls[2][1]).toBeNull();
    expect(calls[3][1]).toEqual({ progress: 0 });
  });
  it('sums the complete actual browser tree, including unrelated renderers and descendants', () => {
    const rows = [
      { pid: 1, ppid: 0, rssBytes: 100, command: executable },
      { pid: 2, ppid: 1, rssBytes: 200, command: 'helper --type=renderer' },
      { pid: 3, ppid: 1, rssBytes: 300, command: 'helper --type=gpu-process' },
      { pid: 4, ppid: 2, rssBytes: 400, command: 'utility' },
      { pid: 5, ppid: 1, rssBytes: 500, command: 'other-tab --type=renderer' },
      { pid: 6, ppid: 0, rssBytes: 999, command: 'not-this-browser' }];
    expect(summarizeEgoProcessTree(rows)).toMatchObject({ totalRssBytes: 1500, rendererRssBytes: 700, gpuRssBytes: 300, processCount: 5 });
    expect(() => summarizeEgoProcessTree(rows.filter(row => row.pid !== 1))).toThrow('unique');
    expect(() => summarizeEgoProcessTree([...rows, { ...rows[0], pid: 99 }])).toThrow('unique');
  });
  it('only rewrites exact frozen CDN object URLs to the same source path', () => {
    const build = { cdn: { files: [{ url: 'https://media.tongye.me/releases/frozen/assets/frame.webm', sourcePath: 'assets/frame.webm' }] } };
    expect(localCdnRequestURL(build.cdn.files[0].url, build, 'http://127.0.0.1:4197/experience/')).toBe('http://127.0.0.1:4197/experience/assets/frame.webm');
    expect(() => localCdnRequestURL('https://media.tongye.me/releases/other/assets/frame.webm', build, 'http://127.0.0.1/')).toThrow('inventory');
  });
  it('requires an approved existing page and a fresh external evidence directory', () => {
    const valid = { taskSpaceId: 7, pageLabel: 'p1', baseURL: 'http://127.0.0.1:4197/experience/', outputDirectory: '/tmp/ego-memory-test' };
    expect(validateEgoMemoryOptions(valid)).toMatchObject(valid);
    for (const change of [{ taskSpaceId: 0 }, { pageLabel: 'new-page' }, { baseURL: 'https://example.com/?x=1' },
      { outputDirectory: pathFromRepo() }]) expect(() => validateEgoMemoryOptions({ ...valid, ...change })).toThrow();
  });
  it('refuses untagged, dirty and incomplete builds before browser actions', () => {
    const manifest = { schemaVersion: 3, sourceDirty: false, qualification: { status: 'pending-memory' }, ...identity };
    expect(() => validateEgoFrozenManifest(manifest)).not.toThrow();
    for (const change of [{ sourceDirty: true }, { candidate: null }, { candidateTagObject: 'short' },
      { qualification: { status: 'qualified' } }]) expect(() => validateEgoFrozenManifest({ ...manifest, ...change })).toThrow();
  });
});

function pathFromRepo() { return new URL('../../output', import.meta.url).pathname; }

describe('Ego CDN cancellation evidence, never message-only error suppression', () => {
  const url = 'https://media.tongye.me/releases/frozen/assets/frame.webm';
  const build = { cdn: { files: [{ url, sourcePath: 'assets/frame.webm' }] } };
  const paused = () => ({ method: 'Fetch.requestPaused', sessionId: 'own-session', params: {
    requestId: 'fetch-1', networkId: 'network-1', request: { url, headers: { Range: 'bytes=0-' } } } });
  const cancellation = () => ({ method: 'Network.loadingFailed', sessionId: 'own-session', params: {
    requestId: 'network-1', canceled: true, errorText: 'net::ERR_ABORTED' } });
  const base = 'http://127.0.0.1:4197/experience/';
  it('continues an active exact-inventory request without changing Range headers', async () => {
    const calls = [], observations = [];
    const page = { events: async () => [paused()], cdp: async (...args) => { calls.push(args); } };
    await createEgoCdnDrainer(page, build, base, () => {}, observations)();
    expect(calls).toEqual([['Fetch.continueRequest', { requestId: 'fetch-1', url: base + 'assets/frame.webm' }]]);
    expect(observations[0]).toMatchObject({ range: 'bytes=0-', status: 'continued' });
  });
  it('retires an already-proven cancelled request without dispatching its expired identifier', async () => {
    const observations = [];
    const page = { events: async () => [paused(), cancellation()], cdp: async () => { throw new Error('must not dispatch'); } };
    await createEgoCdnDrainer(page, build, base, () => {}, observations)();
    expect(observations[0]).toMatchObject({ status: 'cancelled-before-continue', cancellation: cancellation().params });
  });
  it('reads queued cancellation evidence after an invalid identifier and processes other new requests', async () => {
    const next = paused(); next.params.requestId = 'fetch-2'; next.params.networkId = 'network-2';
    const batches = [[paused()], [cancellation(), next]], calls = [], seen = [], observations = [];
    const page = { events: async () => batches.shift() ?? [], cdp: async (_method, args) => {
      calls.push(args.requestId); if (args.requestId === 'fetch-1') throw new Error('Invalid InterceptionId.');
    } };
    await createEgoCdnDrainer(page, build, base, events => seen.push(...events), observations)();
    expect(calls).toEqual(['fetch-1', 'fetch-2']);
    expect(seen).toHaveLength(3);
    expect(observations.map(item => item.status)).toEqual(['cancelled-before-continue', 'continued']);
  });
  it('fails an invalid identifier without positive same-session cancellation evidence', async () => {
    for (const change of [{}, { sessionId: 'other-session' }, { params: { ...cancellation().params, canceled: false } },
      { params: { ...cancellation().params, requestId: 'other-request' } }, { params: { ...cancellation().params, errorText: 'net::ERR_FAILED' } }]) {
      const evidence = Object.keys(change).length ? { ...cancellation(), ...change } : null;
      const batches = [[paused()], evidence ? [evidence] : []];
      const page = { events: async () => batches.shift() ?? [], cdp: async () => { throw new Error('Invalid InterceptionId.'); } };
      await expect(createEgoCdnDrainer(page, build, base, () => {})()).rejects.toThrow('Invalid InterceptionId.');
    }
  });
  it('does not suppress another protocol error or accept an out-of-inventory URL', async () => {
    const page = { events: async () => [paused()], cdp: async () => { throw new Error('session is not controlled'); } };
    await expect(createEgoCdnDrainer(page, build, base, () => {})()).rejects.toThrow('not controlled');
    await expect(createEgoCdnDrainer(page, { cdn: { files: [] } }, base, () => {})()).rejects.toThrow('inventory');
  });
  it('does not reuse cancellation evidence after a new request with the same network identifier', async () => {
    const renewed = { method: 'Network.requestWillBeSent', sessionId: 'own-session', params: { requestId: 'network-1' } };
    const batches = [[cancellation()], [renewed, paused()], []];
    const page = { events: async () => batches.shift() ?? [], cdp: async () => { throw new Error('Invalid InterceptionId.'); } };
    const drain = createEgoCdnDrainer(page, build, base, () => {});
    await drain(); await expect(drain()).rejects.toThrow('Invalid InterceptionId.');
  });
});
