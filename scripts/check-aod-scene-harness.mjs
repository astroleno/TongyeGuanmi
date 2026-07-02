#!/usr/bin/env node
/**
 * Contract check for the standalone AOD scene harness.
 *
 * Run: node scripts/check-aod-scene-harness.mjs
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const playerPath = join(ROOT, 'js/scene-harness/aod-scene-player.js');
const pagePath = join(ROOT, 'scene-harness-aod.html');

globalThis.window = globalThis.window || {
  innerHeight: 800,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (callback) => setTimeout(callback, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => Date.now() }
};
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

const { createAodScenePlayer, AOD_SCENE_TRACE_STATES } = await import(
  pathToFileURL(playerPath).href
);

let pass = 0;
let fail = 0;
const assert = (condition, message) => {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`  x ${message}`);
  }
};
const microtask = () => Promise.resolve();

function makeStyle() {
  return {
    props: new Map(),
    setProperty(name, value) { this.props.set(name, value); },
    removeProperty(name) { this.props.delete(name); }
  };
}

function makeClassList() {
  const names = new Set();
  return {
    add(...items) { items.forEach((item) => names.add(item)); },
    remove(...items) { items.forEach((item) => names.delete(item)); },
    contains(item) { return names.has(item); }
  };
}

function makeFakeVideo({ duration = 5, readyState = 2 } = {}) {
  const listeners = new Map();
  const writes = [];
  const video = {
    duration,
    readyState,
    muted: false,
    loop: true,
    autoplay: true,
    playsInline: false,
    preload: '',
    paused: true,
    pauseCount: 0,
    loadCount: 0,
    _currentTime: 0,
    writes,
    get currentTime() { return this._currentTime; },
    set currentTime(value) {
      writes.push(value);
      this._currentTime = value;
    },
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    load() { this.loadCount += 1; },
    pause() { this.pauseCount += 1; this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); },
    addEventListener(type, callback) {
      const list = listeners.get(type) || [];
      list.push(callback);
      listeners.set(type, list);
    },
    removeEventListener(type, callback) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((item) => item !== callback));
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
    dispatch(type) {
      for (const callback of [...(listeners.get(type) || [])]) callback();
    },
    advance(time) {
      this._currentTime = time;
    }
  };

  return video;
}

function makeFixture(opts = {}) {
  const video = makeFakeVideo(opts);
  const layer = { style: makeStyle() };
  const section = {
    style: makeStyle(),
    querySelector(selector) {
      if (selector.includes('figure-video')) return video;
      return layer;
    }
  };
  const events = [];
  const host = {
    dataset: {},
    style: makeStyle(),
    classList: makeClassList(),
    innerHTML: '',
    cleared: false,
    querySelector(selector) {
      return selector.includes('aod-transition') ? section : section.querySelector(selector);
    },
    replaceChildren() {
      this.cleared = true;
      this.innerHTML = '';
    },
    dispatchEvent(event) {
      events.push(event.detail);
    }
  };

  return { host, section, video, events };
}

function makePump() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    raf(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    caf(id) {
      callbacks.delete(id);
    },
    pending() {
      return callbacks.size;
    },
    async run(count = 1) {
      for (let index = 0; index < count; index += 1) {
        const due = [...callbacks.entries()];
        callbacks.clear();
        for (const [, callback] of due) callback();
        await microtask();
      }
    }
  };
}

function createTestPlayer(fixture, options = {}) {
  const pump = options.pump || makePump();
  let playCount = 0;
  const traces = [];
  const player = createAodScenePlayer({
    host: fixture.host,
    posterTimeoutMs: options.posterTimeoutMs ?? 100,
    playbackTimeoutMs: options.playbackTimeoutMs ?? 1000,
    stableDelayMs: options.stableDelayMs ?? 100000,
    deps: {
      mountMarkup: () => fixture.section,
      raf: pump.raf,
      caf: pump.caf,
      playVideo: options.playVideo || ((video) => {
        playCount += 1;
        video.paused = false;
        return Promise.resolve();
      })
    },
    onTrace: (entry) => traces.push(entry)
  });

  return {
    player,
    pump,
    traces,
    get playCount() { return playCount; }
  };
}

// Static contract -------------------------------------------------------------
{
  assert(existsSync(pagePath), 'scene-harness-aod.html exists');
  assert(existsSync(playerPath), 'js/scene-harness/aod-scene-player.js exists');

  const playerSource = await readFile(playerPath, 'utf8');
  const pageSource = await readFile(pagePath, 'utf8');

  for (const method of ['mount(', 'showPoster(', 'playForward(', 'cancelToSource(', 'reverseToPoster(', 'destroy()', 'getState()']) {
    assert(playerSource.includes(method), `player exposes ${method}`);
  }

  for (const forbidden of ['scrollY', 'pageYOffset', 'currentSceneId', 'location.hash', 'ScrollTrigger']) {
    assert(!playerSource.includes(forbidden), `aod-scene-player does not reference ${forbidden}`);
  }
  for (const forbidden of ['ink-scene-transition', 'createInkCurtainTransition', 'data-aod-ink-canvas', 'aod-transition__ink']) {
    assert(!playerSource.includes(forbidden), `aod-scene-player does not include ink transition wiring: ${forbidden}`);
  }

  assert(pageSource.includes('./js/scene-harness/aod-scene-player.js'), 'standalone page imports harness player');
  assert(pageSource.includes('data-action="reject"'), 'standalone page exposes simulated play reject action');
  assert(
    JSON.stringify(AOD_SCENE_TRACE_STATES) === JSON.stringify(['idle', 'mounted', 'poster', 'playing-forward', 'complete', 'stable', 'destroyed']),
    'success trace states are fixed'
  );
}

// Mount + poster gate: no autoplay ------------------------------------------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture);
  await harness.player.mount({ host: fixture.host });
  assert(harness.player.getState().state === 'mounted', 'mount enters mounted state');
  assert(harness.playCount === 0, 'mount does not start media playback');

  await harness.player.showPoster({ direction: 'forward' });
  assert(harness.player.getState().state === 'poster', 'showPoster enters poster state');
  assert(harness.playCount === 0, 'showPoster does not start media playback');
  assert(fixture.video.pauseCount > 0, 'poster gate pauses media');
  assert(fixture.video.writes.every((value) => value === 0), 'poster gate only seeks to frame 0');
}

// Playback: progress, early-copy once, complete once -------------------------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture);
  const progressEvents = [];
  const traceEvents = [];
  await harness.player.mount({ host: fixture.host });
  await harness.player.showPoster({});

  const done = harness.player.playForward({
    onProgress: (progressValue) => progressEvents.push(progressValue),
    onTrace: (entry) => traceEvents.push(entry)
  });
  await microtask();
  await microtask();

  fixture.video.advance(2);
  await harness.pump.run(1);
  assert(harness.player.getState().state === 'playing-forward', 'playForward enters playing-forward state');
  assert(progressEvents.some((value) => value > 0.35 && value < 0.45), 'onProgress reports normalized playback progress');

  fixture.video.advance(4.1);
  await harness.pump.run(1);
  fixture.video.advance(4.2);
  await harness.pump.run(1);

  const earlyCopyEvents = traceEvents.filter((entry) => entry.type === 'early-copy-ready');
  assert(earlyCopyEvents.length === 1, '80% early-copy event fires exactly once');
  assert(earlyCopyEvents[0]?.target === 'method-top', '80% event targets method-top');
  assert(earlyCopyEvents[0]?.event === 'early-copy-ready: method-top', '80% event includes exact early-copy trace payload');
  assert(
    fixture.events.filter((entry) => entry?.type === 'early-copy-ready' && entry?.target === 'method-top').length === 1,
    '80% early-copy dispatches exactly one host event'
  );

  fixture.video.advance(5);
  fixture.video.dispatch('ended');
  await done;

  const completeEvents = traceEvents.filter((entry) => entry.type === 'complete');
  assert(completeEvents.length === 1, 'complete trace fires exactly once');
  assert(harness.player.getState().completeFired, 'complete flag is set after ended');
  assert(fixture.video.listenerCount('ended') === 0, 'ended listener removed after complete cleanup');
  assert(fixture.video.listenerCount('error') === 0, 'error listener removed after complete cleanup');
}

// ended can arrive before the next RAF: early-copy still fires once -----------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture);
  const traceEvents = [];
  await harness.player.mount({ host: fixture.host });
  await harness.player.showPoster({});

  const done = harness.player.playForward({
    onTrace: (entry) => traceEvents.push(entry)
  });
  await microtask();
  await microtask();

  fixture.video.advance(5);
  fixture.video.dispatch('ended');
  await done;

  assert(harness.pump.pending() === 0, 'ended fast path cancels pending RAF');
  assert(harness.player.getState().earlyCopyFired, 'ended fast path sets early-copy flag');
  assert(traceEvents.filter((entry) => entry.type === 'early-copy-ready').length === 1, 'ended fast path emits early-copy once');
  assert(traceEvents.filter((entry) => entry.type === 'complete').length === 1, 'ended fast path emits complete once');
}

// Successful trace can settle to stable and then destroy ----------------------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture, { stableDelayMs: 1 });
  await harness.player.mount({ host: fixture.host });
  await harness.player.showPoster({});

  const done = harness.player.playForward({});
  await microtask();
  await microtask();
  fixture.video.advance(5);
  fixture.video.dispatch('ended');
  await done;
  await new Promise((resolve) => setTimeout(resolve, 5));
  harness.player.destroy();

  const states = harness.player.getState().trace
    .filter((entry) => AOD_SCENE_TRACE_STATES.includes(entry.type))
    .map((entry) => entry.type);
  assert(
    states.join(' -> ') === AOD_SCENE_TRACE_STATES.join(' -> '),
    `success trace follows fixed state order (got ${states.join(' -> ')})`
  );
  assert(fixture.host.cleared, 'destroy after complete empties owned host');
}

// cancelToSource can cancel playForward while poster gate is pending ----------
{
  const fixture = makeFixture({ readyState: 0 });
  const harness = createTestPlayer(fixture);
  let playResult = null;

  const playPromise = harness.player.playForward({}).then((result) => {
    playResult = result;
  });
  await microtask();
  await microtask();

  await harness.player.cancelToSource({});
  await playPromise;

  fixture.video.readyState = 2;
  fixture.video.dispatch('loadedmetadata');
  fixture.video.dispatch('canplay');
  await microtask();
  await microtask();

  assert(playResult?.cancelled && playResult.reason === 'cancel-to-source', 'cancelToSource resolves poster-gate playForward as cancelled');
  assert(harness.playCount === 0, 'cancelled poster-gate playForward never starts media playback');
  assert(harness.player.getState().state === 'poster', 'cancelled poster-gate playForward stays at poster');
  assert(harness.pump.pending() === 0, 'cancelled poster-gate playForward leaves no RAF loop');
}

// already-aborted playForward signal does not start playback -----------------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture);
  await harness.player.mount({ host: fixture.host });
  await harness.player.showPoster({});

  const controller = new AbortController();
  controller.abort();
  const result = await harness.player.playForward({ signal: controller.signal });

  assert(result.cancelled && result.reason === 'signal-abort', 'already-aborted playForward resolves as signal-abort cancellation');
  assert(harness.playCount === 0, 'already-aborted playForward never starts media playback');
  assert(harness.player.getState().state === 'poster', 'already-aborted playForward keeps poster state');
  assert(harness.pump.pending() === 0, 'already-aborted playForward leaves no RAF loop');
}

// Accepted fallback completion when ended never fires -------------------------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture);
  await harness.player.mount({ host: fixture.host });
  await harness.player.showPoster({});

  const done = harness.player.playForward({});
  await microtask();
  await microtask();
  fixture.video.advance(5);
  await harness.pump.run(1);
  const result = await done;

  assert(result.reason === 'accepted-fallback', 'time-threshold fallback completes when ended never fires');
  assert(harness.traces.filter((entry) => entry.type === 'complete').length === 1, 'fallback complete fires once');
}

// cancelToSource: pause, poster reset, no dangling playback -------------------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture);
  await harness.player.mount({ host: fixture.host });
  await harness.player.showPoster({});

  const playPromise = harness.player.playForward({});
  await microtask();
  await microtask();
  fixture.video.advance(2.5);
  await harness.pump.run(1);

  await harness.player.cancelToSource({});
  const result = await playPromise;

  assert(result.cancelled && result.reason === 'cancel-to-source', 'cancelToSource resolves active playback as cancelled');
  assert(harness.player.getState().state === 'poster', 'cancelToSource restores poster state');
  assert(harness.player.getState().progress === 0, 'cancelToSource resets progress');
  assert(fixture.video.pauseCount > 0, 'cancelToSource pauses video');
  assert(harness.pump.pending() === 0, 'cancelToSource cancels RAF loop');
  assert(fixture.video.listenerCount('ended') === 0, 'cancelToSource removes ended listener');
  assert(fixture.video.listenerCount('error') === 0, 'cancelToSource removes error listener');
}

// Reject path: failed-clean and paused media ---------------------------------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture, {
    playVideo: () => Promise.reject(new Error('Simulated play reject'))
  });
  await harness.player.mount({ host: fixture.host });
  await harness.player.showPoster({});

  let rejected = false;
  await harness.player.playForward({}).catch((error) => {
    rejected = /Simulated play reject/.test(error.message);
  });

  assert(rejected, 'play reject propagates to caller');
  assert(harness.player.getState().state === 'failed-clean', 'play reject enters failed-clean state');
  assert(fixture.video.pauseCount > 0, 'play reject cleanup pauses video');
  assert(harness.pump.pending() === 0, 'play reject leaves no RAF loop');
}

// Timeout path: failed-clean and no dangling playback -------------------------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture, {
    playbackTimeoutMs: 5
  });
  await harness.player.mount({ host: fixture.host });
  await harness.player.showPoster({});

  let rejected = false;
  await harness.player.playForward({}).catch((error) => {
    rejected = /timed out/.test(error.message);
  });

  assert(rejected, 'playback timeout rejects');
  assert(harness.player.getState().state === 'failed-clean', 'playback timeout enters failed-clean state');
  assert(fixture.video.pauseCount > 0, 'playback timeout cleanup pauses video');
  assert(harness.pump.pending() === 0, 'playback timeout leaves no RAF loop');
}

// destroy: owned host emptied -------------------------------------------------
{
  const fixture = makeFixture();
  const harness = createTestPlayer(fixture);
  await harness.player.mount({ host: fixture.host });
  await harness.player.showPoster({});
  const state = harness.player.destroy();

  assert(state.state === 'destroyed', 'destroy enters destroyed state');
  assert(fixture.host.cleared, 'destroy empties owned host');
  assert(fixture.video.pauseCount > 0, 'destroy pauses video');
}

console.log(`aod-scene-harness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
