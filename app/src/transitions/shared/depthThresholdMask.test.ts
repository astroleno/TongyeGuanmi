import { describe, expect, it } from 'vitest';
import { createDepthThresholdMask, thresholdTable } from './depthThresholdMask';

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

  constructor(ownerDocument: FakeDocument) {
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
  createElementNS(): FakeNode {
    return new FakeNode(this);
  }
}

describe('depth threshold mask', () => {
  it('produces only binary values with monotonic forward thresholds', () => {
    const start = thresholdTable(0, 256);
    const middle = thresholdTable(0.37, 256);
    const later = thresholdTable(0.73, 256);
    const end = thresholdTable(1, 256);

    expect(new Set(start)).toEqual(new Set([0]));
    expect(new Set(middle)).toEqual(new Set([0, 1]));
    expect(new Set(end)).toEqual(new Set([1]));
    expect(later.every((value, index) => value >= (middle[index] ?? 0))).toBe(true);
  });

  it('applies the run-scoped mask to the live target without changing its opacity', () => {
    const document = new FakeDocument();
    const host = new FakeNode(document);
    const target = new FakeNode(document);
    target.style.setProperty('opacity', '1');
    const mask = createDepthThresholdMask({
      host: host as unknown as HTMLElement,
      target: target as unknown as HTMLElement,
      depthSrc: '/depth.png',
      runId: 'epoch:7'
    });

    const values = mask?.render(0.37) ?? [];

    expect(mask?.maskId).toContain('epoch-7');
    expect(new Set(values)).toEqual(new Set([0, 1]));
    expect(target.style.getPropertyValue('opacity')).toBe('1');
    expect(target.style.getPropertyValue('mask-image')).toContain(mask?.maskId ?? 'missing');
    expect(target.attributes.get('data-r4-depth-mask-values')).toBe('1,0');

    mask?.dispose();
    expect(target.style.getPropertyValue('mask-image')).toBe('');
    expect(host.children).toHaveLength(0);
  });
});
