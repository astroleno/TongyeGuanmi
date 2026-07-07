import { describe, expect, it } from 'vitest';
import { figure2AnimationScene, renderFigure2AnimationProgress } from './index';

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

describe('figure2-animation scene renderer', () => {
  it('is idempotent for 0 to 1 to 0 to 1 progress renders', () => {
    const root = new FakeElement();

    const start = renderFigure2AnimationProgress(root as unknown as HTMLElement, 0);
    const end = renderFigure2AnimationProgress(root as unknown as HTMLElement, 1);
    const restored = renderFigure2AnimationProgress(root as unknown as HTMLElement, 0);
    const replayed = renderFigure2AnimationProgress(root as unknown as HTMLElement, 1);

    expect(restored).toEqual(start);
    expect(replayed).toEqual(end);
    expect(root.style.values.get('--r4-figure2-progress')).toBe('1.0000');
    expect(root.attributes.get('data-figure2-progress')).toBe('1.0000');
  });

  it('declares targetReady preload without public copy fallback', () => {
    expect(figure2AnimationScene.staticFallback).toBeUndefined();
    expect(figure2AnimationScene.preload()).toEqual({ milestones: ['targetReady'] });
  });
});
