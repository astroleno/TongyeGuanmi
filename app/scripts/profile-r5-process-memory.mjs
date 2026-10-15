/* global window */
import { chromium } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { release as osRelease } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  isBrowserRootCommand,
  R5_PROCESS_MEMORY_RUN_KIND,
  R5_PROCESS_MEMORY_SCHEMA_VERSION,
  summarizeProcessSamples
} from './r5-process-memory-contract.mjs';
import {
  createScrollMemoryTraversal,
  installScrollMemoryProbe,
  isScrollMemoryPoseReady,
  readScrollMemorySnapshot,
  SCROLL_MEMORY_BUDGETS,
  seekScrollMemoryPose,
  summarizeScrollMemory
} from './r5-scroll-memory.mjs';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const outputPath = process.env.R5_MEMORY_OUTPUT_PATH
  ? path.resolve(repoDir, process.env.R5_MEMORY_OUTPUT_PATH)
  : path.join(
      repoDir,
      'output/performance/r5-scroll-memory.json'
    );
const archivePath = process.env.R5_MEMORY_ARCHIVE_PATH
  ? path.resolve(repoDir, process.env.R5_MEMORY_ARCHIVE_PATH)
  : null;
const releaseManifestPath = process.env.R5_RELEASE_MANIFEST_PATH
  ? path.resolve(repoDir, process.env.R5_RELEASE_MANIFEST_PATH)
  : path.join(repoDir, 'dist/r5-release-manifest.json');
const baseUrl = process.env.R5_BASE_URL ?? 'http://127.0.0.1:4173';
const headless = process.env.R5_MEMORY_HEADLESS !== '0';
const proxyServer = process.env.R5_MEMORY_PROXY_SERVER?.trim() || null;
const runId = randomUUID();
const startedAt = new Date().toISOString();
const environment = {
  platform: process.platform,
  arch: process.arch,
  osRelease: osRelease(),
  browserChannel: 'chrome',
  headless,
  runnerClass: process.env.R5_MEMORY_RUNNER_CLASS?.trim() || null,
  proxyServer
};
const budgets = SCROLL_MEMORY_BUDGETS;
const settling = {
  idleMs: 5_000,
  heapMeasurement: 'devtools-heap-profiler-collect-garbage'
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function memoryIdentity() {
  let draftOutput;
  try {
    draftOutput = await readFile(releaseManifestPath, 'utf8');
  } catch (error) {
    if (process.env.R5_REQUIRE_MEMORY_IDENTITY === '1') {
      throw new Error(`release manifest is required at ${releaseManifestPath}`, { cause: error });
    }
    return null;
  }
  const draft = JSON.parse(draftOutput);
  if (
    draft.schemaVersion !== 3
    || draft.qualification?.status !== 'pending-memory'
  ) {
    throw new Error('process memory profiling requires a schema 3 pending-memory manifest');
  }
  if (
    process.env.R5_REQUIRE_MEMORY_IDENTITY === '1'
    && (!draft.candidate || !draft.candidateTagObject || !draft.sourceCommit)
  ) {
    throw new Error('process memory profiling requires an immutable candidate identity');
  }
  return {
    candidate: draft.candidate,
    candidateTagObject: draft.candidateTagObject,
    sourceCommit: draft.sourceCommit,
    artifactTreeSha256: draft.artifactTreeSha256,
    draftManifestSha256: sha256(draftOutput)
  };
}

const identity = await memoryIdentity();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processRows() {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,command=']);
  return stdout.trim().split('\n').flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    return match
      ? [{
          pid: Number(match[1]),
          ppid: Number(match[2]),
          rssBytes: Number(match[3]) * 1024,
          command: match[4]
        }]
      : [];
  });
}

function descendants(rows, rootPid) {
  const ids = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (ids.has(row.ppid) && !ids.has(row.pid)) {
        ids.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => row.pid !== rootPid && ids.has(row.pid));
}

async function readBrowserMemory() {
  const rows = await processRows();
  const owned = descendants(rows, process.pid);
  const browserRoot = owned.find((row) => isBrowserRootCommand(row.command));
  if (!browserRoot) {
    return undefined;
  }
  const browserRows = [
    browserRoot,
    ...descendants(rows, browserRoot.pid)
  ];
  const matchingRows = (matching) => browserRows.filter(matching);
  const sum = (matching) => matchingRows(matching)
    .reduce((total, row) => total + row.rssBytes, 0);
  const gpuRows = matchingRows((row) => row.command.includes('--type=gpu-process'));
  const rendererRows = matchingRows((row) => row.command.includes('--type=renderer'));
  return {
    browserPid: browserRoot.pid,
    browserRootRssBytes: browserRoot.rssBytes,
    totalRssBytes: sum(() => true),
    gpuRssBytes: gpuRows.reduce((total, row) => total + row.rssBytes, 0),
    rendererRssBytes: rendererRows.reduce((total, row) => total + row.rssBytes, 0),
    gpuProcessCount: gpuRows.length,
    rendererProcessCount: rendererRows.length,
    processCount: browserRows.length
  };
}

async function storySnapshot(page, devtools) {
  const snapshot = await page.evaluate(readScrollMemorySnapshot);
  const { usedSize } = await devtools.send('Runtime.getHeapUsage');
  return { ...snapshot, usedJsHeapBytes: usedSize };
}

async function settledStorySnapshot(page, devtools) {
  await sleep(settling.idleMs);
  await devtools.send('HeapProfiler.collectGarbage');
  return storySnapshot(page, devtools);
}

async function visitCheckpoint(page, devtools, point) {
  const goal = await page.evaluate(seekScrollMemoryPose, point);
  try {
    await page.waitForFunction(isScrollMemoryPoseReady, goal, { timeout: 30_000 });
  } catch (error) {
    const snapshot = await storySnapshot(page, devtools);
    throw new Error(`memory checkpoint ${JSON.stringify(point)} failed: ${JSON.stringify(snapshot)}`, { cause: error });
  }
  return { ...goal, ...(await storySnapshot(page, devtools)) };
}

await mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless,
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost' } } : {}),
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ]
});
const samples = [];
const heapSamples = [];
let devtools;
let sampling = true;
let sampleLabel = 'launch';
const sampleMemory = async () => {
  while (sampling) {
    const sample = await readBrowserMemory();
    if (sample) samples.push({ label: sampleLabel, ...sample });
    if (devtools) {
      const { usedSize } = await devtools.send('Runtime.getHeapUsage');
      heapSamples.push({ label: sampleLabel, usedJsHeapBytes: usedSize });
    }
    await sleep(250);
  }
};
let samplingError;
const samplingPromise = sampleMemory().catch((error) => {
  samplingError = error;
  sampling = false;
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(installScrollMemoryProbe);
  devtools = await page.context().newCDPSession(page);
  if (identity) {
    const served = await page.request.get(new URL('r5-release-manifest.json', `${baseUrl.replace(/\/$/, '')}/`).href);
    if (!served.ok() || sha256(await served.text()) !== identity.draftManifestSha256) {
      throw new Error('served preview manifest does not match the memory evidence identity');
    }
  }
  await page.bringToFront();
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__r5ScrollStory?.snapshot().view.status === 'ready',
    undefined, { timeout: 30_000 });
  const ranges = await page.evaluate(() => window.__r5ScrollStory.index().ranges);
  const traversal = createScrollMemoryTraversal(ranges);
  const holds = [];
  const poses = [];
  for (const point of traversal.forward) {
    sampleLabel = `${point.checkpoint}:${point.direction}:${point.rangeId}:${point.progress}`;
    process.stdout.write(`${sampleLabel}\n`);
    const snapshot = await visitCheckpoint(page, devtools, point);
    (point.checkpoint === 'hold' ? holds : poses).push(snapshot);
  }
  sampleLabel = 'settled:forward:contact';
  holds.push({ ...traversal.forward.at(-1), direction: 'forward-settled',
    ...(await settledStorySnapshot(page, devtools)) });

  for (const point of traversal.reverse) {
    sampleLabel = `${point.checkpoint}:${point.direction}:${point.rangeId}:${point.progress}`;
    process.stdout.write(`${sampleLabel}\n`);
    const snapshot = await visitCheckpoint(page, devtools, point);
    (point.checkpoint === 'hold' ? holds : poses).push(snapshot);
  }
  sampleLabel = 'settled:reverse:hero';
  holds.push({ ...traversal.reverse.at(-1), direction: 'reverse-settled',
    ...(await settledStorySnapshot(page, devtools)) });

  sampling = false;
  await samplingPromise;
  if (samplingError) throw new Error('memory sampling failed', { cause: samplingError });
  const memory = summarizeScrollMemory({ poses, holds, processSamples: samples, heapSamples });
  const { actual } = memory;
  const samplingSummary = summarizeProcessSamples(samples);
  const pass = samplingSummary.valid && memory.pass;
  const report = {
    schemaVersion: R5_PROCESS_MEMORY_SCHEMA_VERSION,
    kind: R5_PROCESS_MEMORY_RUN_KIND,
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    identity,
    environment,
    sampleIntervalMs: 250,
    sampling: samplingSummary,
    budgets,
    settling,
    interactionModel: 'continuous-scroll',
    measurement: {
      heap: 'devtools-runtime-get-heap-usage',
      mountedLayers: 'resource-bearing scene roots; persistent reading DOM reported separately',
      chapterCheckpoints: 'real hold ranges use the hold cap; zero-length landmarks are segment frame zero and use the transition cap',
      webgl: 'weak observation of actual live contexts, including off-DOM shared renderers'
    },
    actual,
    pass,
    reasons: [...samplingSummary.reasons, ...memory.reasons],
    holds,
    poses,
    heapSamples,
    processSamples: samples
  };
  const reportOutput = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(outputPath, reportOutput, 'utf8');
  if (archivePath && archivePath !== outputPath) {
    await mkdir(path.dirname(archivePath), { recursive: true });
    await writeFile(archivePath, reportOutput, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({
    outputPath,
    archivePath,
    runId,
    identity,
    environment,
    sampling: samplingSummary,
    actual,
    pass,
    reasons: [...samplingSummary.reasons, ...memory.reasons]
  })}\n`);
  if (!pass) process.exitCode = 1;
} finally {
  sampling = false;
  await samplingPromise;
  try {
    await devtools?.detach();
  } finally {
    await browser.close();
  }
}
