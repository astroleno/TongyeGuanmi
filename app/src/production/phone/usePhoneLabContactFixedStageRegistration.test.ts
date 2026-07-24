import { describe, expect, it } from 'vitest';
import { shouldPrimePhoneLabContactFixedStage } from './usePhoneLabContactFixedStageRegistration';

describe('phone Lab → Contact fixed-stage registration', () => {
  it('primes only a cold full-journey navigation', () => {
    expect(shouldPrimePhoneLabContactFixedStage('navigate')).toBe(true);
    expect(shouldPrimePhoneLabContactFixedStage(undefined)).toBe(true);
    expect(shouldPrimePhoneLabContactFixedStage('reload')).toBe(false);
    expect(shouldPrimePhoneLabContactFixedStage('back_forward')).toBe(false);
    expect(shouldPrimePhoneLabContactFixedStage('navigate', true)).toBe(false);
  });
});
