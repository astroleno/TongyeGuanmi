import { describe, expect, it } from 'vitest';
import { resolvePhoneRunLanding } from './phone-run-landing';

describe('orchestrator-owned phone run landing', () => {
  it('lands forward at the receiver boundary and preserves reverse overshoot', () => {
    expect(resolvePhoneRunLanding(740, 800, 1)).toBe(800);
    expect(resolvePhoneRunLanding(740, 800, -1)).toBe(740);
    expect(resolvePhoneRunLanding(900, 800, -1)).toBe(800);
  });
});
