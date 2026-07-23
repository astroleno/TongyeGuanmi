import { describe, expect, it } from 'vitest';
import { FIGURE2_INTRO_END } from '../../../transitions/figure2-distance-expand';
import { PHONE_PROOF_BRAND_FIELD } from './figure2-proof-brand';
import { PHONE_METHOD_FIGURE2_FIELD } from './method-bottom-figure2';
import { phoneInkAdapterProgress } from './PhoneInkTransition';

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

  it('keeps Proof visible until reduced-motion Brand boundary entry', () => {
    expect(phoneInkAdapterProgress(0, true, 'boundary')).toBe(0);
    expect(phoneInkAdapterProgress(0.001, true, 'boundary')).toBe(1);
    expect(phoneInkAdapterProgress(0, true, 'receiver')).toBe(1);
    expect(phoneInkAdapterProgress(0.42, false, 'boundary')).toBe(0.42);
  });
});
