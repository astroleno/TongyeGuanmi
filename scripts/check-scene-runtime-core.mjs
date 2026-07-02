#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LayerOwnership } from '../js/scene-runtime/LayerOwnership.js';
import { Presentation } from '../js/scene-runtime/Presentation.js';
import { ReadMonitor } from '../js/scene-runtime/ReadMonitor.js';
import { SceneRuntimeCore } from '../js/scene-runtime/SceneRuntimeCore.js';
import { SceneRegistry } from '../js/scene-runtime/SceneRegistry.js';
import { ScrollIntent } from '../js/scene-runtime/ScrollIntent.js';
import {
  TransitionSegmentPlayer,
  TransitionSegmentTimeoutError
} from '../js/scene-runtime/TransitionSegmentPlayer.js';
import { SceneAdapterTimeoutError } from '../js/scene-runtime/ScenePlayerAdapter.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const routeScenes = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'method-bottom'
];

class FakeScenePlayer {
  constructor({
    sceneId,
    playDelayMs = 10,
    rejectPlay = false,
    rejectAfterMilestone = false,
    neverResolve = false,
    milestone = null
  } = {}) {
    this.sceneId = sceneId;
    this.playDelayMs = playDelayMs;
    this.rejectPlay = rejectPlay;
    this.rejectAfterMilestone = rejectAfterMilestone;
    this.neverResolve = neverResolve;
    this.milestone = milestone;
    this.state = 'idle';
    this.calls = [];
    this.timers = new Set();
  }

  remember(methodName, signal) {
    this.calls.push([methodName, signal instanceof AbortSignal]);
    assert(signal instanceof AbortSignal, `${this.sceneId}.${methodName} receives AbortSignal`);
  }

  clearTimers() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  schedule(callback, delayMs) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delayMs);
    this.timers.add(timer);
    return timer;
  }

  async mount({ signal } = {}) {
    this.remember('mount', signal);
    this.state = 'mounted';
    return { completed: true };
  }

  async showPoster({ signal } = {}) {
    this.remember('showPoster', signal);
    this.state = 'poster';
    return { completed: true };
  }

  playForward({ signal, onTrace, onProgress } = {}) {
    this.remember('playForward', signal);
    this.state = 'playing-forward';
    onTrace?.({ type: 'playing-forward', sceneId: this.sceneId });
    if (this.rejectPlay) return Promise.reject(new Error(`${this.sceneId} rejected`));
    if (this.neverResolve && !this.milestone) return new Promise(() => {});

    return new Promise((resolve, reject) => {
      const finish = (result) => {
        this.clearTimers();
        resolve(result);
      };
      const fail = (error) => {
        this.clearTimers();
        reject(error);
      };
      signal.addEventListener('abort', () => {
        this.state = 'poster';
        finish({ completed: false, cancelled: true, reason: 'aborted' });
      }, { once: true });

      if (this.milestone) {
        this.schedule(() => {
          onProgress?.(0.8);
          onTrace?.({ type: 'milestone', milestone: this.milestone, progress: 0.8 });
          if (this.rejectAfterMilestone) fail(new Error(`${this.sceneId} rejected after milestone`));
        }, Math.max(1, Math.floor(this.playDelayMs / 3)));
      }
      if (!this.neverResolve) {
        this.schedule(() => {
          this.state = 'stable';
          onProgress?.(1);
          onTrace?.({ type: 'complete', sceneId: this.sceneId });
          onTrace?.({ type: 'stable', sceneId: this.sceneId });
          finish({ completed: true });
        }, this.playDelayMs);
      }
    });
  }

  async cancelToSource({ signal } = {}) {
    this.remember('cancelToSource', signal);
    this.clearTimers();
    this.state = 'poster';
    return { completed: false, cancelled: true };
  }

  async reverseToPoster({ signal } = {}) {
    this.remember('reverseToPoster', signal);
    this.clearTimers();
    this.state = 'poster';
    return { completed: true };
  }

  async destroy({ signal } = {}) {
    this.remember('destroy', signal);
    this.clearTimers();
    this.state = 'destroyed';
    return { completed: true };
  }

  getState() {
    return { status: this.state, calls: this.calls.slice() };
  }
}

function createFakeRegistry(overrides = {}) {
  const instances = new Map();
  const entries = routeScenes.map((sceneId) => ({
    sceneId,
    createPlayer() {
      const player = new FakeScenePlayer({
        sceneId,
        milestone: sceneId === 'aod-animation' ? 'early-copy-ready' : null,
        ...(overrides[sceneId] || {})
      });
      instances.set(sceneId, player);
      return player;
    },
    timeouts: overrides[sceneId]?.timeouts,
    milestones: sceneId === 'aod-animation'
      ? { 'early-copy-ready': { revealSceneId: 'method-top', atProgress: 0.8 } }
      : {}
  }));
  return {
    registry: new SceneRegistry(entries),
    instances
  };
}

function createRuntime(options = {}) {
  const { registry, instances } = createFakeRegistry(options.sceneOverrides || {});
  const runtime = new SceneRuntimeCore({
    registry,
    presentation: new Presentation(),
    scrollIntent: new ScrollIntent({ viewportHeight: 1000 }),
    readMonitor: new ReadMonitor({ viewportHeight: 1000 }),
    transitionPlayer: new TransitionSegmentPlayer(options.transition || {}),
    ownership: new LayerOwnership(),
    timeouts: {
      transition: 80,
      scene: 80,
      ...(options.timeouts || {})
    }
  });
  return { runtime, instances };
}

function presentOrder(runtime) {
  return runtime.presentation.snapshot().trace
    .filter((entry) => entry.type === 'present')
    .map((entry) => entry.sceneId);
}

async function assertForwardHappyPath() {
  const { runtime } = createRuntime();
  await runtime.initialize('hero');
  await runtime.advance();
  assert.equal(runtime.snapshot().presentation.current, 'pattern', 'hero transition presents pattern');
  await runtime.advance();
  assert.equal(runtime.snapshot().presentation.current, 'star-map', 'pattern transition presents star-map');
  await runtime.advance();
  assert.equal(runtime.snapshot().presentation.current, 'aod-animation', 'star-map transition presents aod');
  await runtime.advance();
  assert.equal(runtime.snapshot().presentation.current, 'method-top', 'aod complete presents method-top');
  assert.deepEqual(runtime.snapshot().presentation.earlyCopies, [], 'aod commit clears early copy');

  let readResult = await runtime.handleReadInput({
    scrollTop: 200,
    scrollHeight: 1200,
    clientHeight: 700,
    deltaY: 500
  });
  assert.equal(readResult.type, 'reading', 'reading scene does not advance before bottom');
  assert.equal(runtime.snapshot().presentation.current, 'method-top', 'method-top remains current while reading');

  readResult = await runtime.handleReadInput({
    scrollTop: 500,
    scrollHeight: 1200,
    clientHeight: 700,
    deltaY: 50
  });
  assert.equal(readResult.type, 'reading', 'bottom needs additional 10vh intent');
  assert.equal(runtime.snapshot().presentation.current, 'method-top', 'under 10vh after bottom does not advance');

  readResult = await runtime.handleReadInput({
    scrollTop: 500,
    scrollHeight: 1200,
    clientHeight: 700,
    deltaY: 60
  });
  assert.equal(readResult.type, 'next', 'bottom plus additional 10vh advances reading scene');
  assert.equal(runtime.snapshot().presentation.current, 'method-bottom', 'reading boundary presents method-bottom');

  await runtime.advance();
  assert.equal(runtime.snapshot().presentation.current, 'method-bottom', 'method-bottom exit transition keeps stable scene');
  assert.deepEqual(
    presentOrder(runtime),
    ['hero', 'pattern', 'star-map', 'aod-animation', 'method-top', 'method-bottom'],
    'presentation commits only the expected stable route scenes'
  );
  assert.deepEqual(runtime.snapshot().ownership.owners, {}, 'happy path releases all layer owners');
  assert(
    runtime.trace.some((entry) => entry.state === 'TRANSITIONING' && entry.segmentId === 'center-ink-expand'),
    'center-ink-expand transition is owned by transition player'
  );
  assert(
    runtime.trace.some((entry) => entry.state === 'TRANSITIONING' && entry.segmentId === 'left-rotate-bloom'),
    'left-rotate-bloom transition is owned by transition player'
  );
  assert(
    runtime.trace.filter((entry) => entry.state === 'TRANSITIONING' && entry.segmentId === 'bottom-to-top-ink').length >= 2,
    'bottom-to-top-ink transition covers star-map to aod and method-bottom exit'
  );
}

async function assertReverseCancelAndScrollIntent() {
  const { runtime } = createRuntime();
  await runtime.initialize('hero');
  const first = runtime.inputScroll({ type: 'wheel', deltaY: 100 });
  assert.equal(first.type, 'intent', '10vh wheel creates intent');
  assert.equal(runtime.snapshot().state, 'ARMED', 'intent only arms the runtime');
  const reverse = runtime.inputScroll({ type: 'wheel', deltaY: -20 });
  assert.equal(reverse.type, 'cancel-armed', 'reverse wheel cancels armed attempt');
  assert.equal(runtime.snapshot().state, 'IDLE', 'reverse cancel returns runtime to idle');
  assert.equal(runtime.snapshot().presentation.current, 'hero', 'reverse cancel does not commit target');

  const intent = new ScrollIntent({ viewportHeight: 1000, decayVh: 2 });
  assert.equal(intent.input({ type: 'wheel', deltaY: 60 }).type, 'pending', 'under threshold does not trigger');
  intent.tick({ elapsedMs: 120 });
  assert(intent.snapshot().accumulatedVh < 6, 'under-threshold intent decays');
  assert.equal(intent.input({ type: 'wheel', deltaY: 30 }).type, 'pending', 'decayed residue still stays under threshold');

  const touchIntent = new ScrollIntent({ viewportHeight: 1000, touchInertiaMs: 300 });
  touchIntent.input({ type: 'touchend', at: 1000 });
  assert.equal(
    touchIntent.input({ type: 'wheel', deltaY: 300, at: 1100 }).type,
    'ignored-inertia',
    'touch inertia wheel is ignored'
  );
  assert.equal(touchIntent.snapshot().accumulatedPx, 0, 'touch inertia does not accumulate');
}

async function assertStaleCallbacksCannotCommit() {
  const { runtime } = createRuntime({
    transition: { defaultDurationMs: 60 }
  });
  await runtime.initialize('hero');
  const running = runtime.advance();
  await wait(5);
  const staleAttempt = runtime.snapshot().activeAttempt;
  runtime.reverse('reverse-during-transition');
  await assert.rejects(running, /reverse-during-transition/, 'reverse aborts active transition');
  await wait(80);
  assert.equal(runtime.snapshot().presentation.current, 'hero', 'stale transition cannot present pattern');

  runtime.handleAsyncTrace(staleAttempt, { type: 'transition', phase: 'ended' });
  runtime.handleAsyncTrace(staleAttempt, { type: 'transition-progress', progress: 1 });
  runtime.handleAsyncTrace(staleAttempt, { type: 'transition', phase: 'reject' });
  runtime.handleSceneTrace(staleAttempt, { type: 'milestone', milestone: 'early-copy-ready' });
  const staleCount = runtime.snapshot().trace.filter((entry) => entry.type === 'stale-callback').length;
  assert(staleCount >= 4, 'stale ended/progress/reject/milestone callbacks are discarded');
  assert.deepEqual(runtime.snapshot().presentation.earlyCopies, [], 'stale milestone cannot reveal early copy');
}

async function assertPlayerRejectTimeoutAndEarlyRollback() {
  const rejectRuntime = createRuntime({
    sceneOverrides: {
      'aod-animation': {
        rejectAfterMilestone: true,
        playDelayMs: 30
      }
    }
  }).runtime;
  await rejectRuntime.initialize('aod-animation');
  await assert.rejects(
    rejectRuntime.advance(),
    /aod-animation rejected after milestone/,
    'scene player reject is surfaced'
  );
  assert.equal(rejectRuntime.snapshot().presentation.current, 'aod-animation', 'player reject recovers to source');
  assert.deepEqual(rejectRuntime.snapshot().presentation.earlyCopies, [], 'player reject clears early copy');
  assert.deepEqual(rejectRuntime.snapshot().presentation.reveals, [], 'player reject clears active reveals');
  assert.deepEqual(rejectRuntime.snapshot().ownership.owners, {}, 'player reject releases owners');
  assert.equal(rejectRuntime.snapshot().state, 'IDLE', 'player reject releases runtime');

  const timeoutRuntime = createRuntime({
    sceneOverrides: {
      'aod-animation': {
        milestone: 'early-copy-ready',
        neverResolve: true
      }
    },
    timeouts: { scene: 20 }
  }).runtime;
  await timeoutRuntime.initialize('aod-animation');
  await assert.rejects(
    timeoutRuntime.advance(),
    (error) => error instanceof SceneAdapterTimeoutError,
    'scene player timeout is surfaced'
  );
  assert.equal(timeoutRuntime.snapshot().presentation.current, 'aod-animation', 'player timeout recovers to source');
  assert.deepEqual(timeoutRuntime.snapshot().presentation.earlyCopies, [], 'player timeout clears early copy');
  assert.deepEqual(timeoutRuntime.snapshot().ownership.owners, {}, 'player timeout releases owners');
}

async function assertTransitionRejectAndTimeout() {
  const rejectRuntime = createRuntime({
    transition: {
      behavior: {
        'center-ink-expand': { reject: true, rejectMessage: 'transition failed' }
      }
    }
  }).runtime;
  await rejectRuntime.initialize('hero');
  await assert.rejects(rejectRuntime.advance(), /transition failed/, 'transition reject is surfaced');
  assert.equal(rejectRuntime.snapshot().presentation.current, 'hero', 'transition reject does not present target');
  assert.deepEqual(rejectRuntime.snapshot().ownership.owners, {}, 'transition reject releases owners');

  const timeoutRuntime = createRuntime({
    transition: {
      behavior: {
        'center-ink-expand': { neverResolve: true }
      }
    },
    timeouts: { transition: 15 }
  }).runtime;
  await timeoutRuntime.initialize('hero');
  await assert.rejects(
    timeoutRuntime.advance(),
    (error) => error instanceof TransitionSegmentTimeoutError,
    'transition timeout is surfaced'
  );
  assert.equal(timeoutRuntime.snapshot().presentation.current, 'hero', 'transition timeout recovers to source');
  assert.deepEqual(timeoutRuntime.snapshot().ownership.owners, {}, 'transition timeout releases owners');
}

function assertLayerConflict() {
  const ownership = new LayerOwnership();
  ownership.claim('transition', 'owner-a');
  assert.throws(
    () => ownership.claim('transition', 'owner-b'),
    /already owned by owner-a/,
    'same layer cannot have two owners'
  );
  ownership.release('transition', 'owner-a');
  assert.deepEqual(ownership.snapshot().owners, {}, 'layer owner can be released cleanly');
}

function assertNoRuntimeSideEffects() {
  const corePaths = [
    'js/scene-runtime/ScrollIntent.js',
    'js/scene-runtime/ReadMonitor.js',
    'js/scene-runtime/Presentation.js',
    'js/scene-runtime/LayerOwnership.js',
    'js/scene-runtime/TransitionSegmentPlayer.js',
    'js/scene-runtime/SceneRuntimeCore.js'
  ];
  const forbidden = [
    [/\bscrollY\b|\bpageYOffset\b/, 'read viewport scroll globals'],
    [/\bwindow\s*\.\s*(scroll|scrollTo|scrollBy)\b|\bscrollTo\s*\(/, 'drive viewport scroll'],
    [/\blocation\s*\.\s*hash\b|\bhashchange\b|\bhistory\s*\./, 'touch hash/history'],
    [/\bcurrentSceneId\b|data-current-scene|sceneRuntimeCurrent/i, 'write scene identity outside Presentation']
  ];
  for (const sourcePath of corePaths) {
    const source = read(sourcePath);
    for (const [pattern, description] of forbidden) {
      assert.doesNotMatch(source, pattern, `${sourcePath} must not ${description}`);
    }
  }
}

assertNoRuntimeSideEffects();
await assertForwardHappyPath();
await assertReverseCancelAndScrollIntent();
await assertStaleCallbacksCannotCommit();
await assertPlayerRejectTimeoutAndEarlyRollback();
await assertTransitionRejectAndTimeout();
assertLayerConflict();

console.log('scene runtime core checks passed.');
