import assert from 'node:assert/strict';
import { homepageSegments } from '../src/homepage/homepage.segments.mjs';
import { createSceneStateMachine, RuntimePhase } from '../js/scenes/runtime/state-machine.js';

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
    for (const timer of this.timers.filter((item) => item.active && item.due <= this.time)) {
      timer.active = false;
      timer.callback();
    }
  }
}

const clock = new FakeClock();
const scrollEvents = [];
const presentationCommits = [];
let playCalled = false;
const machine = createSceneStateMachine({
  segments: homepageSegments,
  initialSceneId: 'aod-animation',
  reducedMotion: true,
  releaseCooldownMs: 20,
  clock,
  scrollLock: {
    lock: (details) => scrollEvents.push(['lock', details.reason]),
    unlock: (details) => scrollEvents.push(['unlock', details.reason])
  },
  presentation: {
    present: (sceneId, details) => presentationCommits.push([sceneId, details.reason])
  },
  playerRegistry: {
    get: () => ({
      play() {
        playCalled = true;
      }
    })
  }
});

machine.arm({ segmentId: 'aod-play' });
machine.beginSnapLock();
machine.completeSnapLock();

assert.equal(playCalled, false, 'reduced motion must not start visual player');
assert.equal(machine.getState().phase, RuntimePhase.RELEASING);
assert.deepEqual(presentationCommits, [['method-top', 'reduced-motion']]);
assert.deepEqual(scrollEvents, [['lock', 'snap-locking'], ['unlock', 'reduced-motion']]);
clock.advance(20);
assert.equal(machine.getState().phase, RuntimePhase.IDLE);

console.log('Reduced-motion runtime checks passed.');
