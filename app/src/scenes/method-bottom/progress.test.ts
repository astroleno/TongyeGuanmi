import { describe, expect, it } from 'vitest';
import { inventoryManifestSeed } from '../../story/manifest';
import { METHOD_BOTTOM_COPY, methodBottomScene, renderMethodBottomProgress } from './index';

class FakeStyle {
  values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe('method-bottom scene renderer', () => {
  it('is idempotent for 0 to 1 to 0 to 1 progress renders', () => {
    const root = new FakeElement();

    const start = renderMethodBottomProgress(root as unknown as HTMLElement, 0);
    const end = renderMethodBottomProgress(root as unknown as HTMLElement, 1);
    const restored = renderMethodBottomProgress(root as unknown as HTMLElement, 0);
    const replayed = renderMethodBottomProgress(root as unknown as HTMLElement, 1);

    expect(restored).toEqual(start);
    expect(replayed).toEqual(end);
    expect(root.style.values.get('--r4-method-bottom-progress')).toBe('1.0000');
    expect(root.attributes.get('data-method-bottom-progress')).toBe('1.0000');
  });

  it('uses the R-1 method-bottom split verbatim', () => {
    const method = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'method');
    expect(methodBottomScene.staticFallback?.text).toEqual(METHOD_BOTTOM_COPY);
    expect(method?.normalizedText.slice(8, 8 + METHOD_BOTTOM_COPY.length)).toEqual([...METHOD_BOTTOM_COPY]);
  });
});
