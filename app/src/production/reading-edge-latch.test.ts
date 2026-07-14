import { describe, expect, it } from 'vitest';
import { createReadingEdgeLatch } from './reading-edge-latch';

describe('reading edge latch', () => {
  it('arms an edge-crossing gesture and requires a later 16px gesture to fire', () => {
    const latch = createReadingEdgeLatch();

    expect(latch.consume({
      scope: 'reading:services:bottom',
      pixels: 120,
      now: 0,
      atEdge: true
    })).toMatchObject({ armed: true, fired: false });
    expect(latch.consume({
      scope: 'reading:services:bottom',
      pixels: 80,
      now: 16,
      atEdge: true
    })).toMatchObject({ armed: true, fired: false });
    expect(latch.consume({
      scope: 'reading:services:bottom',
      pixels: 15,
      now: 240,
      atEdge: true
    })).toMatchObject({ armed: true, fired: false });
    expect(latch.consume({
      scope: 'reading:services:bottom',
      pixels: 1,
      now: 256,
      atEdge: true
    })).toMatchObject({ armed: true, fired: true });
  });

  it('keeps top-edge reverse handoff independent and resets on direction changes', () => {
    const latch = createReadingEdgeLatch();

    expect(latch.consume({
      scope: 'reading:figure3-animation:top',
      pixels: -24,
      now: 0,
      atEdge: true,
      forceNewGesture: true
    })).toMatchObject({ armed: true, fired: false });
    expect(latch.consume({
      scope: 'reading:figure3-animation:top',
      pixels: -16,
      now: 1,
      atEdge: true,
      forceNewGesture: true
    })).toMatchObject({ armed: true, fired: true });
    expect(latch.consume({
      scope: 'reading:figure3-animation:bottom',
      pixels: 16,
      now: 2,
      atEdge: true,
      forceNewGesture: true
    })).toMatchObject({ armed: true, fired: false });
  });
});
