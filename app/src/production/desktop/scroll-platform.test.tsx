// @vitest-environment jsdom
import { act, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { SceneModule, TransitionContext } from '../../story/types';
const source = vi.hoisted(() => ({ promise: null as Promise<SceneModule> | null }));
vi.mock('./module-loaders', () => ({ loadDesktopSceneModule: () => source.promise, loadDesktopTransitionModule: vi.fn() }));
import { createDesktopScrollPlatform } from './scroll-platform';
import { loadDesktopTransitionModule } from './module-loaders';
import { canvasLeaseGuard, windowOwnsCanvas } from '../../media/scroll-canvas-window';
import { createScrollSpine, locateScrollPosition, positionForScrollAnchor } from '../../story/scroll-spine';

it('samples the authored Figure2 phase at its active-time position', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'); document.body.append(container);
  source.promise = Promise.resolve({ id: 'figure2-animation', Component: () => <article>Scene</article>,
    preload: () => ({ milestones: [] }), renderHold() {} });
  const progress = vi.fn();
  vi.mocked(loadDesktopTransitionModule).mockResolvedValue({ id: 'figure2-distance-expand', buildTimeline() {
    return { play: async () => {}, reverse: async () => {}, progress, jumpToEnd() {}, dispose() {} };
  } });
  const platform = createDesktopScrollPlatform({ root: () => container, layer: () => container,
    measure() {}, requestWindow() {}, requestRender() {}, resourcesChanged() {} });
  const root = createRoot(container), Scene = platform.Scene, controller = new AbortController();
  try {
    await act(async () => root.render(<Suspense><Scene scene="figure2-animation" /><Scene scene="figure2-proof" /></Suspense>));
    const index = createScrollSpine({ viewportHeight: 900 });
    const pose = locateScrollPosition(index, positionForScrollAnchor(index, { rangeId: 'figure2-distance-expand', progress: .5 }));
    const intent = { generation: 1, epoch: 1, revision: 1, layoutRevision: 1 };
    const window = await platform.adapter.prepare(pose, intent, controller.signal);
    const frame = window.render(pose, intent);
    expect(progress.mock.lastCall?.[0]).toBeCloseTo(.72 * 2050 / 2600);
    expect(frame?.progress).toBeCloseTo(.5);
    window.dispose();
  } finally { controller.abort(); await act(async () => root.unmount()); platform.dispose(); container.remove(); vi.unstubAllGlobals(); }
});

it('reuses one transition canvas, rejects stale acquisition and retires it in reading', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'); document.body.append(container);
  source.promise = Promise.resolve({ id: 'pattern', Component: () => <article>Scene</article>,
    preload: () => ({ milestones: [] }), renderHold() {} });
  const contexts: TransitionContext[] = [], canvases: HTMLCanvasElement[] = [];
  vi.mocked(loadDesktopTransitionModule).mockResolvedValue({ id: 'hero-pattern', buildTimeline(context) {
    contexts.push(context); const canvas = context.acquireInkCanvas!(); canvases.push(canvas);
    container.append(canvas);
    return { play: async () => {}, reverse: async () => {}, progress() {}, jumpToEnd() {}, dispose: () => canvas.remove() };
  } });
  const platform = createDesktopScrollPlatform({ root: () => container, layer: () => container,
    measure() {}, requestWindow() {}, requestRender() {}, resourcesChanged() {} });
  const root = createRoot(container), Scene = platform.Scene;
  const controller = new AbortController();
  try {
    await act(async () => root.render(<Suspense><Scene scene="hero" /><Scene scene="pattern" /></Suspense>));
    const index = createScrollSpine({ viewportHeight: 900 });
    const at = (rangeId: 'hero-pattern' | 'hold:pattern') => locateScrollPosition(index, positionForScrollAnchor(index, { rangeId, progress: .5 }));
    const intent = { generation: 1, epoch: 1, revision: 1, layoutRevision: 1 };
    const first = await platform.adapter.prepare(at('hero-pattern'), intent, controller.signal);
    const oldGuard = canvasLeaseGuard(canvases[0]!);
    first.dispose();
    expect(() => contexts[0]!.acquireInkCanvas!()).toThrow('Superseded');
    const second = await platform.adapter.prepare(at('hero-pattern'), { ...intent, generation: 2 }, controller.signal);
    expect(canvases[1]).toBe(canvases[0]); expect(oldGuard()).toBe(false);
    expect(windowOwnsCanvas(canvases[0]!)).toBe(true);
    second.dispose();
    const reading = await platform.adapter.prepare(at('hold:pattern'), { ...intent, generation: 3 }, controller.signal);
    expect(windowOwnsCanvas(canvases[0]!)).toBe(false);
    reading.dispose();
  } finally { controller.abort(); await act(async () => root.unmount()); container.remove(); platform.dispose(); vi.unstubAllGlobals(); }
});

it('retains initial refs and waits for the actual compositor-ready handle', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'); document.body.append(container);
  let report: (name: string, element: HTMLElement | null) => void = () => {};
  const module: SceneModule = { id: 'pattern',
    Component: ({ registerHandle }) => {
      report = registerHandle!;
      return <article ref={e => registerHandle?.('copy', e)}>Pattern</article>;
    }, scrollReadyHandles: ['copy', 'texture'], preload: () => ({ milestones: [] }), renderHold() {} };
  source.promise = Promise.resolve(module);
  const platform = createDesktopScrollPlatform({ root: () => container, layer: () => container,
    measure() {}, requestWindow() {}, requestRender() {}, resourcesChanged() {} });
  const root = createRoot(container), Scene = platform.Scene;
  const controller = new AbortController();
  try {
    await act(async () => root.render(<Suspense><Scene scene="pattern" /></Suspense>));
    const index = createScrollSpine({ viewportHeight: 900 });
    const position = locateScrollPosition(index, positionForScrollAnchor(index, { rangeId: 'hold:pattern', progress: .5 }));
    let ready = false;
    const pending = platform.adapter.prepare(position, { generation: 1, epoch: 1, revision: 1, layoutRevision: 1 }, controller.signal)
      .then(window => { ready = true; return window; });
    await act(async () => { await Promise.resolve(); });
    expect(ready).toBe(false);
    report('texture', document.createElement('canvas'));
    const window = await pending;
    expect(ready).toBe(true); window.dispose();
  } finally { controller.abort(); await act(async () => root.unmount()); platform.dispose(); container.remove(); vi.unstubAllGlobals(); }
});
