import { describe, expect, it } from 'vitest';

import { createReadingHandoff } from './reading-handoff';

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
  it('spends physical distance on the scene scrollport before commitment or Director intent', () => {
    const handoff = createReadingHandoff();
    const { root, scrollport } = readingLayer();

    const result = handoff.consume({
      scene: 'method-top',
      root,
      pixels: 420,
      viewportHeight: 1000,
      now: 0
    });

    expect(scrollport.scrollTop).toBe(420);
    expect(result).toMatchObject({
      owned: true,
      contentPixels: 420,
      commitmentPixels: 0,
      residualPixels: 0,
      directorDelta: 0
    });
  });

  it('spends a large edge-crossing event on content, then releases one combined 10svh plus residual intent', () => {
    const handoff = createReadingHandoff();
    const { root, scrollport } = readingLayer({ scrollTop: 950 });

    const result = handoff.consume({
      scene: 'method-top',
      root,
      pixels: 200,
      viewportHeight: 1000,
      now: 0
    });

    expect(scrollport.scrollTop).toBe(1000);
    expect(result).toMatchObject({
      contentPixels: 50,
      commitmentPixels: 100,
      residualPixels: 50,
      directorDelta: 0.15,
      committed: true
    });
  });

  it('does not release 9.9svh and emits the threshold plus residual exactly once when crossed', () => {
    const handoff = createReadingHandoff();
    const { root } = readingLayer({ scrollTop: 1000 });

    expect(handoff.consume({
      scene: 'method-top',
      root,
      pixels: 99,
      viewportHeight: 1000,
      now: 0
    })).toMatchObject({ commitmentPixels: 99, residualPixels: 0, directorDelta: 0 });

    expect(handoff.consume({
      scene: 'method-top',
      root,
      pixels: 2,
      viewportHeight: 1000,
      now: 16
    })).toMatchObject({ commitmentPixels: 1, residualPixels: 1, directorDelta: 0.101 });

    expect(handoff.consume({
      scene: 'method-top',
      root,
      pixels: 20,
      viewportHeight: 1000,
      now: 32
    })).toMatchObject({ owned: false, commitmentPixels: 0, residualPixels: 20, directorDelta: 0.02 });
  });

  it('clears forward commitment on reversal before beginning reverse ownership', () => {
    const handoff = createReadingHandoff();
    const { root, scrollport } = readingLayer({ scrollTop: 1000 });
    handoff.consume({
      scene: 'method-top',
      root,
      pixels: 90,
      viewportHeight: 1000,
      now: 0
    });

    const reverse = handoff.consume({
      scene: 'method-top',
      root,
      pixels: -40,
      viewportHeight: 1000,
      now: 16
    });

    expect(scrollport.scrollTop).toBe(960);
    expect(reverse).toMatchObject({
      direction: -1,
      contentPixels: -40,
      commitmentPixels: 0,
      residualPixels: 0
    });
    expect(handoff.snapshot().accumulatedPixels).toBe(0);
  });

  it('treats one keyboard viewport step as exactly one commitment band at the edge', () => {
    const handoff = createReadingHandoff();
    const { root } = readingLayer({ scrollTop: 1000 });

    expect(handoff.consume({
      scene: 'method-top',
      root,
      pixels: 100,
      viewportHeight: 1000,
      now: 0
    }).directorDelta).toBe(0.1);
  });

  it('resets partial commitment on idle, scene change, and explicit viewport reset', () => {
    const handoff = createReadingHandoff({ idleMs: 200 });
    const method = readingLayer({ scrollTop: 1000 });
    const lab = readingLayer({ scrollTop: 1000 });

    handoff.consume({ scene: 'method-top', root: method.root, pixels: 90, viewportHeight: 1000, now: 0 });
    expect(handoff.consume({
      scene: 'method-top',
      root: method.root,
      pixels: 20,
      viewportHeight: 1000,
      now: 250
    }).directorDelta).toBe(0);

    handoff.consume({ scene: 'lab', root: lab.root, pixels: 50, viewportHeight: 1000, now: 260 });
    expect(handoff.snapshot()).toMatchObject({ scene: 'lab', accumulatedPixels: 50 });

    handoff.reset('viewport-change');
    expect(handoff.snapshot()).toMatchObject({ scene: undefined, accumulatedPixels: 0 });
  });

  it('does not claim input when the current layer is not a reading owner', () => {
    const handoff = createReadingHandoff();
    const root = {
      dataset: { reading: 'false' },
      matches: () => false,
      querySelector: () => null
    } as unknown as HTMLElement;

    expect(handoff.consume({
      scene: 'hero',
      root,
      pixels: 80,
      viewportHeight: 1000,
      now: 0
    })).toMatchObject({ owned: false, residualPixels: 80, directorDelta: 0.08 });
  });
});
