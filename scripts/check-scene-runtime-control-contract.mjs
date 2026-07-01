import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { MVP_ROUTE_STEPS, MVP_SCENE_ROUTE } from '../js/scenes/runtime/SceneRuntime.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const route = ['hero', 'pattern', 'star-map', 'aod-animation', 'method-top', 'method-bottom', 'figure2-animation'];
const expectedSegments = [
  'hero-to-pattern',
  'pattern-to-star-map',
  'star-map-to-aod',
  'aod-play',
  'method-read',
  'method-bottom-to-figure2'
];

assert.deepEqual(MVP_SCENE_ROUTE, route, 'control smoke must use the exact MVP route');
assert.deepEqual(MVP_ROUTE_STEPS.map((step) => step.segmentId), expectedSegments, 'control smoke segment route drifted');

const runtimeSource = readFileSync(path.join(rootDir, 'js/scenes/runtime/SceneRuntime.js'), 'utf8');
[
  "recordTrace('scene:stable'",
  "recordTrace('intent:armed'",
  "recordTrace('snap:locked'",
  "recordTrace('player:started'",
  "recordTrace('early-copy'",
  "recordTrace('release:start'",
  "recordTrace('release:done'",
  "recordPresentTarget",
  'restorePreviousStableScene'
].forEach((needle) => {
  assert(runtimeSource.includes(needle), `SceneRuntime control trace missing ${needle}`);
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, processRef) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processRef.exitCode !== null) throw new Error(`server exited before ready with code ${processRef.exitCode}`);
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return;
    } catch {}
    await wait(125);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startServer() {
  const server = spawn(process.execPath, ['scripts/serve-static-site.mjs'], {
    cwd: rootDir,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '8094' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  return { server, output: () => output };
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), wait(1500)]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function createRuntimePage(browser, logs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => logs.push({ type: 'pageerror', text: error.message }));
  await page.goto('http://127.0.0.1:8094/?sceneRuntime=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sceneRuntime && document.documentElement.dataset.sceneRuntimeCurrentScene, null, { timeout: 8000 });
  return page;
}

async function snapshot(page, label) {
  return page.evaluate(({ label, route }) => {
    const html = document.documentElement;
    const state = window.__sceneRuntime?.stateMachine?.getState?.();
    const scenes = Object.fromEntries(route.map((id) => {
      const el = document.querySelector(`[data-scene-owner="scene-runtime"][data-scene-id="${id}"]`);
      if (!el) return [id, null];
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return [id, {
        current: el.hasAttribute('data-scene-runtime-current'),
        earlyCopy: el.dataset.sceneRuntimeEarlyCopy || null,
        opacity: Number(style.opacity),
        visibility: style.visibility,
        display: style.display,
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        visible: style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0.01
          && rect.bottom > 0
          && rect.top < window.innerHeight
      }];
    }));

    return {
      label,
      current: html.dataset.sceneRuntimeCurrentScene,
      routeIndex: html.dataset.sceneRuntimeRouteIndex,
      phase: state?.phase || null,
      activeSegment: state?.activeSegmentId || null,
      recovery: html.dataset.sceneRuntimeRecoveryReason || null,
      scrollY: Math.round(window.scrollY),
      overlayCount: document.querySelectorAll('.scene-runtime-ink-canvas, .pattern-bloom-transition__stage').length,
      centerScene: document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
        ?.closest?.('[data-scene-owner="scene-runtime"][data-scene-id]')?.dataset?.sceneId || null,
      scenes
    };
  }, { label, route });
}

function assertStableSnapshot(snap, expected) {
  const visible = route.filter((id) => snap.scenes[id]?.visible);
  const current = route.filter((id) => snap.scenes[id]?.current);
  const earlyCopies = route.filter((id) => snap.scenes[id]?.earlyCopy);
  assert.equal(snap.recovery, null, `${snap.label}: unexpected recovery ${snap.recovery}`);
  assert.equal(snap.current, expected, `${snap.label}: current scene drifted`);
  assert.equal(snap.routeIndex, String(route.indexOf(expected)), `${snap.label}: route index drifted`);
  assert.deepEqual(current, [expected], `${snap.label}: exactly one route scene must be current`);
  assert.deepEqual(visible, [expected], `${snap.label}: exactly one route scene must be visible`);
  assert.deepEqual(earlyCopies, [], `${snap.label}: no early-copy marker may survive stable release`);
  assert.equal(snap.overlayCount, 0, `${snap.label}: transition overlay must be cleaned up after release`);
}

async function waitStable(page, expected, label, tries = 180, delay = 160) {
  for (let index = 0; index < tries; index += 1) {
    const snap = await snapshot(page, `${label}-${index}`);
    if (snap.current === expected && snap.phase === 'IDLE') {
      await page.waitForTimeout(260);
      const stable = await snapshot(page, label);
      assertStableSnapshot(stable, expected);
      return stable;
    }
    await page.waitForTimeout(delay);
  }
  throw new Error(`Timed out waiting for stable ${expected}: ${JSON.stringify(await snapshot(page, `${label}-timeout`), null, 2)}`);
}

async function driveHeroToPattern(page) {
  for (let index = 0; index < 24; index += 1) {
    const snap = await snapshot(page, `hero-loop-${index}`);
    if (snap.current === 'pattern') return waitStable(page, 'pattern', 'after hero-to-pattern');
    assert.equal(snap.current, 'hero', `hero drive jumped to ${snap.current}`);
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(180);
  }
  return waitStable(page, 'pattern', 'after hero-to-pattern');
}

async function wheelTo(page, expected, label, deltaY = 1000) {
  await page.mouse.wheel(0, deltaY);
  return waitStable(page, expected, label);
}

async function readTo(page, expected, label) {
  await page.waitForTimeout(1300);
  for (let index = 0; index < 80; index += 1) {
    const snap = await snapshot(page, `${label}-read-${index}`);
    if (snap.current === expected && snap.phase === 'IDLE') {
      assertStableSnapshot(snap, expected);
      return snap;
    }
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(150);
  }
  throw new Error(`Timed out reading to ${expected}: ${JSON.stringify(await snapshot(page, `${label}-timeout`), null, 2)}`);
}

async function driveForwardRoute(page) {
  const snapshots = [];
  const initial = await snapshot(page, 'initial');
  assertStableSnapshot(initial, 'hero');
  snapshots.push(initial);
  snapshots.push(await driveHeroToPattern(page));
  snapshots.push(await wheelTo(page, 'star-map', 'after pattern-to-star-map'));
  snapshots.push(await wheelTo(page, 'aod-animation', 'after star-map-to-aod'));
  snapshots.push(await wheelTo(page, 'method-top', 'after aod-play'));
  snapshots.push(await readTo(page, 'method-bottom', 'after method-read'));
  snapshots.push(await readTo(page, 'figure2-animation', 'after method-bottom-to-figure2'));
  return snapshots;
}

async function runtimeTrace(page) {
  return page.evaluate(() => window.__sceneRuntime?.trace || []);
}

function eventsFor(trace, segmentId, direction = 'forward') {
  return trace.filter((entry) => entry.segmentId === segmentId && (entry.direction || 'forward') === direction);
}

function assertOrderedEvents(trace, segmentId, expected, direction = 'forward') {
  const segmentEvents = eventsFor(trace, segmentId, direction).map((entry) => entry.event);
  let cursor = -1;
  for (const event of expected) {
    const nextIndex = segmentEvents.indexOf(event, cursor + 1);
    assert.notEqual(nextIndex, -1, `${segmentId} ${direction} trace missing ${event}; got ${segmentEvents.join(' -> ')}`);
    cursor = nextIndex;
  }
}

function assertForwardTrace(trace) {
  assert(trace.some((entry) => entry.event === 'scene:stable' && entry.sceneId === 'hero' && entry.reason === 'initial'), 'initial hero stable trace is missing');
  for (const segmentId of expectedSegments) {
    const expected = ['intent:armed', 'snap:locked', 'player:started'];
    if (segmentId === 'aod-play') expected.push('early-copy');
    expected.push('present:target', 'release:start', 'release:done', 'scene:stable');
    assertOrderedEvents(trace, segmentId, expected);
  }
  assert(trace.some((entry) => entry.event === 'scene:stable' && entry.sceneId === 'figure2-animation'), 'forward route must end with figure2-animation stable');
}

async function assertReverseAfterCommit(page) {
  await page.mouse.wheel(0, -1000);
  const snap = await waitStable(page, 'method-bottom', 'after reverse-restore');
  assertStableSnapshot(snap, 'method-bottom');
  const trace = await runtimeTrace(page);
  assertOrderedEvents(trace, 'method-bottom-to-figure2', [
    'intent:armed',
    'snap:locked',
    'player:started',
    'present:target',
    'release:start',
    'release:done',
    'scene:stable'
  ], 'reverse');
}

async function assertReverseCancelBeforeCommit(browser, logs) {
  const page = await createRuntimePage(browser, logs);
  await driveHeroToPattern(page);
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(80);
  await page.mouse.wheel(0, -1000);
  const snap = await waitStable(page, 'pattern', 'after reverse-cancel-before-commit');
  assertStableSnapshot(snap, 'pattern');
  const trace = await runtimeTrace(page);
  assert(trace.some((entry) => entry.event === 'release:start'
    && entry.segmentId === 'pattern-to-star-map'
    && entry.releaseReason === 'cancelled'), 'reverse cancel must release pattern-to-star-map as cancelled');
  assert(trace.some((entry) => entry.event === 'scene:stable'
    && entry.segmentId === 'pattern-to-star-map'
    && entry.sceneId === 'pattern'
    && entry.reason === 'cancelled'), 'reverse cancel must return to source scene pattern');
  await page.close();
}

const { server } = startServer();
let browser;
try {
  await waitForServer('http://127.0.0.1:8094/?sceneRuntime=1', server);
  browser = await chromium.launch({ headless: true });
  const logs = [];
  const page = await createRuntimePage(browser, logs);
  await driveForwardRoute(page);
  const trace = await runtimeTrace(page);
  assertForwardTrace(trace);
  await assertReverseAfterCommit(page);
  await page.close();
  await assertReverseCancelBeforeCommit(browser, logs);
  const unexpectedLogs = logs.filter((entry) => !entry.text.includes('GPU stall due to ReadPixels'));
  assert.deepEqual(unexpectedLogs, [], 'browser control smoke must not emit console/page errors');
} finally {
  await browser?.close();
  await stopServer(server);
}

console.log('SceneRuntime control contract browser smoke passed.');
