import { describe, expect, it } from 'vitest';
import {
  PHONE_INK_AUTOPLAY_MS,
  phoneTimedTransitionProgress,
  phoneTransitionCrossesBoundary
} from './phone-transition-coordinator';

describe('phone transition coordinator', () => {
  it('claims both directions at the same semantic edge', () => {
    expect(phoneTransitionCrossesBoundary(400, 900, 800, 1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(400, 798, 800, 1)).toBe(false);
    expect(phoneTransitionCrossesBoundary(800, 900, 800, 1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(800, 600, 800, -1)).toBe(true);
    expect(phoneTransitionCrossesBoundary(760, 600, 800, -1)).toBe(false);
  });

  it('uses one mirrored 600ms easing curve for every ink boundary', () => {
    expect(PHONE_INK_AUTOPLAY_MS).toBe(600);
    expect(phoneTimedTransitionProgress(0)).toBe(0);
    expect(phoneTimedTransitionProgress(300)).toBe(.5);
    expect(phoneTimedTransitionProgress(600)).toBe(1);
    expect(phoneTimedTransitionProgress(900)).toBe(1);
  });
});
