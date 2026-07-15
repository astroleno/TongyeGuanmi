import { describe, expect, it } from 'vitest';
import { createReadingEdgeLatch } from './reading-edge-latch';

describe('reading edge latch', () => {
  it('absorbs the edge-crossing tail and fires within the next clear gesture', () => {
    const latch = createReadingEdgeLatch();

    expect(latch.consume({
      scope: 'reading:services:bottom',
      pixels: 120,
      startedAtEdge: false,
      reachedEdgeDuringInput: true,
      newGesture: true
    })).toMatchObject({ state: 'armed', fired: false });
    expect(latch.consume({
      scope: 'reading:services:bottom',
      pixels: 80,
      startedAtEdge: true,
      reachedEdgeDuringInput: false,
      newGesture: false
    })).toMatchObject({ state: 'armed', fired: false });
    expect(latch.consume({
      scope: 'reading:services:bottom',
      pixels: 15,
      startedAtEdge: true,
      reachedEdgeDuringInput: false,
      newGesture: true
    })).toMatchObject({ state: 'steady', fired: false });
    expect(latch.consume({
      scope: 'reading:services:bottom',
      pixels: 1,
      startedAtEdge: true,
      reachedEdgeDuringInput: false,
      newGesture: false
    })).toMatchObject({ state: 'fired', fired: true });
  });

  it('lets a scene mounted at an edge leave on its first outward gesture', () => {
    const latch = createReadingEdgeLatch();
    latch.mountAtEdge('reading:method-top:top');

    expect(latch.consume({
      scope: 'reading:method-top:top',
      pixels: -16,
      startedAtEdge: true,
      reachedEdgeDuringInput: false,
      newGesture: true
    })).toMatchObject({ state: 'fired', fired: true });

    expect(latch.consume({
      scope: 'reading:method-top:bottom',
      pixels: 16,
      startedAtEdge: false,
      reachedEdgeDuringInput: false,
      newGesture: true
    })).toMatchObject({ state: 'free', fired: false });
  });

  it('lets a fresh gesture leave an edge reached by native scroll or snap', () => {
    const latch = createReadingEdgeLatch();

    expect(latch.consume({
      scope: 'reading:services:bottom',
      pixels: 16,
      startedAtEdge: true,
      reachedEdgeDuringInput: false,
      newGesture: true
    })).toMatchObject({ state: 'fired', fired: true });
  });
});
