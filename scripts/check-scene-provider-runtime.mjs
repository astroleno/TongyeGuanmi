#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

  assert.doesNotMatch(
    read('js/scene-harness/aod-scene-player.js'),
    /method-top/,
    'AOD player must not know the early-copy target scene'
  );
}

class FakeProvider {
  constructor({
    milestone = null,
    rejectPlay = false,
    neverResolve = false,
    playDelayMs = 26
  } = {}) {
    this.milestone = milestone;
    this.rejectPlay = rejectPlay;
    this.neverResolve = neverResolve;
    this.playDelayMs = playDelayMs;
    this.state = 'idle';
    this.signals = [];
    this.destroyCount = 0;
    this.timers = new Set();
    this.activeResolve = null;
  }

  rememberSignal(signal) {
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
    this.rememberSignal(signal);
    this.emit('mounted', onTrace);
    return { completed: true };
  }

  async showPoster({ signal, onTrace } = {}) {
    this.rememberSignal(signal);
    this.emit('poster', onTrace);
    return { completed: true };
  }

  playForward({ signal, onTrace, onProgress } = {}) {
    this.rememberSignal(signal);
    this.emit('playing-forward', onTrace);
    if (this.rejectPlay) return Promise.reject(new Error('fake play reject'));
    if (this.neverResolve) return new Promise(() => {});

    return new Promise((resolve) => {
      const settle = (result) => {
        this.clearTimers();
        this.activeResolve = null;
        resolve(result);
      };
      this.activeResolve = settle;
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
        }, Math.max(1, Math.floor(this.playDelayMs / 3)));
      }
      this.schedule(() => {
        onProgress?.(1);
        this.emit('complete', onTrace);
        this.emit('stable', onTrace);
        settle({ completed: true });
      }, this.playDelayMs);
    });
  }

  async cancelToSource({ signal, onTrace } = {}) {
    this.rememberSignal(signal);
    this.clearTimers();
    this.emit('poster', onTrace, { reason: 'cancel-to-source' });
    this.activeResolve?.({ completed: false, cancelled: true, reason: 'cancel-to-source' });
    this.activeResolve = null;
    return { completed: false, cancelled: true, reason: 'cancel-to-source' };
  }

  async reverseToPoster({ signal, onTrace } = {}) {
    this.rememberSignal(signal);
    this.clearTimers();
    this.emit('poster', onTrace, { reason: 'reverse-to-poster' });
    this.activeResolve?.({ completed: false, cancelled: true, reason: 'reverse-to-poster' });
    this.activeResolve = null;
    return { completed: true };
  }

  destroy() {
    this.destroyCount += 1;
    this.clearTimers();
    this.state = 'destroyed';
    this.activeResolve?.({ completed: false, cancelled: true, reason: 'destroyed' });
    this.activeResolve = null;
    return this.getState();
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
  adapter.destroy();
  adapter.destroy();

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

  const rejectFactory = fakeFactory({ rejectPlay: true });
  const rejectAdapter = createScenePlayerAdapter({
    sceneId: 'reject',
    createPlayer: rejectFactory.createPlayer
  });
  await rejectAdapter.mount({ host: {} });
  await rejectAdapter.showPoster({});
  await assert.rejects(rejectAdapter.playForward({}), /fake play reject/, 'adapter propagates provider rejects');
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
  orchestrator.destroy();
  orchestrator.destroy();
  assert.equal(factory.instances[0].destroyCount, 1, 'orchestrator destroy is idempotent through adapter');
}

assertNoForbiddenProviderSideEffects();
await assertAdapterLifecycle();
await assertAdapterTimeoutAndReject();
await assertRegistryAndOrchestrator();
await assertCancelAndReverseDoNotResurrectOldScenes();

console.log('scene provider adapter/registry/orchestrator checks passed.');
