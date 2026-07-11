/* global document, window */
import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const outputPath = path.join(
  repoDir,
  'artifacts/react-refactor/r5-candidate/r5-process-memory.json'
);
const baseUrl = process.env.R5_BASE_URL ?? 'http://127.0.0.1:4173';
const scenes = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'figure2-animation',
  'figure2-proof-opening',
  'figure2-proof-cards',
  'figure2-proof-closing',
  'brand',
  'figure3-animation',
  'services',
  'ttg-animation',
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
];
const budgets = {
  peakBrowserTreeRssBytes: 1_500_000_000,
  peakGpuProcessRssBytes: 512 * 1024 * 1024,
  peakRendererRssBytes: 1024 * 1024 * 1024,
  settledHeapFractionOfPeak: 0.9
};

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
  const browserRoot = owned.find((row) => (
    /Google Chrome/.test(row.command) && !row.command.includes('--type=')
  ));
  if (!browserRoot) {
    return undefined;
  }
  const browserRows = [
    browserRoot,
    ...descendants(rows, browserRoot.pid)
  ];
  const sum = (matching) => browserRows
    .filter(matching)
    .reduce((total, row) => total + row.rssBytes, 0);
  return {
    browserPid: browserRoot.pid,
    totalRssBytes: sum(() => true),
    gpuRssBytes: sum((row) => row.command.includes('--type=gpu-process')),
    rendererRssBytes: sum((row) => row.command.includes('--type=renderer')),
    processCount: browserRows.length
  };
}

async function storySnapshot(page) {
  return page.evaluate(() => {
    const story = window.__storyApp?.snapshot();
    if (!story) throw new Error('StoryApp diagnostics are unavailable');
    const memory = performance.memory;
    const canvases = [...document.querySelectorAll('[data-stage-layer] canvas')];
    return {
      ...story,
      usedJsHeapBytes: memory?.usedJSHeapSize,
      canvasPixelBytes: canvases.reduce(
        (total, canvas) => total + canvas.width * canvas.height * 4,
        0
      )
    };
  });
}

async function waitForHold(page, scene) {
  await page.waitForFunction((expected) => {
    const snapshot = window.__storyApp?.snapshot();
    return snapshot?.phase === 'hold' && snapshot.current === expected;
  }, scene, { timeout: 30_000 });
}

async function moveOneHold(page, direction) {
  const start = (await storySnapshot(page)).current;
  await page.evaluate((value) => {
    const current = window.__storyApp?.snapshot().current;
    const layer = document.querySelector(`[data-stage-layer="${current}"]`);
    const scrollport = layer?.querySelector('[data-reading-scrollport="true"]')
      ?? (layer?.matches('[data-reading="true"]') ? layer : null);
    if (scrollport) {
      scrollport.scrollTop = value === 1
        ? Math.max(0, scrollport.scrollHeight - scrollport.clientHeight)
        : 0;
    }
  }, direction);
  const key = direction === 1 ? 'PageDown' : 'PageUp';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const before = await storySnapshot(page);
    if (before.phase === 'hold' && before.current !== start) return before;
    if (before.phase !== 'hold' && before.phase !== 'staged-paused') {
      await page.waitForFunction((scene) => {
        const snapshot = window.__storyApp?.snapshot();
        return snapshot?.phase === 'staged-paused'
          || (snapshot?.phase === 'hold' && snapshot.current !== scene);
      }, start, { timeout: 30_000 });
      continue;
    }
    await page.keyboard.press(key);
    try {
      await page.waitForFunction((scene) => {
        const snapshot = window.__storyApp?.snapshot();
        return snapshot?.phase === 'staged-paused'
          || (snapshot?.phase === 'hold' && snapshot.current !== scene);
      }, start, { timeout: 30_000 });
    } catch (error) {
      const current = await storySnapshot(page);
      throw new Error(
        `Timed out moving from ${start}: ${JSON.stringify(current)}`,
        { cause: error }
      );
    }
  }
  throw new Error(`Story did not leave ${start}`);
}

await mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ]
});
const samples = [];
let sampling = true;
const sampleMemory = async () => {
  while (sampling) {
    const sample = await readBrowserMemory();
    if (sample) samples.push(sample);
    await sleep(250);
  }
};
const samplingPromise = sampleMemory();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.bringToFront();
  await page.goto(baseUrl);
  await waitForHold(page, 'hero');
  const holds = [{ direction: 'boot', ...(await storySnapshot(page)) }];

  for (const expected of scenes.slice(1)) {
    process.stdout.write(`forward:${expected}\n`);
    const snapshot = await moveOneHold(page, 1);
    if (snapshot.current !== expected) {
      throw new Error(`Expected ${expected}, received ${snapshot.current}`);
    }
    holds.push({ direction: 'forward', ...snapshot });
  }
  await sleep(5_000);
  holds.push({ direction: 'forward-settled', ...(await storySnapshot(page)) });

  for (const expected of [...scenes].reverse().slice(1)) {
    process.stdout.write(`reverse:${expected}\n`);
    const snapshot = await moveOneHold(page, -1);
    if (snapshot.current !== expected) {
      throw new Error(`Expected reverse ${expected}, received ${snapshot.current}`);
    }
    holds.push({ direction: 'reverse', ...snapshot });
  }
  await sleep(5_000);
  holds.push({ direction: 'reverse-settled', ...(await storySnapshot(page)) });

  sampling = false;
  await samplingPromise;
  const max = (field) => Math.max(0, ...samples.map((sample) => sample[field]));
  const heapValues = holds.flatMap((hold) => (
    typeof hold.usedJsHeapBytes === 'number' ? [hold.usedJsHeapBytes] : []
  ));
  const peakJsHeapBytes = Math.max(0, ...heapValues);
  const finalJsHeapBytes = heapValues.at(-1) ?? 0;
  const actual = {
    peakBrowserTreeRssBytes: max('totalRssBytes'),
    peakGpuProcessRssBytes: max('gpuRssBytes'),
    peakRendererRssBytes: max('rendererRssBytes'),
    peakJsHeapBytes,
    finalJsHeapBytes,
    peakCanvasPixelBytes: Math.max(0, ...holds.map((hold) => hold.canvasPixelBytes)),
    maxMountedLayers: Math.max(0, ...holds.map((hold) => hold.mountedLayers)),
    maxWebglCanvasesAtHold: Math.max(0, ...holds.map((hold) => hold.webglCanvases))
  };
  const pass = actual.peakBrowserTreeRssBytes <= budgets.peakBrowserTreeRssBytes
    && actual.peakGpuProcessRssBytes <= budgets.peakGpuProcessRssBytes
    && actual.peakRendererRssBytes <= budgets.peakRendererRssBytes
    && actual.finalJsHeapBytes <= actual.peakJsHeapBytes * budgets.settledHeapFractionOfPeak
    && actual.maxMountedLayers <= 3
    && actual.maxWebglCanvasesAtHold <= 1;
  const report = {
    schemaVersion: 1,
    environment: 'macOS / Chrome hardware process-tree sample',
    sampleIntervalMs: 250,
    budgets,
    actual,
    pass,
    holds,
    processSamples: samples
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ outputPath, actual, pass })}\n`);
  if (!pass) process.exitCode = 1;
} finally {
  sampling = false;
  await samplingPromise;
  await browser.close();
}
