import { describe, expect, it } from 'vitest';
import { HERO_COPY, heroScene, renderHeroProgress } from './index';
import { fixtureStaticFallbackText } from '../../story/copy-baseline';

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

describe('hero scene renderer', () => {
  it('is idempotent for 0 to 1 to 0 to 1 progress renders', () => {
    const root = new FakeElement();

    const start = renderHeroProgress(root as unknown as HTMLElement, 0);
    const end = renderHeroProgress(root as unknown as HTMLElement, 1);
    const restored = renderHeroProgress(root as unknown as HTMLElement, 0);
    const replayed = renderHeroProgress(root as unknown as HTMLElement, 1);

    expect(restored).toEqual(start);
    expect(replayed).toEqual(end);
    expect(root.style.values.get('--r4-hero-progress')).toBe('1.0000');
    expect(root.attributes.get('data-hero-progress')).toBe('1.0000');
  });

  it('keeps static fallback copy aligned with R-1 baseline', () => {
    expect(heroScene.staticFallback?.text).toEqual(HERO_COPY);
    expect(heroScene.staticFallback?.text).toEqual(fixtureStaticFallbackText('hero'));
  });
});
