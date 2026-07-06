import { describe, expect, it } from 'vitest';
import { routeInput } from './input-router';

const holdCursor = { status: 'hold', scene: 'hero' } as const;
const segmentCursor = { status: 'segment', segment: 'hero-pattern', from: 'hero', to: 'pattern' } as const;

describe('input router', () => {
  it('routes reading holds to innerScroll while the layer can scroll', () => {
    expect(routeInput({ state: 'hold', cursor: holdCursor, delta: 0.04, readingCanScroll: true })).toEqual({
      path: 'innerScroll',
      delta: 0.04
    });
  });

  it('routes scrub policies to scrub', () => {
    expect(
      routeInput({
        state: 'hold',
        cursor: holdCursor,
        delta: 0.04,
        segmentPolicy: { kind: 'scrub', snapAfterIdleMs: 160 }
      })
    ).toEqual({ path: 'scrub', delta: 0.04 });
  });

  it('routes normal holds to charge', () => {
    expect(routeInput({ state: 'hold', cursor: holdCursor, delta: -0.04 })).toEqual({
      path: 'charge',
      delta: -0.04,
      direction: -1
    });
  });

  it('buffers intent during playing and settling', () => {
    expect(routeInput({ state: 'playing', cursor: segmentCursor, delta: 0.04 }).path).toBe('intentBuffer');
    expect(routeInput({ state: 'settling', cursor: segmentCursor, delta: 0.04 }).path).toBe('intentBuffer');
  });

  it('routes locked states to none', () => {
    expect(routeInput({ state: 'preparing', cursor: holdCursor, delta: 0.04 })).toEqual({
      path: 'none',
      delta: 0.04
    });
  });
});
