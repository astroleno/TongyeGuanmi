// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ scroll: 0, actualScroll: 0, smooth: false, roundNative: false, truncateNative: false, limit: Infinity,
  wake: null as (() => void) | null, destroyed: false, options: {} as Record<string, unknown> }));
vi.mock('lenis', () => ({ default: class {
  constructor(options: Record<string, unknown>) { state.options = options; }
  get options() { return state.options; }
  get scroll() { return state.scroll; }
  get actualScroll() { return state.actualScroll; }
  get limit() { return state.limit; }
  get isScrolling() { return state.smooth ? 'smooth' : false; }
  raf() { state.scroll += state.smooth ? 10 : 0; }
  on(_type: string, fn: () => void) { state.wake = fn; return () => { state.wake = null; }; }
  scrollTo(y: number) {
    const target = Math.max(0, Math.min(state.limit, y));
    state.actualScroll = state.truncateNative ? Math.floor(target) : state.roundNative ? Math.round(target) : target;
    state.scroll = state.actualScroll; state.smooth = false;
  }
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
    Object.assign(state, { scroll: 0, actualScroll: 0, smooth: false, roundNative: false, truncateNative: false, limit: Infinity, wake: null, destroyed: false });
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
  it.each([[1000.4, false], [1000.6, false], [1000.6, true], [1000.99, true]] as const)(
    'keeps a parked seek at %s through native rounding (truncate=%s) and media wakes', (target, truncate) => {
    state.roundNative = true; state.truncateNative = truncate;
    const sample = vi.fn(); const source = createStoryScrollSource(sample); frame();
    source.seek(target); frame();
    expect(state.actualScroll).toBe(truncate ? Math.floor(target) : Math.round(target));
    expect(sample.mock.lastCall?.[0]).toBe(target);
    window.dispatchEvent(new Event('scroll')); frame();
    source.requestRender(); frame();
    expect(source.position()).toBe(target);
    expect(sample.mock.lastCall?.[0]).toBe(target);
    expect(frames.size).toBe(0); source.dispose();
  });
  it('drops the parked rounding correction on native movement and never reapplies it', () => {
    state.roundNative = true;
    const source = createStoryScrollSource(vi.fn()); frame(); source.seek(1000.4); frame();
    state.actualScroll = 1001; window.dispatchEvent(new Event('scroll')); frame();
    expect(source.position()).toBe(1001);
    state.actualScroll = 1000; window.dispatchEvent(new Event('scroll')); frame();
    expect(source.position()).toBe(1000); source.dispose();
  });
  it('drops the parked correction as soon as smooth input owns the position', () => {
    state.roundNative = true;
    const source = createStoryScrollSource(vi.fn()); frame(); source.seek(1000.4); frame();
    state.smooth = true; state.wake?.(); frame();
    expect(source.position()).toBe(state.scroll);
    state.smooth = false; frame();
    expect(source.position()).toBe(state.actualScroll); source.dispose();
  });
  it('preserves a parked landmark through suspend and resume without hiding native movement', () => {
    state.roundNative = true;
    const source = createStoryScrollSource(vi.fn()); frame(); source.seek(1000.4); frame();
    source.suspend(); source.resume(); frame();
    expect(source.position()).toBe(1000.4);
    source.suspend(); state.actualScroll = 1003; source.resume(); frame();
    expect(source.position()).toBe(1003); source.dispose();
  });
  it('preserves the logical terminal landmark when the native document limit truncates it', () => {
    state.truncateNative = true; state.limit = 1000;
    const source = createStoryScrollSource(vi.fn()); frame();
    source.seek(1000.75); frame();
    expect(state.actualScroll).toBe(1000);
    expect(source.position()).toBe(1000.75); source.dispose();
  });
  it('does not preserve out-of-bounds coordinates beyond the native subpixel residual', () => {
    state.roundNative = true; state.limit = 1000;
    const source = createStoryScrollSource(vi.fn()); frame();
    source.seek(1001); frame(); expect(source.position()).toBe(1000);
    source.seek(-.4); frame(); expect(source.position()).toBe(0);
    source.seek(NaN); frame(); expect(source.position()).toBe(0); source.dispose();
  });
  it('retains a parked landmark when reduced motion changes without native movement', () => {
    const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => media); state.roundNative = true;
    const source = createStoryScrollSource(vi.fn(), { syncTouch: true }); frame();
    source.seek(1000.4); frame();
    const change = media.addEventListener.mock.calls[0]![1] as () => void;
    media.matches = true; change(); frame();
    expect(source.position()).toBe(1000.4); expect(state.options.syncTouch).toBe(false);
    media.matches = false; change(); frame();
    expect(source.position()).toBe(1000.4); expect(state.options.syncTouch).toBe(true);
    source.dispose();
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
