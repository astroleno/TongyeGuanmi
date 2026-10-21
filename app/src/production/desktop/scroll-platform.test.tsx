// @vitest-environment jsdom
import { act, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { SceneModule, TransitionContext } from '../../story/types';
const source = vi.hoisted(() => ({ promise: null as Promise<SceneModule> | null }));
vi.mock('./module-loaders', () => ({ loadDesktopSceneModule: () => source.promise, loadDesktopTransitionModule: vi.fn() }));
import { createDesktopScrollPlatform } from './scroll-platform';
import { loadDesktopTransitionModule } from './module-loaders';
import { canvasLeaseGuard, windowOwnsCanvas } from '../../media/scroll-canvas-window';
import { createScrollSpine, locateScrollPosition, positionForScrollAnchor } from '../../story/scroll-spine';

function videoSceneFixture() {
  const container = document.createElement('div'); document.body.append(container);
  let layer: HTMLElement = container;
  source.promise = Promise.resolve({ id: 'crane-animation', Component: () => <article><video poster="poster.webp"><source src="motion.webm" type="video/webm" /></video></article>,
    preload: () => ({ milestones: [] }), renderHold() {} });
  const platform = createDesktopScrollPlatform({ root: () => container, layer: () => layer,
    measure() {}, requestWindow() {}, requestRender() {}, resourcesChanged() {} });
  const root = createRoot(container);
  return { container, platform, root, replaceLayer: (element: HTMLElement) => { layer = element; } };
}

it.each(['recovered', 'permanent', 'aborted'] as const)('retries a proven failed image only once (%s), without replacing its URL', async outcome => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'); document.body.append(container);
  source.promise = Promise.resolve({ id: 'hero', Component: () => <img src="https://assets.tongye.me/immutable.webp" alt="" />,
    preload: () => ({ milestones: [] }), renderHold() {} });
  const platform = createDesktopScrollPlatform({ root: () => container, layer: () => container,
    measure() {}, requestWindow() {}, requestRender() {}, resourcesChanged() {} });
  const root = createRoot(container), Scene = platform.Scene, controller = new AbortController();
  try {
    await act(async () => root.render(<Suspense><Scene scene="hero" /></Suspense>));
    const image = container.querySelector('img')!; let width = 0, calls = 0;
    Object.defineProperties(image, { complete: { get: () => true }, naturalWidth: { get: () => width } });
    const decode = vi.fn(async () => {
      calls++;
      if (outcome === 'aborted') controller.abort('superseded image');
      if (outcome === 'recovered' && calls > 1) { width = 1672; return; }
      throw new DOMException('The source image cannot be decoded.', 'EncodingError');
    });
    image.decode = decode;
    const setter = vi.spyOn(image, 'src', 'set');
    const index = createScrollSpine({ viewportHeight: 900 });
    const position = locateScrollPosition(index, positionForScrollAnchor(index, { rangeId: 'hold:hero', progress: 0 }));
    const preparation = platform.adapter.prepare(position, { generation: 1, epoch: 1, revision: 1, layoutRevision: 1 }, controller.signal);
    if (outcome === 'recovered') {
      const ready = await preparation;
      expect(ready.render(position, { generation: 1, epoch: 1, revision: 1, layoutRevision: 1 })?.progress).toBe(0);
      ready.dispose();
    } else await expect(preparation).rejects.toThrow('cannot be decoded');
    expect(setter.mock.calls).toEqual(outcome === 'aborted' ? [] : [['https://assets.tongye.me/immutable.webp']]);
    expect(decode.mock.calls.length).toBe(outcome === 'aborted' ? 1 : outcome === 'permanent' ? 2 : 3);
  } finally { controller.abort(); await act(async () => root.unmount()); platform.dispose(); container.remove(); vi.unstubAllGlobals(); }
});

it.each([2, 3])('does not restart a cold decoder outside the media driver (networkState %i)', async networkState => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const { container, platform, root } = videoSceneFixture(), Scene = platform.Scene;
  const controller = new AbortController();
  let preparation: Promise<unknown> | undefined;
  try {
    await act(async () => root.render(<Suspense><Scene scene="hero" /></Suspense>));
    const video = container.querySelector('video')!;
    Object.defineProperties(video, { readyState: { value: 0 }, networkState: { value: networkState } });
    const index = createScrollSpine({ viewportHeight: 900 });
    const position = locateScrollPosition(index, positionForScrollAnchor(index, { rangeId: 'hold:hero', progress: 0 }));
    preparation = platform.adapter.prepare(position, { generation: 1, epoch: 1, revision: 1, layoutRevision: 1 }, controller.signal)
      .catch(error => error);
    await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(networkState === 3 ? 1 : 0);
  } finally {
    controller.abort(); await preparation;
    await act(async () => root.unmount()); platform.dispose(); container.remove(); pause.mockRestore(); load.mockRestore(); vi.unstubAllGlobals();
  }
});

it('promotes mounted-window media while independent scene assets are still preparing', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const { container, platform, root } = videoSceneFixture(), Scene = platform.Scene;
  let finish!: () => void;
  source.promise = Promise.resolve({ id: 'crane-animation', Component: () => <video preload="none"><source src="motion.webm" /></video>,
    preload: () => new Promise<void>(resolve => { finish = resolve; }).then(() => ({ milestones: [] })), renderHold() {} });
  try {
    await act(async () => root.render(<Suspense><Scene scene="crane-animation" /></Suspense>));
    expect(container.querySelector('video')?.preload).toBe('auto');
    expect(load).not.toHaveBeenCalled();
  } finally {
    finish(); await act(async () => root.unmount()); platform.dispose(); container.remove(); pause.mockRestore(); load.mockRestore(); vi.unstubAllGlobals();
  }
});

it('starts image decoding before the independent cold video has a frame', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const { container, platform, root } = videoSceneFixture(), Scene = platform.Scene;
  source.promise = Promise.resolve({ id: 'hero', Component: () => <article><video><source src="motion.webm" /></video><img src="still.webp" alt="" /></article>,
    preload: () => ({ milestones: [] }), renderHold() {} });
  const controller = new AbortController(); let preparation: Promise<unknown> | undefined;
  try {
    await act(async () => root.render(<Suspense><Scene scene="hero" /></Suspense>));
    const video = container.querySelector('video')!, image = container.querySelector('img')!;
    Object.defineProperties(video, { readyState: { value: 0 }, networkState: { value: 2 } });
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1672 } });
    const decode = vi.fn(async () => {}); image.decode = decode;
    const index = createScrollSpine({ viewportHeight: 900 });
    const position = locateScrollPosition(index, positionForScrollAnchor(index, { rangeId: 'hold:hero', progress: 0 }));
    preparation = platform.adapter.prepare(position, { generation: 1, epoch: 1, revision: 1, layoutRevision: 1 }, controller.signal).catch(error => error);
    await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
    expect(decode).toHaveBeenCalledOnce(); expect(load).not.toHaveBeenCalled();
  } finally { controller.abort(); await preparation; await act(async () => root.unmount()); platform.dispose(); container.remove(); pause.mockRestore(); load.mockRestore(); vi.unstubAllGlobals(); }
});

it.each(['source', 'direct'] as const)('unloads detached desktop video %s resources on scene unmount', async kind => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const { container, platform, root } = videoSceneFixture(), Scene = platform.Scene;
  let unmounted = false;
  try {
    await act(async () => root.render(<Suspense><Scene scene="crane-animation" /></Suspense>));
    const video = container.querySelector('video')!, source = video.querySelector('source')!;
    if (kind === 'direct') video.src = 'direct.webm';
    await act(async () => root.unmount()); unmounted = true;
    expect(pause).toHaveBeenCalled(); expect(load).toHaveBeenCalledOnce();
    expect(video.hasAttribute('src')).toBe(false);
    expect(source.hasAttribute('src')).toBe(false); expect(video.hasAttribute('poster')).toBe(false);
  } finally { if (!unmounted) await act(async () => root.unmount()); platform.dispose(); container.remove(); pause.mockRestore(); load.mockRestore(); vi.unstubAllGlobals(); }
});

it('keeps connected video sources through StrictMode cleanup and retained rerenders, but releases the old node on re-entry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const { container, platform, root } = videoSceneFixture(), Scene = platform.Scene;
  try {
    const render = () => <StrictMode><Suspense><Scene scene="crane-animation" /></Suspense></StrictMode>;
    await act(async () => root.render(render()));
    const first = container.querySelector('video')!;
    expect(first.querySelector('source')?.getAttribute('src')).toBe('motion.webm');
    expect(load).not.toHaveBeenCalled();
    await act(async () => root.render(render()));
    expect(container.querySelector('video')).toBe(first); expect(load).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(first.querySelector('source')?.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    await act(async () => root.render(render()));
    const replacement = container.querySelector('video')!;
    expect(replacement).not.toBe(first);
    expect(replacement.querySelector('source')?.getAttribute('src')).toBe('motion.webm');
    expect(load).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); platform.dispose(); container.remove(); pause.mockRestore(); load.mockRestore(); vi.unstubAllGlobals(); }
});

it('cleans the captured scene video, not a replacement returned by the host layer getter', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const { container, platform, root, replaceLayer } = videoSceneFixture(), Scene = platform.Scene;
  const replacement = document.createElement('div'), nextVideo = document.createElement('video');
  nextVideo.src = 'new-owner.webm'; replacement.append(nextVideo); document.body.append(replacement);
  let unmounted = false;
  try {
    await act(async () => root.render(<Suspense><Scene scene="crane-animation" /></Suspense>));
    const video = container.querySelector('video')!;
    replaceLayer(replacement);
    await act(async () => root.unmount()); unmounted = true;
    expect(video.querySelector('source')?.hasAttribute('src')).toBe(false);
    expect(nextVideo.getAttribute('src')).toBe('new-owner.webm');
    expect(pause.mock.instances).not.toContain(nextVideo); expect(load.mock.instances).toEqual([video]);
  } finally { if (!unmounted) await act(async () => root.unmount()); platform.dispose(); container.remove(); replacement.remove(); pause.mockRestore(); load.mockRestore(); vi.unstubAllGlobals(); }
});

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
