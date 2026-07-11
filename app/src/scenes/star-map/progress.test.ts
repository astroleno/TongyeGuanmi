import { describe, expect, it } from 'vitest';
import { renderStarMapProgress, starMapMotionEnabled } from './index';

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

describe('star-map progress renderer', () => {
  it('keeps the canonical live Perlin owner active while visible', () => {
    expect(starMapMotionEnabled(true, false)).toBe(false);
    expect(starMapMotionEnabled(false, true)).toBe(false);
    expect(starMapMotionEnabled(false, false, 'next')).toBe(false);
    expect(starMapMotionEnabled(false, false)).toBe(true);
  });

  it('is idempotent for repeated progress renders', () => {
    const root = new FakeElement();

    const first = renderStarMapProgress(root as unknown as HTMLElement, 0.75);
    const second = renderStarMapProgress(root as unknown as HTMLElement, 0.75);

    expect(second).toEqual(first);
    expect(root.style.values.get('--r3-star-copy-opacity')).toBe('0.7500');
    expect(root.style.values.get('--r3-star-canvas-opacity')).toBe('0.6600');
    expect(root.attributes.get('data-star-map-progress')).toBe('0.7500');
  });
});
