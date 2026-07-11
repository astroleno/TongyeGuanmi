import { describe, expect, it, vi } from 'vitest';
import { pauseStarMapTransitionMotion, releaseStarMapTransitionMotion, renderStarMapProgress, starMapMotionEnabled } from './index';

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
  it('keeps the rendered Perlin field static on hold so the scene stays inside the idle CPU budget', () => {
    expect(starMapMotionEnabled(true, false)).toBe(false);
    expect(starMapMotionEnabled(false, true)).toBe(false);
    expect(starMapMotionEnabled(false, false)).toBe(false);
  });

  it('pauses live Perlin during a snapshot handoff and keeps the captured destination frame static', () => {
    const setActive = vi.fn();
    const root = {
      dataset: {},
      __r4StarMapPaintController: { setActive }
    } as unknown as HTMLElement;

    pauseStarMapTransitionMotion(root);
    releaseStarMapTransitionMotion(root);

    expect(setActive).toHaveBeenNthCalledWith(1, false);
    expect(setActive).toHaveBeenNthCalledWith(2, false);
    expect(root.dataset.starMapTransitionMotion).toBeUndefined();
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
