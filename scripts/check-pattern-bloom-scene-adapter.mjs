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
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const adapterSource = readFileSync(join(ROOT, 'js/transitions/pattern-bloom-adapter.js'), 'utf8');
const { createPatternBloomSceneAdapter } = await import(
  pathToFileURL(join(ROOT, 'js/runtime/scenes/pattern-bloom-scene-adapter.js')).href
);

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const closeTo = (actual, expected, epsilon = 1e-6) => Math.abs(actual - expected) <= epsilon;

/** Fake driver: lets the test step progress and resolve play() on demand. */
function makeFakeDriver() {
  let onProgress = () => {};
  let resolveCurrent = null;
  let cancelled = false;
  const playCalls = [];
  return {
    factory(opts) {
      onProgress = opts.onProgress;
      return {
        play: (playOptions = {}) => {
          playCalls.push(playOptions);
          return new Promise((res) => { resolveCurrent = res; });
        },
        cancel: () => { cancelled = true; if (resolveCurrent) { resolveCurrent({ completed: false }); resolveCurrent = null; } },
        getProgress: () => 0,
        isRunning: () => Boolean(resolveCurrent)
      };
    },
    emit: (p) => onProgress(p),
    finish: () => { if (resolveCurrent) { resolveCurrent({ completed: true }); resolveCurrent = null; } },
    playCalls: () => playCalls,
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
  const p = adapter.play({
    direction: 1,
    fromScene: { id: 'hero' },
    toScene: { id: 'pattern-bloom' }
  }).then(() => { done = true; });
  assert(fake.playCalls()[0]?.from === 0 && fake.playCalls()[0]?.to === 0.80,
    `hero -> pattern plays only the pattern segment (got ${JSON.stringify(fake.playCalls()[0])})`);
  assert(closeTo(fake.playCalls()[0]?.durationMs, 2000),
    `hero -> pattern keeps a full 1600ms segment despite 0.8 progress span (got ${JSON.stringify(fake.playCalls()[0])})`);
  fake.emit(0.5);
  assert(Math.abs(mountedWith.progressSource() - 0.5) < 1e-9, 'driver progress flows to visual progressSource');
  assert(Math.abs(adapter.getProgress() - 0.5) < 1e-9, 'adapter.getProgress reflects driver');

  fake.finish();
  await p;
  assert(done, 'play() resolves when driver completes');

  adapter.destroy();
  assert(destroyed, 'destroy tears down mounted visual');
}

// ---- pattern -> belief plays the star-map exit segment ---------------------
{
  const fake = makeFakeDriver();
  const adapter = createPatternBloomSceneAdapter({
    host: { dataset: {} },
    reduceMotion: false,
    mount: () => ({ destroy() {} }),
    createDriver: fake.factory
  });

  const p = adapter.play({
    direction: 1,
    fromScene: { id: 'pattern-bloom' },
    toScene: { id: 'belief-star' }
  });
  assert(fake.playCalls()[0]?.from === 0.80 && fake.playCalls()[0]?.to === 1,
    `pattern -> belief plays only the left-origin exit segment (got ${JSON.stringify(fake.playCalls()[0])})`);
  assert(closeTo(fake.playCalls()[0]?.durationMs, 8000),
    `pattern -> belief keeps a full 1600ms segment despite 0.2 progress span (got ${JSON.stringify(fake.playCalls()[0])})`);
  fake.finish();
  await p;
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

  await adapter.play({
    direction: 1,
    fromScene: { id: 'hero' },
    toScene: { id: 'pattern-bloom' }
  });
  assert(!driverPlayed, 'reduced motion does NOT run the timed driver');
  assert(adapter.getProgress() === 0.80, 'reduced motion hero -> pattern jumps to pattern terminal');

  await adapter.play({
    direction: 1,
    fromScene: { id: 'pattern-bloom' },
    toScene: { id: 'belief-star' }
  });
  assert(adapter.getProgress() === 1, 'reduced motion pattern -> belief jumps to star-map terminal');

  await adapter.play({
    direction: -1,
    fromScene: { id: 'belief-star' },
    toScene: { id: 'pattern-bloom' }
  });
  assert(adapter.getProgress() === 0.80, 'reduced motion reverse belief -> pattern returns to pattern terminal');
}

// ---- missing host throws ----------------------------------------------------
{
  let threw = false;
  try { createPatternBloomSceneAdapter({ host: null }); } catch { threw = true; }
  assert(threw, 'throws without a host element');
}

// ---- visual phase centers stay distinct ------------------------------------
assert(
  /const\s+revealInkTransition[\s\S]*?inkCenterX:\s*CENTER_INK\.x[\s\S]*?inkCenterY:\s*CENTER_INK\.y/.test(adapterSource),
  'hero -> pattern ink reveal starts from viewport center'
);

assert(
  /createPatternBloomScene\([\s\S]*?center:\s*\{[\s\S]*?x:\s*LEFT_INK\.x[\s\S]*?y:\s*LEFT_INK\.y/.test(adapterSource)
    && /const\s+exitInkTransition[\s\S]*?inkCenterX:\s*LEFT_INK\.x[\s\S]*?inkCenterY:\s*LEFT_INK\.y/.test(adapterSource),
  'pattern bloom and pattern -> star-map exit stay left-centered'
);

assert(
  adapterSource.includes('PATTERN_STATEMENT')
    && adapterSource.includes('pattern-bloom-transition__statement')
    && adapterSource.includes("['一句话讲清', '我们干什么'].join('')")
    && adapterSource.includes("['让 AI 从', '一场培训，', '变成账上的数字。'].join('')")
    && adapterSource.includes("['我们不卖课、不卖软件，', '而是进到你的业务现场，', '把 AI 做成团队天天在用、', '月底对得上账的东西。'].join('')"),
  'pattern screen assembles the approved right-side statement'
);

console.log(`pattern-bloom-scene-adapter: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
