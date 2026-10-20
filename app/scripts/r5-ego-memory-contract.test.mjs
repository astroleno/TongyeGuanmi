import { describe, expect, it } from 'vitest';
import { isBrowserRootCommand, validateProcessMemoryQualification, validateReleaseMemoryEnvironment } from './r5-process-memory-contract.mjs';
import { SCROLL_MEMORY_BUDGETS, SCROLL_MEMORY_SCENES, summarizeScrollMemory } from './r5-scroll-memory.mjs';
import { localCdnRequestURL, summarizeEgoProcessTree, validateEgoFrozenManifest, validateEgoMemoryOptions } from './run-r5-process-memory-ego.mjs';

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
