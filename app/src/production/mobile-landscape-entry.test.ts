import { describe, expect, it } from 'vitest';
import {
  createMobileLandscapeStabilityTracker,
  isGatedPhone,
  isPhoneLandscapeReady,
  isViewportDriftWithin,
  mobileLandscapeEntryState,
  mobileLandscapeViewport
} from './mobile-landscape-entry';

describe('mobile landscape entry policy', () => {
  it('prefers visualViewport dimensions while retaining an inner-window fallback', () => {
    expect(mobileLandscapeViewport({
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: { width: 844, height: 390 }
    })).toEqual({ width: 844, height: 390 });
    expect(mobileLandscapeViewport({
      innerWidth: 390,
      innerHeight: 844
    })).toEqual({ width: 390, height: 844 });
  });

  it('gates only coarse, non-hover phone-sized viewports', () => {
    const phone = { width: 390, height: 844 };
    expect(isGatedPhone(phone, { pointerCoarse: true, hoverNone: true })).toBe(true);
    expect(isGatedPhone(phone, { pointerCoarse: false, hoverNone: true })).toBe(false);
    expect(isGatedPhone(phone, { pointerCoarse: true, hoverNone: false })).toBe(false);
    expect(isGatedPhone({ width: 1024, height: 768 }, { pointerCoarse: true, hoverNone: true })).toBe(false);
  });

  it('accepts only a usable phone-landscape viewport', () => {
    expect(isPhoneLandscapeReady({ width: 844, height: 390 })).toBe(true);
    expect(isPhoneLandscapeReady({ width: 639, height: 390 })).toBe(false);
    expect(isPhoneLandscapeReady({ width: 844, height: 299 })).toBe(false);
    expect(isPhoneLandscapeReady({ width: 500, height: 470 })).toBe(false);
  });

  it('requires two nearly identical landscape frames and a quiet period', () => {
    const tracker = createMobileLandscapeStabilityTracker();
    const first = { width: 844, height: 390 };
    const second = { width: 845, height: 389 };

    expect(tracker.sample(first, 0)).toEqual({ stable: false, quietUntil: undefined });
    expect(tracker.sample(second, 16)).toEqual({ stable: false, quietUntil: 196 });
    expect(tracker.sample(second, 195)).toEqual({ stable: false, quietUntil: 196 });
    expect(tracker.sample(second, 196)).toEqual({ stable: true, quietUntil: 196 });

    tracker.reset();
    tracker.sample(first, 0);
    expect(tracker.sample({ width: 848, height: 390 }, 16)).toEqual({
      stable: false,
      quietUntil: undefined
    });
    expect(isViewportDriftWithin(first, { width: 846, height: 388 })).toBe(true);
    expect(isViewportDriftWithin(first, { width: 847, height: 388 })).toBe(false);
  });

  it('keeps started phones in their current scene and surfaces only a portrait warning', () => {
    expect(mobileLandscapeEntryState({
      gatedPhone: false,
      landscapeStable: false,
      landscapeCurrentlyAllowed: false,
      started: false
    })).toBe('bypass');
    expect(mobileLandscapeEntryState({
      gatedPhone: true,
      landscapeStable: false,
      landscapeCurrentlyAllowed: false,
      started: false
    })).toBe('portrait-blocked');
    expect(mobileLandscapeEntryState({
      gatedPhone: true,
      landscapeStable: true,
      landscapeCurrentlyAllowed: true,
      started: false
    })).toBe('landscape-ready');
    expect(mobileLandscapeEntryState({
      gatedPhone: true,
      landscapeStable: true,
      landscapeCurrentlyAllowed: true,
      started: true
    })).toBe('started');
    expect(mobileLandscapeEntryState({
      gatedPhone: true,
      landscapeStable: false,
      landscapeCurrentlyAllowed: false,
      started: true
    })).toBe('portrait-warning');
  });
});
