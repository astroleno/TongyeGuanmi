// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalSceneIds } from '../story/canonical-spine';
import { locateScrollPosition } from '../story/scroll-spine';
import { createStoryScrollLayout } from './story-scroll-layout';

describe('single document scroll geometry', () => {
  let root: HTMLElement;
  let observed: HTMLElement[];
  let disconnect: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    observed = []; disconnect = vi.fn();
    vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('ResizeObserver', class {
      observe(node: HTMLElement) { observed.push(node); }
      disconnect = disconnect;
    });
    root = document.createElement('main');
    for (const scene of canonicalSceneIds) {
      const slot = document.createElement('div'); slot.dataset.scrollSlot = scene;
      const surface = document.createElement('section'); surface.dataset.scrollContent = scene;
      slot.append(surface); root.append(slot);
    }
    document.body.append(root);
  });
  afterEach(() => { root.remove(); vi.unstubAllGlobals(); });
  it('keeps the phone Crane duration in initial layout and subsequent measurements', () => {
    root.dataset.scrollPlatform = 'phone';
    const layout = createStoryScrollLayout(root, vi.fn());
    for (const measure of [false, true]) {
      if (measure) layout.measure();
      const range = layout.getIndex().ranges.find(r => r.id === 'crane-contact')!;
      expect((range.end - range.start) / 844).toBeCloseTo(3400 / 1200);
    }
    layout.dispose();
  });
  it('makes the terminal landmark reachable after native limit truncation without changing authored ranges', () => {
    root.dataset.scrollPlatform = 'phone';
    const layout = createStoryScrollLayout(root, vi.fn()); layout.measure();
    const index = layout.getIndex();
    expect(Number.isInteger(index.maxScroll)).toBe(false);
    const nativeLimit = Math.floor(Number.parseFloat(root.style.minHeight) - index.viewportHeight);
    expect(nativeLimit).toBeGreaterThanOrEqual(index.maxScroll);
    expect(nativeLimit - index.maxScroll).toBeLessThan(1);
    expect(layout.locate(nativeLimit).rangeId).toBe('hold:contact');
    const crane = index.ranges.find(range => range.id === 'crane-contact')!;
    expect((crane.end - crane.start) / 844).toBeCloseTo(3400 / 1200, 12);
    layout.dispose();
  });
  it('clips incoming reading to the viewport while preserving full reading geometry and hiding unprepared receivers', () => {
    const proof = root.querySelector<HTMLElement>('[data-scroll-content="figure2-proof"]')!;
    Object.defineProperty(proof, 'scrollHeight', { value: 2532 });
    const layout = createStoryScrollLayout(root, vi.fn()); layout.measure();
    const reveal = layout.getIndex().ranges.find((range) => range.id === 'figure2-distance-expand')!;
    layout.paint(layout.locate(reveal.start + 100));
    expect(proof.style.height).toBe('var(--story-height)');
    expect(proof.style.overflow).toBe('hidden');
    expect(proof.style.opacity).toBe('0');
    layout.measure();
    expect(layout.getIndex().scenes.find(({ scene }) => scene === 'figure2-proof')?.contentHeight).toBe(2532);
    const reading = layout.getIndex().ranges.find((range) => range.id === 'hold:figure2-proof')!;
    layout.paint(layout.locate(reading.start + 100));
    expect(proof.style.height).toBe(''); expect(proof.style.overflow).toBe('');
    expect(proof.style.position).toBe('relative'); expect(proof.style.opacity).toBe('1');
    layout.dispose();
  });
  it('measures each reading surface once and updates outgoing bottom after late content growth', () => {
    const surface = root.querySelector<HTMLElement>('[data-scroll-content="method-top"]')!;
    let height = 1800;
    Object.defineProperty(surface, 'scrollHeight', { get: () => height });
    const changed = vi.fn(); const layout = createStoryScrollLayout(root, changed);
    layout.measure();
    expect(observed).toHaveLength(7);
    const range = layout.getIndex().ranges.find((r) => r.id === 'method-bottom-figure2')!;
    layout.paint(locateScrollPosition(layout.getIndex(), range.start + 100));
    expect(surface.style.position).toBe('fixed'); expect(surface.style.top).toBe('0px');
    expect(surface.style.height).toBe('var(--story-height)');
    expect(surface.style.overflow).toBe('hidden'); expect(surface.scrollTop).toBe(956);
    height = 2100; layout.measure();
    const restored = changed.mock.lastCall![1] as number;
    layout.paint(layout.locate(restored));
    expect(surface.style.top).toBe('0px'); expect(surface.scrollTop).toBe(1256);
    expect(surface.inert).toBe(false);
    expect(surface.style.pointerEvents).toBe('none');
    const hold = layout.getIndex().ranges.find(r => r.id === 'hold:method-top')!;
    layout.paint(layout.locate(hold.start + 10));
    expect(surface.inert).toBe(false); expect(surface.style.pointerEvents).toBe('auto');
    expect(root.querySelector<HTMLElement>('[data-scroll-content="hero"]')!.inert).toBe(true);
    layout.dispose(); expect(disconnect).toHaveBeenCalledOnce();
    const count = changed.mock.calls.length; window.dispatchEvent(new Event('resize'));
    expect(changed).toHaveBeenCalledTimes(count);
  });
  it('ignores phone address-bar height for distances but reflows real rotation', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('coarse'), addEventListener() {}, removeEventListener() {} }));
    const layout = createStoryScrollLayout(root, vi.fn()); layout.measure();
    const initial = layout.getIndex().maxScroll;
    vi.stubGlobal('innerHeight', 760); layout.measure();
    expect(layout.getIndex().maxScroll).toBe(initial);
    expect(root.style.getPropertyValue('--phone-visual-height')).toBe('760px');
    vi.stubGlobal('innerWidth', 844); vi.stubGlobal('innerHeight', 390); layout.measure();
    expect(layout.getIndex().viewportHeight).toBe(390);
    expect(layout.getIndex().maxScroll).toBeLessThan(initial);
    layout.dispose();
  });
  it('refreshes the reading bookmark after a seek reaches the native document', () => {
    const surface = root.querySelector<HTMLElement>('[data-scroll-content="method-top"]')!;
    const text = document.createElement('p'); surface.append(text);
    Object.defineProperty(surface, 'scrollHeight', { value: 1800 });
    const changed = vi.fn(); const layout = createStoryScrollLayout(root, changed); layout.measure();
    let textOffset = 500;
    const start = () => layout.getIndex().ranges.find(r => r.id === 'hold:method-top')!.start;
    surface.getBoundingClientRect = () => ({ top: start() - window.scrollY } as DOMRect);
    text.getBoundingClientRect = () => {
      const top = start() + textOffset - window.scrollY;
      return { top, bottom: top + 50, height: 50 } as DOMRect;
    };
    const y = start() + 400;
    vi.stubGlobal('scrollY', start()); layout.paint(layout.locate(y));
    // The semantic position was painted first; this second paint observes the
    // same position after the document has actually moved.
    vi.stubGlobal('scrollY', y); layout.paint(layout.locate(y));
    textOffset = 450;
    vi.stubGlobal('innerWidth', 800); layout.measure();
    expect(changed.mock.lastCall![1]).toBe(start() + 350);
    layout.dispose();
  });
});
