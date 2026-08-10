import { beforeEach, describe, expect, it, vi } from 'vitest';

const compositorProbe = vi.hoisted(() => ({
  onFrame: null as ((mediaTime?: number | null) => void) | null,
  onFrames: [] as Array<(mediaTime?: number | null) => void>,
  canvases: [] as FakeNode[],
  renderTimes: [] as Array<number | null>,
  frameStatus: 'ready' as 'ready' | 'fallback',
  restoreOwner: {
    isPending: vi.fn(() => false),
    markPending: vi.fn(),
    retire: vi.fn(),
    wait: vi.fn(() => false),
    cancel: vi.fn(),
    clear: vi.fn()
  }
}));

vi.mock('../../../media/packed-alpha-video', () => ({
  createPackedAlphaWebGlRestoreOwner: vi.fn(() => compositorProbe.restoreOwner),
  createPackedAlphaVideoCompositor: vi.fn(({ canvas, onFrame }) => {
    canvas.dataset.packedAlphaStatus = 'waiting';
    const frame = onFrame
      ? (mediaTime: number | null = compositorProbe.frameStatus === 'ready' ? 1.25 : null) => {
        canvas.dataset.packedAlphaStatus = compositorProbe.frameStatus;
        canvas.dataset.packedAlphaMediaTime = mediaTime === null
          ? 'fallback'
          : mediaTime.toFixed(4);
        canvas.dataset.packedAlphaFrameEvidence = mediaTime === null
          ? 'fallback'
          : 'rvfc';
        onFrame(mediaTime);
      }
      : null;
    compositorProbe.onFrame = frame;
    if (frame) compositorProbe.onFrames.push(frame);
    compositorProbe.canvases.push(canvas);
    return {
      render: (mediaTime?: number) => {
        compositorProbe.renderTimes.push(mediaTime ?? null);
        if (Number.isFinite(mediaTime)) {
          canvas.dataset.packedAlphaStatus = 'ready';
          canvas.dataset.packedAlphaMediaTime = mediaTime!.toFixed(4);
        }
        return 'rendered';
      },
      setActive: vi.fn(),
      dispose: vi.fn()
    };
  }),
  releasePackedAlphaWebGlContext: vi.fn(),
  setPackedAlphaVideoSource: vi.fn((video, sourceUrl) => {
    const source = video.ownerDocument.createElement('source');
    source.src = sourceUrl;
    video.dataset.packedAlphaSource = 'rgb-alpha-side-by-side';
    video.replaceChildren(source);
    video.load();
  }),
  renewPackedAlphaCanvas: vi.fn((canvas: FakeNode) => {
    const renewed = canvas.cloneNode();
    renewed.width = 1;
    renewed.height = 1;
    canvas.replaceWith(renewed);
    return renewed;
  })
}));

import {
  createPhonePackedAlphaSurface
} from './phone-packed-alpha-surface';
import { releasePackedAlphaWebGlContext } from '../../../media/packed-alpha-video';

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  ownerDocument!: FakeDocument;
  parentNode: FakeNode | null = null;
  className = '';
  width = 300;
  height = 150;
  src = '';
  alt = '';
  decoding = '';
  draggable = true;
  webglContext: { isContextLost: () => boolean } | null = null;
  readonly getContext = vi.fn(() => this.webglContext);

  append(child: FakeNode) {
    child.parentNode = this;
    this.children.push(child);
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  replaceChildren(...children: FakeNode[]) {
    for (const child of this.children) child.parentNode = null;
    this.children.length = 0;
    for (const child of children) this.append(child);
  }

  cloneNode() {
    const clone = new FakeNode();
    clone.ownerDocument = this.ownerDocument;
    clone.className = this.className;
    clone.width = this.width;
    clone.height = this.height;
    for (const [name, value] of this.attributes) {
      clone.attributes.set(name, value);
    }
    Object.assign(clone.dataset, this.dataset);
    return clone;
  }

  replaceWith(replacement: FakeNode) {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index < 0) return;
    replacement.parentNode = this.parentNode;
    this.parentNode.children[index] = replacement;
    this.parentNode = null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  querySelector(selector: string): FakeNode | null {
    const tag = selector.toLowerCase();
    return this.children.find((child) => child.attributes.get('tag') === tag) ?? null;
  }
}

class FakeVideo extends FakeNode {
  readonly pause = vi.fn();
  readonly play = vi.fn(() => Promise.resolve());
  readonly load = vi.fn();
  readonly listeners = new Map<string, Set<() => void>>();
  currentTime = 0;
  duration = 2;
  readyState = 4;

  addEventListener(name: string, listener: () => void) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: () => void) {
    this.listeners.get(name)?.delete(listener);
  }
}

class FakeDocument {
  createElement(tag: string): FakeNode {
    const node = tag === 'video' ? new FakeVideo() : new FakeNode();
    node.ownerDocument = this;
    node.attributes.set('tag', tag);
    return node;
  }
}

function fixture(onFrame: ((presentationToken: string | null, mediaTime: number | null) => void) | null = null) {
  const ownerDocument = new FakeDocument();
  const root = ownerDocument.createElement('section');
  const container = ownerDocument.createElement('div');
  const video = ownerDocument.createElement('video') as FakeVideo;
  root.append(container);
  container.append(video);
  const surface = createPhonePackedAlphaSurface([
    root as unknown as HTMLElement,
    container as unknown as HTMLElement,
    video as unknown as HTMLVideoElement,
    '/packed.mp4',
    1.25,
    'phoneTestAlpha',
    'test',
    'test-canvas',
    null,
    onFrame
  ]);
  return { root, container, video, surface };
}

describe('phone packed-alpha surface', () => {
  beforeEach(() => {
    compositorProbe.onFrame = null;
    compositorProbe.onFrames.length = 0;
    compositorProbe.canvases.length = 0;
    compositorProbe.renderTimes.length = 0;
    compositorProbe.frameStatus = 'ready';
    for (const method of Object.values(compositorProbe.restoreOwner)) method.mockClear();
    vi.mocked(releasePackedAlphaWebGlContext).mockClear();
    vi.unstubAllGlobals();
  });

  it('seeks the packed Canvas owner to the stable endpoint', () => {
    const { root, container, video, surface } = fixture();

    surface(['activate', 'endpoint']);

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(video.querySelector('source')?.src).toBe('/packed.mp4');
    // Endpoint preparation first nudges a retained decoder away from the
    // terminal sample so WebKit must produce a fresh rVFC for this lease.
    expect(video.currentTime).toBeCloseTo(1.25 - (0.08 * 2), 5);
    expect(root.dataset.phoneTestAlpha).toBe('probing');
    surface(['dispose']);
  });

  it('keeps the surface-owned Canvas hidden on release and removes it on dispose', () => {
    const { container, video, surface } = fixture();

    surface(['activate', 'forward']);

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(video.querySelector('source')?.src).toBe('/packed.mp4');
    expect(video.dataset.packedAlphaSource).toBe('rgb-alpha-side-by-side');
    surface(['release']);
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(container.querySelector('canvas')?.dataset.phonePackedAlphaRetired).toBe('true');
    expect(video.querySelector('source')).toBeNull();
    surface(['dispose']);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('reuses one surface-owned Canvas across release/reacquire', () => {
    const ownerDocument = new FakeDocument();
    const root = ownerDocument.createElement('section');
    const container = ownerDocument.createElement('div');
    const video = ownerDocument.createElement('video') as FakeVideo;
    root.append(container);
    container.append(video);
    const surface = createPhonePackedAlphaSurface([
      root as unknown as HTMLElement,
      container as unknown as HTMLElement,
      video as unknown as HTMLVideoElement,
      '/packed.mp4',
      1.25,
      'phoneTestAlpha',
      'test',
      'test-canvas',
      null,
      null
    ]);

    surface(['activate', 'forward']);
    const firstCanvas = container.querySelector('canvas');
    expect(firstCanvas).not.toBeNull();
    surface(['release']);

    expect(container.querySelector('canvas')).toBe(firstCanvas);
    expect(firstCanvas?.dataset.phonePackedAlphaRetired).toBe('true');
    expect(video.querySelector('source')).toBeNull();

    surface(['activate', 'endpoint']);
    const secondCanvas = container.querySelector('canvas');
    expect(secondCanvas).not.toBeNull();
    expect(secondCanvas).toBe(firstCanvas);
    expect(compositorProbe.canvases).toEqual([firstCanvas, firstCanvas]);
    surface(['dispose']);
  });

  it('routes terminal surface retirement through the shared restore owner', () => {
    const { container, surface } = fixture();
    surface(['activate', 'forward']);
    const canvas = container.querySelector('canvas');

    surface(['retire']);

    expect(canvas).not.toBeNull();
    expect(compositorProbe.restoreOwner.retire).toHaveBeenCalledWith(canvas);
    expect(canvas?.dataset.phonePackedAlphaRetired).toBe('true');
    surface(['dispose']);
  });

  it('hard-releases the surface-owned WebGL context exactly at terminal dispose', () => {
    const { container, surface } = fixture();
    surface(['activate', 'forward']);
    const canvas = container.querySelector('canvas') as FakeNode;
    const context = { isContextLost: () => false };
    canvas.webglContext = context;

    surface(['dispose']);

    expect(releasePackedAlphaWebGlContext).toHaveBeenCalledWith(context);
  });

  it('retains the forward decoder and Canvas while Safari waits for a gesture frame', () => {
    vi.useFakeTimers();
    try {
      const ownerDocument = new FakeDocument();
      const root = ownerDocument.createElement('section');
      const container = ownerDocument.createElement('div');
      const video = ownerDocument.createElement('video') as FakeVideo;
      root.append(container);
      container.append(video);
      const surface = createPhonePackedAlphaSurface([
        root as unknown as HTMLElement,
        container as unknown as HTMLElement,
        video as unknown as HTMLVideoElement,
        '/packed.mp4',
        1.25,
        'phoneTestAlpha',
        'test',
        'test-canvas',
        20,
        null
      ]);

      surface(['activate', 'forward']);
      vi.advanceTimersByTime(20);

      expect(root.dataset.phoneTestAlpha).toBe('awaiting-native-playback');
      expect(container.querySelector('canvas')).not.toBeNull();
      expect(video.querySelector('source')?.src).toBe('/packed.mp4');
      surface(['dispose']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prepares forward topology without hidden playback or a frame-zero gate', async () => {
    const { root, video, surface } = fixture();
    await expect(surface(['prepare', 'forward', null])).resolves.toBeUndefined();
    expect(video.play).not.toHaveBeenCalled();
    expect(root.dataset.phoneTestAlpha).toBe('awaiting-native-playback');
    surface(['dispose']);
  });

  it('waits for a physical forward canvas draw when a direct entry requires it', async () => {
    const { root, surface } = fixture();
    let resolved = false;
    const preparation = Promise.resolve(
      surface(['prepare', 'forward', null, true])
    ).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(root.dataset.phoneTestAlpha).toBe('awaiting-native-playback');
    compositorProbe.onFrame?.();

    await expect(preparation).resolves.toBeUndefined();
    expect(root.dataset.phoneTestAlpha).toBe('verified');
    surface(['dispose']);
  });

  it('[convergence] rejects a prior verified frame for a new presentation token', async () => {
    const { root, surface } = fixture();
    const prepare = (token: string) => surface([
      'prepare',
      'forward',
      null,
      true,
      token
    ] as unknown as Parameters<typeof surface>[0]);

    const first = Promise.resolve(prepare('authority-a:1')).then(() => undefined);
    compositorProbe.onFrame?.();
    await expect(first).resolves.toBeUndefined();
    expect(root.dataset.phoneTestAlpha).toBe('verified');

    let secondResolved = false;
    const second = Promise.resolve(prepare('authority-a:2')).then(() => {
      secondResolved = true;
    });
    await Promise.resolve();

    expect(secondResolved).toBe(false);
    compositorProbe.onFrame?.();
    await expect(second).resolves.toBeUndefined();
    surface(['dispose']);
  });

  it('[convergence] rebinds a fresh proof token without allocating another WebGL canvas', async () => {
    const { surface } = fixture();
    const prepare = (token: string) => surface([
      'prepare',
      'forward',
      null,
      true,
      token
    ] as unknown as Parameters<typeof surface>[0]);

    const first = Promise.resolve(prepare('authority-a:1'));
    compositorProbe.onFrame?.();
    await expect(first).resolves.toBeUndefined();
    const firstCanvas = compositorProbe.canvases[0];

    const second = Promise.resolve(prepare('authority-a:2'));
    await Promise.resolve();
    expect(compositorProbe.canvases).toEqual([firstCanvas]);
    compositorProbe.onFrame?.();
    await expect(second).resolves.toBeUndefined();
    surface(['dispose']);
  });

  it('[P0 PH restore] requires a fresh token-B draw after retire and restore', () => {
    const reported: Array<string | null> = [];
    const { root, surface } = fixture((token) => reported.push(token));

    surface(['activate', 'endpoint', 'token-a']);
    surface(['present', 'token-a']);
    const staleTokenAFrame = compositorProbe.onFrame!;
    staleTokenAFrame();
    expect(root.dataset.phoneTestAlpha).toBe('verified');
    expect(reported).toEqual(['token-a']);

    surface(['retire']);
    surface(['activate', 'endpoint', 'token-b']);
    const tokenBFrame = compositorProbe.onFrame!;
    expect(root.dataset.phoneTestAlpha).not.toBe('verified');
    expect(reported).toEqual(['token-a']);
    expect(surface(['canvas'])?.dataset.phonePackedAlphaPresentationToken)
      .toBeUndefined();

    staleTokenAFrame();
    expect(reported).toEqual(['token-a']);
    expect(root.dataset.phoneTestAlpha).not.toBe('verified');

    tokenBFrame();
    expect(reported).toEqual(['token-a', 'token-b']);
    expect(surface(['canvas'])?.dataset.phonePackedAlphaPresentationToken)
      .toBe('token-b');
    expect(surface(['canvas'])).toBe(compositorProbe.canvases[0]);
    surface(['dispose']);
  });

  it('[P0 exact frame] never settles an endpoint from a ready draw without rVFC mediaTime', async () => {
    const { root, surface } = fixture();
    let settled = false;
    const preparation = Promise.resolve(surface([
      'prepare',
      'endpoint',
      null,
      true,
      'token-exact'
    ] as unknown as Parameters<typeof surface>[0])).then(() => {
      settled = true;
    });

    await Promise.resolve();
    compositorProbe.onFrame?.(null);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(root.dataset.phoneTestAlpha).toBe('probing');

    compositorProbe.onFrame?.(1.25);
    await expect(preparation).resolves.toBeUndefined();
    expect(settled).toBe(true);
    expect(root.dataset.phoneTestAlpha).toBe('verified');
    surface(['dispose']);
  });

  it('[Task 3] binds an active proof token only to a subsequent physical draw', () => {
    const report = vi.fn();
    const { surface } = fixture(report);

    surface(['activate', 'forward']);
    compositorProbe.onFrame?.();
    expect(report).toHaveBeenLastCalledWith(null, 1.25);

    surface(['present', 'authority|session|3']);
    // The mock compositor does not draw eagerly; this is the physical draw
    // callback that a successful WebGL upload/draw would produce.
    compositorProbe.onFrame?.();

    expect(report).toHaveBeenLastCalledWith('authority|session|3', 1.25);
    surface(['dispose']);
  });

  it('waits for the authored endpoint frame during reverse preparation', async () => {
    const { root, surface } = fixture();
    let resolved = false;
    const preparation = Promise.resolve(
      surface(['prepare', 'endpoint', null])
    ).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(root.dataset.phoneTestAlpha).toBe('probing');
    compositorProbe.onFrame?.();

    await expect(preparation).resolves.toBeUndefined();
    expect(root.dataset.phoneTestAlpha).toBe('verified');
    surface(['dispose']);
  });

  it('does not settle reverse admission from a currentTime fallback draw', async () => {
    const { root, surface } = fixture();
    compositorProbe.frameStatus = 'fallback';
    let settled = false;
    const preparation = Promise.resolve(
      surface(['prepare', 'endpoint', null])
    ).then(() => {
      settled = true;
    });

    await Promise.resolve();
    compositorProbe.onFrame?.();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(root.dataset.phoneTestAlpha).toBe('probing');

    compositorProbe.frameStatus = 'ready';
    compositorProbe.onFrame?.();
    await expect(preparation).resolves.toBeUndefined();
    expect(root.dataset.phoneTestAlpha).toBe('verified');
    surface(['dispose']);
  });

  it('passes an exact prepared mediaTime to the sole packed-surface compositor', () => {
    const { surface, video } = fixture();
    surface(['activate', 'endpoint', 'token-a']);
    surface(['present', 'token-a']);
    compositorProbe.onFrame?.();
    video.dataset.timelineVideoFrameEvidence = 'video-frame-callback';
    video.dataset.timelineVideoFrameMediaTime = '1.1000';

    expect(surface(['frame', 1.1])).toBe(true);

    expect(compositorProbe.renderTimes).toContain(1.1);
    surface(['dispose']);
  });

  it('does not start hidden playback when endpoint preparation is retired', async () => {
    const { video, surface } = fixture();
    const controller = new AbortController();
    const preparation = expect(
      surface(['prepare', 'endpoint', controller.signal])
    ).rejects.toMatchObject({ name: 'AbortError' });

    await Promise.resolve();
    expect(video.play).not.toHaveBeenCalled();
    controller.abort();

    await preparation;
    expect(video.play).not.toHaveBeenCalled();
    surface(['dispose']);
  });

});
