#!/usr/bin/env node
/**
 * Unit test for the figure2-animation scene adapter (control flow, not WebGL).
 *
 * Uses a FAKE figure2 controller (records renderStaticState calls + video
 * start/finish) and a fake driver, so the wiring contract is verified under node:
 *  - showFirstFrame mounts + prepares + presents (intro=0, transition=0)
 *  - forward play ramps introProgress 0->1, calls startFigureVideoPlayback once,
 *    then finishFigureVideoPlayback; never scrubs (no currentTime writes here)
 *  - reduced-motion / reverse present terminal WITHOUT running the driver
 *  - controller init failure -> play rejects (runtime recovers)
 *  - destroy cancels the driver and destroys the controller
 *
 * The REAL figure2 controller (WebGL ink + alpha videos) is NOT exercised — that
 * rendering needs in-browser confirmation.
 *
 * Run: node scripts/check-figure2-scene-adapter.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { createFigure2SceneAdapter } = await import(
  pathToFileURL(join(ROOT, 'js/runtime/scenes/figure2-scene-adapter.js')).href
);

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

function makeFakeController({ failInit = false } = {}) {
  if (failInit) return null;
  const calls = { render: [], start: 0, finish: 0, prepare: 0, destroyed: false };
  return {
    prepare() { calls.prepare++; },
    waitForVideos() { return Promise.resolve(); },
    renderStaticState(s) { calls.render.push({ ...s }); },
    startFigureVideoPlayback() { calls.start++; },
    finishFigureVideoPlayback() { calls.finish++; },
    resetFigureVideoPlayback() {},
    destroy() { calls.destroyed = true; },
    __calls: calls
  };
}

/** Fake driver: test drives progress + resolves play() on demand. */
function makeFakeDriver() {
  let onProgress = () => {};
  let resolveCurrent = null;
  let cancelled = false;
  return {
    factory(opts) {
      onProgress = opts.onProgress || (() => {});
      return {
        play: () => new Promise((res) => { resolveCurrent = res; }),
        cancel() { cancelled = true; if (resolveCurrent) { resolveCurrent({ completed: false }); resolveCurrent = null; } },
        getProgress: () => 0, isRunning: () => Boolean(resolveCurrent)
      };
    },
    emit: (p) => onProgress(p),
    finish: () => { if (resolveCurrent) { resolveCurrent({ completed: true }); resolveCurrent = null; } },
    wasCancelled: () => cancelled
  };
}

const fakeHost = () => ({ classList: { add() {}, remove() {} }, replaceChildren() {}, innerHTML: '', _section: { tag: 'section' } });

// ---- showFirstFrame presents (0,0); forward ramps + plays video -------------
{
  const fc = makeFakeController();
  const fd = makeFakeDriver();
  const adapter = createFigure2SceneAdapter({
    host: fakeHost(),
    deps: {
      mountMarkup: (h) => h._section,
      createController: () => fc,
      createDriver: fd.factory
    }
  });

  await adapter.showFirstFrame();
  assert(fc.__calls.prepare === 1, 'showFirstFrame prepares controller');
  const first = fc.__calls.render[fc.__calls.render.length - 1];
  assert(first && first.introProgress === 0 && first.transitionProgress === 0, 'presents (intro=0, transition=0) after prep');

  let done = false;
  const p = adapter.play({ direction: 1 }).then(() => { done = true; });
  await Promise.resolve();
  assert(fc.__calls.start === 1, 'forward calls startFigureVideoPlayback once');

  fd.emit(0.5);
  assert(Math.abs(adapter.getProgress() - 0.5) < 1e-9, 'driver progress flows to intro axis');
  const mid = fc.__calls.render[fc.__calls.render.length - 1];
  assert(mid.introProgress === 0.5 && mid.transitionProgress === 0, 'renders intro ramp with transition pinned at 0');

  fd.finish();
  await p;
  assert(done, 'play resolves when driver completes');
  assert(adapter.getProgress() === 1, 'settles intro to 1');
  assert(fc.__calls.finish === 1, 'calls finishFigureVideoPlayback on completion');
}

// ---- reduced motion: terminal, no driver, no startVideo ---------------------
{
  const fc = makeFakeController();
  let driverPlayed = false;
  const adapter = createFigure2SceneAdapter({
    host: fakeHost(),
    reduceMotion: true,
    deps: {
      mountMarkup: (h) => h._section,
      createController: () => fc,
      createDriver: () => ({ play: () => { driverPlayed = true; return Promise.resolve({ completed: true }); }, cancel() {}, getProgress: () => 0, isRunning: () => false })
    }
  });
  await adapter.play({ direction: 1 });
  assert(!driverPlayed, 'reduced motion does not run the driver');
  assert(adapter.getProgress() === 1, 'reduced motion presents terminal intro=1');
  assert(fc.__calls.start === 0, 'reduced motion does not start video playback loop');
  assert(fc.__calls.finish >= 1, 'reduced motion finishes video to terminal');
}

// ---- reverse: terminal fallback (true reverse video deferred) ---------------
{
  const fc = makeFakeController();
  let driverPlayed = false;
  const adapter = createFigure2SceneAdapter({
    host: fakeHost(),
    deps: {
      mountMarkup: (h) => h._section,
      createController: () => fc,
      createDriver: () => ({ play: () => { driverPlayed = true; return Promise.resolve({ completed: true }); }, cancel() {}, getProgress: () => 0, isRunning: () => false })
    }
  });
  await adapter.showFirstFrame();
  await adapter.play({ direction: -1 });
  assert(!driverPlayed, 'reverse does not run forward ramp (terminal fallback)');
  assert(adapter.getProgress() === 1, 'reverse presents terminal');
}

// ---- controller init failure -> play rejects --------------------------------
{
  const adapter = createFigure2SceneAdapter({
    host: fakeHost(),
    deps: {
      mountMarkup: (h) => h._section,
      createController: () => null, // init fails
      createDriver: makeFakeDriver().factory
    }
  });
  let rejected = false;
  await adapter.play({ direction: 1 }).catch(() => { rejected = true; });
  assert(rejected, 'controller init failure -> play rejects (runtime recovers)');
}

// ---- destroy cancels driver + destroys controller ---------------------------
{
  const fc = makeFakeController();
  const fd = makeFakeDriver();
  const adapter = createFigure2SceneAdapter({
    host: fakeHost(),
    deps: { mountMarkup: (h) => h._section, createController: () => fc, createDriver: fd.factory }
  });
  await adapter.showFirstFrame();
  adapter.destroy();
  assert(fd.wasCancelled(), 'destroy cancels the driver');
  assert(fc.__calls.destroyed, 'destroy destroys the controller');
}

// ---- missing host throws ----------------------------------------------------
{
  let threw = false;
  try { createFigure2SceneAdapter({ host: null }); } catch { threw = true; }
  assert(threw, 'throws without a host element');
}

console.log(`figure2-scene-adapter: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
