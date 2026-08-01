import { describe, expect, it } from 'vitest';
import { PHONE_FIGURE2_PROOF_BRAND_OPTIONS } from './phone';

describe('clean Proof → Brand transition leaf', () => {
  it('freezes one above-both bottom-up effect surface', () => {
    expect(PHONE_FIGURE2_PROOF_BRAND_OPTIONS).toMatchObject({
      segmentId: 'figure2-proof-brand', surfaceId: 'fx:figure2-proof-brand',
      field: {
        kind: 'horizontal', direction: 'bottom-to-top',
        seed: 'figure2-proof-brand-phone'
      }, grade: 'dark'
    });
  });
});
