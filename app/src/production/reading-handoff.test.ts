import { describe, expect, it } from 'vitest';
import { consumeReadingPixels } from './reading-handoff';

function readingLayer(options: {
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
} = {}) {
  const scrollport = {
    clientHeight: options.clientHeight ?? 600,
    dataset: {} as Record<string, string>,
    scrollHeight: options.scrollHeight ?? 1600,
    scrollTop: options.scrollTop ?? 0
  };
  const root = {
    dataset: { reading: 'true' },
    matches: (selector: string) => selector === '[data-reading="true"]',
    querySelector: (selector: string) => selector === '[data-reading-scrollport="true"]'
      ? scrollport
      : null
  };
  return {
    root: root as unknown as HTMLElement,
    scrollport
  };
}

describe('reading handoff', () => {
  it('returns post-edge pixels to the single production commitment owner', () => {
    const { root } = readingLayer({ scrollTop: 1000 });

    expect(consumeReadingPixels({ root, pixels: 20 })).toEqual({
      owned: true,
      direction: 1,
      contentPixels: 0,
      residualPixels: 20
    });
  });

  it('spends physical distance on the scene scrollport before returning residual pixels', () => {
    const { root, scrollport } = readingLayer();

    const result = consumeReadingPixels({ root, pixels: 420 });

    expect(scrollport.scrollTop).toBe(420);
    expect(result).toEqual({
      owned: true,
      direction: 1,
      contentPixels: 420,
      residualPixels: 0
    });
  });

  it('splits one large edge-crossing event into content and residual physical pixels', () => {
    const { root, scrollport } = readingLayer({ scrollTop: 950 });

    const result = consumeReadingPixels({ root, pixels: 200 });

    expect(scrollport.scrollTop).toBe(1000);
    expect(result).toMatchObject({ contentPixels: 50, residualPixels: 150 });
  });

  it('clamps fractional edge metrics before returning the complete residual', () => {
    const { root, scrollport } = readingLayer({ scrollTop: 999.5 });

    expect(consumeReadingPixels({ root, pixels: 20 })).toMatchObject({
      contentPixels: 0,
      residualPixels: 20
    });
    expect(scrollport.scrollTop).toBe(1000);
  });

  it('scrolls content first after direction reversal without retaining old intent state', () => {
    const { root, scrollport } = readingLayer({ scrollTop: 1000 });
    consumeReadingPixels({ root, pixels: 90 });

    expect(consumeReadingPixels({ root, pixels: -40 })).toMatchObject({
      direction: -1,
      contentPixels: -40,
      residualPixels: 0
    });
    expect(scrollport.scrollTop).toBe(960);
  });

  it('returns one keyboard-sized 10svh step unchanged at the edge', () => {
    const { root } = readingLayer({ scrollTop: 1000 });

    expect(consumeReadingPixels({ root, pixels: 100 }).residualPixels).toBe(100);
  });

  it('does not claim input when the current layer is not a reading owner', () => {
    const root = {
      dataset: { reading: 'false' },
      matches: () => false,
      querySelector: () => null
    } as unknown as HTMLElement;

    expect(consumeReadingPixels({ root, pixels: 80 })).toEqual({
      owned: false,
      direction: 1,
      contentPixels: 0,
      residualPixels: 80
    });
  });
});
