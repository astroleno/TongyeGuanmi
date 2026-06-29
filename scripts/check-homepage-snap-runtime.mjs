#!/usr/bin/env node
/**
 * Runtime contract test for the homepage snap FSM + charge subsystem.
 *
 * This is an EXECUTABLE test (not a static scan): it loads the real runtime
 * modules under a minimal DOM shim and drives them, asserting the plan's
 * charge-driven contract:
 *   - normalizer + accumulator agree on units (10vh of wheel === full charge)
 *   - SnappedArmed locks the page and does NOT trigger on <10vh
 *   - 10vh of input triggers playback through the scenePresenter seam
 *   - reverse charge at scene top plays the previous scene
 *   - a failing presenter routes to recovery and ALWAYS unlocks scroll
 *
 * Run: node scripts/check-homepage-snap-runtime.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- minimal DOM/window shim ------------------------------------------------
let bodyOverflow = '';
globalThis.window = {
  innerHeight: 800, scrollY: 0, pageYOffset: 0,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  addEventListener() {}, removeEventListener() {},
  scrollTo({ top }) { this.scrollY = top; this.pageYOffset = top; },
  dispatchEvent() {}, visualViewport: null, location: { hash: '' }
};
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
globalThis.document = {
  documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {} },
  body: { style: { set overflow(v) { bodyOverflow = v; }, get overflow() { return bodyOverflow; } } },
  querySelector: () => null
};

const { createHomepageSnapRuntime } = await import(
  pathToFileURL(join(ROOT, 'js/runtime/homepage-snap-runtime.js')).href
);
const { createChargeAccumulator } = await import(
  pathToFileURL(join(ROOT, 'js/runtime/charge-accumulator.js')).href
);
const { createInputNormalizer } = await import(
  pathToFileURL(join(ROOT, 'js/runtime/input-normalizer.js')).href
);

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- units ------------------------------------------------------------------
{
  const norm = createInputNormalizer({ viewportHeight: 800 });
  const charge = createChargeAccumulator({ thresholdVh: 10 });
  const d = norm.normalizeWheel({ deltaY: 80, deltaMode: 0 });
  assert(Math.abs(d - 0.1) < 1e-9, `80px/800 wheel => 0.1 (got ${d})`);
  assert(Math.abs(charge.accumulate(d) - 1.0) < 1e-9, 'one 10vh wheel fills charge');
  assert(charge.isTriggered(), 'charge triggers at 10vh');
}

// ---- forward cycle ----------------------------------------------------------
{
  const states = [];
  const calls = [];
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [{ id: 'hero' }, { id: 'pattern-bloom' }, { id: 'belief-star' }] },
    scenePresenter: async (info) => { calls.push(info); },
    onStateChange: (s) => states.push(s.current)
  });
  rt.handleScroll();
  await tick(30);
  assert(rt.getCurrentState().current === 'SnappedArmed', 'arms at start');
  assert(rt.getCurrentState().isScrollLocked === true, 'page locked while armed');
  rt.handleWheel({ deltaY: 72, deltaMode: 0 }); // 9vh
  assert(calls.length === 0, '9vh does not trigger');
  rt.handleWheel({ deltaY: 16, deltaMode: 0 }); // crosses 10vh
  await tick(40);
  assert(calls.length === 1 && calls[0].direction === 1 && calls[0].toIndex === 1, 'forward playback to next scene');
  await tick(40);
  assert(rt.getCurrentScene() === 1, 'scene commits after completion');
  assert(document.body.style.overflow === '', 'scroll unlocked after completion');
  assert(states.join(' ').includes('TriggeredPlayback') && states.join(' ').includes('Completing'), 'passes through TriggeredPlayback + Completing');
}

// ---- reverse ----------------------------------------------------------------
{
  const calls = [];
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [{ id: 'a' }, { id: 'b' }] },
    scenePresenter: async (info) => { calls.push(info); }
  });
  // Start at scene 1 by scrolling there first.
  window.scrollTo({ top: 800 });
  rt.handleScroll();
  await tick(30);
  assert(rt.getCurrentState().current === 'SnappedArmed', 'arms at scene 1');
  rt.handleWheel({ deltaY: -80, deltaMode: 0 }); // full reverse charge
  await tick(40);
  assert(calls.length === 1 && calls[0].direction === -1 && calls[0].toIndex === 0, 'reverse plays previous scene');
}

// ---- recovery never wedges --------------------------------------------------
{
  let errored = null;
  window.scrollTo({ top: 0 });
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [{ id: 'a' }, { id: 'b' }] },
    scenePresenter: async () => { throw new Error('404 video'); },
    onError: (e) => { errored = e; }
  });
  rt.handleScroll();
  await tick(30);
  rt.handleWheel({ deltaY: 80, deltaMode: 0 });
  await tick(40);
  assert(rt.getCurrentState().current === 'RecoverPresentTarget', 'enters recovery on presenter failure');
  await tick(2100);
  assert(rt.getCurrentState().current === 'FreeScroll', 'recovers to FreeScroll');
  assert(document.body.style.overflow === '', 'scroll unlocked after recovery');
  assert(errored && /404/.test(errored.message), 'error surfaced for observability');
}

console.log(`snap-runtime contract: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
