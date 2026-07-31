import { beforeEach, describe, expect, it, vi } from 'vitest';

const compositorProbe = vi.hoisted(() => ({
  onFrame: null as (() => void) | null,
  canvases: [] as FakeNode[]
}));

vi.mock('../../../media/packed-alpha-video', () => ({
  createPackedAlphaVideoCompositor: vi.fn(({ canvas, onFrame }) => {
    canvas.dataset.packedAlphaStatus = 'waiting';
    compositorProbe.onFrame = onFrame ?? null;
    compositorProbe.canvases.push(canvas);
    return { render: () => false, dispose: vi.fn() };
  }),
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

function fixture(onFrame: ((presentationToken: string | null) => void) | null = null) {
  const ownerDocument = new FakeDocument();
  const root = ownerDocument.createElement('section');
  const container = ownerDocument.createElement('div');
  const video = ownerDocument.createElement('video') as FakeVideo;
  root.append(container);
  container.append(video);
  const surface = createPhonePackedAlphaSurface([
    root as unknown as HTMLElement,
    container as unknown as HTMLElement,
    null,
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
    compositorProbe.canvases.length = 0;
    vi.unstubAllGlobals();
  });

  it('seeks the packed Canvas owner to the stable endpoint', () => {
    const { root, container, video, surface } = fixture();

    surface(['activate', 'endpoint']);

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(video.querySelector('source')?.src).toBe('/packed.mp4');
    expect(video.currentTime).toBe(1.25);
    expect(root.dataset.phoneTestAlpha).toBe('probing');
    surface(['dispose']);
  });

  it('mounts a packed decoder/Canvas pair and removes both on release', () => {
    const { container, video, surface } = fixture();

    surface(['activate', 'forward']);

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(video.querySelector('source')?.src).toBe('/packed.mp4');
    expect(video.dataset.packedAlphaSource).toBe('rgb-alpha-side-by-side');
    surface(['release']);
    expect(container.querySelector('canvas')).toBeNull();
    expect(video.querySelector('source')).toBeNull();
    surface(['dispose']);
  });

  it('renews a React-owned Canvas after hard release before reacquiring WebGL', () => {
    const ownerDocument = new FakeDocument();
    const root = ownerDocument.createElement('section');
    const container = ownerDocument.createElement('div');
    const video = ownerDocument.createElement('video') as FakeVideo;
    const canvas = ownerDocument.createElement('canvas');
    root.append(container);
    container.append(video);
    container.append(canvas);
    const surface = createPhonePackedAlphaSurface([
      root as unknown as HTMLElement,
      container as unknown as HTMLElement,
      canvas as unknown as HTMLCanvasElement,
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
    surface(['release']);

    const renewed = container.querySelector('canvas');
    expect(renewed).not.toBe(canvas);
    expect(renewed?.width).toBe(1);
    expect(renewed?.height).toBe(1);
    expect(video.querySelector('source')).toBeNull();

    surface(['activate', 'endpoint']);
    expect(compositorProbe.canvases).toEqual([canvas, renewed]);
    surface(['dispose']);
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
        null,
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

  it('[Task 3] binds an active proof token only to a subsequent physical draw', () => {
    const report = vi.fn();
    const { surface } = fixture(report);

    surface(['activate', 'forward']);
    compositorProbe.onFrame?.();
    expect(report).toHaveBeenLastCalledWith(null);

    surface(['present', 'authority|session|3']);
    // The mock compositor does not draw eagerly; this is the physical draw
    // callback that a successful WebGL upload/draw would produce.
    compositorProbe.onFrame?.();

    expect(report).toHaveBeenLastCalledWith('authority|session|3');
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
