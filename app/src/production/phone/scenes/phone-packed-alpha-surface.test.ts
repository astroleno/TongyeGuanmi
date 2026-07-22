import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../media/packed-alpha-video', () => ({
  createPackedAlphaVideoCompositor: vi.fn(({ canvas }) => {
    canvas.dataset.packedAlphaStatus = 'waiting';
    return { render: () => false, dispose: vi.fn() };
  }),
  setPackedAlphaVideoSource: vi.fn((video, sourceUrl) => {
    const source = video.ownerDocument.createElement('source');
    source.src = sourceUrl;
    video.dataset.packedAlphaSource = 'rgb-alpha-side-by-side';
    video.replaceChildren(source);
    video.load();
  })
}));

import {
  createPhonePackedAlphaSurface,
  releasePhonePackedAlphaWhenHidden
} from './phone-packed-alpha-surface';

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  ownerDocument!: FakeDocument;
  parentNode: FakeNode | null = null;
  className = '';
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

function fixture() {
  const ownerDocument = new FakeDocument();
  const root = ownerDocument.createElement('section');
  const container = ownerDocument.createElement('div');
  const video = ownerDocument.createElement('video') as FakeVideo;
  root.append(container);
  container.append(video);
  const surface = createPhonePackedAlphaSurface({
    root: root as unknown as HTMLElement,
    container: container as unknown as HTMLElement,
    video: video as unknown as HTMLVideoElement,
    packedSourceUrl: '/packed.mp4',
    endpointSeconds: 1.25,
    statusDataset: 'phoneTestAlpha',
    layerName: 'test',
    canvasClassName: 'test-canvas'
  });
  return { root, container, video, surface };
}

describe('phone packed-alpha surface', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('seeks the packed Canvas owner to the stable endpoint', () => {
    const { root, container, video, surface } = fixture();

    surface.activate('endpoint');

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(video.querySelector('source')?.src).toBe('/packed.mp4');
    expect(video.currentTime).toBe(1.25);
    expect(root.dataset.phoneTestAlpha).toBe('probing');
    surface.dispose();
  });

  it('mounts a packed decoder/Canvas pair and removes both on release', () => {
    const { container, video, surface } = fixture();

    surface.activate();

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(video.querySelector('source')?.src).toBe('/packed.mp4');
    expect(video.dataset.packedAlphaSource).toBe('rgb-alpha-side-by-side');
    surface.release();
    expect(container.querySelector('canvas')).toBeNull();
    expect(video.querySelector('source')).toBeNull();
    surface.dispose();
  });

  it('waits for the scroll transition to become invisible before releasing', () => {
    let notifyMutation: (() => void) | undefined;
    class FakeMutationObserver {
      constructor(callback: () => void) {
        notifyMutation = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('MutationObserver', FakeMutationObserver);
    const root = new FakeNode();
    root.style.opacity = '0.5';
    const release = vi.fn();
    const cancel = releasePhonePackedAlphaWhenHidden(
      root as unknown as HTMLElement,
      release
    );

    expect(release).not.toHaveBeenCalled();
    root.style.opacity = '0';
    notifyMutation?.();
    expect(release).toHaveBeenCalledOnce();
    cancel();
  });
});
