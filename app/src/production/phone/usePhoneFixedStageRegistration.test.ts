import { describe, expect, it } from 'vitest';
import { shouldPrimePhoneFixedStage } from './usePhoneFixedStageRegistration';

describe('phone fixed-stage registration', () => {
  it('primes only a cold navigation or an unavailable navigation entry', () => {
    expect(shouldPrimePhoneFixedStage('navigate')).toBe(true);
    expect(shouldPrimePhoneFixedStage(undefined)).toBe(true);
    expect(shouldPrimePhoneFixedStage('reload')).toBe(false);
    expect(shouldPrimePhoneFixedStage('back_forward')).toBe(false);
    expect(shouldPrimePhoneFixedStage('navigate', true)).toBe(false);
  });
});
