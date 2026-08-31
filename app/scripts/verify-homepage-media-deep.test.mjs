import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alphaVideoSourcePairs,
  canonicalVideoContracts,
  packedAlphaVideoSources
} from './homepage-media-contract.mjs';

const expected = new Map([
  ['assets/figure1.webm', [24, 1, 49, 48]],
  ['assets/figure2-pair-motion.webm', [30, 1, 156, 155]],
  ['assets/ph-figure-motion.webm', [30, 1, 46, 45]],
  ['assets/ttg-figure-motion.webm', [30, 1, 75, 74]],
  ['assets/crane-figure-motion.webm', [30, 1, 75, 74]],
  ['assets/crane-flock-motion.webm', [30, 1, 74, 73]],
  ['assets/aod-figure-motion.webm', [30, 1, 78, 77]],
  ['assets/figure3-motion.webm', [30, 1, 78, 77]]
]);

test('deep media contracts carry one complete rational frame map per semantic WebM', () => {
  assert.equal(canonicalVideoContracts.length, expected.size);
  for (const contract of canonicalVideoContracts) {
    const values = expected.get(contract.source);
    assert.ok(values, `unexpected canonical video ${contract.source}`);
    const [fpsNumerator, fpsDenominator, frameCount, endFrame] = values;
    assert.deepEqual(contract.frameMap, {
      fpsNumerator,
      fpsDenominator,
      firstPtsSeconds: 0,
      frameCount,
      startFrame: 0,
      endFrame
    });
  }
});

test('every HEVC and packed variant resolves to a mapped canonical animation', () => {
  const canonicalSources = new Set(canonicalVideoContracts.map((entry) => entry.source));
  for (const { webm } of alphaVideoSourcePairs) assert.ok(canonicalSources.has(webm));
  for (const packed of packedAlphaVideoSources) {
    const stem = packed.replace(/^assets\//, '').replace(/-rgb-alpha\.mp4$/, '');
    assert.ok(
      [...canonicalSources].some((source) => source.replace(/^assets\//, '').replace(/\.webm$/, '') === stem),
      `packed variant ${packed} has no canonical frame map`
    );
  }
});
