import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HERO_COPY,
  heroScene,
  heroVideoPlaybackStateForPresentation,
  renderHeroPatternProgress,
  renderHeroProgress,
  setHeroVideoPlaybackState
} from './index';
import { fixtureStaticFallbackText } from '../../story/copy-baseline';
import {
  FakeElement as TimelineRoot,
  FakeVideo as TimelineVideo
} from '../../transitions/__fixtures__/back-half.fixture';

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
  preload = 'auto';
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
    expect(root.style.values.get('--r4-hero-middle-intro')).toBe('1.0000');
    expect(root.style.values.get('--r4-hero-figure-intro')).toBe('1.0000');
    expect(root.style.values.get('--r4-hero-progress')).toBe('1.0000');
    expect(root.attributes.get('data-hero-progress')).toBe('1.0000');
  });

  it('keeps the Hero figure paused at authored endpoints instead of playing it during intro', () => {
    const video = new FakeVideo();
    const root = new FakeHeroRoot(video);

    setHeroVideoPlaybackState(video as unknown as HTMLVideoElement, 'start');

    expect(video.loop).toBe(false);
    expect(video.autoplay).toBe(false);
    expect(video.playbackRate).toBe(1);
    expect(video.playCount).toBe(0);
    expect(video.pauseCount).toBe(1);
    expect(video.currentTime).toBeCloseTo(0.34, 2);

    renderHeroProgress(root as unknown as HTMLElement, 1);
    renderHeroProgress(root as unknown as HTMLElement, 0);

    expect(video.playCount).toBe(0);
    expect(video.pauseCount).toBe(1);
    expect(video.currentTime).toBeCloseTo(0.34, 2);

    setHeroVideoPlaybackState(video as unknown as HTMLVideoElement, 'terminal');
    expect(video.pauseCount).toBe(2);
    expect(video.currentTime).toBeCloseTo(2.34, 2);

    setHeroVideoPlaybackState(video as unknown as HTMLVideoElement, 'inactive');
    expect(video.pauseCount).toBe(3);
  });

  it('defers the Hero source seek while cold preload is disabled, then restores the authored endpoint on metadata', () => {
    const video = new FakeVideo();
    video.preload = 'none';

    setHeroVideoPlaybackState(video as unknown as HTMLVideoElement, 'terminal');

    expect(video.currentTime).toBe(0);
    expect(video.playCount).toBe(0);
    video.listeners.get('loadedmetadata')?.(new Event('loadedmetadata'));
    expect(video.currentTime).toBeCloseTo(2.34, 2);
    expect(video.paused).toBe(true);
  });

  it('prepositions a hidden prev Hero at terminal but restores its authored start after reverse landing', () => {
    expect(heroVideoPlaybackStateForPresentation({
      hidden: true,
      role: 'prev',
      introMode: 'complete'
    })).toBe('terminal');
    expect(heroVideoPlaybackStateForPresentation({
      hidden: false,
      role: 'current',
      introMode: 'complete'
    })).toBe('start');
    expect(heroVideoPlaybackStateForPresentation({
      hidden: false,
      role: 'current',
      introMode: 'complete'
    })).toBe('start');
  });

  it('moves the middle and figure down through the dedicated Hero to Pattern handoff', () => {
    const root = new FakeElement();

    renderHeroPatternProgress(root as unknown as HTMLElement, 0);
    expect(root.style.values.get('--r4-hero-pattern-middle-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-hero-pattern-figure-progress')).toBe('0.0000');

    renderHeroPatternProgress(root as unknown as HTMLElement, 0.5);
    expect(root.style.values.get('--r4-hero-pattern-middle-progress')).toBe('0.5000');
    expect(root.style.values.get('--r4-hero-pattern-figure-progress')).toBe('0.5000');

    renderHeroPatternProgress(root as unknown as HTMLElement, 1);
    expect(root.style.values.get('--r4-hero-pattern-middle-progress')).toBe('1.0000');
    expect(root.style.values.get('--r4-hero-pattern-figure-progress')).toBe('1.0000');
  });

  it('keeps Hero media run ownership deterministic through forward, reverse, and forward replacement', () => {
    const root = new TimelineRoot();
    const video = new TimelineVideo();
    root.connect('[data-hero-figure-video]', video);

    renderHeroPatternProgress(root as unknown as HTMLElement, 0.25, {
      mediaRun: { runId: 'hero-pattern-media:1', direction: 1 }
    });
    expect(video.dataset.timelineVideoRun).toBe('hero-pattern-media:1');
    expect(video.dataset.timelineVideoDirection).toBe('1');

    renderHeroPatternProgress(root as unknown as HTMLElement, 0.75, {
      mediaRun: { runId: 'hero-pattern-media:2', direction: -1 }
    });
    expect(video.dataset.timelineVideoRun).toBe('hero-pattern-media:2');
    expect(video.dataset.timelineVideoDirection).toBe('-1');

    renderHeroPatternProgress(root as unknown as HTMLElement, 0.5, {
      mediaRun: { runId: 'hero-pattern-media:3', direction: 1 }
    });
    expect(video.dataset.timelineVideoRun).toBe('hero-pattern-media:3');
    expect(video.dataset.timelineVideoDirection).toBe('1');
    expect(video.currentTimeWrites).toBeGreaterThan(0);
  });

  it('holds the figure at its authored start behind Loader and throughout Hero intro', () => {
    const video = new FakeVideo();

    setHeroVideoPlaybackState(video as unknown as HTMLVideoElement, 'start');
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo(0.34, 2);
    expect(video.playCount).toBe(0);

    video.currentTime = 1.8;
    setHeroVideoPlaybackState(video as unknown as HTMLVideoElement, 'start');
    expect(video.currentTime).toBeCloseTo(0.34, 2);
    expect(video.paused).toBe(true);
    expect(video.playCount).toBe(0);

    setHeroVideoPlaybackState(video as unknown as HTMLVideoElement, 'terminal');
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo(2.34, 2);
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
    expect(markup).toContain('preload="none"');
    expect(markup).toContain('figure1.webm');
    expect(markup).toContain('figure-poster.jpg');
    expect(markup).not.toContain('hero-figure-scrub');
  });

  it('keeps copy inside the artwork stacking context below the center figure', () => {
    const markup = renderToStaticMarkup(createElement(heroScene.Component, {
      scene: 'hero',
      hidden: false
    }));
    const artworkIndex = markup.indexOf('r4-hero-scene__stage');
    const artworkEndIndex = markup.indexOf('</div>', artworkIndex);
    const copyIndex = markup.indexOf('r4-hero-scene__content');
    const introInkIndex = markup.indexOf('data-hero-intro-ink-canvas');
    const figureIndex = markup.indexOf('r4-hero-scene__figure');
    const vignetteIndex = markup.indexOf('r4-hero-scene__vignette');

    expect(artworkIndex).toBeGreaterThanOrEqual(0);
    expect(introInkIndex).toBeGreaterThan(artworkIndex);
    expect(copyIndex).toBeGreaterThan(artworkIndex);
    expect(copyIndex).toBeLessThan(artworkEndIndex);
    expect(figureIndex).toBeGreaterThan(copyIndex);
    expect(vignetteIndex).toBeGreaterThan(figureIndex);
    expect(heroScene.requiredHandles).toContain('intro-ink');
  });
});
