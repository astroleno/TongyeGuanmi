#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCENE_PLAYER_TRACE_STATES,
  SceneAdapterTimeoutError,
  createScenePlayerAdapter
} from '../js/scene-runtime/ScenePlayerAdapter.js';
import { SceneRegistry, createDefaultSceneRegistry } from '../js/scene-runtime/SceneRegistry.js';
import { createMockSceneOrchestrator } from '../js/scene-runtime/MockSceneOrchestrator.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const providerPaths = [
  'js/scene-harness/hero-scene-player.js',
  'js/scene-harness/pattern-scene-player.js',
  'js/scene-harness/starmap-scene-player.js',
  'js/scene-harness/aod-scene-player.js'
];

function collectLocalDependencies(relativePath, seen = new Set()) {
  if (seen.has(relativePath)) return seen;
  seen.add(relativePath);

  const source = read(relativePath);
  const importPattern = /\bimport\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;

    const resolved = path.resolve(path.join(rootDir, path.dirname(relativePath)), specifier);
    const withExtension = path.extname(resolved) ? resolved : `${resolved}.js`;
    if (!withExtension.startsWith(rootDir) || !existsSync(withExtension)) continue;

    collectLocalDependencies(path.relative(rootDir, withExtension), seen);
  }

  return seen;
}

function stateTrace(adapter) {
  return adapter.getState().trace
    .filter((entry) => entry.type === 'state')
    .map((entry) => entry.phase);
}

function assertNoForbiddenProviderSideEffects() {
  const forbidden = [
    [/\bscrollY\b|\bpageYOffset\b/, 'read scroll position'],
    [/\bscrollTo\s*\(/, 'move page scroll'],
    [/\bcurrentSceneId\b|sceneRuntimeCurrent|data-current-scene/i, 'touch current scene identity'],
    [/\blocation\s*\.\s*hash\b|\bhashchange\b|\bhistory\s*\./, 'touch hash/history'],
    [/\blockScroll\b|\bunlockScroll\b|\breleaseScroll\b|\bscrollLock\b|scene-runtime-scroll-locked/i, 'lock/release scroll'],
    [/\bdocument\s*\.\s*(body|documentElement|scrollingElement)\b/, 'touch document-level scroll containers'],
    [/\bwindow\s*\.\s*(scroll|scrollTo|scrollBy)\b/, 'drive window scrolling']
  ];

  for (const sourcePath of providerPaths) {
    const source = read(sourcePath);
    for (const [pattern, description] of forbidden) {
      assert.doesNotMatch(source, pattern, `${sourcePath} must not ${description}`);
    }
  }

  const providerDependencyPaths = [...new Set(providerPaths.flatMap((sourcePath) => [
    ...collectLocalDependencies(sourcePath)
  ]))];

  for (const sourcePath of providerDependencyPaths) {
    assert.notEqual(
      sourcePath,
      'js/pattern-mirror-standalone.js',
      'provider import graph must not include standalone pattern bootstrap'
    );
  }

  assert.doesNotMatch(
    read('js/scene-harness/aod-scene-player.js'),
    /method-top/,
    'AOD player must not know the early-copy target scene'
  );
  assert.doesNotMatch(
    read('js/pattern-mirror-stage.js'),
    /initStandalonePatternBloom|documentRef\s*\.\s*body|document\s*\.\s*body/,
    'pattern renderer module must not auto-start or touch document.body on import'
  );
}

class FakeProvider {
  constructor({
    milestone = null,
    rejectPlay = false,
    rejectAfterMilestone = false,
    neverResolve = false,
    neverResolveAfterMilestone = false,
    rejectDestroy = false,
    neverDestroy = false,
    destroyDelayMs = 0,
    playDelayMs = 26
  } = {}) {
    this.milestone = milestone;
    this.rejectPlay = rejectPlay;
    this.rejectAfterMilestone = rejectAfterMilestone;
    this.neverResolve = neverResolve;
    this.neverResolveAfterMilestone = neverResolveAfterMilestone;
    this.rejectDestroy = rejectDestroy;
    this.neverDestroy = neverDestroy;
    this.destroyDelayMs = destroyDelayMs;
    this.playDelayMs = playDelayMs;
    this.state = 'idle';
    this.signals = [];
    this.calls = [];
    this.destroyCount = 0;
    this.timers = new Set();
    this.activeResolve = null;
    this.activeReject = null;
  }

  rememberSignal(signal, methodName) {
    this.calls.push([methodName, signal instanceof AbortSignal]);
    assert(signal instanceof AbortSignal, 'adapter passes an AbortSignal to every provider call');
    this.signals.push(signal);
  }

  emit(type, onTrace, detail = {}) {
    if (SCENE_PLAYER_TRACE_STATES.includes(type)) this.state = type;
    onTrace?.({ type, ...detail });
  }

  schedule(callback, delayMs) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delayMs);
    this.timers.add(timer);
    return timer;
  }

  clearTimers() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  async mount({ signal, onTrace } = {}) {
    this.rememberSignal(signal, 'mount');
    this.emit('mounted', onTrace);
    return { completed: true };
  }

  async showPoster({ signal, onTrace } = {}) {
    this.rememberSignal(signal, 'showPoster');
    this.emit('poster', onTrace);
    return { completed: true };
  }

  playForward({ signal, onTrace, onProgress } = {}) {
    this.rememberSignal(signal, 'playForward');
    this.emit('playing-forward', onTrace);
    if (this.rejectPlay) return Promise.reject(new Error('fake play reject'));
    if (this.neverResolve) return new Promise(() => {});

    return new Promise((resolve, reject) => {
      const settle = (result) => {
        this.clearTimers();
        this.activeResolve = null;
        this.activeReject = null;
        resolve(result);
      };
      const fail = (error) => {
        this.clearTimers();
        this.activeResolve = null;
        this.activeReject = null;
        reject(error);
      };
      this.activeResolve = settle;
      this.activeReject = fail;
      signal.addEventListener('abort', () => {
        this.emit('poster', onTrace, { reason: 'signal-abort' });
        settle({ completed: false, cancelled: true, reason: 'signal-abort' });
      }, { once: true });

      if (this.milestone) {
        this.schedule(() => {
          onProgress?.(0.8);
          this.emit(this.milestone, onTrace, {
            milestone: this.milestone,
            progress: 0.8
          });
          if (this.rejectAfterMilestone) {
            fail(new Error('fake play reject after milestone'));
          }
        }, Math.max(1, Math.floor(this.playDelayMs / 3)));
      }
      if (!this.neverResolveAfterMilestone) {
        this.schedule(() => {
          onProgress?.(1);
          this.emit('complete', onTrace);
          this.emit('stable', onTrace);
          settle({ completed: true });
        }, this.playDelayMs);
      }
    });
  }

  async cancelToSource({ signal, onTrace } = {}) {
    this.rememberSignal(signal, 'cancelToSource');
    this.clearTimers();
    this.emit('poster', onTrace, { reason: 'cancel-to-source' });
    this.activeResolve?.({ completed: false, cancelled: true, reason: 'cancel-to-source' });
    this.activeResolve = null;
    this.activeReject = null;
    return { completed: false, cancelled: true, reason: 'cancel-to-source' };
  }

  async reverseToPoster({ signal, onTrace } = {}) {
    this.rememberSignal(signal, 'reverseToPoster');
    this.clearTimers();
    this.emit('poster', onTrace, { reason: 'reverse-to-poster' });
    this.activeResolve?.({ completed: false, cancelled: true, reason: 'reverse-to-poster' });
    this.activeResolve = null;
    this.activeReject = null;
    return { completed: true };
  }

  destroy({ signal } = {}) {
    this.rememberSignal(signal, 'destroy');
    if (this.rejectDestroy) return Promise.reject(new Error('fake destroy reject'));
    if (this.neverDestroy) return new Promise(() => {});

    const completeDestroy = () => {
      this.destroyCount += 1;
      this.clearTimers();
      this.state = 'destroyed';
      this.activeResolve?.({ completed: false, cancelled: true, reason: 'destroyed' });
      this.activeResolve = null;
      this.activeReject = null;
      return this.getState();
    };

    if (this.destroyDelayMs > 0) {
      return new Promise((resolve) => {
        this.schedule(() => resolve(completeDestroy()), this.destroyDelayMs);
      });
    }

    return completeDestroy();
  }

  getState() {
    return {
      status: this.state,
      destroyCount: this.destroyCount
    };
  }
}

function fakeFactory(options = {}) {
  const instances = [];
  return {
    instances,
    createPlayer() {
      const instance = new FakeProvider(options);
      instances.push(instance);
      return instance;
    }
  };
}

async function assertAdapterLifecycle() {
  const factory = fakeFactory();
  const adapter = createScenePlayerAdapter({
    sceneId: 'fake',
    createPlayer: factory.createPlayer,
    timeouts: { playForward: 500 }
  });

  await adapter.mount({ host: { id: 'host' } });
  await adapter.showPoster({});
  await adapter.playForward({});
  await adapter.destroy();
  await adapter.destroy();

  assert.deepEqual(
    stateTrace(adapter),
    ['idle', 'mounted', 'poster', 'playing-forward', 'complete', 'stable', 'destroyed'],
    'adapter state trace follows the unified lifecycle order'
  );
  assert.equal(factory.instances[0].destroyCount, 1, 'adapter destroy() is idempotent');
  assert(factory.instances[0].signals.every((signal) => signal instanceof AbortSignal), 'all calls received AbortSignal');
}

async function assertAdapterTimeoutAndReject() {
  const timeoutFactory = fakeFactory({ neverResolve: true });
  const timeoutAdapter = createScenePlayerAdapter({
    sceneId: 'timeout',
    createPlayer: timeoutFactory.createPlayer,
    timeouts: { playForward: 15 }
  });
  await timeoutAdapter.mount({ host: {} });
  await timeoutAdapter.showPoster({});
  await assert.rejects(
    timeoutAdapter.playForward({}),
    (error) => error instanceof SceneAdapterTimeoutError,
    'adapter rejects on provider timeout'
  );
  assert(timeoutFactory.instances[0].signals.at(-1).aborted, 'timeout aborts provider signal');
  assert.equal(timeoutAdapter.getState().phase, 'poster', 'timeout returns adapter to poster phase');

  const rejectFactory = fakeFactory({ rejectPlay: true });
  const rejectAdapter = createScenePlayerAdapter({
    sceneId: 'reject',
    createPlayer: rejectFactory.createPlayer
  });
  await rejectAdapter.mount({ host: {} });
  await rejectAdapter.showPoster({});
  await assert.rejects(rejectAdapter.playForward({}), /fake play reject/, 'adapter propagates provider rejects');
  assert.equal(rejectAdapter.getState().phase, 'poster', 'provider reject returns adapter to poster phase');
}

async function assertDestroySignalTimeoutAndNoRevive() {
  const factory = fakeFactory({ destroyDelayMs: 4 });
  const adapter = createScenePlayerAdapter({
    sceneId: 'destroyable',
    createPlayer: factory.createPlayer,
    timeouts: { destroy: 100 }
  });
  await adapter.mount({ host: {} });
  await adapter.showPoster({});
  await adapter.destroy();

  const provider = factory.instances[0];
  const callCount = provider.calls.length;
  assert(provider.calls.some(([methodName, hasSignal]) => methodName === 'destroy' && hasSignal), 'destroy receives AbortSignal');
  assert.equal(adapter.getState().phase, 'destroyed', 'destroy leaves adapter destroyed');
  assert.equal(adapter.getState().destroyed, true, 'destroyed flag remains true');

  await adapter.destroy();
  assert.equal(provider.calls.length, callCount, 'destroy after destroyed is idempotent');

  for (const [methodName, args] of [
    ['mount', { host: {} }],
    ['showPoster', {}],
    ['playForward', {}],
    ['cancelToSource', {}],
    ['reverseToPoster', {}]
  ]) {
    await assert.rejects(
      adapter[methodName](args),
      /is destroyed/,
      `${methodName} cannot revive a destroyed adapter`
    );
  }
  assert.equal(provider.calls.length, callCount, 'destroyed adapter does not call provider again');
  assert.equal(adapter.getState().phase, 'destroyed', 'failed revive attempts keep destroyed phase');
  assert.equal(adapter.getState().destroyed, true, 'failed revive attempts keep destroyed flag');

  const timeoutFactory = fakeFactory({ neverDestroy: true });
  const timeoutAdapter = createScenePlayerAdapter({
    sceneId: 'destroy-timeout',
    createPlayer: timeoutFactory.createPlayer,
    timeouts: { destroy: 8 }
  });
  await timeoutAdapter.mount({ host: {} });
  await assert.rejects(
    timeoutAdapter.destroy(),
    (error) => error instanceof SceneAdapterTimeoutError,
    'destroy timeout rejects with SceneAdapterTimeoutError'
  );
  assert(timeoutFactory.instances[0].signals.at(-1).aborted, 'destroy timeout aborts provider signal');
  assert.equal(timeoutAdapter.getState().phase, 'destroyed', 'destroy timeout still closes adapter state');
  assert.equal(timeoutAdapter.getState().destroyed, true, 'destroy timeout does not leave adapter revivable');
}

async function assertRegistryAndOrchestrator() {
  const defaultRegistry = createDefaultSceneRegistry();
  assert.deepEqual(
    defaultRegistry.listSceneIds(),
    ['hero', 'pattern', 'star-map', 'aod-animation'],
    'default registry registers the four provider scenes'
  );
  assert.equal(
    defaultRegistry.resolveMilestone('aod-animation', 'early-copy-ready')?.revealSceneId,
    'method-top',
    'AOD early-copy-ready maps to method-top in the registry manifest'
  );

  const aodFactory = fakeFactory({ milestone: 'early-copy-ready', playDelayMs: 36 });
  const patternFactory = fakeFactory({ playDelayMs: 36 });
  const registry = new SceneRegistry([
    {
      sceneId: 'aod-animation',
      createPlayer: aodFactory.createPlayer,
      milestones: { 'early-copy-ready': { revealSceneId: 'method-top', atProgress: 0.8 } }
    },
    {
      sceneId: 'pattern',
      createPlayer: patternFactory.createPlayer,
      milestones: {}
    }
  ]);

  const orchestrator = createMockSceneOrchestrator({ registry });
  await orchestrator.mount('aod-animation', { host: {} });
  await orchestrator.showPoster('aod-animation');
  await orchestrator.mount('pattern', { host: {} });
  await orchestrator.showPoster('pattern');

  const playAod = orchestrator.playForward('aod-animation');
  await assert.rejects(
    orchestrator.playForward('pattern'),
    /Active player already running: aod-animation/,
    'mock orchestrator enforces at most one active player'
  );
  await playAod;

  assert.deepEqual(
    orchestrator.getState().reveals,
    [{
      sceneId: 'aod-animation',
      milestone: 'early-copy-ready',
      revealSceneId: 'method-top',
      atProgress: 0.8
    }],
    'orchestrator, not AOD player, maps the 80% milestone to method-top'
  );
  const milestone = orchestrator.getState().trace.find((entry) => entry.type === 'milestone');
  assert(milestone, 'adapter emits AOD milestone trace');
  assert(!('target' in milestone) && !('targetSceneId' in milestone), 'milestone trace does not leak target scene');
}

async function assertCancelAndReverseDoNotResurrectOldScenes() {
  const factory = fakeFactory({ milestone: 'early-copy-ready', playDelayMs: 45 });
  const registry = new SceneRegistry([
    {
      sceneId: 'aod-animation',
      createPlayer: factory.createPlayer,
      milestones: { 'early-copy-ready': { revealSceneId: 'method-top', atProgress: 0.8 } }
    }
  ]);
  const orchestrator = createMockSceneOrchestrator({ registry });
  await orchestrator.mount('aod-animation', { host: {} });
  await orchestrator.showPoster('aod-animation');

  const play = orchestrator.playForward('aod-animation');
  await wait(3);
  await orchestrator.cancelActiveToSource();
  const result = await play;
  assert(result.cancelled, 'cancel resolves active play as cancelled');
  await wait(60);

  const afterCancel = orchestrator.getState();
  assert.equal(afterCancel.activePlayerSceneId, null, 'cancel clears active player');
  assert.equal(afterCancel.reveals.length, 0, 'cancel before 80% does not reveal method-top');
  assert(
    !afterCancel.trace.some((entry) => entry.phase === 'complete' || entry.phase === 'stable'),
    'cancelled play does not emit late complete/stable'
  );

  await orchestrator.reverseToPoster('aod-animation');
  await wait(20);
  assert.equal(orchestrator.getState().activePlayerSceneId, null, 'reverse clears active player');
  assert.equal(factory.instances[0].getState().status, 'poster', 'reverse leaves provider at poster');
  await orchestrator.destroy();
  await orchestrator.destroy();
  assert.equal(factory.instances[0].destroyCount, 1, 'orchestrator destroy is idempotent through adapter');
}

async function assertRevealClearsAfterMilestoneCancelAndReverse() {
  const cancelFactory = fakeFactory({ milestone: 'early-copy-ready', playDelayMs: 90 });
  const cancelRegistry = new SceneRegistry([
    {
      sceneId: 'aod-animation',
      createPlayer: cancelFactory.createPlayer,
      milestones: { 'early-copy-ready': { revealSceneId: 'method-top', atProgress: 0.8 } }
    }
  ]);
  const cancelOrchestrator = createMockSceneOrchestrator({ registry: cancelRegistry });
  await cancelOrchestrator.mount('aod-animation', { host: {} });
  await cancelOrchestrator.showPoster('aod-animation');
  const cancelPlay = cancelOrchestrator.playForward('aod-animation');
  await wait(40);
  assert.equal(cancelOrchestrator.getState().reveals.length, 1, 'milestone reveal is registered before cancel');
  await cancelOrchestrator.cancelActiveToSource();
  const cancelResult = await cancelPlay;
  assert(cancelResult.cancelled, 'cancel after milestone resolves active play as cancelled');
  await wait(80);
  assert.equal(cancelOrchestrator.getState().reveals.length, 0, 'cancel after milestone clears reveal');
  assert(
    cancelOrchestrator.getState().trace.some((entry) => entry.type === 'reveal-clear' && entry.reason === 'cancel-to-source'),
    'cancel emits reveal-clear trace'
  );
  assert(
    !cancelOrchestrator.getState().trace.some((entry) => entry.phase === 'complete' || entry.phase === 'stable'),
    'cancel after milestone does not emit late complete/stable'
  );

  const reverseFactory = fakeFactory({ milestone: 'early-copy-ready', playDelayMs: 90 });
  const reverseRegistry = new SceneRegistry([
    {
      sceneId: 'aod-animation',
      createPlayer: reverseFactory.createPlayer,
      milestones: { 'early-copy-ready': { revealSceneId: 'method-top', atProgress: 0.8 } }
    }
  ]);
  const reverseOrchestrator = createMockSceneOrchestrator({ registry: reverseRegistry });
  await reverseOrchestrator.mount('aod-animation', { host: {} });
  await reverseOrchestrator.showPoster('aod-animation');
  const reversePlay = reverseOrchestrator.playForward('aod-animation');
  await wait(40);
  assert.equal(reverseOrchestrator.getState().reveals.length, 1, 'milestone reveal is registered before reverse');
  await reverseOrchestrator.reverseToPoster('aod-animation');
  const reverseResult = await reversePlay;
  assert(reverseResult.cancelled, 'reverse after milestone resolves active play as cancelled');
  await wait(80);
  assert.equal(reverseOrchestrator.getState().reveals.length, 0, 'reverse after milestone clears reveal');
  assert(
    reverseOrchestrator.getState().trace.some((entry) => entry.type === 'reveal-clear' && entry.reason === 'reverse-to-poster'),
    'reverse emits reveal-clear trace'
  );
}

async function assertRevealClearsAfterMilestoneFailure() {
  const rejectFactory = fakeFactory({
    milestone: 'early-copy-ready',
    rejectAfterMilestone: true,
    playDelayMs: 90
  });
  const rejectRegistry = new SceneRegistry([
    {
      sceneId: 'aod-animation',
      createPlayer: rejectFactory.createPlayer,
      milestones: { 'early-copy-ready': { revealSceneId: 'method-top', atProgress: 0.8 } }
    }
  ]);
  const rejectOrchestrator = createMockSceneOrchestrator({ registry: rejectRegistry });
  await rejectOrchestrator.mount('aod-animation', { host: {} });
  await rejectOrchestrator.showPoster('aod-animation');
  await assert.rejects(
    rejectOrchestrator.playForward('aod-animation'),
    /fake play reject after milestone/,
    'play reject after milestone is surfaced'
  );
  assert.equal(rejectOrchestrator.getState().reveals.length, 0, 'reject after milestone clears reveal');
  assert(
    rejectOrchestrator.getState().trace.some((entry) => (
      entry.type === 'reveal-clear'
      && entry.reason === 'play-forward-failed'
      && entry.removed?.[0]?.revealSceneId === 'method-top'
    )),
    'reject after milestone emits reveal-clear trace'
  );

  const timeoutFactory = fakeFactory({
    milestone: 'early-copy-ready',
    neverResolveAfterMilestone: true,
    playDelayMs: 90
  });
  const timeoutRegistry = new SceneRegistry([
    {
      sceneId: 'aod-animation',
      createPlayer: timeoutFactory.createPlayer,
      timeouts: { playForward: 50 },
      milestones: { 'early-copy-ready': { revealSceneId: 'method-top', atProgress: 0.8 } }
    }
  ]);
  const timeoutOrchestrator = createMockSceneOrchestrator({ registry: timeoutRegistry });
  await timeoutOrchestrator.mount('aod-animation', { host: {} });
  await timeoutOrchestrator.showPoster('aod-animation');
  await assert.rejects(
    timeoutOrchestrator.playForward('aod-animation'),
    (error) => error instanceof SceneAdapterTimeoutError,
    'play timeout after milestone is surfaced'
  );
  assert.equal(timeoutOrchestrator.getState().reveals.length, 0, 'timeout after milestone clears reveal');
  assert(
    timeoutOrchestrator.getState().trace.some((entry) => (
      entry.type === 'reveal-clear'
      && entry.reason === 'play-forward-timeout'
      && entry.removed?.[0]?.revealSceneId === 'method-top'
    )),
    'timeout after milestone emits reveal-clear trace'
  );
}

assertNoForbiddenProviderSideEffects();
await assertAdapterLifecycle();
await assertAdapterTimeoutAndReject();
await assertDestroySignalTimeoutAndNoRevive();
await assertRegistryAndOrchestrator();
await assertCancelAndReverseDoNotResurrectOldScenes();
await assertRevealClearsAfterMilestoneCancelAndReverse();
await assertRevealClearsAfterMilestoneFailure();

console.log('scene provider adapter/registry/orchestrator checks passed.');
