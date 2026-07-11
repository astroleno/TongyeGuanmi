import { describe, expect, it } from 'vitest';
import {
  createDepthThresholdMask,
  thresholdTable,
  thresholdTables
} from './depthThresholdMask';

class FakeStyle {
  readonly values = new Map<string, string>();
  position = '';
  pointerEvents = '';

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
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

describe('depth threshold mask', () => {
  it('produces complementary binary tables at every sampled direction point', () => {
    for (const progress of [0, 0.37, 0.73, 1, 0.37]) {
      const tables = thresholdTables(progress, 256);
      expect(tables.reveal).toEqual(thresholdTable(progress, 256));
      expect(tables.reveal.every((value) => value === 0 || value === 1)).toBe(true);
      expect(tables.conceal.every((value) => value === 0 || value === 1)).toBe(true);
      expect(tables.reveal.every((value, index) => value + (tables.conceal[index] ?? -1) === 1)).toBe(true);
    }
  });

  it('applies reveal and conceal masks to live targets without changing opacity', () => {
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
      depthSrc: '/depth.png',
      runId: 'epoch:7'
    });

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

  it('creates two discrete alpha definitions independently of source alpha', () => {
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const reveal = new FakeNode(document);
    const conceal = new FakeNode(document);

    createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [
        { element: reveal as unknown as HTMLElement, polarity: 'reveal' },
        { element: conceal as unknown as HTMLElement, polarity: 'conceal' }
      ],
      depthSrc: '/depth-with-alpha.png',
      runId: 'alpha-contract:1'
    });

    const nodes = descendants(host);
    const alphaFunctions = nodes.filter((node) => node.nodeName === 'feFuncA');
    const binaryAlpha = nodes.filter((node) => node.attributes.get('result')?.endsWith('binary-alpha'));
    const masks = nodes.filter((node) => node.nodeName === 'mask');
    expect(alphaFunctions).toHaveLength(2);
    expect(alphaFunctions.every((node) => node.attributes.get('type') === 'discrete')).toBe(true);
    expect(alphaFunctions.every((node) => node.attributes.get('tableValues') === '1 1')).toBe(true);
    expect(binaryAlpha).toHaveLength(2);
    expect(binaryAlpha.every((node) => node.attributes.get('values')?.includes('1 0 0 0 0'))).toBe(true);
    expect(masks).toHaveLength(2);
    expect(masks.every((node) => node.attributes.get('mask-type') === 'alpha')).toBe(true);
  });

  it('uses Stage coordinates and updates only constant-size threshold intercepts', () => {
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const reveal = new FakeNode(document);
    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      targets: [{ element: reveal as unknown as HTMLElement, polarity: 'reveal' }],
      depthSrc: '/depth.png',
      runId: 'camera-contract:1'
    });

    mask?.render(0.37, depthTransform);
    const nodes = descendants(host);
    const masks = nodes.filter((node) => node.nodeName === 'mask');
    const filters = nodes.filter((node) => node.nodeName === 'filter');
    const images = nodes.filter((node) => node.nodeName === 'image');
    const linearFunctions = nodes.filter((node) => node.attributes.get('type') === 'linear');
    const discreteFunctions = nodes.filter(
      (node) => node.nodeName !== 'feFuncA' && node.attributes.get('type') === 'discrete'
    );
    const firstIntercepts = linearFunctions.map((node) => node.attributes.get('intercept'));

    mask?.render(0.73, depthTransform);

    expect(masks.every((node) => node.attributes.get('maskUnits') === 'userSpaceOnUse')).toBe(true);
    expect(masks.every((node) => node.attributes.get('maskContentUnits') === 'userSpaceOnUse')).toBe(true);
    expect(filters.every((node) => node.attributes.get('filterUnits') === 'userSpaceOnUse')).toBe(true);
    expect(images.every((node) => node.attributes.get('x') === '-80')).toBe(true);
    expect(images.every((node) => node.attributes.get('width') === '1600')).toBe(true);
    expect(images.every((node) => node.attributes.get('transform')?.includes('scale(1.142)'))).toBe(true);
    expect(images.every((node) => node.attributes.get('transform')?.includes('translate(0 -34)'))).toBe(true);
    expect(linearFunctions).toHaveLength(6);
    expect(linearFunctions.map((node) => node.attributes.get('intercept'))).not.toEqual(firstIntercepts);
    expect(discreteFunctions).toHaveLength(6);
    expect(discreteFunctions.every((node) => (node.attributes.get('tableValues')?.length ?? 0) <= 3)).toBe(true);
  });
});
