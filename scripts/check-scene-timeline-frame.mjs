#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  createFrame,
  SceneTimelineFrameContract
} from '../js/transitions/homepage/scene-timeline-frame.js';

const defaultFrame = createFrame();

assert.deepEqual(
  defaultFrame,
  {
    joinId: '',
    fromScene: '',
    toScene: '',
    direction: 0,
    phase: 'idle',
    progress: 0,
    sourceOpacity: 1,
    targetOpacity: 0,
    copyOwner: 'hidden',
    visualOwner: 'native',
    interactionOwner: 'none',
    milestones: {}
  },
  'default frame must be an idle, hidden, native frame'
);
assert.ok(Object.isFrozen(defaultFrame), 'frame must be frozen');
assert.ok(Object.isFrozen(defaultFrame.milestones), 'milestones must be frozen');

const playingFrame = createFrame({
  joinId: 'home-belief',
  fromScene: 'home',
  toScene: 'belief',
  direction: 1,
  phase: 'playing',
  progress: 0.5,
  sourceOpacity: 0.4,
  targetOpacity: 0.6,
  copyOwner: 'timeline-fixed',
  visualOwner: 'adapter',
  interactionOwner: 'director',
  milestones: {
    targetReady: 1,
    skipped: 0
  }
});

assert.equal(playingFrame.milestones.targetReady, true, 'milestones normalize truthy values');
assert.equal(playingFrame.milestones.skipped, false, 'milestones normalize falsy values');

assert.throws(() => createFrame({ phase: 'transitioning' }), /phase must be one of/, 'legacy phase is rejected');
assert.throws(() => createFrame({ copyOwner: 'adapter' }), /copyOwner must be one of/, 'invalid copyOwner is rejected');
assert.throws(() => createFrame({ visualOwner: 'timeline' }), /visualOwner must be one of/, 'invalid visualOwner is rejected');
assert.throws(() => createFrame({ interactionOwner: 'adapter' }), /interactionOwner must be one of/, 'invalid interactionOwner is rejected');
assert.throws(() => createFrame({ direction: 2 }), /direction must be one of/, 'invalid direction is rejected');
assert.throws(() => createFrame({ progress: 1.1 }), /progress must be a finite number in 0..1/, 'invalid progress is rejected');
assert.throws(() => createFrame({ milestones: [] }), /milestones must be an object/, 'invalid milestones are rejected');

assert.deepEqual(
  SceneTimelineFrameContract.phases,
  ['idle', 'preparing', 'playing', 'committed', 'presented', 'cleanup', 'released'],
  'phase enum is exported for static checks'
);

console.log('SceneTimelineFrame contract OK.');
