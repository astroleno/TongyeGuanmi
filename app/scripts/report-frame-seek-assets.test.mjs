import assert from 'node:assert/strict';

import { summarizeFrameProbe } from './report-frame-seek-assets.mjs';

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

function syntheticFrames({ firstPtsSeconds = 0, durationSeconds = 1 / 30 } = {}) {
  return Array.from({ length: 24 }, (_, index) => ({
    keyFrame: [0, 8, 16].includes(index),
    ptsSeconds: firstPtsSeconds + index / 30,
    durationSeconds
  }));
}

const frozenContract = {
  frameCount: 24,
  fpsNumerator: 30,
  fpsDenominator: 1,
  firstPtsSeconds: 0,
  lastPtsSeconds: 23 / 30
};

test('summarizes frame count, keyframes, GOP, rational fps, and PTS exactly', () => {
  const summary = summarizeFrameProbe(syntheticFrames(), {
    expected: frozenContract
  });

  assert.deepEqual(summary, {
    frameCount: 24,
    keyframeCount: 3,
    maxGopFrames: 8,
    fpsNumerator: 30,
    fpsDenominator: 1,
    firstPtsSeconds: 0,
    lastPtsSeconds: 23 / 30
  });
});

test('rejects variable-frame-rate records', () => {
  const frames = syntheticFrames();
  frames[9] = {
    ...frames[9],
    ptsSeconds: frames[8].ptsSeconds + 1 / 24
  };

  assert.throws(
    () => summarizeFrameProbe(frames),
    /variable frame rate/i
  );
});

test('rejects a frame with missing PTS', () => {
  const frames = syntheticFrames();
  frames[4] = { ...frames[4], ptsSeconds: undefined };

  assert.throws(
    () => summarizeFrameProbe(frames),
    /missing frame PTS/i
  );
});

test('rejects a nonzero first PTS that is not represented by the frozen contract', () => {
  assert.throws(
    () => summarizeFrameProbe(syntheticFrames({ firstPtsSeconds: 0.25 }), {
      expected: frozenContract
    }),
    /first PTS/i
  );
});

test('rejects a frame count that differs from the frozen contract', () => {
  assert.throws(
    () => summarizeFrameProbe(syntheticFrames(), {
      expected: { ...frozenContract, frameCount: 23 }
    }),
    /frame count/i
  );
});
