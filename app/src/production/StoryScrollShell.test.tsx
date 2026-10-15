// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryScrollPlatform } from './StoryScrollShell';
import type { ScrollPosition, ScrollSpine } from '../story/scroll-spine';
const sourceState = vi.hoisted(() => ({ sources: [] as Array<{ disposed: boolean; frame(y: number, now: number): void }> }));
const loaderState = vi.hoisted(() => ({ props: null as import('./StoryLoader').StoryLoaderProps | null }));
vi.mock('./story-scroll-source', () => ({ createStoryScrollSource: (frame: (y: number, now: number) => void) => {
  const source = { disposed: false, frame }; sourceState.sources.push(source);
  return { position: () => 0, seek() {}, resize() {}, requestRender() {}, suspend() {}, resume() {}, dispose() { source.disposed = true; } };
} }));
vi.mock('./StoryLoader', () => ({ StoryLoader: (props: import('./StoryLoader').StoryLoaderProps) => { loaderState.props = props; return null; } }));
vi.mock('./StoryNav', () => ({ StoryNav: () => null, PhoneStoryFaultActions: () => null, activateStaticReading: vi.fn() }));
import { StoryScrollShell } from './StoryScrollShell';

describe('shared continuous shell lifecycle', () => {
  beforeEach(() => { history.replaceState(null, '', '/'); loaderState.props = null; });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); sourceState.sources.length = 0; });
  it('restores the cold loader and runs an interruptible Hero entrance on the shared frame owner', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const makePlatform = (): StoryScrollPlatform => ({
      Scene: ({ scene }) => <article>{scene}</article>, dispose() {},
      adapter: { prepare: async () => ({ render: (p, i) => ({ progress: p.progress, epoch: i.epoch, revision: i.revision }), pause() {}, dispose() {} }) }
    });
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<StoryScrollShell platform="desktop" createPlatform={makePlatform} />));
      const stage = container.querySelector<HTMLElement>('[data-scroll-platform]')!;
      expect(stage.querySelectorAll('.stage-layer')).toHaveLength(16);
      expect(stage.style.background).toBe('');
      expect(loaderState.props?.mode).toBe('cold-hero');
      await act(async () => sourceState.sources.at(-1)!.frame(0, 100));
      expect(stage.dataset.scrollEntryProgress).toBe('0');
      await act(async () => loaderState.props?.onHidden?.('ready'));
      await act(async () => sourceState.sources.at(-1)!.frame(0, 200));
      await act(async () => sourceState.sources.at(-1)!.frame(0, 1360));
      expect(Number(stage.dataset.scrollEntryProgress)).toBeCloseTo(.5);
      await act(async () => window.dispatchEvent(new Event('wheel')));
      expect(stage.dataset.scrollEntryProgress).toBe('1');
      await act(async () => sourceState.sources.at(-1)!.frame(0, 1400));
      expect(stage.dataset.scrollEntryProgress).toBe('1');
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
  it('coalesces scroll-end history writes, flushes page hide and cancels on unmount', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const makePlatform = (): StoryScrollPlatform => ({
      Scene: ({ scene }) => <article>{scene}</article>, dispose() {},
      adapter: { prepare: async () => ({ render: (p, i) => ({ progress: p.progress, epoch: i.epoch, revision: i.revision }), pause() {}, dispose() {} }) }
    });
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<StoryScrollShell platform="phone" createPlatform={makePlatform} />));
    const replace = vi.spyOn(history, 'replaceState');
    for (let i = 0; i < 120; i++) window.dispatchEvent(new Event('scrollend'));
    expect(replace).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(160));
    expect(replace).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('scrollend'));
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    expect(replace).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(160));
    expect(replace).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('scrollend'));
    await act(async () => root.unmount());
    await act(async () => vi.advanceTimersByTime(160));
    expect(replace).toHaveBeenCalledTimes(2);
    container.remove();
  });
  it('survives StrictMode reattachment with one live source and removes ownership on unmount', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const dispose = vi.fn();
    const makePlatform = (): StoryScrollPlatform => ({
      Scene: ({ scene }) => <article><h2>{scene}</h2></article>, dispose,
      adapter: { prepare: async () => ({ render: (p, i) => ({ progress: p.progress, epoch: i.epoch, revision: i.revision }), pause() {}, dispose() {} }) }
    });
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<StrictMode><StoryScrollShell platform="phone" createPlatform={makePlatform} /></StrictMode>));
    expect(sourceState.sources.length).toBe(2);
    expect(sourceState.sources.filter((source) => !source.disposed)).toHaveLength(1);
    expect(container.querySelectorAll('[data-scroll-content="method-top"] article')).toHaveLength(1);
    expect(document.documentElement.dataset.storyScroll).toBe('phone');
    expect(container.querySelector('.stage-layer')).toBeNull();
    expect(container.querySelector<HTMLElement>('main')!.style.background).toBe('rgb(4, 8, 7)');
    const api = (window as unknown as { __r5ScrollStory: {
      index(): ScrollSpine; seek(y: number): void; snapshot(): { desired: ScrollPosition };
    } }).__r5ScrollStory;
    const range = api.index().ranges.find((range) => range.id === 'figure2-distance-expand')!;
    await act(async () => {
      api.seek(range.start + (range.end - range.start) * .65);
      // A resize observer can run before the next RAF: explicit seeks must
      // already own the semantic position rather than restore the old chapter.
      expect(api.snapshot().desired.rangeId).toBe(range.id);
      expect(api.snapshot().desired.progress).toBeCloseTo(.65);
    });
    await act(async () => root.unmount());
    expect(sourceState.sources.every((source) => source.disposed)).toBe(true);
    expect(document.documentElement.dataset.storyScroll).toBeUndefined();
    expect((window as unknown as { __r5ScrollStory?: unknown }).__r5ScrollStory).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(2);
    container.remove();
  });
});
