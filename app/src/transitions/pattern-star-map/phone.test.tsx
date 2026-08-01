import { describe, expect, it } from 'vitest';
import { PHONE_PATTERN_STAR_MAP_INK_OPTIONS } from './phone';

describe('clean Pattern → Star Map transition leaf', () => {
  it('freezes the accepted radial field, origin, seed, grade, and surface', () => {
    expect(PHONE_PATTERN_STAR_MAP_INK_OPTIONS).toEqual({
      segmentId: 'pattern-star-map', surfaceId: 'fx:pattern-star-map',
      field: { kind: 'radial', origin: { x: .5, y: .28 }, seed: 'portrait-pattern-star-r5' },
      grade: 'dark', canvasClassName: 'portrait-scroll-spike__ink',
      portraitInk: 'pattern-star'
    });
  });
});
