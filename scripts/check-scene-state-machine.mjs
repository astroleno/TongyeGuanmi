import assert from 'node:assert/strict';
import { homepageSegments } from '../src/homepage/homepage.segments.mjs';
import { createRecoveryRoutine } from '../js/scenes/runtime/recovery.js';
import {
  createSceneStateMachine,
  publicRuntimePhases,
  RuntimePhase
} from '../js/scenes/runtime/state-machine.js';

class FakeClock {
  constructor() {
    this.time = 0;
    this.timers = [];
  }

  now() {
    return this.time;
  }

  setTimeout(callback, delay) {
    const timer = { callback, due: this.time + delay, active: true };
    this.timers.push(timer);
    return timer;
  }

  clearTimeout(timer) {
    if (timer) timer.active = false;
  }

  advance(ms) {
    this.time += ms;
    const dueTimers = this.timers
      .filter((timer) => timer.active && timer.due <= this.time)
      .sort((a, b) => a.due - b.due);
    for (const timer of dueTimers) {
      timer.active = false;
      timer.callback();
    }
  }
}

function deferredPlayer({ reject = false, never = false } = {}) {
  let resolve;
  let rejectPromise;
  const promise = new Promise((res, rej) => {
    resolve = res;
    rejectPromise = rej;
  });
  const calls = [];
  return {
    calls,
    resolve,
    reject: rejectPromise,
    player: {
      play(input) {
        calls.push(['play', input.segment.id]);
        if (never) return promise;
        if (reject) return Promise.reject(new Error('play rejected'));
        return promise;
      },
      stop(details) {
        calls.push(['stop', details.reason]);
      }
    }
  };
}

function fakePorts(clock, player) {
  const presentationCommits = [];
  const scrollEvents = [];
  const recovery = createRecoveryRoutine({
    scrollLock: { unlock: (details) => scrollEvents.push(['unlock', details.reason, details.recoveryReason]) },
    presentation: { present: (sceneId, details) => presentationCommits.push(['present', sceneId, details.reason, details.recoveryReason]) }
  });
  return {
    clock,
    presentation: {
      present: (sceneId, details) => presentationCommits.push(['present', sceneId, details.reason])
    },
    scrollLock: {
      lock: (details) => scrollEvents.push(['lock', details.reason, details.segmentId]),
      unlock: (details) => scrollEvents.push(['unlock', details.reason, details.recoveryReason])
    },
    playerRegistry: { get: () => player },
    recovery,
    presentationCommits,
    scrollEvents
  };
}

async function normalFlow() {
  const clock = new FakeClock();
  const fakePlayer = deferredPlayer();
  const ports = fakePorts(clock, fakePlayer.player);
  const phases = [RuntimePhase.IDLE];
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'aod-animation',
    ...ports,
    releaseCooldownMs: 220,
    onTransition: (state) => phases.push(state.phase)
  });

  machine.arm({ segmentId: 'aod-play', intent: { source: 'wheel', direction: 'forward', distanceVh: 10 } });
  machine.beginSnapLock();
  const playPromise = machine.completeSnapLock();
  assert.equal(machine.getState().phase, RuntimePhase.PLAYING);
  fakePlayer.resolve({ ended: true });
  await playPromise;
  assert.equal(machine.getState().phase, RuntimePhase.RELEASING);
  assert.deepEqual(ports.presentationCommits.at(-1).slice(0, 3), ['present', 'method-top', 'play-complete']);
  clock.advance(220);
  assert.equal(machine.getState().phase, RuntimePhase.IDLE);
  assert.deepEqual(
    phases,
    [
      'IDLE',
      'ARMED',
      'SNAP_LOCKING',
      'PLAYING',
      'PRESENTING',
      'RELEASING',
      'IDLE'
    ],
    'normal public phase order must be fixed'
  );
  assert.ok(phases.every((phase) => publicRuntimePhases.includes(phase)));
  assert.ok(!phases.includes('RECOVERING'));
}

function readCompletePresentationFlow() {
  const clock = new FakeClock();
  const ports = fakePorts(clock, null);
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'method-top',
    ...ports
  });

  const result = machine.presentScene('method-bottom', { reason: 'read-complete' });
  assert.equal(result.phase, RuntimePhase.IDLE);
  assert.equal(result.currentSceneId, 'method-bottom');
  assert.equal(machine.getState().currentSceneId, 'method-bottom');
  assert.deepEqual(ports.presentationCommits.at(-1), ['present', 'method-bottom', 'read-complete']);
}

function cancelFlow() {
  const clock = new FakeClock();
  const fakePlayer = deferredPlayer();
  const ports = fakePorts(clock, fakePlayer.player);
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'hero',
    ...ports,
    releaseCooldownMs: 50
  });

  machine.arm({ segmentId: 'hero-to-pattern' });
  machine.cancel({ reason: 'cancelled' });
  assert.equal(machine.getState().phase, RuntimePhase.RELEASING);
  assert.equal(machine.getState().releaseReason, 'cancelled');
  assert.deepEqual(ports.scrollEvents.at(-1).slice(0, 2), ['unlock', 'cancelled']);
  clock.advance(50);
  assert.equal(machine.getState().phase, RuntimePhase.IDLE);
}

function cancelWhilePlayingStopsPlayer() {
  const clock = new FakeClock();
  const fakePlayer = deferredPlayer({ never: true });
  const ports = fakePorts(clock, fakePlayer.player);
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'figure3-animation',
    ...ports,
    releaseCooldownMs: 50
  });

  machine.arm({ segmentId: 'figure3-play' });
  machine.beginSnapLock();
  machine.completeSnapLock();
  assert.equal(machine.getState().phase, RuntimePhase.PLAYING);
  machine.cancel({ reason: 'cancelled' });
  assert.equal(machine.getState().phase, RuntimePhase.RELEASING);
  assert.ok(fakePlayer.calls.some((call) => call[0] === 'stop' && call[1] === 'cancelled'));
  assert.deepEqual(ports.scrollEvents.at(-1).slice(0, 2), ['unlock', 'cancelled']);
}

async function playRejectRecovers() {
  const clock = new FakeClock();
  const fakePlayer = deferredPlayer({ reject: true });
  const ports = fakePorts(clock, fakePlayer.player);
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'aod-animation',
    ...ports,
    releaseCooldownMs: 10
  });

  machine.arm({ segmentId: 'aod-play' });
  machine.beginSnapLock();
  await machine.completeSnapLock();
  assert.equal(machine.getState().phase, RuntimePhase.RELEASING);
  assert.equal(machine.getState().releaseReason, 'recovery');
  assert.equal(machine.getState().recoveryReason, 'PLAYING_ERROR');
  assert.equal(ports.recovery.getHistory().at(-1).recoveryReason, 'PLAYING_ERROR');
  assert.ok(ports.scrollEvents.some((event) => event[0] === 'unlock' && event[1] === 'recovery'));
  clock.advance(10);
  assert.equal(machine.getState().phase, RuntimePhase.IDLE);
}

function timeoutRecovers() {
  const clock = new FakeClock();
  const fakePlayer = deferredPlayer({ never: true });
  const ports = fakePorts(clock, fakePlayer.player);
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'crane-animation',
    ...ports,
    mediaTimeoutMs: 100,
    releaseCooldownMs: 10
  });

  machine.arm({ segmentId: 'crane-play' });
  machine.beginSnapLock();
  machine.completeSnapLock();
  clock.advance(100);
  assert.equal(machine.getState().phase, RuntimePhase.RELEASING);
  assert.equal(machine.getState().releaseReason, 'recovery');
  assert.equal(machine.getState().recoveryReason, 'PLAYER_TIMEOUT');
  assert.ok(ports.recovery.getHistory().some((item) => item.recoveryReason === 'PLAYER_TIMEOUT'));
}

function resourceFailureRecovers() {
  const clock = new FakeClock();
  const fakePlayer = deferredPlayer({ never: true });
  const ports = fakePorts(clock, fakePlayer.player);
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'ph-animation',
    ...ports,
    releaseCooldownMs: 10
  });

  machine.arm({ segmentId: 'ph-play' });
  machine.beginSnapLock();
  machine.completeSnapLock();
  machine.resourceFailed({ recoveryReason: 'RESOURCE_FAILED' });
  assert.equal(machine.getState().phase, RuntimePhase.RELEASING);
  assert.equal(machine.getState().releaseReason, 'recovery');
  assert.equal(machine.getState().recoveryReason, 'RESOURCE_FAILED');
  assert.ok(ports.scrollEvents.some((event) => event[0] === 'unlock' && event[1] === 'recovery'));
}

async function missingPlayerRecovers() {
  const clock = new FakeClock();
  const ports = fakePorts(clock, null);
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'hero',
    ...ports,
    releaseCooldownMs: 10
  });

  machine.arm({ segmentId: 'hero-to-pattern' });
  machine.beginSnapLock();
  await machine.completeSnapLock();
  assert.equal(machine.getState().phase, RuntimePhase.RELEASING);
  assert.equal(machine.getState().releaseReason, 'recovery');
  assert.equal(machine.getState().recoveryReason, 'RESOURCE_FAILED');
  assert.equal(ports.recovery.getHistory().at(-1).targetScene, 'pattern');
  assert.ok(ports.scrollEvents.some((event) => event[0] === 'unlock' && event[1] === 'recovery'));
  clock.advance(10);
  assert.equal(machine.getState().phase, RuntimePhase.IDLE);
}

async function nullPlayerPathRecovers() {
  const clock = new FakeClock();
  const ports = fakePorts(clock, { play: null });
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'method-bottom',
    ...ports,
    releaseCooldownMs: 10
  });

  machine.arm({ segmentId: 'figure2-compound-to-brand' });
  machine.beginSnapLock();
  await machine.completeSnapLock();
  assert.equal(machine.getState().releaseReason, 'recovery');
  assert.equal(machine.getState().recoveryReason, 'RESOURCE_FAILED');
}

assert.throws(() => {
  const clock = new FakeClock();
  const ports = fakePorts(clock, null);
  const machine = createSceneStateMachine({
    segments: homepageSegments,
    initialSceneId: 'hero',
    ...ports
  });
  machine.arm({ segmentId: 'unknown-segment' });
}, /Unknown segment/);

await normalFlow();
readCompletePresentationFlow();
cancelFlow();
cancelWhilePlayingStopsPlayer();
await playRejectRecovers();
timeoutRecovers();
resourceFailureRecovers();
await missingPlayerRecovers();
await nullPlayerPathRecovers();

console.log('SceneRuntime state machine checks passed.');
