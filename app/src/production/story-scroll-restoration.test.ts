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
    expect(scrollPositionForHash(index, '#figure2-proof-cards', root)).toBe(start + 800);
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
