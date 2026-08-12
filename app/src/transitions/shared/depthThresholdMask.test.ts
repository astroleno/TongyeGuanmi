import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDepthThresholdMask,
  thresholdTable,
  thresholdTables
} from './depthThresholdMask';

class FakeStyle {
  readonly values = new Map<string, string>();
  readonly writes: { name: string; value: string }[] = [];
  position = '';
  pointerEvents = '';

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
    this.writes.push({ name, value });
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }

  removeProperty(name: string): void {
    this.values.delete(name);
  }
}

class FakeNode {
  readonly attributes = new Map<string, string>();
  readonly children: FakeNode[] = [];
  readonly style = new FakeStyle();
  ownerDocument: FakeDocument;
  parent: FakeNode | null = null;

  constructor(ownerDocument: FakeDocument, readonly nodeName = '') {
    this.ownerDocument = ownerDocument;
  }

  append(...children: FakeNode[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  remove(): void {
    if (!this.parent) {
      return;
    }
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
}

class FakeDocument {
  createElementNS(_namespace: string, nodeName: string): FakeNode {
    return new FakeNode(this, nodeName);
  }
}

function descendants(node: FakeNode): FakeNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

const depthTransform = {
  viewport: { width: 1440, height: 900 },
  cover: { x: -80, y: 0, width: 1600, height: 900 },
  camera: {
    scale: 1.142,
    translateX: 0,
    translateY: -34,
    originX: 0.5,
    originY: 0.56
  }
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('depth threshold mask', () => {
  it('owns no runtime SVG fragment and mutates the target CSS atlas coordinates', async () => {
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [],
      polarities: ['reveal', 'conceal'],
      atlasSrc: '/depth-atlas.webp',
      runId: 'phone-depth:1'
    });

    await mask?.ready;
    mask?.commit();
    mask?.render(.5, depthTransform);

    expect(host.children).toHaveLength(0);
    expect(host.children.flatMap((child) => descendants(child))).toHaveLength(0);
    mask?.dispose();
    expect(host.children).toHaveLength(0);
  });

  it('keeps every live target unmasked until the decoded resource is committed', async () => {
    class DeferredImage {
      static latest: DeferredImage | undefined;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';

      constructor() {
        DeferredImage.latest = this;
      }
    }
    vi.stubGlobal('Image', DeferredImage);
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const reveal = new FakeNode(document);

    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [{ element: reveal as unknown as HTMLElement, polarity: 'reveal' }],
      atlasSrc: '/delayed-depth-atlas.webp',
      runId: 'depth-delayed:1'
    });

    expect(reveal.style.getPropertyValue('mask-image')).toBe('');
    expect(reveal.attributes.get('data-r4-depth-mask-run')).toBeUndefined();
    expect(host.children).toHaveLength(0);

    DeferredImage.latest?.onload?.();
    await mask?.ready;
    expect(reveal.style.getPropertyValue('mask-image')).toBe('');
    expect(host.children).toHaveLength(0);

    mask?.commit();
    expect(reveal.style.getPropertyValue('mask-image')).toBe('url("/delayed-depth-atlas.webp")');
    expect(reveal.attributes.get('data-r4-depth-mask-run')).toBe('depth-delayed:1');
    expect(host.children).toHaveLength(0);
  });

  it('rejects a failed depth resource without attaching an empty mask', async () => {
    class DeferredImage {
      static latest: DeferredImage | undefined;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';

      constructor() {
        DeferredImage.latest = this;
      }
    }
    vi.stubGlobal('Image', DeferredImage);
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const reveal = new FakeNode(document);
    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [{ element: reveal as unknown as HTMLElement, polarity: 'reveal' }],
      atlasSrc: '/failed-depth-atlas.webp',
      runId: 'depth-failed:1'
    });

    DeferredImage.latest?.onerror?.();
    await expect(mask?.ready).rejects.toThrow(/failed to load/i);
    expect(() => mask?.commit()).toThrow(/failed to load/i);
    expect(reveal.style.getPropertyValue('mask-image')).toBe('');
    expect(host.children).toHaveLength(0);
  });

  it('produces complementary binary tables at every sampled direction point', () => {
    for (const progress of [0, 0.37, 0.73, 1, 0.37]) {
      const tables = thresholdTables(progress, 256);
      expect(tables.reveal).toEqual(thresholdTable(progress, 256));
      expect(tables.reveal.every((value) => value === 0 || value === 1)).toBe(true);
      expect(tables.conceal.every((value) => value === 0 || value === 1)).toBe(true);
      expect(tables.reveal.every((value, index) => value + (tables.conceal[index] ?? -1) === 1)).toBe(true);
    }
  });

  it('applies reveal and conceal masks to live targets without changing opacity', async () => {
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const proof = new FakeNode(document);
    const ground = new FakeNode(document);
    const depthField = new FakeNode(document);
    proof.style.setProperty('opacity', '1');
    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [
        { element: proof as unknown as HTMLElement, polarity: 'reveal' },
        { element: ground as unknown as HTMLElement, polarity: 'reveal' },
        { element: depthField as unknown as HTMLElement, polarity: 'conceal' }
      ],
      atlasSrc: '/depth-atlas.webp',
      runId: 'epoch:7'
    });
    await mask?.ready;
    mask?.commit();

    const tables = mask?.render(0.37, depthTransform);

    expect(tables?.reveal.every((value, index) => value + (tables.conceal[index] ?? -1) === 1)).toBe(true);
    expect(proof.style.getPropertyValue('opacity')).toBe('1');
    expect(proof.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');
    expect(ground.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');
    expect(depthField.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');
    expect(proof.style.getPropertyValue('-webkit-mask-position')).not.toBe(
      depthField.style.getPropertyValue('-webkit-mask-position')
    );
    mask?.dispose();
    expect(proof.style.getPropertyValue('mask-image')).toBe('');
    expect(ground.style.getPropertyValue('mask-image')).toBe('');
    expect(depthField.style.getPropertyValue('mask-image')).toBe('');
    expect(host.children).toHaveLength(0);
  });

  it('does not attach then remove the fully visible endpoint mask during commit', async () => {
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const reveal = new FakeNode(document);
    const conceal = new FakeNode(document);
    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [
        { element: reveal as unknown as HTMLElement, polarity: 'reveal' },
        { element: conceal as unknown as HTMLElement, polarity: 'conceal' }
      ],
      atlasSrc: '/depth-atlas.webp',
      runId: 'endpoint-contract:1'
    });
    await mask?.ready;
    mask?.commit();

    expect(conceal.style.getPropertyValue('mask-image')).toBe('');
    expect(conceal.style.writes.filter(({ name, value }) => (
      name === 'mask-image' && value.includes('/depth-atlas.webp')
    ))).toHaveLength(0);
    expect(reveal.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');

    mask?.render(0.37, depthTransform);
    expect(conceal.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');
    expect(reveal.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');

    mask?.render(1, depthTransform);
    expect(reveal.style.getPropertyValue('mask-image')).toBe('');
    expect(conceal.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');

    mask?.render(0.37, depthTransform);
    expect(conceal.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');
    expect(reveal.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');

    mask?.render(0, depthTransform);
    expect(conceal.style.getPropertyValue('mask-image')).toBe('');
    expect(reveal.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');
    mask?.dispose();
    expect(host.children).toHaveLength(0);
  });

  it('selects independent reveal and conceal WebP tiles on the planes themselves', async () => {
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const reveal = new FakeNode(document);
    const conceal = new FakeNode(document);

    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [
        { element: reveal as unknown as HTMLElement, polarity: 'reveal' },
        { element: conceal as unknown as HTMLElement, polarity: 'conceal' }
      ],
      atlasSrc: '/depth-atlas.webp',
      runId: 'alpha-contract:1'
    });
    await mask?.ready;
    mask?.commit();
    mask?.render(.37, depthTransform);

    expect(descendants(host)).toHaveLength(0);
    expect(reveal.style.getPropertyValue('-webkit-mask-image')).toBe('url("/depth-atlas.webp")');
    expect(reveal.style.getPropertyValue('mask-mode')).toBe('alpha');
    expect(conceal.style.getPropertyValue('mask-image')).toBe('url("/depth-atlas.webp")');
    expect(conceal.style.getPropertyValue('mask-mode')).toBe('alpha');
    expect(reveal.style.getPropertyValue('-webkit-mask-size')).toBe('14617.6px 8222.4px');
    expect(reveal.style.getPropertyValue('-webkit-mask-position')).toBe('-11156.8px -2161.168px');
    expect(conceal.style.getPropertyValue('-webkit-mask-position')).toBe('-12984px -2161.168px');
  });

  it('advances native CSS atlas coordinates with Stage cover and camera', async () => {
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const reveal = new FakeNode(document);
    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [{ element: reveal as unknown as HTMLElement, polarity: 'reveal' }],
      atlasSrc: '/depth-atlas.webp',
      runId: 'camera-contract:1'
    });
    await mask?.ready;
    mask?.commit();

    mask?.render(0.37, depthTransform);
    const firstPosition = reveal.style.getPropertyValue('-webkit-mask-position');

    mask?.render(0.73, depthTransform);

    expect(descendants(host)).toHaveLength(0);
    expect(reveal.style.getPropertyValue('-webkit-mask-position')).not.toBe(firstPosition);
    expect(reveal.style.getPropertyValue('-webkit-mask-size')).toBe('14617.6px 8222.4px');
    expect(reveal.style.getPropertyValue('-webkit-mask-position')).toBe('-11156.8px -5244.568px');
    expect(reveal.style.getPropertyValue('-webkit-mask-image')).not.toContain('#');
  });
});
