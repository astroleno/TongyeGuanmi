#!/usr/bin/env node
/**
 * Unit test for the timed progress driver (pure timing logic, fake clock).
 *
 * Verifies the time-driven playback contract that replaces scroll-driven
 * progress: forward 0->1, reverse 1->0, monotonic ramp, completion resolution,
 * and cancel settling as not-completed. No real rAF / DOM / WebGL.
 *
 * Run: node scripts/check-timed-progress-driver.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { createTimedProgressDriver } = await import(
  pathToFileURL(join(ROOT, 'js/runtime/timed-progress-driver.js')).href
);

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

/**
 * Build a deterministic clock + frame pump. Each pumped frame advances the clock
 * by `stepMs` and runs all callbacks scheduled since the last pump.
 */
function makeHarness(stepMs) {
  let t = 0;
  let queue = [];
  return {
    now: () => t,
    requestFrame: (cb) => { queue.push(cb); return queue.length; },
    cancelFrame: (id) => { queue[id - 1] = null; },
    pump(times) {
      for (let i = 0; i < times; i++) {
        t += stepMs;
        const due = queue;
        queue = [];
        for (const cb of due) if (cb) cb(t);
      }
    }
  };
}

// ---- forward ramp 0 -> 1 ----------------------------------------------------
{
  const h = makeHarness(100); // 100ms/frame
  const seen = [];
  const driver = createTimedProgressDriver({
    durationMs: 1000,
    easing: (t) => t, // linear for predictable assertions
    onProgress: (p) => seen.push(p),
    now: h.now,
    requestFrame: h.requestFrame,
    cancelFrame: h.cancelFrame
  });

  let result = null;
  driver.play({ direction: 1 }).then((r) => { result = r; });
  assert(driver.isRunning(), 'running after play()');

  h.pump(5); // 500ms -> progress ~0.5
  assert(Math.abs(driver.getProgress() - 0.5) < 1e-9, `mid progress ~0.5 (got ${driver.getProgress()})`);

  h.pump(5); // 1000ms -> complete
  await Promise.resolve();
  assert(driver.getProgress() === 1, 'forward ends at 1');
  assert(result && result.completed === true, 'resolves completed:true');
  assert(!driver.isRunning(), 'not running after completion');
  // monotonic non-decreasing
  let mono = true;
  for (let i = 1; i < seen.length; i++) if (seen[i] < seen[i - 1]) mono = false;
  assert(mono, 'forward progress is monotonic non-decreasing');
}

// ---- reverse ramp 1 -> 0 ----------------------------------------------------
{
  const h = makeHarness(250);
  const driver = createTimedProgressDriver({
    durationMs: 1000, easing: (t) => t,
    now: h.now, requestFrame: h.requestFrame, cancelFrame: h.cancelFrame
  });
  driver.play({ direction: -1 });
  assert(driver.getProgress() === 1, 'reverse starts at 1');
  h.pump(2); // 500ms -> ~0.5
  assert(Math.abs(driver.getProgress() - 0.5) < 1e-9, `reverse mid ~0.5 (got ${driver.getProgress()})`);
  h.pump(2); // complete
  await Promise.resolve();
  assert(driver.getProgress() === 0, 'reverse ends at 0');
}

// ---- cancel settles as not-completed ----------------------------------------
{
  const h = makeHarness(100);
  const driver = createTimedProgressDriver({
    durationMs: 1000, easing: (t) => t,
    now: h.now, requestFrame: h.requestFrame, cancelFrame: h.cancelFrame
  });
  let result = null;
  driver.play({ direction: 1 }).then((r) => { result = r; });
  h.pump(3); // 300ms
  driver.cancel();
  await Promise.resolve();
  assert(result && result.completed === false, 'cancel resolves completed:false');
  assert(!driver.isRunning(), 'not running after cancel');
  const frozen = driver.getProgress();
  h.pump(5); // no further ticks should run
  assert(driver.getProgress() === frozen, 'progress frozen after cancel (no stray ticks)');
}

// ---- partial ramp preserves speed and endpoint ------------------------------
{
  const h = makeHarness(100);
  const driver = createTimedProgressDriver({
    durationMs: 1000, easing: (t) => t,
    now: h.now, requestFrame: h.requestFrame, cancelFrame: h.cancelFrame
  });
  let result = null;
  driver.play({ from: 0.6, to: 0, direction: -1 }).then((r) => { result = r; });
  assert(driver.getProgress() === 0.6, 'partial reverse starts at explicit from');
  h.pump(3);
  assert(Math.abs(driver.getProgress() - 0.3) < 1e-9, `partial reverse mid ~0.3 (got ${driver.getProgress()})`);
  h.pump(3);
  await Promise.resolve();
  assert(driver.getProgress() === 0, 'partial reverse settles at explicit to');
  assert(result && result.completed === true, 'partial reverse resolves completed:true');
}

// ---- partial cancel freezes mid-flight --------------------------------------
{
  const h = makeHarness(100);
  const driver = createTimedProgressDriver({
    durationMs: 1000, easing: (t) => t,
    now: h.now, requestFrame: h.requestFrame, cancelFrame: h.cancelFrame
  });
  let result = null;
  driver.play({ from: 0.6, to: 0, direction: -1 }).then((r) => { result = r; });
  h.pump(2);
  driver.cancel();
  await Promise.resolve();
  assert(result && result.completed === false, 'partial cancel resolves completed:false');
  const frozen = driver.getProgress();
  h.pump(5);
  assert(driver.getProgress() === frozen, 'partial progress frozen after cancel');
}

// ---- per-play duration override ---------------------------------------------
{
  const h = makeHarness(100);
  const driver = createTimedProgressDriver({
    durationMs: 1000, easing: (t) => t,
    now: h.now, requestFrame: h.requestFrame, cancelFrame: h.cancelFrame
  });
  let result = null;
  driver.play({ from: 1, to: 0, direction: -1, durationMs: 500 }).then((r) => { result = r; });
  h.pump(5);
  await Promise.resolve();
  assert(driver.getProgress() === 0, 'duration override settles at overridden duration');
  assert(result && result.completed === true, 'duration override resolves completed:true');
}

// ---- last-call-wins: play() during a run restarts cleanly -------------------
{
  const h = makeHarness(100);
  const driver = createTimedProgressDriver({
    durationMs: 1000, easing: (t) => t,
    now: h.now, requestFrame: h.requestFrame, cancelFrame: h.cancelFrame
  });
  let first = null;
  driver.play({ direction: 1 }).then((r) => { first = r; });
  h.pump(4); // 400ms
  driver.play({ direction: 1 }); // restart
  await Promise.resolve();
  assert(first && first.completed === false, 'superseded run resolves not-completed');
  assert(driver.getProgress() === 0, 'restart resets progress to 0');
}

console.log(`timed-progress-driver: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
