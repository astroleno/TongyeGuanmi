import { describe, expect, it } from 'vitest';
import { FIGURE2_INTRO_END } from '../../../transitions/figure2-distance-expand';
import { PHONE_PROOF_BRAND_FIELD } from './figure2-proof-brand';
import { PHONE_METHOD_FIGURE2_FIELD } from './method-bottom-figure2';

describe('phone Grade A transition contracts', () => {
  it('keeps both chapter boundaries on the canonical bottom-up field', () => {
    expect(PHONE_METHOD_FIGURE2_FIELD).toMatchObject({
      kind: 'horizontal',
      direction: 'bottom-to-top'
    });
    expect(PHONE_PROOF_BRAND_FIELD).toMatchObject({
      kind: 'horizontal',
      direction: 'bottom-to-top'
    });
  });

  it('keeps the authored Figure2 media/depth split', () => {
    expect(FIGURE2_INTRO_END).toBe(0.72);
  });
});
