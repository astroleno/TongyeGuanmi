import { describe, expect, it, vi } from 'vitest';
import {
  HERO_INTRO_DURATION_MS,
  HERO_TITLE_START_PROGRESS,
  attachHeroParallax,
  heroParallaxSample,
  sampleHeroIntro,
  sampleHeroScroll,
  startHeroIntro
} from './motion';

class FakeStyle {
  values = new Map<string, string>();
  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeRoot {
  style = new FakeStyle();
  dataset: Record<string, string> = {};
}

class FakeEventTarget {
  listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = listener as (event: unknown) => void;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as (event: unknown) => void);
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe('Hero motion', () => {
  it('samples the Main Hero layers independently at authored endpoints', () => {
    expect(sampleHeroScroll(0)).toMatchObject({
      backYVh: 0,
      backScale: 1.1,
      middleYVh: 1,
      middleScale: 0.98,
      figureYVh: 12,
      figureScale: 1
    });
    expect(sampleHeroScroll(1)).toMatchObject({
      backYVh: -5,
      backScale: 1.2,
      middleYVh: 19,
      middleScale: 1.3,
      figureYVh: 0,
      figureScale: 1.065
    });
    expect(sampleHeroScroll(1, true).middleYVh).toBe(15);
    expect(sampleHeroScroll(0.16).figureScale).toBe(1);
    expect(sampleHeroScroll(0.92).figureScale).toBe(1.065);
  });

  it('uses the legacy 2.7s intro and title threshold', () => {
    expect(HERO_INTRO_DURATION_MS).toBe(2_700);
    expect(HERO_TITLE_START_PROGRESS).toBe(0.78);
    expect(sampleHeroIntro(0.779)).toMatchObject({ titleActive: false, complete: false });
    expect(sampleHeroIntro(0.78)).toMatchObject({ titleActive: true, complete: false });
    expect(sampleHeroIntro(1)).toEqual({ progress: 1, titleActive: true, complete: true });
  });

  it('advances intro from 0 to 1 and cancels its frame idempotently', () => {
    const frames: Array<(time: number) => void> = [];
    const rendered: number[] = [];
    const onTitle = vi.fn();
    const onComplete = vi.fn();
    const cancelFrame = vi.fn();
    const dispose = startHeroIntro({
      render: (sample) => rendered.push(sample.progress),
      onTitleActive: onTitle,
      onComplete,
      now: () => 0,
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame
    });

    expect(rendered).toEqual([0]);
    frames.shift()?.(HERO_INTRO_DURATION_MS * 0.5);
    frames.shift()?.(HERO_INTRO_DURATION_MS * HERO_TITLE_START_PROGRESS);
    frames.shift()?.(HERO_INTRO_DURATION_MS);
    expect(rendered.at(-1)).toBe(1);
    expect(onTitle).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();

    dispose();
    dispose();
    expect(cancelFrame).toHaveBeenCalledOnce();
  });

  it('renders the endpoint without frames for reduced motion', () => {
    const render = vi.fn();
    const requestFrame = vi.fn();
    const onComplete = vi.fn();
    startHeroIntro({ render, requestFrame, reducedMotion: true, onComplete });
    expect(render).toHaveBeenCalledWith({ progress: 1, titleActive: true, complete: true });
    expect(requestFrame).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('uses distinct legacy back, middle, and figure pointer coefficients', () => {
    expect(heroParallaxSample(100, 50)).toEqual({
      backX: 2,
      backY: 1,
      middleX: 4,
      middleY: 2,
      figureX: 6,
      figureY: 3
    });
  });

  it('ignores touch and releases pointer listeners, rAF, and offsets', () => {
    const root = new FakeRoot();
    const target = new FakeEventTarget();
    const frames: Array<(time: number) => void> = [];
    const cancelFrame = vi.fn();
    const dispose = attachHeroParallax(root as unknown as HTMLElement, {
      eventTarget: target as unknown as Window,
      viewport: () => ({ width: 1_000, height: 800 }),
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame
    });

    target.dispatch('pointermove', { pointerType: 'touch', clientX: 900, clientY: 700 });
    expect(frames).toHaveLength(0);
    target.dispatch('pointermove', { pointerType: 'mouse', clientX: 900, clientY: 600 });
    expect(frames).toHaveLength(1);
    frames.shift()?.(16.67);
    expect(Number.parseFloat(root.style.values.get('--r4-hero-back-parallax-x') ?? '0')).toBeGreaterThan(0);
    expect(root.dataset.heroParallaxActive).toBe('true');

    dispose();
    dispose();
    expect(target.listeners.get('pointermove')?.size).toBe(0);
    expect(target.listeners.get('pointerleave')?.size).toBe(0);
    expect(root.style.values.get('--r4-hero-back-parallax-x')).toBe('0.00px');
    expect(root.dataset.heroParallaxActive).toBeUndefined();
    expect(cancelFrame).toHaveBeenCalledOnce();
  });
});
