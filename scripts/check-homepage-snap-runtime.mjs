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
  scrollTo(arg, maybeY) {
    // Browsers accept both scrollTo({top}) and scrollTo(x, y).
    const top = typeof arg === 'object' && arg ? arg.top : maybeY;
    this.scrollY = top || 0;
    this.pageYOffset = this.scrollY;
  },
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
  const completions = [];
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [{ id: 'hero' }, { id: 'pattern-bloom' }, { id: 'belief-star' }] },
    scenePresenter: async (info) => { calls.push(info); },
    onCompletePlayback: (info) => { completions.push(info); },
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
  assert(completions.length === 1 && completions[0].toIndex === 1, 'Director calls completion hook in Completing');
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

// ---- DOM-driven bounds (real positions, not index*vh) -----------------------
{
  // Three scenes at non-uniform document tops (e.g. tall reading sections).
  const tops = { a: 0, b: 1300, c: 3000 };
  window.scrollTo({ top: 0 });
  const calls = [];
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    resolveSceneTop: (id) => tops[id],
    scenePresenter: async (info) => { calls.push(info); }
  });
  rt.recalculateSceneBounds();

  const bounds = rt.sceneBounds();
  assert(bounds[1] && bounds[1].top === 1300, `scene b uses real top 1300 (got ${bounds[1]?.top})`);
  assert(bounds[1].height === 1700, `scene b height spans to next real top (got ${bounds[1].height})`);
  assert(rt.calculateSceneTop({ id: 'c' }) === 3000, 'calculateSceneTop returns real DOM top');

  // Arm at scene a, charge forward: presenter targets scene b (index 1), and
  // snap target should be its real top, not 1*vh.
  rt.handleScroll();
  await tick(30);
  assert(rt.getCurrentState().current === 'SnappedArmed', 'arms with DOM bounds');
  rt.handleWheel({ deltaY: 80, deltaMode: 0 });
  await tick(40);
  assert(calls.length === 1 && calls[0].toIndex === 1, 'forward targets next active scene by real position');
}

// ---- programmatic snap is not cancelled by Lenis velocity -------------------
{
  const tops = { a: 0, b: 1000 };
  window.scrollTo({ top: 960 }); // within 50px snap threshold for b
  let completeSnap = null;
  const lenisLike = {
    velocity: 0,
    scrollTo(_target, options = {}) {
      completeSnap = options.onComplete;
      window.scrollTo({ top: _target });
    }
  };
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [{ id: 'a' }, { id: 'b' }] },
    scrollController: lenisLike,
    resolveSceneTop: (id) => tops[id],
    scenePresenter: async () => {}
  });
  rt.recalculateSceneBounds();
  rt.handleScroll();
  await tick(30);
  assert(rt.getCurrentState().current === 'SnapAligning', `enters SnapAligning near b (got ${rt.getCurrentState().current})`);

  // Lenis reports high velocity during the programmatic snap; this must not
  // kick the FSM into ReadingScroll and lose the pending SNAP_COMPLETE.
  lenisLike.velocity = 3;
  rt.handleScroll();
  await tick(30);
  assert(rt.getCurrentState().current === 'SnapAligning', `programmatic snap velocity does not cancel SnapAligning (got ${rt.getCurrentState().current})`);

  completeSnap?.();
  await tick(30);
  assert(rt.getCurrentState().current === 'SnappedArmed' && rt.getCurrentScene() === 1,
    'SnapAligning completes into SnappedArmed at target scene');
}

// ---- reading -> animation boundary arms previous->animation, not animation->next
{
  const tops = { hero: 0, reader: 1000, 'aod-animation': 2000, method: 3000 };
  window.scrollTo({ top: 1960 }); // reading scrolled near next animation top
  const calls = [];
  const scrollToCalls = [];
  let completeSnap = null;
  const lenisLike = {
    velocity: 0,
    scrollTo(target, options = {}) {
      scrollToCalls.push({ target, options });
      completeSnap = options.onComplete;
      window.scrollTo({ top: target });
    }
  };
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [
      { id: 'hero', kind: 'animation' },
      { id: 'reader', kind: 'reading' },
      { id: 'aod-animation', kind: 'animation' },
      { id: 'method', kind: 'reading' }
    ] },
    scrollController: lenisLike,
    resolveSceneTop: (id) => tops[id],
    scenePresenter: async (info) => { calls.push(info); }
  });
  rt.recalculateSceneBounds();
  rt.handleScroll();
  await tick(30);
  assert(rt.getCurrentState().current === 'SnapAligning', 'reading exit enters snap aligning to next animation');
  assert(scrollToCalls.some(call => call.target === 2000 && call.options?.force === true && call.options?.lock === true),
    'reading exit snap force-locks Lenis so momentum cannot overrun the animation boundary');
  completeSnap?.();
  await tick(30);
  const armed = rt.getCurrentState();
  assert(armed.current === 'SnappedArmed', `reading exit arms at animation boundary (got ${armed.current})`);
  assert(armed.currentSceneIndex === 1 && armed.targetSceneIndex === 2,
    `armed boundary keeps reader as source and animation as target (got current=${armed.currentSceneIndex}, target=${armed.targetSceneIndex})`);

  rt.handleWheel({ deltaY: 80, deltaMode: 0 });
  await tick(40);
  assert(calls.length === 1 && calls[0].fromIndex === 1 && calls[0].toIndex === 2,
    `forward charge from reading boundary plays animation target, not next scene (got ${JSON.stringify(calls[0])})`);
}

// ---- rapid reading scroll cannot skip animation snap boundaries -------------
{
  const pairs = [
    ['belief-star', 'aod-animation'],
    ['method-lower', 'figure2-animation'],
    ['brand', 'figure3-animation'],
    ['services', 'ttg-animation'],
    ['lab', 'ph-animation'],
    ['philosophy', 'crane-animation']
  ];

  for (const [readerId, animationId] of pairs) {
    const afterId = `${animationId}-after`;
    const tops = { [readerId]: 0, [animationId]: 1000, [afterId]: 2000 };
    const calls = [];
    const scrollToCalls = [];
    let completeSnap = null;
    window.scrollTo({ top: 100 });
    const lenisLike = {
      velocity: 0,
      scrollTo(target, options = {}) {
        scrollToCalls.push({ target, options });
        completeSnap = options.onComplete;
        window.scrollTo({ top: target });
      }
    };
    const rt = createHomepageSnapRuntime({
      timeline: { scenes: [
        { id: readerId, kind: 'reading' },
        { id: animationId, kind: 'animation' },
        { id: afterId, kind: 'reading' }
      ] },
      scrollController: lenisLike,
      resolveSceneTop: (id) => tops[id],
      scenePresenter: async (info) => { calls.push(info); }
    });

    rt.recalculateSceneBounds();
    rt.handleScroll();
    await tick(30);
    assert(rt.getCurrentState().current === 'FreeScroll',
      `${animationId}: starts in natural reading scroll before rapid input`);

    lenisLike.velocity = 3;
    window.scrollTo({ top: 1200 });
    rt.handleScroll();
    await tick(30);
    assert(rt.getCurrentState().current === 'SnapAligning',
      `${animationId}: rapid scroll crossing boundary enters SnapAligning, not ReadingScroll`);
    assert(completeSnap && window.scrollY === 1000,
      `${animationId}: rapid scroll is pulled back to animation top`);
    assert(scrollToCalls.some(call => call.target === 1000 && call.options?.force === true && call.options?.lock === true),
      `${animationId}: rapid boundary snap force-locks Lenis before arming`);

    completeSnap?.();
    await tick(30);
    const armed = rt.getCurrentState();
    assert(armed.current === 'SnappedArmed' && armed.currentSceneIndex === 0 && armed.targetSceneIndex === 1,
      `${animationId}: rapid boundary arms reader -> animation target (got ${JSON.stringify(armed)})`);

    rt.handleWheel({ deltaY: 80, deltaMode: 0 });
    await tick(40);
    assert(calls.length === 1 && calls[0].fromIndex === 0 && calls[0].toIndex === 1 && calls[0].direction === 1,
      `${animationId}: charged playback runs the animation adapter (got ${JSON.stringify(calls[0])})`);
  }
}

// ---- continuous input during snap is replayed after arming ------------------
{
  const tops = { reader: 0, 'aod-animation': 1000, after: 2000 };
  window.scrollTo({ top: 100 });
  const calls = [];
  let completeSnap = null;
  const lenisLike = {
    velocity: 3,
    scrollTo(target, options = {}) {
      completeSnap = options.onComplete;
      window.scrollTo({ top: target });
    }
  };
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [
      { id: 'reader', kind: 'reading' },
      { id: 'aod-animation', kind: 'animation' },
      { id: 'after', kind: 'reading' }
    ] },
    scrollController: lenisLike,
    resolveSceneTop: (id) => tops[id],
    scenePresenter: async (info) => { calls.push(info); }
  });

  rt.recalculateSceneBounds();
  rt.handleScroll();
  await tick(30);
  lenisLike.velocity = 3;
  window.scrollTo({ top: 1200 });
  rt.handleScroll();
  await tick(30);
  assert(rt.getCurrentState().current === 'SnapAligning', 'continuous input test enters SnapAligning at animation boundary');
  assert(rt.handleWheel({ deltaY: 80, deltaMode: 0 }) === true,
    'wheel input during SnapAligning is consumed and buffered');
  completeSnap?.();
  await tick(80);
  assert(calls.length === 1 && calls[0].fromIndex === 0 && calls[0].toIndex === 1,
    `buffered snap input triggers animation playback after arming (got ${JSON.stringify(calls[0])})`);
}

// ---- kind-based re-arm: animation re-arms + aligns + reverses ---------------
{
  // hero(reading) -> pattern-bloom(animation) -> belief-star(reading).
  // Real tops so we can assert the page aligns to the committed scene.
  const tops = { hero: 0, 'pattern-bloom': 1000, 'belief-star': 2000 };
  window.scrollTo({ top: 0 });
  const calls = [];
  const scrollToCalls = [];
  const lenisLike = {
    stopped: false,
    stop() { this.stopped = true; },
    start() { this.stopped = false; },
    scrollTo(target, options = {}) {
      scrollToCalls.push({ target, options, stopped: this.stopped });
      // Real Lenis requires force to scroll while stopped.
      if (!this.stopped || options.force === true) {
        window.scrollTo({ top: target });
      }
    }
  };
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [
      { id: 'hero', kind: 'reading' },
      { id: 'pattern-bloom', kind: 'animation' },
      { id: 'belief-star', kind: 'reading' }
    ] },
    scrollController: lenisLike,
    resolveSceneTop: (id) => tops[id],
    scenePresenter: async (info) => { calls.push(info); }
  });
  rt.recalculateSceneBounds();
  rt.handleScroll();
  await tick(30);
  assert(rt.getCurrentState().current === 'SnappedArmed', 'arms at hero');

  // Forward charge -> play into pattern-bloom (animation).
  rt.handleWheel({ deltaY: 80, deltaMode: 0 });
  await tick(40);
  assert(calls.length === 1 && calls[0].toIndex === 1, 'forward into pattern-bloom');

  // After completion: page aligned to pattern-bloom top, then re-armed there.
  await tick(60); // allow align + cooldown(420) ... pump more below
  assert(Math.abs((window.scrollY || 0) - 1000) < 1e-9, `aligned to pattern-bloom top 1000 (got ${window.scrollY})`);
  assert(scrollToCalls.some(call => call.target === 1000 && call.options?.immediate === true && call.options?.force === true),
    'completion alignment forces stopped Lenis to committed scene top');
  const cooldown = rt.getCurrentState();
  assert(cooldown.current === 'ReleaseCooldown' && cooldown.isScrollLocked === true,
    `animation re-arm cooldown stays scroll-locked (got ${JSON.stringify(cooldown)})`);
  assert(document.body.style.overflow === 'hidden', 'animation re-arm cooldown keeps body overflow locked');
  assert(lenisLike.stopped === true, 'animation re-arm cooldown keeps Lenis stopped');
  const callsBeforeCooldownWheel = calls.length;
  assert(rt.handleWheel({ deltaY: 80, deltaMode: 0 }) === true, 'cooldown wheel input is consumed');
  await tick(40);
  assert(calls.length === callsBeforeCooldownWheel, 'cooldown wheel input does not trigger next playback');
  await tick(500); // cooldown expiry (COOLDOWN_DURATION 420ms)
  assert(rt.getCurrentState().current === 'SnappedArmed', `animation scene re-arms after cooldown (got ${rt.getCurrentState().current})`);
  assert(rt.getCurrentScene() === 1, 're-armed AT pattern-bloom (index 1)');

  // Reverse charge from pattern-bloom -> play back toward hero.
  rt.handleWheel({ deltaY: -80, deltaMode: 0 });
  await tick(40);
  assert(calls.length === 2 && calls[1].direction === -1 && calls[1].toIndex === 0,
    `reverse from pattern-bloom targets hero (got ${JSON.stringify(calls[1])})`);
}

// ---- kind-based re-arm: reading scene releases (no auto-arm) -----------------
{
  const tops = { a: 0, reader: 1000, c: 2000 };
  window.scrollTo({ top: 0 });
  const rt = createHomepageSnapRuntime({
    timeline: { scenes: [
      { id: 'a', kind: 'animation' },
      { id: 'reader', kind: 'reading' },
      { id: 'c', kind: 'animation' }
    ] },
    resolveSceneTop: (id) => tops[id],
    scenePresenter: async () => {}
  });
  rt.recalculateSceneBounds();
  rt.handleScroll();
  await tick(30);
  rt.handleWheel({ deltaY: 80, deltaMode: 0 }); // play into 'reader' (reading)
  await tick(40);
  await tick(500); // align + cooldown expiry
  const st = rt.getCurrentState().current;
  assert(st === 'FreeScroll', `reading scene releases to FreeScroll, does NOT auto-arm (got ${st})`);
}

console.log(`snap-runtime contract: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
