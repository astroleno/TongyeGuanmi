import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HERO_COPY, heroScene, renderHeroProgress, setHeroPlaybackActive } from './index';
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

class FakeVideo {
  muted = false;
  loop = true;
  autoplay = true;
  playsInline = false;
  currentTime = 0;
  duration = 5.04;
  paused = true;
  playbackRate = 0;
  pauseCount = 0;
  playCount = 0;
  listeners = new Map<string, EventListener>();

  pause(): void {
    this.paused = true;
    this.pauseCount += 1;
  }

  play(): Promise<void> {
    this.paused = false;
    this.playCount += 1;
    return Promise.resolve();
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }
}

class FakeHeroRoot extends FakeElement {
  constructor(private readonly video: FakeVideo) {
    super();
  }

  querySelector(selector: string): FakeVideo | null {
    return selector === '[data-hero-figure-video]' ? this.video : null;
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
    expect(start.middleOpacity).toBeGreaterThan(0);
    expect(start.figureOpacity).toBeGreaterThan(0);
    expect(end.middleOpacity).toBe(1);
    expect(end.figureOpacity).toBe(1);
    expect(root.style.values.get('--r4-hero-progress')).toBe('1.0000');
    expect(root.attributes.get('data-hero-progress')).toBe('1.0000');
  });

  it('plays the hero video natively and never seeks it from visual progress frames', () => {
    const video = new FakeVideo();
    const root = new FakeHeroRoot(video);

    setHeroPlaybackActive(video as unknown as HTMLVideoElement, true);

    expect(video.loop).toBe(false);
    expect(video.autoplay).toBe(false);
    expect(video.playbackRate).toBe(1);
    expect(video.playCount).toBe(1);
    expect(video.pauseCount).toBe(0);
    expect(video.currentTime).toBeCloseTo(0.34, 2);

    renderHeroProgress(root as unknown as HTMLElement, 1);
    renderHeroProgress(root as unknown as HTMLElement, 0);

    expect(video.playCount).toBe(1);
    expect(video.pauseCount).toBe(0);
    expect(video.currentTime).toBeCloseTo(0.34, 2);

    video.currentTime = 2.5;
    video.listeners.get('timeupdate')?.(new Event('timeupdate'));
    expect(video.pauseCount).toBe(1);
    expect(video.currentTime).toBeCloseTo(2.34, 2);

    setHeroPlaybackActive(video as unknown as HTMLVideoElement, false);
    expect(video.pauseCount).toBe(2);
  });

  it('keeps static fallback copy aligned with R-1 baseline', () => {
    expect(heroScene.staticFallback?.text).toEqual(HERO_COPY);
    expect(heroScene.staticFallback?.text).toEqual(fixtureStaticFallbackText('hero'));
  });

  it('renders the title and subtitle through the reusable staggered text reveal contract', () => {
    const markup = renderToStaticMarkup(createElement(heroScene.Component, {
      scene: 'hero',
      hidden: false
    }));

    expect(markup).toContain('data-text-reveal="staggered"');
    expect(markup).toContain('data-text-reveal-item="0"');
    expect(markup).toContain('data-text-reveal-item="3"');
    expect(markup).toContain('data-text-reveal="line"');
    expect(markup.match(/data-text-reveal-effects="stagger blur-to-clear rise-up"/g)).toHaveLength(2);
  });

  it('keeps copy inside the artwork stacking context below the center figure', () => {
    const markup = renderToStaticMarkup(createElement(heroScene.Component, {
      scene: 'hero',
      hidden: false
    }));
    const artworkIndex = markup.indexOf('r4-hero-scene__stage');
    const artworkEndIndex = markup.indexOf('</div>', artworkIndex);
    const copyIndex = markup.indexOf('r4-hero-scene__content');
    const figureIndex = markup.indexOf('r4-hero-scene__figure');
    const vignetteIndex = markup.indexOf('r4-hero-scene__vignette');

    expect(artworkIndex).toBeGreaterThanOrEqual(0);
    expect(copyIndex).toBeGreaterThan(artworkIndex);
    expect(copyIndex).toBeLessThan(artworkEndIndex);
    expect(figureIndex).toBeGreaterThan(copyIndex);
    expect(vignetteIndex).toBeGreaterThan(figureIndex);
  });
});
