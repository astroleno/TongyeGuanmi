import { describe, expect, it } from 'vitest';
import { createPhysicalGestureTracker } from './physical-gesture-tracker';

describe('physical gesture tracker', () => {
  it('detects a decay-then-reacceleration wheel gesture before the idle fallback', () => {
    const tracker = createPhysicalGestureTracker();

    expect(tracker.consume({ source: 'wheel', pixels: 30, now: 0 }).newGesture).toBe(true);
    expect(tracker.consume({ source: 'wheel', pixels: 18, now: 16 }).newGesture).toBe(false);
    expect(tracker.consume({ source: 'wheel', pixels: 8, now: 32 }).newGesture).toBe(false);
    expect(tracker.consume({ source: 'wheel', pixels: 20, now: 48 }).newGesture).toBe(true);
  });

  it('uses explicit touch lifecycle and treats every key as discrete', () => {
    const tracker = createPhysicalGestureTracker();

    expect(tracker.consume({ source: 'touch', pixels: 8, now: 0, explicitStart: true }).newGesture).toBe(true);
    expect(tracker.consume({ source: 'touch', pixels: 8, now: 16 }).newGesture).toBe(false);
    tracker.end();
    expect(tracker.consume({ source: 'touch', pixels: 8, now: 32, explicitStart: true }).newGesture).toBe(true);
    expect(tracker.consume({ source: 'key', pixels: 100, now: 48 }).newGesture).toBe(true);
    expect(tracker.consume({ source: 'key', pixels: 100, now: 49 }).newGesture).toBe(true);
  });
});
