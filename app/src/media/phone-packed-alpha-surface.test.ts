// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const compositorProbe = vi.hoisted(() => ({
  setupFailure: false,
  renderResult: true,
  callbacks: [] as Array<(frame?: Readonly<{ mediaTimeSeconds: number }>) => void>,
  failures: [] as Array<(failure: Readonly<{ code: 'context-lost'; message: string }>) => void>,
  disposals: [] as Array<ReturnType<typeof vi.fn>>
}));

vi.mock('./packed-alpha-video', async () => {
  const actual = await vi.importActual<typeof import('./packed-alpha-video')>(
    './packed-alpha-video'
  );
  return {
    ...actual,
    createPackedAlphaVideoCompositor: vi.fn((options: Readonly<{
      canvas: HTMLCanvasElement;
      onFrame?: (frame?: Readonly<{ mediaTimeSeconds: number }>) => void;
      onFailure?: (failure: Readonly<{ code: 'context-lost'; message: string }>) => void;
    }>) => {
      if (options.onFrame) compositorProbe.callbacks.push(options.onFrame);
      if (options.onFailure) compositorProbe.failures.push(options.onFailure);
      const dispose = vi.fn();
      compositorProbe.disposals.push(dispose);
      if (compositorProbe.setupFailure) {
        options.canvas.dataset.packedAlphaStatus = 'setup-failed';
        options.onFailure?.({ code: 'context-lost', message: 'setup failed' });
      } else {
        options.canvas.dataset.packedAlphaStatus = 'waiting';
      }
      return {
        render: () => compositorProbe.renderResult,
        setActive: () => undefined,
        dispose
      };
    }),
    setPackedAlphaVideoSource: vi.fn((video: HTMLVideoElement, sourceUrl: string) => {
      const source = video.ownerDocument.createElement('source');
      source.src = sourceUrl;
      video.dataset.packedAlphaSource = 'rgb-alpha-side-by-side';
      video.replaceChildren(source);
      video.load();
    })
  };
});

import {
  createPhonePackedAlphaSurface,
  releasePhonePackedAlphaWhenHidden
} from './phone-packed-alpha-surface';
import { mediaTimeForFrame } from './frame-timebase';
import { VIDEO_FRAME_MAPS } from './video-frame-maps';

function fixture(options: Readonly<{ injected?: boolean; failure?: boolean }> = {}) {
  const root = document.createElement('section');
  const container = document.createElement('div');
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  root.append(container);
  container.append(video);
  if (options.injected !== false) container.append(canvas);
  document.body.replaceChildren(root);
  const onFrame = vi.fn();
  const onFailure = vi.fn();
  const onCanvasRenewed = vi.fn();
  let currentCanvas = canvas;
  const surface = createPhonePackedAlphaSurface({
    root,
    container,
    ...(options.injected === false ? {} : { canvas }),
    video,
    packedSourceUrl: '/packed.mp4',
    endpointSeconds: 1.25,
    statusDataset: 'phoneTestAlpha',
    layerName: 'test',
    canvasClassName: 'test-canvas',
    renewCanvasAfterFailure: options.failure ?? true,
    onCanvasRenewed: (renewed) => {
      currentCanvas = renewed;
      onCanvasRenewed(renewed);
    },
    onFrame,
    onFailure
  });
  return {
    root, container, video, canvas, surface, onFrame, onFailure, onCanvasRenewed,
    currentCanvas: () => currentCanvas
  };
}

describe('canonical phone packed-alpha surface', () => {
  beforeEach(() => {
    compositorProbe.setupFailure = false;
    compositorProbe.renderResult = true;
    compositorProbe.callbacks = [];
    compositorProbe.failures = [];
    compositorProbe.disposals = [];
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('reports only a successful compositor callback from the active generation', () => {
    const current = fixture();
    const first = current.surface.activate();
    expect(current.onFrame).not.toHaveBeenCalled();
    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).toHaveBeenLastCalledWith({
      canvas: current.canvas, generation: first, mediaTimeSeconds: 0, frameIndex: -1
    });

    current.surface.release();
    const second = current.surface.activate();
    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).toHaveBeenCalledTimes(1);
    compositorProbe.callbacks[1]?.();
    expect(current.onFrame).toHaveBeenLastCalledWith({
      canvas: current.canvas, generation: second, mediaTimeSeconds: 0, frameIndex: -1
    });
    expect(second).toBeGreaterThan(first);
    current.surface.dispose('terminal');
  });

  it('returns a packed-canvas receipt only for the exact requested frame', async () => {
    const current = fixture();
    const frameMap = VIDEO_FRAME_MAPS['ph-figure-motion'];
    const generation = current.surface.activate('forward');
    const targetFrameIndex = 23;
    const request = {
      runId: 'phone-packed-receipt:1',
      direction: 1 as const,
      sequence: 1,
      desiredProgress: targetFrameIndex / frameMap.endFrame,
      frameMap,
      signal: new AbortController().signal
    };
    const receipt = current.surface.presentFrame(request);

    compositorProbe.callbacks[0]?.({
      mediaTimeSeconds: mediaTimeForFrame(frameMap, targetFrameIndex + 1)
    });
    let settled = false;
    void receipt.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    const mediaTimeSeconds = mediaTimeForFrame(frameMap, targetFrameIndex);
    compositorProbe.callbacks[0]?.({ mediaTimeSeconds });
    await expect(receipt).resolves.toMatchObject({
      status: 'presented',
      desiredFrameIndex: targetFrameIndex,
      presentedFrameIndex: targetFrameIndex,
      mediaTimeSeconds,
      evidence: 'packed-canvas-draw',
      generation
    });
    expect(current.onFrame).toHaveBeenLastCalledWith({
      canvas: current.canvas,
      generation,
      mediaTimeSeconds,
      frameIndex: targetFrameIndex
    });
    current.surface.dispose('terminal');
  });

  it('coalesces packed frame requests and makes an older sequence stale', async () => {
    const current = fixture();
    const frameMap = VIDEO_FRAME_MAPS['ph-figure-motion'];
    const generation = current.surface.activate('forward');
    const signal = new AbortController().signal;
    const first = current.surface.presentFrame({
      runId: 'phone-packed-latest:1',
      direction: 1,
      sequence: 1,
      desiredProgress: 1 / frameMap.endFrame,
      frameMap,
      signal
    });
    const second = current.surface.presentFrame({
      runId: 'phone-packed-latest:1',
      direction: 1,
      sequence: 2,
      desiredProgress: 44 / frameMap.endFrame,
      frameMap,
      signal
    });

    await expect(first).resolves.toMatchObject({ status: 'stale', sequence: 1 });
    compositorProbe.callbacks[0]?.({ mediaTimeSeconds: mediaTimeForFrame(frameMap, 44) });
    await expect(second).resolves.toMatchObject({
      status: 'presented',
      sequence: 2,
      desiredFrameIndex: 44,
      presentedFrameIndex: 44,
      generation
    });
    current.surface.dispose('terminal');
  });

  it('rejects a failed packed render and resolves pending work stale on release', async () => {
    const failed = fixture();
    const frameMap = VIDEO_FRAME_MAPS['ph-figure-motion'];
    failed.surface.activate('forward');
    Object.defineProperty(failed.video, 'readyState', {
      configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA
    });
    compositorProbe.renderResult = false;
    await expect(failed.surface.presentFrame({
      runId: 'phone-packed-render-failure:1',
      direction: 1,
      sequence: 1,
      desiredProgress: 0,
      frameMap,
      signal: new AbortController().signal
    })).rejects.toThrow('Packed-alpha frame render failed');
    failed.surface.dispose('terminal');

    compositorProbe.renderResult = true;
    const released = fixture();
    released.surface.activate('forward');
    const pending = released.surface.presentFrame({
      runId: 'phone-packed-release:1',
      direction: 1,
      sequence: 1,
      desiredProgress: 0.5,
      frameMap,
      signal: new AbortController().signal
    });
    released.surface.release();
    await expect(pending).resolves.toMatchObject({ status: 'stale' });
    released.surface.dispose('terminal');
  });

  it('rejects a present request when its signal aborts', async () => {
    const current = fixture();
    const frameMap = VIDEO_FRAME_MAPS['ph-figure-motion'];
    current.surface.activate('forward');
    const controller = new AbortController();
    const pending = current.surface.presentFrame({
      runId: 'phone-packed-abort:1',
      direction: 1,
      sequence: 1,
      desiredProgress: 0.5,
      frameMap,
      signal: controller.signal
    });
    controller.abort('abort test');
    await expect(pending).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_ABORTED' });
    current.surface.dispose('terminal');
  });

  it('fails a false explicit render, renews the Canvas, and rejects the retired callback', () => {
    const current = fixture();
    const first = current.surface.activate();
    compositorProbe.renderResult = false;
    expect(current.surface.render()).toBe(false);
    expect(current.onFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: 'packed-alpha-render-failed', generation: first
    }));
    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).not.toHaveBeenCalled();

    compositorProbe.renderResult = true;
    const second = current.surface.activate();
    expect(current.onCanvasRenewed).toHaveBeenCalledTimes(1);
    expect(current.currentCanvas()).not.toBe(current.canvas);
    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).not.toHaveBeenCalled();
    compositorProbe.callbacks[1]?.();
    expect(current.onFrame).toHaveBeenCalledWith({
      canvas: current.currentCanvas(), generation: second, mediaTimeSeconds: 0, frameIndex: -1
    });
    current.surface.dispose('terminal');
  });

  it('allows a retained-generation probe to miss without retiring the surface', () => {
    const current = fixture();
    const generation = current.surface.activate();
    compositorProbe.renderResult = false;

    expect(current.surface.probe()).toBe(false);
    expect(current.onFailure).not.toHaveBeenCalled();

    compositorProbe.renderResult = true;
    expect(current.surface.probe()).toBe(true);
    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).toHaveBeenCalledWith({
      canvas: current.canvas, generation, mediaTimeSeconds: 0, frameIndex: -1
    });
    current.surface.dispose('terminal');
  });

  it('keeps a verified retained frame presented while its generation changes mode', () => {
    const current = fixture();
    current.surface.activate('initial');
    Object.defineProperty(current.video, 'paused', {
      configurable: true, value: true
    });
    Object.defineProperty(current.video, 'seeking', {
      configurable: true, value: false
    });
    current.video.currentTime = 0;
    compositorProbe.callbacks[0]?.();
    expect(current.root.dataset.phoneTestAlpha).toBe('verified');

    (current.surface.setMode as (
      mode: 'forward' | 'initial' | 'endpoint', preservePresentation: boolean
    ) => void)('forward', true);

    expect(current.root.dataset.phoneTestAlpha).toBe('verified');
    current.surface.dispose('terminal');
  });

  it('waits for current media data before priming an endpoint frame', () => {
    const current = fixture();
    Object.defineProperty(current.video, 'readyState', {
      configurable: true, value: HTMLMediaElement.HAVE_METADATA
    });
    current.surface.activate('endpoint');
    current.video.dispatchEvent(new Event('loadedmetadata'));
    expect(current.onFailure).not.toHaveBeenCalled();

    Object.defineProperty(current.video, 'readyState', {
      configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA
    });
    current.video.dispatchEvent(new Event('loadeddata'));
    expect(current.onFailure).not.toHaveBeenCalled();
    current.surface.dispose('terminal');
  });

  it('does not prove an endpoint compositor frame while its seek is pending', () => {
    const current = fixture();
    current.surface.activate('endpoint');
    current.video.currentTime = 1.25;
    Object.defineProperty(current.video, 'seeking', {
      configurable: true, value: true
    });

    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).not.toHaveBeenCalled();

    Object.defineProperty(current.video, 'seeking', {
      configurable: true, value: false
    });
    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).toHaveBeenCalledOnce();
    current.surface.dispose('terminal');
  });

  it('proves an initial frame only while paused exactly at frame zero', () => {
    const current = fixture();
    current.surface.activate('initial');
    Object.defineProperty(current.video, 'paused', {
      configurable: true, value: false
    });
    current.video.currentTime = 0.3;
    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).not.toHaveBeenCalled();

    Object.defineProperty(current.video, 'paused', {
      configurable: true, value: true
    });
    Object.defineProperty(current.video, 'seeking', {
      configurable: true, value: false
    });
    current.video.currentTime = 0;
    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).toHaveBeenCalledOnce();
    current.surface.dispose('terminal');
  });

  it('reports setup and context loss immediately and retires their token', () => {
    compositorProbe.setupFailure = true;
    const setup = fixture();
    const generation = setup.surface.activate();
    expect(setup.onFailure).toHaveBeenCalledWith(expect.objectContaining({ generation }));
    compositorProbe.callbacks[0]?.();
    expect(setup.onFrame).not.toHaveBeenCalled();
    setup.surface.dispose('terminal');

    compositorProbe.setupFailure = false;
    const context = fixture();
    const contextGeneration = context.surface.activate();
    compositorProbe.failures.at(-1)?.({ code: 'context-lost', message: 'lost' });
    expect(context.onFailure).toHaveBeenCalledWith({
      code: 'context-lost', message: 'lost', generation: contextGeneration
    });
    compositorProbe.callbacks[0]?.();
    expect(context.onFrame).not.toHaveBeenCalled();
    context.surface.dispose('terminal');
  });

  it('keeps a React Canvas reactivatable but hard-retires it explicitly once', () => {
    const current = fixture();
    expect(current.canvas.dataset.packedAlphaCompositorActive).toBe('false');
    current.surface.activate();
    current.surface.release();
    expect(current.canvas.dataset.packedAlphaCompositorActive).toBe('false');
    current.surface.activate();
    expect(current.currentCanvas()).toBe(current.canvas);
    expect(compositorProbe.disposals[0]).toHaveBeenCalledWith('reactivatable');
    current.surface.dispose('terminal');
    current.surface.dispose('terminal');
    expect(compositorProbe.disposals[1]).toHaveBeenCalledTimes(1);
    expect(compositorProbe.disposals[1]).toHaveBeenCalledWith('terminal');
  });

  it('waits for a visible surface to become hidden before releasing', () => {
    const root = document.createElement('section');
    root.style.opacity = '0.5';
    const release = vi.fn();
    const cancel = releasePhonePackedAlphaWhenHidden(root, release);
    expect(release).not.toHaveBeenCalled();
    root.style.opacity = '0';
    root.setAttribute('style', root.getAttribute('style') ?? '');
    return vi.waitFor(() => expect(release).toHaveBeenCalledOnce()).finally(cancel);
  });
});
