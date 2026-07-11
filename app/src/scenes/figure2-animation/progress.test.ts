import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { figure2AnimationScene, renderFigure2AnimationProgress, renderFigure2Hold, renderFigure2ProofTransitionProgress } from './index';

class FakeStyle {
  values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map<string, string>();
  clientHeight = 900;
  clientWidth = 1440;

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeVideo {
  private time = 0;
  readonly seekWrites: number[] = [];
  duration = 2.417;
  loop = false;
  muted = false;
  paused = true;
  playbackRate = 1;
  playCalls = 0;
  playsInline = false;

  get currentTime(): number {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    this.seekWrites.push(value);
  }

  addEventListener(): void {}

  pause(): void {
    this.paused = true;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }

  setNaturalTime(value: number): void {
    this.time = value;
  }
}

class FakeVideoRoot extends FakeElement {
  constructor(private readonly videos: readonly FakeVideo[]) {
    super();
  }

  querySelectorAll(): readonly FakeVideo[] {
    return this.videos;
  }
}

class FakeStageRoot extends FakeVideoRoot {
  readonly retainedArch = new FakeElement();

  closest(): { querySelector: () => FakeElement } {
    return { querySelector: () => this.retainedArch };
  }
}

describe('figure2-animation scene renderer', () => {
  it('separates depth-ranked architecture from the binary figure group', () => {
    const markup = renderToStaticMarkup(createElement(figure2AnimationScene.Component, {
      scene: 'figure2-animation',
      hidden: false
    }));

    expect(markup.match(/data-figure2-depth-ranked-field=/g)).toHaveLength(1);
    expect(markup.match(/data-figure2-figure-depth-surface=/g)).toHaveLength(1);
    expect(markup.match(/data-figure2-figure-field=/g)).toHaveLength(1);
    expect(markup).not.toContain('r4-figure2__near-arch');
  });

  it('publishes the same terminal cover and camera transform used by the middle architecture', () => {
    const root = new FakeElement();
    const state = renderFigure2AnimationProgress(root as unknown as HTMLElement, 1);

    expect(state.depthTransform).toEqual({
      viewport: { width: 1440, height: 900 },
      cover: { x: -80, y: 0, width: 1600, height: 900 },
      camera: {
        scale: 1.142,
        translateX: 0,
        translateY: -34,
        originX: 0.5,
        originY: 0.56
      }
    });
  });

  it('is idempotent for 0 to 1 to 0 to 1 progress renders', () => {
    const root = new FakeElement();

    const start = renderFigure2AnimationProgress(root as unknown as HTMLElement, 0);
    const end = renderFigure2AnimationProgress(root as unknown as HTMLElement, 1);
    const restored = renderFigure2AnimationProgress(root as unknown as HTMLElement, 0);
    const replayed = renderFigure2AnimationProgress(root as unknown as HTMLElement, 1);

    expect(restored).toEqual(start);
    expect(replayed).toEqual(end);
    expect(Number(root.style.values.get('--r4-figure2-cloud-scale'))).toBeGreaterThan(1);
    expect(Number(root.style.values.get('--r4-figure2-far-arcade-scale'))).toBeGreaterThan(Number(root.style.values.get('--r4-figure2-cloud-scale')));
    expect(root.style.values.has('--r4-figure2-near-arch-blur')).toBe(false);
    expect(root.style.values.get('--r4-figure2-figure-scale')).toBe('1.0350');
    expect(root.style.values.get('--r4-figure2-progress')).toBe('1.0000');
    expect(root.style.values.get('--r4-figure2-proof-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-figure2-background-opacity')).toBe('1.0000');
    expect(root.style.values.get('--r4-figure2-figure-opacity')).toBe('1.0000');
    expect(root.attributes.get('data-figure2-progress')).toBe('1.0000');
  });

  it('writes foreground scale and blur to the one Stage-retained arch', () => {
    const root = new FakeStageRoot([]);

    renderFigure2AnimationProgress(root as unknown as HTMLElement, 1);

    expect(root.retainedArch.style.values.get('--r4-figure2-near-arch-scale')).toBe('1.1350');
    expect(root.retainedArch.style.values.get('--r4-figure2-near-arch-blur')).toBe('3.60px');
    expect(root.style.values.has('--r4-figure2-near-arch-scale')).toBe(false);
    expect(root.style.values.has('--r4-figure2-near-arch-blur')).toBe(false);
  });

  it('keeps Scene opacity binary while the transition owns depth visibility', () => {
    const root = new FakeStageRoot([]);

    const state = renderFigure2ProofTransitionProgress(root as unknown as HTMLElement, 0.72);

    expect(state.progress).toBe(1);
    expect(state.proofProgress).toBeGreaterThan(0.7);
    expect(state.backgroundOpacity).toBe(1);
    expect(state.figureOpacity).toBe(1);
    expect(root.style.values.get('--r4-figure2-background-opacity')).toBe('1.0000');
    expect(root.style.values.get('--r4-figure2-figure-opacity')).toBe('1.0000');
    expect(root.retainedArch.style.values.get('--r4-figure2-near-arch-blur')).toBe('3.60px');
    expect(root.attributes.get('data-figure2-proof-progress')).not.toBe('0.0000');
  });

  it('declares target and media readiness without public copy fallback', () => {
    expect(figure2AnimationScene.staticFallback).toBeUndefined();
    expect(figure2AnimationScene.preload()).toEqual({ milestones: ['targetReady', 'mediaReady'] });
  });

  it('restores the exact opening hold including media time and scene-owned variables', () => {
    const video = new FakeVideo();
    const root = new FakeStageRoot([video]);
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 1, { videoMode: 'seek' });

    renderFigure2Hold(root as unknown as HTMLElement);

    expect(root.attributes.get('data-figure2-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-figure2-background-opacity')).toBe('1.0000');
    expect(root.style.values.get('--r4-figure2-figure-opacity')).toBe('1.0000');
    expect(root.style.values.get('--r4-figure2-camera-scale')).toBe('1.0120');
    expect(root.retainedArch.style.values.get('--r4-figure2-near-arch-blur')).toBe('0.00px');
    expect(video.currentTime).toBe(0.001);
  });

  it('slows short Figure2 media to the 2.6 second intro instead of finishing early', () => {
    const video = new FakeVideo();
    const root = new FakeVideoRoot([video]);

    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.2, { videoMode: 'native' });

    expect(video.playbackRate).toBeGreaterThan(0.8);
    expect(video.playbackRate).toBeLessThan(1);
  });

  it('does not seek a natively playing Figure2 video between its endpoints', () => {
    const video = new FakeVideo();
    const root = new FakeVideoRoot([video]);
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0, { videoMode: 'native' });
    video.seekWrites.length = 0;
    video.setNaturalTime(0.3);

    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.2, { videoMode: 'native' });

    expect(video.seekWrites).toEqual([]);
  });

  it('uses timeline frames after one rejected native play without retrying autoplay', async () => {
    class RejectingVideo extends FakeVideo {
      override play(): Promise<void> {
        this.playCalls += 1;
        this.paused = true;
        return Promise.reject(new Error('autoplay denied'));
      }
    }
    const video = new RejectingVideo();
    const root = new FakeVideoRoot([video]);

    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.2, { videoMode: 'native' });
    await Promise.resolve();
    const firstFallbackTime = video.currentTime;
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.4, { videoMode: 'native' });
    const secondFallbackTime = video.currentTime;
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.6, { videoMode: 'native' });

    expect(video.playCalls).toBe(1);
    expect(secondFallbackTime).toBeGreaterThan(firstFallbackTime);
    expect(video.currentTime).toBeGreaterThan(secondFallbackTime);
  });

  it('seeks reverse Figure2 samples continuously through intermediate frames', () => {
    const video = new FakeVideo();
    const root = new FakeVideoRoot([video]);

    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.8, { videoMode: 'seek' });
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.5, { videoMode: 'seek' });
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.2, { videoMode: 'seek' });

    expect(video.seekWrites).toHaveLength(3);
    expect(video.seekWrites[0]).toBeGreaterThan(video.seekWrites[1] ?? 0);
    expect(video.seekWrites[1]).toBeGreaterThan(video.seekWrites[2] ?? 0);
    expect(video.seekWrites[2]).toBeGreaterThan(0);
  });
});
