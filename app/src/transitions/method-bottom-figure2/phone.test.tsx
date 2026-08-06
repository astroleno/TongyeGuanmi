import { describe, expect, it } from 'vitest';
import { PHONE_METHOD_BOTTOM_FIGURE2_OPTIONS } from './phone';

describe('clean Method → Figure2 transition leaf', () => {
  it('freezes the accepted bottom-up field without a second progress mapper', () => {
    expect(PHONE_METHOD_BOTTOM_FIGURE2_OPTIONS).toMatchObject({
      segmentId: 'method-bottom-figure2', surfaceId: 'fx:method-bottom-figure2',
      field: {
        kind: 'horizontal', direction: 'bottom-to-top',
        seed: 'method-bottom-figure2-phone'
      }, grade: 'dark'
    });
    expect(PHONE_METHOD_BOTTOM_FIGURE2_OPTIONS).not.toHaveProperty('mapProgress');
  });
});
