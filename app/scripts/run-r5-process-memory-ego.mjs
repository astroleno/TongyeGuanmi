/* global taskSpace, window, document */
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, realpath, stat, mkdir, writeFile, rename, access } from 'node:fs/promises';
import { release } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { collectScrollBrowserEvents } from './scroll-browser-events.mjs';
import { createScrollMemoryTraversal, installScrollMemoryProbe, isScrollMemoryPoseReady,
  readScrollMemorySnapshot, SCROLL_MEMORY_BUDGETS, seekScrollMemoryPose, summarizeScrollMemory } from './r5-scroll-memory.mjs';
import { isBrowserRootCommand, R5_PROCESS_MEMORY_SCHEMA_VERSION, R5_PROCESS_MEMORY_RUN_KIND,
  R5_PROCESS_MEMORY_QUALIFICATION_KIND, R5_REQUIRED_MEMORY_RUNS, summarizeProcessSamples,
  validateProcessMemoryQualification, validateReleaseMemoryEnvironment } from './r5-process-memory-contract.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const dist = path.join(repo, 'dist');
const exec = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const identityFields = ['candidate', 'candidateTagObject', 'sourceCommit', 'artifactTreeSha256'];

// Ego rejects an explicitly supplied undefined argument before dispatch. Its
// no-argument overload must omit the second parameter, unlike Playwright.
export function evaluateEgoPage(page, fn, argument) {
  return argument === undefined ? page.evaluate(fn) : page.evaluate(fn, argument);
}

export function validateEgoMemoryOptions(options) {
  if (!Number.isSafeInteger(options?.taskSpaceId) || options.taskSpaceId <= 0 || !/^p[1-9]\d*$/.test(options.pageLabel ?? '')) {
    throw new Error('An existing, authorized TaskSpace and owned blank Page are required');
  }
  const base = new URL(options.baseURL);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash
    || !base.pathname.endsWith('/')) throw new Error('baseURL must be an HTTP(S) mounted entry ending in /');
  if (!path.isAbsolute(options.outputDirectory ?? '')) throw new Error('A new absolute evidence directory is required');
  const outputDirectory = path.resolve(options.outputDirectory);
  const relative = path.relative(repo, outputDirectory);
  if (!relative || !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) {
    throw new Error('Evidence must stay outside the source repository');
  }
  return { taskSpaceId: options.taskSpaceId, pageLabel: options.pageLabel, baseURL: base.href, outputDirectory };
}

export function summarizeEgoProcessTree(rows) {
  const roots = rows.filter(row => isBrowserRootCommand(row.command, 'darwin', 'ego-lite'));
  if (roots.length !== 1) throw new Error('A unique, actual Ego browser root is required');
  const root = roots[0], ids = new Set([root.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (ids.has(row.ppid) && !ids.has(row.pid)) { ids.add(row.pid); changed = true; }
  }
  const tree = rows.filter(row => ids.has(row.pid));
  const gpu = tree.filter(row => row.command.includes('--type=gpu-process'));
  const renderers = tree.filter(row => row.command.includes('--type=renderer'));
  const sum = list => list.reduce((n, row) => n + row.rssBytes, 0);
  return { browserExecutable: root.command.match(/^(.*?\/ego lite\.app\/Contents\/MacOS\/ego lite)(?:\s|$)/)[1],
    browserPid: root.pid, browserRootRssBytes: root.rssBytes, totalRssBytes: sum(tree),
    gpuRssBytes: sum(gpu), rendererRssBytes: sum(renderers), gpuProcessCount: gpu.length,
    rendererProcessCount: renderers.length, processCount: tree.length };
}

async function processMemory() {
  const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,ppid=,rss=,command=']);
  const rows = stdout.trim().split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    return match ? [{ pid: +match[1], ppid: +match[2], rssBytes: +match[3] * 1024, command: match[4] }] : [];
  });
  return summarizeEgoProcessTree(rows);
}

export function localCdnRequestURL(requestURL, build, baseURL) {
  const file = build.cdn.files.find(entry => entry.url === requestURL);
  if (!file) throw new Error('CDN request is not in the frozen artifact inventory: ' + requestURL);
  return new URL(file.sourcePath, baseURL).href;
}

export function validateEgoFrozenManifest(manifest) {
  if (manifest.schemaVersion !== 3 || manifest.sourceDirty !== false || manifest.qualification?.status !== 'pending-memory'
    || !/^[0-9a-f]{40}$/.test(manifest.sourceCommit ?? '') || !/^[0-9a-f]{40}$/.test(manifest.candidateTagObject ?? '')
    || !/^[0-9a-f]{64}$/.test(manifest.artifactTreeSha256 ?? '')
    || !/^react-refactor-r5-(?:parity-repair-)?candidate(?:-v[1-9][0-9]*)?$/.test(manifest.candidate ?? '')) {
    throw new Error('Formal Ego memory qualification requires a clean, tagged pending-memory build');
  }
}

async function frozenBuild(baseURL) {
  const text = await readFile(path.join(dist, 'r5-release-manifest.json'), 'utf8');
  const manifest = JSON.parse(text);
  validateEgoFrozenManifest(manifest);
  const git = async (...args) => (await exec('git', args, { cwd: repo })).stdout.trim();
  if (await git('status', '--porcelain', '--untracked-files=all') || await git('rev-parse', 'HEAD^{commit}') !== manifest.sourceCommit
    || await git('cat-file', '-t', `refs/tags/${manifest.candidate}`) !== 'tag'
    || await git('rev-parse', `refs/tags/${manifest.candidate}`) !== manifest.candidateTagObject
    || await git('rev-parse', `refs/tags/${manifest.candidate}^{commit}`) !== manifest.sourceCommit) {
    throw new Error('Frozen candidate tag, commit or source cleanliness changed');
  }
  if (new URL(baseURL).pathname !== (manifest.basePath ?? '/')) throw new Error('Preview mount differs from the compiled identity');
  const response = await fetch(new URL('r5-release-manifest.json', baseURL));
  if (!response.ok || await response.text() !== text) throw new Error('Served manifest differs from the frozen build');
  if (sha(JSON.stringify(manifest.files)) !== manifest.artifactTreeSha256) throw new Error('Artifact tree declaration changed');
  const root = await realpath(dist);
  for (const item of manifest.files) {
    const filename = path.resolve(dist, item.path);
    if (!filename.startsWith(dist + path.sep)) throw new Error('Unsafe artifact path');
    const resolved = await realpath(filename);
    if (!resolved.startsWith(root + path.sep) || !(await stat(filename)).isFile()) throw new Error('Artifact leaves the dist directory');
    const bytes = await readFile(filename);
    if (bytes.length !== item.bytes || sha(bytes) !== item.sha256) throw new Error('Frozen bytes changed: ' + item.path);
  }
  const cdn = JSON.parse(await readFile(path.join(dist, 'cdn-publish-manifest.json'), 'utf8'));
  if (cdn.schemaVersion !== 1 || cdn.enabled !== true || !cdn.releaseId || cdn.sourceCommit !== manifest.sourceCommit) {
    throw new Error('Formal memory qualification requires the frozen CDN-enabled build');
  }
  for (const file of cdn.files) {
    const artifact = manifest.files.find(item => item.path === file.sourcePath);
    if (!artifact || artifact.sha256 !== file.sha256 || artifact.bytes !== file.bytes
      || file.objectKey !== `releases/${cdn.releaseId}/${file.sourcePath}`
      || file.url !== `${cdn.origins[file.channel]}/${file.objectKey}`) throw new Error('CDN inventory differs from frozen artifact');
  }
  return { manifest, cdn, identity: { ...Object.fromEntries(identityFields.map(field => [field, manifest[field]])), draftManifestSha256: sha(text) } };
}

async function save(file, value, initial = false) {
  if (initial) return writeFile(file, JSON.stringify(value, null, 2), { flag: 'wx' });
  const temporary = file + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
  await rename(temporary, file);
}

async function collectRun(task, page, options, build, environment, expectedRoot, file) {
  const run = { schemaVersion: R5_PROCESS_MEMORY_SCHEMA_VERSION, kind: R5_PROCESS_MEMORY_RUN_KIND,
    runId: randomUUID(), startedAt: new Date().toISOString(), identity: build.identity, environment,
    sampleIntervalMs: 250, settling: { idleMs: 5000, heapMeasurement: 'devtools-heap-profiler-collect-garbage' },
    interactionModel: 'continuous-scroll', taskSpaceId: task.spaceId, budgets: SCROLL_MEMORY_BUDGETS,
    measurement: { process: 'ps RSS of the entire shared Ego browser tree, including unrelated pages', navigationIncluded: true,
      cdnTransport: 'owned-page CDP rewrite to byte-verified local preview; original URL and Range headers retained; not public CDN/network qualification',
      viewport: { width: 1440, height: 900, dpr: 1 }, focusEmulation: true },
    holds: [], poses: [], processSamples: [], heapSamples: [], errors: [], externalBrowserErrors: [],
    browserPage: { label: page.label, isolateId: null }, failure: null, pass: false };
  await save(file, run, true);
  let eventState, sampling = false, samplingPromise, samplingError, label = 'entry', loaded = false, heapEnabled = false;
  const drain = async () => {
    const events = await page.events();
    if (events.some(event => event.method === 'Page.loadEventFired')) loaded = true;
    eventState = collectScrollBrowserEvents(eventState, events);
    for (const event of events) if (event.method === 'Fetch.requestPaused') {
      await page.cdp('Fetch.continueRequest', { requestId: event.params.requestId,
        url: localCdnRequestURL(event.params.request.url, build, options.baseURL) });
    }
    run.errors = eventState.errors;
    run.externalBrowserErrors = eventState.externalBrowserErrors;
  };
  const wait = async (fn, argument, timeout) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await drain();
      if (await evaluateEgoPage(page, fn, argument)) return;
      await sleep(50);
    }
    throw new Error(`Readiness deadline at ${label}`);
  };
  const snapshot = async () => {
    const state = await page.evaluate(readScrollMemorySnapshot);
    const heap = await page.cdp('Runtime.getHeapUsage');
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight,
      dpr: window.devicePixelRatio, focused: document.hasFocus(), visible: !document.hidden }));
    if (viewport.width !== 1440 || viewport.height !== 900 || viewport.dpr !== 1 || !viewport.focused || !viewport.visible) {
      throw new Error('Viewport, foreground or focus drift');
    }
    return { ...state, usedJsHeapBytes: heap.usedSize, viewport };
  };
  const visit = async point => {
    label = `${point.direction}:${point.rangeId}:${point.progress}`;
    const goal = await page.evaluate(seekScrollMemoryPose, point);
    await wait(isScrollMemoryPoseReady, goal, 30000);
    (point.checkpoint === 'hold' ? run.holds : run.poses).push({ ...goal, ...await snapshot() });
    if ((run.holds.length + run.poses.length) % 12 === 0) await save(file, run);
  };
  const settled = async (point, direction) => {
    label = 'settled:' + direction;
    const end = Date.now() + 5000;
    while (Date.now() < end) { await drain(); await sleep(Math.min(50, Math.max(0, end - Date.now()))); }
    await page.cdp('HeapProfiler.collectGarbage');
    run.holds.push({ ...point, direction: direction + '-settled', ...await snapshot() });
  };
  try {
    // Include navigation and cold preparation in peak RSS/heap sampling, as the
    // original collector does; do not start only after the app is already ready.
    sampling = true;
    samplingPromise = (async () => {
      while (sampling) {
        const sample = await processMemory();
        if (sample.browserPid !== expectedRoot) throw new Error('Actual Ego browser root changed');
        run.processSamples.push({ label, recordedAt: new Date().toISOString(), ...sample });
        if (!sampling) break;
        if (heapEnabled) {
          const heap = await page.cdp('Runtime.getHeapUsage');
          run.heapSamples.push({ label, usedJsHeapBytes: heap.usedSize });
        }
        await sleep(250);
      }
    })().catch(error => { samplingError = String(error); sampling = false; });
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
    await page.cdp('Page.bringToFront'); await page.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.cdp('Runtime.enable'); heapEnabled = true; await page.cdp('Log.enable');
    await page.cdp('Page.enable');
    run.userAgent = await page.evaluate(() => window.navigator.userAgent);
    const init = await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(${installScrollMemoryProbe.toString()})();` });
    await page.cdp('Fetch.enable', { patterns: Object.values(build.cdn.origins).map(origin => ({
      urlPattern: `${origin}/releases/${build.cdn.releaseId}/*`, requestStage: 'Request' })) });
    await drain(); loaded = false;
    const navigation = await page.cdp('Page.navigate', { url: options.baseURL });
    if (navigation.errorText) throw new Error(navigation.errorText);
    const navigationDeadline = Date.now() + 30000;
    while (!loaded && Date.now() < navigationDeadline) { await drain(); if (!loaded) await sleep(50); }
    if (!loaded) throw new Error('Navigation load deadline');
    await wait(() => {
      const loader = document.querySelector('.story-loader');
      const hidden = !loader || !loader.getClientRects().length || ['none', 'hidden'].includes(window.getComputedStyle(loader).display)
        || window.getComputedStyle(loader).visibility === 'hidden';
      return window.__r5ScrollStory?.snapshot().view.status === 'ready' && hidden;
    }, undefined, 30000);
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier });
    run.browserPage.isolateId = (await page.cdp('Runtime.getIsolateId')).id;
    const traversal = createScrollMemoryTraversal(await page.evaluate(() => window.__r5ScrollStory.index().ranges));
    for (const point of traversal.forward) await visit(point);
    await settled(traversal.forward.at(-1), 'forward');
    for (const point of traversal.reverse) await visit(point);
    await settled(traversal.reverse.at(-1), 'reverse');
    await drain();
    sampling = false; await samplingPromise;
    if (samplingError) throw new Error(samplingError);
    if (!same((await frozenBuild(options.baseURL)).identity, build.identity)) throw new Error('Frozen identity changed');
    await page.cdp('Fetch.disable');
    await page.close();
  } catch (error) {
    run.failure = { checkpoint: label, message: String(error) };
    // Stop browser calls on a failed/control-lost Page. Do not create a new Page
    // as recovery; the caller must inspect/resume the existing space explicitly.
  } finally { sampling = false; await samplingPromise; }
  run.sampling = summarizeProcessSamples(run.processSamples);
  const memory = summarizeScrollMemory(run);
  run.actual = memory.actual;
  run.reasons = [...run.sampling.reasons, ...memory.reasons, ...(samplingError ? [samplingError] : [])];
  run.pass = !run.failure && !run.errors.length && run.sampling.valid && memory.pass && !samplingError;
  run.completedAt = new Date().toISOString();
  await save(file, run);
  return run;
}

// Execute only through ego-browser nodejs. This function never creates/claims a
// TaskSpace, launches/installs a browser, chooses profiles or touches other tabs.
export async function runEgoMemoryQualification(input) {
  const options = validateEgoMemoryOptions(input);
  const output = path.join(dist, 'r5-process-memory.json');
  try { await access(output); throw new Error('A previous frozen memory report already exists; refusing to overwrite it'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const build = await frozenBuild(options.baseURL), root = await processMemory();
  const environment = { platform: process.platform, arch: process.arch, osRelease: release(),
    browserChannel: 'ego-lite', headless: false, runnerClass: 'local-macos-hardware',
    browserExecutable: root.browserExecutable, processScope: 'entire-shared-browser-tree' };
  const validated = validateReleaseMemoryEnvironment(environment);
  if (!validated.valid) throw new Error(validated.reasons.join('; '));
  const task = await taskSpace(options.taskSpaceId), parked = task.page(options.pageLabel);
  // This Ego build exposes openedBy on TaskSpace.tabs(), not on Page handles.
  // Inspect ownership only inside the authorized space; never infer it from a
  // truthy Page handle or close an unknown/user-created tab.
  const owned = (await task.tabs()).find(tab => tab.label === options.pageLabel);
  if (task.ownership !== 'agent' || owned?.openedBy !== 'agent' || await parked.url() !== 'about:blank') {
    throw new Error('Only an agent-owned, parked Page may be replaced by the fresh runs');
  }
  await mkdir(options.outputDirectory);
  await parked.close();
  const runs = [];
  for (let index = 0; index < R5_REQUIRED_MEMORY_RUNS; index++) {
    if (!same((await frozenBuild(options.baseURL)).identity, build.identity)) throw new Error('Frozen candidate changed between runs');
    const page = await task.newPage();
    const run = await collectRun(task, page, options, build, environment, root.browserPid,
      path.join(options.outputDirectory, `run-${index + 1}.json`));
    runs.push(run);
    console.log(JSON.stringify({ run: index + 1, page: run.browserPage, pass: run.pass, actual: run.actual, reasons: run.reasons, failure: run.failure }));
    if (run.failure) break;
  }
  const report = { schemaVersion: R5_PROCESS_MEMORY_SCHEMA_VERSION, kind: R5_PROCESS_MEMORY_QUALIFICATION_KIND,
    generatedAt: new Date().toISOString(), identity: build.identity, environment, requiredRunCount: R5_REQUIRED_MEMORY_RUNS,
    completedRunCount: runs.length, budgets: SCROLL_MEMORY_BUDGETS, runs,
    actual: Object.fromEntries([...new Set(runs.flatMap(run => Object.keys(run.actual)))].map(field => [field, Math.max(...runs.map(run => run.actual[field]))])),
    pass: runs.length === R5_REQUIRED_MEMORY_RUNS && runs.every(run => run.pass), releaseQualified: false };
  report.validation = validateProcessMemoryQualification(report);
  await save(path.join(options.outputDirectory, 'qualification.json'), report, true);
  if (runs.length === R5_REQUIRED_MEMORY_RUNS) await save(output, report, true);
  return report;
}
