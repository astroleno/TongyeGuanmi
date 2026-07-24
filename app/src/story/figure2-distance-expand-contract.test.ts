import { describe, expect, it } from 'vitest';
import { FIGURE2_DISTANCE_EXPAND_SEGMENT } from './figure2-distance-expand-contract';
import { storyManifest } from './manifest';

describe('Figure2 distance-expand runtime projection', () => {
  it('stays exactly equal to the canonical manifest segment', () => {
    const canonical = storyManifest.nodes.find(
      (node) => node.kind === 'segment' && node.id === 'figure2-distance-expand'
    );

    expect(FIGURE2_DISTANCE_EXPAND_SEGMENT).toEqual(canonical);
  });
});
