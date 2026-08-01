import { describe, expect, it } from 'vitest';
import { PHONE_STAR_MAP_AOD_INK_OPTIONS } from './phone';

describe('clean Star Map → AOD transition leaf', () => {
  it('freezes the accepted bottom-to-top field, seed, grade, and surface', () => {
    expect(PHONE_STAR_MAP_AOD_INK_OPTIONS).toEqual({
      segmentId: 'star-map-aod', surfaceId: 'fx:star-map-aod',
      field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'portrait-star-aod-r5' },
      grade: 'edge-bright', canvasClassName: 'portrait-scroll-spike__ink',
      portraitInk: 'star-aod'
    });
  });
});
