import { describe, expect, it } from 'vitest';
import {
  FRONT_HALF_CHECKPOINT_IDS,
  GRADE_A_CHECKPOINT_IDS,
  frontHalfCheckpoint,
  frontHalfSemanticCheckpoints
} from './semantic-checkpoints';

describe('front-half semantic checkpoints', () => {
  it('names the accepted Route B journey in forward order', () => {
    expect(FRONT_HALF_CHECKPOINT_IDS).toEqual([
      'loader',
      'hero-entered',
      'hero-to-pattern',
      'pattern-complete',
      'pattern-to-star-map',
      'star-map-reading',
      'star-map-to-aod',
      'aod-stage',
      'aod-autoplay',
      'aod-to-method',
      'method-intro'
    ]);
    expect(frontHalfSemanticCheckpoints.map(({ id }) => id)).toEqual(FRONT_HALF_CHECKPOINT_IDS);
  });

  it('anchors each checkpoint to the canonical product spine rather than a renderer', () => {
    expect(frontHalfCheckpoint('hero-to-pattern')).toMatchObject({
      scene: 'hero',
      segment: 'hero-pattern'
    });
    expect(frontHalfCheckpoint('aod-autoplay')).toMatchObject({
      scene: 'aod-animation',
      media: 'aod-figure-motion'
    });
    expect(frontHalfCheckpoint('method-intro')).toMatchObject({ scene: 'method-top' });
  });

  it('names the one Method → Figure2 → Proof chain without alias scenes', () => {
    expect(GRADE_A_CHECKPOINT_IDS).toEqual([
      'method-to-figure2',
      'figure2-stage',
      'figure2-to-proof',
      'figure2-proof-opening',
      'figure2-proof-cards',
      'figure2-proof-closing'
    ]);
  });
});
