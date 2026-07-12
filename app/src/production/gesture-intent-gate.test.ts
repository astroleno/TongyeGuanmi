import { describe, expect, it } from 'vitest';
import { createGestureIntentGate } from './gesture-intent-gate';

describe('production gesture intent gate', () => {
  it('fires exactly once after slow or fast physical input reaches 10svh', () => {
    const slow = createGestureIntentGate();
    const samples = Array.from({ length: 5 }, (_, index) => slow.consume({
      pixels: 20,
      viewportHeight: 1000,
      now: index * 16,
      scope: 'hold:contact'
    }));

    expect(samples.slice(0, -1).every((sample) => !sample.fired)).toBe(true);
    expect(samples.at(-1)).toMatchObject({ fired: true, committed: true, direction: 1 });
    expect(slow.consume({
      pixels: 60,
      viewportHeight: 1000,
      now: 96,
      scope: 'hold:contact'
    })).toMatchObject({ fired: false, committed: true });

    const fast = createGestureIntentGate();
    expect(fast.consume({
      pixels: -100,
      viewportHeight: 1000,
      now: 0,
      scope: 'hold:contact'
    })).toMatchObject({ fired: true, committed: true, direction: -1 });
  });

  it('does not fire at 9.9svh and starts a fresh budget on direction reversal', () => {
    const gate = createGestureIntentGate();

    expect(gate.consume({
      pixels: 99,
      viewportHeight: 1000,
      now: 0,
      scope: 'hold:method-top'
    })).toMatchObject({ fired: false, accumulatedPixels: 99 });
    expect(gate.consume({
      pixels: -20,
      viewportHeight: 1000,
      now: 16,
      scope: 'hold:method-top'
    })).toMatchObject({
      fired: false,
      direction: -1,
      accumulatedPixels: 20,
      lastResetReason: 'direction-reversal'
    });
  });

  it('resets stale distance on idle, viewport, and runtime scope changes', () => {
    const gate = createGestureIntentGate({ idleMs: 200 });
    gate.consume({ pixels: 80, viewportHeight: 1000, now: 0, scope: 'hold:lab' });

    expect(gate.consume({
      pixels: 20,
      viewportHeight: 1000,
      now: 201,
      scope: 'hold:lab'
    })).toMatchObject({ accumulatedPixels: 20, fired: false, lastResetReason: 'gesture-idle' });
    expect(gate.consume({
      pixels: 20,
      viewportHeight: 900,
      now: 210,
      scope: 'hold:lab'
    })).toMatchObject({ accumulatedPixels: 20, fired: false, lastResetReason: 'viewport-change' });
    expect(gate.consume({
      pixels: 20,
      viewportHeight: 900,
      now: 220,
      scope: 'stage:ph-education:0'
    })).toMatchObject({ accumulatedPixels: 20, fired: false, lastResetReason: 'scope-change' });
  });
});
