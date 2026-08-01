// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const compositorProbe = vi.hoisted(() => ({
  setupFailure: false,
  renderResult: true,
  callbacks: [] as Array<() => void>,
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
      onFrame?: () => void;
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
      canvas: current.canvas, generation: first
    });

    current.surface.release();
    const second = current.surface.activate();
    compositorProbe.callbacks[0]?.();
    expect(current.onFrame).toHaveBeenCalledTimes(1);
    compositorProbe.callbacks[1]?.();
    expect(current.onFrame).toHaveBeenLastCalledWith({
      canvas: current.canvas, generation: second
    });
    expect(second).toBeGreaterThan(first);
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
      canvas: current.currentCanvas(), generation: second
    });
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
    current.surface.activate();
    current.surface.release();
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
