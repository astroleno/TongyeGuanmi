// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createScrollSpine, locateScrollPosition } from '../story/scroll-spine';
import { readSavedScrollAnchor, remapScrollAnchor, restoreScrollTextBookmark, scrollPositionForHash } from './story-scroll-restoration';

describe('semantic scroll restoration', () => {
  it('maps a removed animation range to its visible chapter when reducing motion', () => {
    const index = createScrollSpine({ viewportHeight: 800, reducedMotion: true });
    expect(locateScrollPosition(index, remapScrollAnchor(index, { rangeId: 'ph-education', progress: .8 })).scene).toBe('education');
    expect(locateScrollPosition(index, remapScrollAnchor(index, { rangeId: 'ph-education', progress: .2 })).scene).toBe('ph-animation');
  });
  it('validates saved state without trusting arbitrary history data', () => {
    expect(readSavedScrollAnchor({ rangeId: 'hold:lab', progress: .5, readingOffset: 330 })).toEqual({ rangeId: 'hold:lab', progress: .5, readingOffset: 330 });
    expect(readSavedScrollAnchor({ rangeId: 'hold:lab', progress: 'oops' })).toBeNull();
    expect(readSavedScrollAnchor(null)).toBeNull();
  });
  it('resolves existing Proof aliases inside the single reading surface', () => {
    const index = createScrollSpine({ viewportHeight: 800, contentHeights: { 'figure2-proof': 2400 } });
    const root = document.createElement('main');
    root.innerHTML = '<section data-scroll-content="figure2-proof"><div data-r4-proof-panel="cards"></div></section>';
    const surface = root.firstElementChild as HTMLElement;
    const node = surface.firstElementChild as HTMLElement;
    surface.getBoundingClientRect = () => ({ top: -900 } as DOMRect);
    node.getBoundingClientRect = () => ({ top: -100 } as DOMRect);
    const start = index.ranges.find(({ id }) => id === 'hold:figure2-proof')!.start;
    expect(scrollPositionForHash(index, '#figure2-proof-cards', root)).toBe(Math.round(start + 800));
  });
  it.each(['desktop', 'phone'] as const)('keeps chapter targets inside the hold after native pixel rounding on %s', platform => {
    const index = createScrollSpine({ viewportHeight: 844, platform, contentHeights: {
      'method-top': 1800, 'figure2-proof': 2600, brand: 1600,
      services: 2200, lab: 1900, education: 2000, contact: 1700
    } });
    const root = document.createElement('main');
    for (const range of index.ranges.filter(range => range.kind === 'hold' && range.reading)) {
      const hash = range.scene === 'method-top' ? '#method' : `#${range.scene}`;
      const target = scrollPositionForHash(index, hash, root);
      expect(target).toBe(Math.ceil(range.start));
      expect(locateScrollPosition(index, Math.round(target)).rangeId).toBe(range.id);
    }
    // This fractional start formerly rounded back into ph-education.
    const education = index.ranges.find(({ id }) => id === 'hold:education')!;
    expect(Math.round(education.start)).toBeLessThan(education.start);
  });
  it('clamps a late Proof alias to the last reachable pixel before the outgoing transition', () => {
    const index = createScrollSpine({ viewportHeight: 844, contentHeights: { 'figure2-proof': 2400 } });
    const root = document.createElement('main');
    root.innerHTML = '<section data-scroll-content="figure2-proof"><div data-r4-proof-panel="closing"></div></section>';
    const surface = root.firstElementChild as HTMLElement;
    const node = surface.firstElementChild as HTMLElement;
    surface.getBoundingClientRect = () => ({ top: -900 } as DOMRect);
    node.getBoundingClientRect = () => ({ top: 3000 } as DOMRect);
    const range = index.ranges.find(({ id }) => id === 'hold:figure2-proof')!;
    const target = scrollPositionForHash(index, '#figure2-proof-closing', root);
    expect(target).toBe(Math.ceil(range.end) - 1);
    expect(locateScrollPosition(index, target).rangeId).toBe(range.id);
  });
  it('resolves a Proof alias independently of its outgoing transition scrollTop', () => {
    const index = createScrollSpine({ viewportHeight: 900, contentHeights: { 'figure2-proof': 2700 } });
    const root = document.createElement('main');
    root.innerHTML = '<section data-scroll-content="figure2-proof"><div data-r4-proof-panel="closing"></div></section>';
    const surface = root.firstElementChild as HTMLElement, node = surface.firstElementChild as HTMLElement;
    surface.scrollTop = 1800;
    surface.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
    node.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
    const range = index.ranges.find(r => r.id === 'hold:figure2-proof')!;
    expect(scrollPositionForHash(index, '#figure2-proof-closing', root)).toBe(Math.ceil(range.end) - 1);
  });
  it('preserves zero-length scene landmarks', () => {
    const index = createScrollSpine({ viewportHeight: 844 });
    const range = index.ranges.find(({ id }) => id === 'hold:brand')!;
    expect(range.end).toBe(range.start);
    expect(scrollPositionForHash(index, '#brand', document.createElement('main'))).toBe(range.start);
  });
  it('preserves the visible text block after reflow and rejects a detached block', () => {
    const index = createScrollSpine({ viewportHeight: 800, contentHeights: { lab: 2000 } });
    const surface = document.createElement('article'); const node = document.createElement('p'); surface.append(node);
    surface.getBoundingClientRect = () => ({ top: -400 } as DOMRect);
    node.getBoundingClientRect = () => ({ top: 170 } as DOMRect);
    const bookmark = { rangeId: 'hold:lab', node, viewportTop: 50 };
    const start = index.ranges.find(({ id }) => id === 'hold:lab')!.start;
    expect(restoreScrollTextBookmark(bookmark, surface, index)).toBe(start + 520);
    node.remove(); expect(restoreScrollTextBookmark(bookmark, surface, index)).toBeNull();
  });
});
