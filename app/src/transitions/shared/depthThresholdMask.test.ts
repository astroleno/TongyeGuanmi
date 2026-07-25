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
    expect(reveal.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');
    expect(reveal.attributes.get('data-r4-depth-mask-run')).toBe('depth-delayed:1');
    expect(host.children).toHaveLength(1);
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
    for (const progress of [0, 0.25, 0.5, 0.75, 1, 0.25]) {
      const tables = thresholdTables(progress, 256);
      expect(tables.reveal).toEqual(thresholdTable(progress, 256));
      expect(tables.reveal.reduce((total, value) => total + value, 0))
        .toBe(Math.round(progress * 256));
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
    expect(proof.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');
    expect(ground.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');
    expect(depthField.style.getPropertyValue('mask-image')).toContain('depth-threshold-conceal-mask');
    expect(proof.attributes.get('data-r4-depth-mask-values')).toBe('1,0');
    expect(ground.attributes.get('data-r4-depth-mask-values')).toBe('1,0');
    expect(depthField.attributes.get('data-r4-depth-mask-values')).toBe('0,1');

    mask?.dispose();
    expect(proof.style.getPropertyValue('mask-image')).toBe('');
    expect(ground.style.getPropertyValue('mask-image')).toBe('');
    expect(depthField.style.getPropertyValue('mask-image')).toBe('');
    expect(host.children).toHaveLength(0);
  });

  it('conceals both Figure2 depth owners while revealing Proof at quarter samples', async () => {
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const backgroundAndMiddle = new FakeNode(document);
    const figures = new FakeNode(document);
    const proof = new FakeNode(document);
    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [
        {
          element: backgroundAndMiddle as unknown as HTMLElement,
          polarity: 'conceal'
        },
        {
          element: figures as unknown as HTMLElement,
          polarity: 'conceal'
        },
        {
          element: proof as unknown as HTMLElement,
          polarity: 'reveal'
        }
      ],
      atlasSrc: '/figure2-depth-atlas.webp',
      runId: 'figure2-proof:quarter-samples'
    });
    await mask?.ready;
    mask?.commit();

    for (const progress of [0.25, 0.5, 0.75]) {
      const tables = mask?.render(progress, depthTransform);
      expect(tables?.conceal).toEqual(
        tables?.reveal.map((value) => 1 - value)
      );
      expect(backgroundAndMiddle.attributes.get('data-r4-depth-mask-values'))
        .toBe('0,1');
      expect(figures.attributes.get('data-r4-depth-mask-values')).toBe('0,1');
      expect(proof.attributes.get('data-r4-depth-mask-values')).toBe('1,0');
    }
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
      name === 'mask-image' && value.includes('depth-threshold-conceal-mask')
    ))).toHaveLength(0);
    expect(reveal.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');

    mask?.render(0.37, depthTransform);
    expect(conceal.style.getPropertyValue('mask-image')).toContain('depth-threshold-conceal-mask');
    expect(reveal.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');

    mask?.render(1, depthTransform);
    expect(reveal.style.getPropertyValue('mask-image')).toBe('');
    expect(conceal.style.getPropertyValue('mask-image')).toContain('depth-threshold-conceal-mask');

    mask?.render(0.37, depthTransform);
    expect(conceal.style.getPropertyValue('mask-image')).toContain('depth-threshold-conceal-mask');
    expect(reveal.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');

    mask?.render(0, depthTransform);
    expect(conceal.style.getPropertyValue('mask-image')).toBe('');
    expect(reveal.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');
    mask?.dispose();
    expect(host.children).toHaveLength(0);
  });

  it('uses one pre-baked atlas image per requested polarity and only a static conceal inversion', async () => {
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

    const nodes = descendants(host);
    const alphaFunctions = nodes.filter((node) => node.nodeName === 'feFuncA');
    const masks = nodes.filter((node) => node.nodeName === 'mask');
    const images = nodes.filter((node) => node.nodeName === 'image');
    expect(alphaFunctions).toHaveLength(1);
    expect(alphaFunctions[0]?.attributes.get('type')).toBe('table');
    expect(alphaFunctions[0]?.attributes.get('tableValues')).toBe('1 0');
    expect(masks).toHaveLength(2);
    expect(images).toHaveLength(2);
    expect(images.every((node) => node.attributes.get('href') === '/depth-atlas.webp')).toBe(true);
    expect(masks.every((node) => node.attributes.get('mask-type') === 'alpha')).toBe(true);
    expect(nodes.some((node) => node.nodeName === 'feColorMatrix')).toBe(false);
  });

  it('uses Stage coordinates and advances atlas tiles without mutable threshold filters', async () => {
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
    const nodes = descendants(host);
    const masks = nodes.filter((node) => node.nodeName === 'mask');
    const filters = nodes.filter((node) => node.nodeName === 'filter');
    const images = nodes.filter((node) => node.nodeName === 'image');
    const viewports = nodes.filter((node) => node.nodeName === 'svg' && node.attributes.has('viewBox'));
    const cameras = nodes.filter((node) => node.nodeName === 'g');
    const firstViewBoxes = viewports.map((node) => node.attributes.get('viewBox'));

    mask?.render(0.73, depthTransform);

    expect(masks.every((node) => node.attributes.get('maskUnits') === 'userSpaceOnUse')).toBe(true);
    expect(masks.every((node) => node.attributes.get('maskContentUnits') === 'userSpaceOnUse')).toBe(true);
    expect(filters).toHaveLength(0);
    expect(images.every((node) => node.attributes.get('x') === '0')).toBe(true);
    expect(images.every((node) => node.attributes.get('width') === '3072')).toBe(true);
    expect(viewports.every((node) => node.attributes.get('x') === '-80')).toBe(true);
    expect(viewports.every((node) => node.attributes.get('width') === '1600')).toBe(true);
    expect(viewports.map((node) => node.attributes.get('viewBox'))).not.toEqual(firstViewBoxes);
    expect(viewports.every((node) => node.attributes.get('viewBox') === '2304 1080 384 216')).toBe(true);
    expect(cameras.every((node) => node.attributes.get('transform')?.includes('scale(1.142)'))).toBe(true);
    expect(cameras.every((node) => node.attributes.get('transform')?.includes('translate(0 -34)'))).toBe(true);
    expect(nodes.some((node) => node.attributes.get('type') === 'linear')).toBe(false);
  });
});
