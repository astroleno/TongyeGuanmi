import { describe, expect, it } from 'vitest';
import { canonicalSceneIds, canonicalSegments } from './canonical-spine';
import { createScrollSpine, locateScrollPosition, positionForScrollAnchor, scrollAuthoredProgress } from './scroll-spine';

describe('continuous story coordinates', () => {
  const spine = () => createScrollSpine({ viewportHeight: 800,
    contentHeights: { 'method-top': 2000, 'figure2-proof': 3200, services: 1800 } });

  it.each(['desktop', 'phone'] as const)('preserves v55 active-time ratios on %s without allocating waiting time', (platform) => {
    const index = createScrollSpine({ viewportHeight: 1200, platform });
    const milliseconds = [2700, 3600, 1200, 2600, 1200, 4100, 1200, 1200, 2600, 1200, 3100, 1200, 2120, 1200,
      platform === 'phone' ? 3400 : 3000];
    const segments = index.ranges.filter(r => r.kind === 'segment');
    segments.forEach((range, i) => expect(range.end - range.start).toBeCloseTo(milliseconds[i]!));
    expect(segments[3]!.end - segments[3]!.start).toBeCloseTo(segments[8]!.end - segments[8]!.start);
  });

  it('maps Figure2 active time through both authored phases without a dwell or discontinuity', () => {
    const boundary = 2600 / 4100;
    expect(scrollAuthoredProgress('figure2-distance-expand', .5)).toBeCloseTo(.72 * 2050 / 2600);
    expect(scrollAuthoredProgress('figure2-distance-expand', boundary)).toBeCloseTo(.72);
    expect(scrollAuthoredProgress('figure2-distance-expand', boundary + 1e-6)).toBeGreaterThan(.72);
    expect(scrollAuthoredProgress('figure2-distance-expand', boundary - 1e-6)).toBeLessThan(.72);
    expect(scrollAuthoredProgress('figure2-distance-expand', 3350 / 4100)).toBeCloseTo(.86);
    for (const p of [0, .2, .5, .8, 1]) {
      for (const id of ['pattern-star-map', 'ttg-lab', 'ph-education', 'crane-contact'] as const)
        expect(scrollAuthoredProgress(id, p)).toBeCloseTo(p);
    }
    expect(scrollAuthoredProgress('figure2-distance-expand', -1)).toBe(0);
    expect(scrollAuthoredProgress('figure2-distance-expand', 2)).toBe(1);
    expect(scrollAuthoredProgress('figure2-distance-expand', Number.NaN)).toBe(0);
  });

  it('retains every canonical scene and transition in order with no gaps', () => {
    const index = spine();
    expect(index.scenes.map(({ scene }) => scene)).toEqual(canonicalSceneIds);
    expect(index.ranges.filter(({ kind }) => kind === 'segment').map(({ id }) => id))
      .toEqual(canonicalSegments.map(({ id }) => id));
    index.ranges.forEach((range, i) => {
      expect(range.start).toBe(i ? index.ranges[i - 1]!.end : 0);
      expect(range.end).toBeGreaterThanOrEqual(range.start);
    });
    expect(index.totalHeight).toBe(index.maxScroll + 800);
  });

  it('measures reading from content, without a per-gesture or one-screen cap', () => {
    const index = spine();
    const method = index.scenes.find(({ scene }) => scene === 'method-top')!;
    expect(method.readingEnd - method.start).toBeCloseTo(1200, 9);
    const position = locateScrollPosition(index, method.start + 1100);
    expect(position).toMatchObject({ kind: 'hold', scene: 'method-top' });
    expect(position.readingOffset).toBeCloseTo(1100, 9);
    const next = locateScrollPosition(index, method.readingEnd + 400);
    expect(next).toMatchObject({ kind: 'segment', segment: 'method-bottom-figure2' });
    expect(next.progress).toBeCloseTo(.5, 12);
  });

  it.each(canonicalSegments)('can stop and directly locate every point of $id', ({ id }) => {
    const index = spine();
    const range = index.ranges.find((entry) => entry.id === id)!;
    for (const progress of [0, .25, .5, .75]) {
      const y = range.start + (range.end - range.start) * progress;
      const first = locateScrollPosition(index, y);
      locateScrollPosition(index, index.maxScroll);
      expect(locateScrollPosition(index, y)).toEqual(first);
      expect(first).toMatchObject({ kind: 'segment', segment: id });
      expect(first.progress).toBeCloseTo(progress, 12);
      expect(positionForScrollAnchor(index, { rangeId: id, progress })).toBeCloseTo(y);
    }
  });

  it('crosses arbitrarily many ranges without running intervening scenes', () => {
    const index = spine();
    const target = index.ranges.find(({ id }) => id === 'ph-education')!;
    const position = locateScrollPosition(index, target.start + (target.end - target.start) * .65);
    expect(position).toMatchObject({ kind: 'segment', segment: 'ph-education' });
    expect(position.progress).toBeCloseTo(.65, 12);
  });

  it('has deterministic boundary ownership in both directions', () => {
    const index = spine();
    const range = index.ranges.find(({ id }) => id === 'hero-pattern')!;
    expect(locateScrollPosition(index, range.end - .001).kind).toBe('segment');
    expect(locateScrollPosition(index, range.end)).toMatchObject({ kind: 'hold', scene: 'pattern' });
    expect(locateScrollPosition(index, range.end + .001)).toMatchObject({ kind: 'hold', scene: 'pattern' });
  });

  it('clamps invalid positions and restores reading anchors after reflow', () => {
    const index = spine();
    expect(locateScrollPosition(index, Number.NaN).scene).toBe('hero');
    expect(locateScrollPosition(index, -100).scene).toBe('hero');
    expect(locateScrollPosition(index, Infinity).scene).toBe('contact');
    expect(positionForScrollAnchor(index, { rangeId: 'missing', progress: .5 })).toBe(0);
    const anchor = { rangeId: 'hold:method-top', progress: .5, readingOffset: 500 };
    const resized = createScrollSpine({ viewportHeight: 600, contentHeights: { 'method-top': 2400 } });
    const target = positionForScrollAnchor(resized, anchor);
    expect(locateScrollPosition(resized, target).readingOffset).toBe(500);
  });

  it('keeps all scenes navigable with zero overflow and reduced motion', () => {
    const index = createScrollSpine({ viewportHeight: 800, reducedMotion: true });
    expect(index.ranges.every(({ kind }) => kind === 'hold')).toBe(true);
    for (const scene of canonicalSceneIds) {
      const y = positionForScrollAnchor(index, { rangeId: `hold:${scene}`, progress: 0 });
      expect(locateScrollPosition(index, y).scene).toBe(scene);
    }
  });

  it('rejects unusable viewport geometry instead of producing NaN ranges', () => {
    expect(() => createScrollSpine({ viewportHeight: 0 })).toThrow('viewport');
    expect(() => createScrollSpine({ viewportHeight: Number.NaN })).toThrow('viewport');
  });
});
