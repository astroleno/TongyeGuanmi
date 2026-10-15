// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ scroll: 0, actualScroll: 0, smooth: false,
  wake: null as (() => void) | null, destroyed: false, options: {} as Record<string, unknown> }));
vi.mock('lenis', () => ({ default: class {
  constructor(options: Record<string, unknown>) { state.options = options; }
  get options() { return state.options; }
  get scroll() { return state.scroll; }
  get actualScroll() { return state.actualScroll; }
  get isScrolling() { return state.smooth ? 'smooth' : false; }
  raf() { state.scroll += state.smooth ? 10 : 0; }
  on(_type: string, fn: () => void) { state.wake = fn; return () => { state.wake = null; }; }
  scrollTo(y: number) { state.scroll = y; state.actualScroll = y; state.smooth = false; }
  resize() {}
  destroy() { state.destroyed = true; }
} }));
import { createStoryScrollSource } from './story-scroll-source';

describe('one native-document Lenis source', () => {
  let frames: Map<number, FrameRequestCallback>;
  let sequence: number;
  const frame = () => {
    const next = [...frames]; frames.clear();
    for (const [, callback] of next) callback(16 * sequence);
  };
  beforeEach(() => {
    frames = new Map(); sequence = 0;
    Object.assign(state, { scroll: 0, actualScroll: 0, smooth: false, wake: null, destroyed: false });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps desktop touch native and uses real Lenis without a second RAF', () => {
    const sample = vi.fn(); const source = createStoryScrollSource(sample);
    expect(state.options).toMatchObject({ autoRaf: false, syncTouch: false, anchors: false });
    frame(); expect(sample).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
    state.smooth = true; state.wake?.(); state.wake?.();
    expect(frames.size).toBe(1); frame(); expect(frames.size).toBe(1);
    state.smooth = false; frame(); expect(frames.size).toBe(0);
    source.dispose(); expect(state.destroyed).toBe(true);
  });
  it('enables the standard Lenis touch curve only when requested and retains one frame owner', () => {
    const sample = vi.fn(); const source = createStoryScrollSource(sample, { syncTouch: true });
    expect(state.options).toMatchObject({ autoRaf: false, syncTouch: true, touchMultiplier: 1,
      syncTouchLerp: .075, touchInertiaExponent: 1.7, lerp: .18 });
    frame(); state.smooth = true; state.wake?.(); state.wake?.();
    expect(frames.size).toBe(1); frame(); expect(frames.size).toBe(1);
    state.actualScroll = 123; window.dispatchEvent(new Event('touchcancel')); frame();
    expect(state.smooth).toBe(false); expect(sample.mock.lastCall?.[0]).toBe(123);
    expect(frames.size).toBe(0); source.dispose();
    window.dispatchEvent(new Event('touchcancel')); expect(frames.size).toBe(0);
  });
  it('leaves pinch, zoom and text selection native for the entire touch gesture', () => {
    const source = createStoryScrollSource(vi.fn(), { syncTouch: true });
    const allow = state.options.virtualScroll as (data: { event: object }) => boolean;
    const touch = (type: string, fingers: number) => allow({ event: { type, touches: Array(fingers) } });
    expect(touch('touchstart', 1)).toBe(true);
    state.smooth = true; state.actualScroll = 100;
    expect(touch('touchstart', 2)).toBe(false); expect(state.smooth).toBe(false);
    expect(touch('touchmove', 1)).toBe(false); expect(touch('touchend', 0)).toBe(false);
    expect(touch('touchstart', 1)).toBe(true);
    vi.stubGlobal('visualViewport', { scale: 2 });
    expect(touch('touchmove', 1)).toBe(false);
    vi.stubGlobal('visualViewport', { scale: 1 });
    vi.spyOn(document, 'getSelection').mockReturnValue({ isCollapsed: false } as Selection);
    expect(touch('touchstart', 1)).toBe(false);
    expect(allow({ event: { type: 'wheel' } })).toBe(true);
    vi.restoreAllMocks(); source.dispose();
  });
  it('does not take scrolling from editable controls or the open mobile menu', () => {
    const source = createStoryScrollSource(vi.fn(), { syncTouch: true });
    const prevent = state.options.prevent as (node: HTMLElement) => boolean;
    for (const tag of ['input', 'textarea', 'select']) expect(prevent(document.createElement(tag))).toBe(true);
    const editable = document.createElement('div'); editable.setAttribute('contenteditable', '');
    expect(prevent(editable)).toBe(true);
    const menu = document.createElement('nav'); menu.className = 'site-nav'; menu.dataset.menuOpen = 'true';
    const link = document.createElement('a'); menu.append(link); expect(prevent(link)).toBe(true);
    menu.dataset.menuOpen = 'false'; expect(prevent(link)).toBe(false);
    source.dispose();
  });
  it('accepts native scroll, cancels old inertia on seek and never replays hidden time', () => {
    const sample = vi.fn(); const source = createStoryScrollSource(sample); frame();
    state.actualScroll = 340; window.dispatchEvent(new Event('scroll')); frame();
    expect(sample.mock.lastCall?.[0]).toBe(340);
    expect(source.position()).toBe(340);
    expect(state.scroll).toBe(0);
    state.smooth = true; source.seek(1500); frame();
    expect(sample.mock.lastCall?.[0]).toBe(1500);
    state.smooth = true; state.actualScroll = 1520;
    source.suspend(); expect(frames.size).toBe(0);
    source.resume(); frame(); expect(sample.mock.lastCall?.[0]).toBe(1520);
    source.dispose(); window.dispatchEvent(new Event('scroll')); expect(frames.size).toBe(0);
  });
  it('disables smoothing and clears existing inertia when reduced motion changes', () => {
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => media);
    const source = createStoryScrollSource(vi.fn(), { syncTouch: true });
    expect(state.options.smoothWheel).toBe(false);
    expect(state.options.syncTouch).toBe(false);
    const change = media.addEventListener.mock.calls[0]![1] as () => void;
    media.matches = false; change(); expect(state.options.smoothWheel).toBe(true);
    expect(state.options.syncTouch).toBe(true);
    state.smooth = true; state.actualScroll = 400;
    media.matches = true; change(); expect(state.smooth).toBe(false); expect(source.position()).toBe(400);
    expect(state.options.syncTouch).toBe(false);
    source.dispose(); expect(media.removeEventListener).toHaveBeenCalledWith('change', change);
  });
});
