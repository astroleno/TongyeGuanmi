#!/usr/bin/env node
/**
 * Unit test for the pattern-bloom scene adapter (wiring, not WebGL).
 *
 * Uses injected fakes for `mount` and `createDriver` so the wiring contract is
 * verified under node:
 *  - mounts the visual with a progressSource closure
 *  - play() reports driver progress; render(frame) updates progressSource
 *  - reduced-motion jumps to terminal without running the driver
 *  - destroy() tears down both driver and mounted visual
 *
 * The REAL mountPatternBloomTransition (WebGL ink + pattern mirror) is NOT
 * exercised here — that rendering needs in-browser confirmation.
 *
 * Run: node scripts/check-pattern-bloom-scene-adapter.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { createPatternBloomSceneAdapter } = await import(
  pathToFileURL(join(ROOT, 'js/runtime/scenes/pattern-bloom-scene-adapter.js')).href
);

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

/** Fake driver: lets the test step progress and resolve play() on demand. */
function makeFakeDriver() {
  let onProgress = () => {};
  let resolveCurrent = null;
  let cancelled = false;
  return {
    factory(opts) {
      onProgress = opts.onProgress;
      return {
        play: () => new Promise((res) => { resolveCurrent = res; }),
        cancel: () => { cancelled = true; if (resolveCurrent) { resolveCurrent({ completed: false }); resolveCurrent = null; } },
        getProgress: () => 0,
        isRunning: () => Boolean(resolveCurrent)
      };
    },
    emit: (p) => onProgress(p),
    finish: () => { if (resolveCurrent) { resolveCurrent({ completed: true }); resolveCurrent = null; } },
    wasCancelled: () => cancelled
  };
}

// ---- mounts visual + play() reports frames consumed by render(frame) --------
{
  const fake = makeFakeDriver();
  let mountedWith = null;
  let destroyed = false;
  const adapter = createPatternBloomSceneAdapter({
    host: { dataset: {} },
    reduceMotion: false,
    mount: (opts) => { mountedWith = opts; return { destroy() { destroyed = true; } }; },
    createDriver: fake.factory
  });

  assert(mountedWith && typeof mountedWith.progressSource === 'function', 'mounts visual with a progressSource closure');
  assert(mountedWith.progressSource() === 0, 'progress starts at 0');

  let done = false;
  const p = adapter.play({ direction: 1 }).then(() => { done = true; });
  fake.emit(0.5);
  assert(Math.abs(mountedWith.progressSource() - 0.5) < 1e-9, 'driver progress flows to visual progressSource');
  assert(Math.abs(adapter.getProgress() - 0.5) < 1e-9, 'adapter.getProgress reflects driver');

  fake.finish();
  await p;
  assert(done, 'play() resolves when driver completes');

  adapter.destroy();
  assert(destroyed, 'destroy tears down mounted visual');
}

// ---- reduced motion jumps to terminal without driver ------------------------
{
  let driverPlayed = false;
  const adapter = createPatternBloomSceneAdapter({
    host: { dataset: {} },
    reduceMotion: true,
    mount: () => ({ destroy() {} }),
    createDriver: () => ({
      play: () => { driverPlayed = true; return Promise.resolve({ completed: true }); },
      cancel: () => {}, getProgress: () => 0, isRunning: () => false
    })
  });

  await adapter.play({ direction: 1 });
  assert(!driverPlayed, 'reduced motion does NOT run the timed driver');
  assert(adapter.getProgress() === 1, 'reduced motion forward jumps to terminal 1');

  await adapter.play({ direction: -1 });
  assert(adapter.getProgress() === 0, 'reduced motion reverse jumps to 0');
}

// ---- missing host throws ----------------------------------------------------
{
  let threw = false;
  try { createPatternBloomSceneAdapter({ host: null }); } catch { threw = true; }
  assert(threw, 'throws without a host element');
}

console.log(`pattern-bloom-scene-adapter: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
