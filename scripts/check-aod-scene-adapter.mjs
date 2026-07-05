#!/usr/bin/env node
/**
 * Unit test for the aod scene adapter (media/autoplay), with a FAKE video.
 *
 * Proves the media-policy contract that distinguishes aod from pattern-bloom:
 *  1. play() awaits video.play() then completes on the `ended` event
 *  2. play() rejection (autoplay/decode failure) propagates -> runtime recovers
 *  3. `ended` never firing -> time-based safety completes (no wedge)
 *  4. stalled playback rejects instead of holding the Director in Playing
 *  5. currentTime is written ONLY on prepare/reset (to 0), NEVER per frame
 *     (i.e. the main path does not scrub the webm — seekPolicy: reset-only)
 *
 * No real DOM/WebGL/WebM: a fake section+video are injected via deps.mountMarkup
 * and a synchronous frame pump via deps.raf/caf.
 *
 * Run: node scripts/check-aod-scene-adapter.mjs
 */

import { join, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const adapterSource = readFileSync(join(ROOT, 'js/runtime/scenes/aod-scene-adapter.js'), 'utf8');
const recoverySource = readFileSync(join(ROOT, 'js/runtime/recovery-handler.js'), 'utf8');

// renderAodTransitionProgress / prepareAodTransition / waitForAodTransitionMetadata
// touch DOM + window. Stub the component module is overkill; instead provide a
// minimal global shim so the real component runs harmlessly against fakes.
globalThis.window = globalThis.window || { innerHeight: 800 };
if (!globalThis.window.innerHeight) globalThis.window.innerHeight = 800;
globalThis.window.setTimeout = globalThis.window.setTimeout || ((fn, ms) => setTimeout(fn, ms));
globalThis.window.clearTimeout = globalThis.window.clearTimeout || ((id) => clearTimeout(id));

const { createAodSceneAdapter } = await import(
  pathToFileURL(join(ROOT, 'js/runtime/scenes/aod-scene-adapter.js')).href
);

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const microtask = () => Promise.resolve();

/**
 * Build a fake aod <section> + <video>. Records every currentTime WRITE so we
 * can prove the main path never scrubs.
 */
function makeFakeSection({ playBehavior = 'resolve' } = {}) {
  const writes = [];
  const listeners = {};
  const style = { setProperty() {}, removeProperty() {} };

  const video = {
    duration: 5,
    _currentTime: 0,
    readyState: 2,
    muted: true, loop: false, autoplay: false, playsInline: true, preload: 'auto',
    get currentTime() { return this._currentTime; },
    set currentTime(v) { writes.push(v); this._currentTime = v; },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    load() {}, pause() {},
    play() {
      if (playBehavior === 'reject') return Promise.reject(new Error('NotAllowedError: autoplay blocked'));
      return Promise.resolve();
    },
    addEventListener(type, cb, opts) { (listeners[type] ||= []).push({ cb, once: opts?.once }); },
    removeEventListener(type, cb) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((l) => l.cb !== cb);
    },
    dispatch(type) {
      (listeners[type] || []).slice().forEach((l) => {
        if (l.once) listeners[type] = listeners[type].filter((x) => x !== l);
        l.cb();
      });
    },
    // Helper for the test to advance playback time (simulates the browser, which
    // is what moves currentTime in the real autoplay path — not the adapter).
    advance(t) { this._currentTime = t; }
  };

  const section = {
    style,
    querySelector(sel) {
      if (sel.includes('figure-video')) return video;
      // sun/cloud layers etc. — return a node with a style bag.
      return { style: { setProperty() {}, removeProperty() {} } };
    }
  };

  const host = {
    _section: section,
    querySelector(sel) { return sel.includes('aod-transition') ? section : section.querySelector(sel); },
    replaceChildren() {},
    innerHTML: ''
  };

  return { host, section, video, writes };
}

/** Synchronous-ish frame pump. */
function makePump() {
  let q = [];
  return {
    raf: (cb) => { q.push(cb); return q.length; },
    caf: (id) => { q[id - 1] = null; },
    async run(times) {
      for (let i = 0; i < times; i++) {
        const due = q; q = [];
        for (const cb of due) if (cb) cb();
        await microtask();
      }
    }
  };
}

// ---- 1 + 4. play() -> ended completes; currentTime never scrubbed -----------
{
  const { host, video, writes } = makeFakeSection({ playBehavior: 'resolve' });
  const pump = makePump();
  const adapter = createAodSceneAdapter({
    host,
    deps: {
      mountMarkup: (h) => h._section,
      raf: pump.raf,
      caf: pump.caf
    }
  });

  await adapter.showFirstFrame();
  const writesAfterPrep = writes.length;
  assert(writes.every((w) => w === 0), `prep writes currentTime only to 0 (writes=${JSON.stringify(writes)})`);

  let done = false;
  const playP = adapter.play({ direction: 1 }).then(() => { done = true; });
  await microtask(); // let video.play() resolve and listeners attach

  // Simulate the browser advancing playback; adapter should READ, not WRITE.
  video.advance(1.5); await pump.run(1);
  video.advance(3.0); await pump.run(1);
  assert(adapter.getProgress() > 0 && adapter.getProgress() < 1, `progress tracks real time (got ${adapter.getProgress()})`);
  assert(writes.length === writesAfterPrep, 'no currentTime writes during playback (no scrub)');

  // Fire ended -> completes.
  video.advance(5); video.dispatch('ended');
  await playP;
  assert(done, 'play() resolves on ended');
  assert(adapter.getProgress() === 1, 'progress ends at 1');
  assert(writes.length === writesAfterPrep, 'still no scrub writes after completion');
}

// ---- 2. play() rejection -> propagates for recovery -------------------------
{
  const { host } = makeFakeSection({ playBehavior: 'reject' });
  const pump = makePump();
  const adapter = createAodSceneAdapter({
    host,
    deps: { mountMarkup: (h) => h._section, raf: pump.raf, caf: pump.caf }
  });
  await adapter.showFirstFrame();
  let rejected = false;
  await adapter.play({ direction: 1 }).catch((e) => { rejected = /autoplay|NotAllowed/i.test(e.message); });
  assert(rejected, 'play() rejection propagates (runtime will recover)');
}

// ---- 3. ended never fires -> time-based safety completes (no wedge) ---------
{
  const { host, video } = makeFakeSection({ playBehavior: 'resolve' });
  const pump = makePump();
  const adapter = createAodSceneAdapter({
    host,
    deps: { mountMarkup: (h) => h._section, raf: pump.raf, caf: pump.caf }
  });
  await adapter.showFirstFrame();
  let done = false;
  const p = adapter.play({ direction: 1 }).then(() => { done = true; });
  await microtask();
  // Never dispatch 'ended'; instead advance time to the end. Safety should finish.
  video.advance(video.duration); await pump.run(2);
  await p;
  assert(done, 'reaches completion via time-safety when ended never fires');
}

// ---- 4. shared media watcher rejection propagates ---------------------------
{
  const { host } = makeFakeSection({ playBehavior: 'resolve' });
  const pump = makePump();
  let attemptPlay = null;
  const adapter = createAodSceneAdapter({
    host,
    getRecoveryHandler: () => ({
      watchMediaPlay: (_video, _timeout, _scene, options) => {
        attemptPlay = options?.attemptPlay;
        return Promise.reject(new Error('watchMediaPlay failed'));
      }
    }),
    deps: { mountMarkup: (h) => h._section, raf: pump.raf, caf: pump.caf }
  });
  await adapter.showFirstFrame();
  let rejected = false;
  await adapter.play({ direction: 1 }).catch((e) => { rejected = /watchMediaPlay failed/.test(e.message); });
  assert(attemptPlay === false, 'AOD asks watchMediaPlay to observe without a second video.play()');
  assert(rejected, 'watchMediaPlay rejection propagates to snap runtime recovery');
}

// ---- 5. play() resolve without time advancing rejects (no infinite Playing) -
{
  const { host } = makeFakeSection({ playBehavior: 'resolve' });
  const pump = makePump();
  let nowMs = 0;
  const adapter = createAodSceneAdapter({
    host,
    playbackStallTimeoutMs: 30,
    deps: {
      mountMarkup: (h) => h._section,
      raf: pump.raf,
      caf: pump.caf,
      now: () => nowMs
    }
  });
  await adapter.showFirstFrame();
  let rejected = false;
  const p = adapter.play({ direction: 1 }).catch((e) => { rejected = /playback stalled/.test(e.message); });
  await microtask();
  nowMs = 10; await pump.run(1);
  nowMs = 50; await pump.run(1);
  await p;
  assert(rejected, 'stalled playback rejects instead of wedging Playing');
}

// ---- reduced motion: terminal, no play ---------------------------------------
{
  const { host, video, writes } = makeFakeSection();
  let played = false;
  const origPlay = video.play.bind(video);
  video.play = () => { played = true; return origPlay(); };
  const pump = makePump();
  const adapter = createAodSceneAdapter({
    host, reduceMotion: true,
    deps: { mountMarkup: (h) => h._section, raf: pump.raf, caf: pump.caf }
  });
  await adapter.play({ direction: 1 });
  assert(!played, 'reduced motion does not call video.play()');
  assert(adapter.getProgress() === 1, 'reduced motion presents terminal (progress 1)');
}

assert(
  adapterSource.includes("classList?.add('homepage-transition', 'homepage-transition--aod')")
    && adapterSource.includes("classList?.remove('homepage-transition', 'homepage-transition--aod')"),
  'aod scene adapter scopes fixed transition media to its host'
);

assert(
  adapterSource.includes('attemptPlay: false')
    && recoverySource.includes('options.attemptPlay === false ? null : video.play()'),
  'watchMediaPlay can observe already-started playback without calling video.play() twice'
);

console.log(`aod-scene-adapter: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
