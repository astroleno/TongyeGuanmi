import { describe, expect, it } from 'vitest';
import { phoneForwardInputCrossesBoundary } from './phone-scroll-snap-lock';

describe('phone time-owned scroll gate', () => {
  it('claims a fast forward gesture exactly at the next media boundary', () => {
    expect(phoneForwardInputCrossesBoundary(400, 799, 800)).toBe(true);
    expect(phoneForwardInputCrossesBoundary(400, 798, 800)).toBe(false);
    expect(phoneForwardInputCrossesBoundary(820, 900, 800)).toBe(false);
  });
});
