import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  commitFigure2MediaLeg,
  disposeFigure2Media,
  figure2AnimationScene,
  figure2DirectionalMediaSnapshot,
  parkFigure2Media,
  prepareFigure2MediaLeg,
  renderFigure2AnimationProgress,
  renderFigure2Hold,
  renderFigure2ProofTransitionProgress
} from './index';

class FakeStyle {
  values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  clientHeight = 900;
  clientWidth = 1440;

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeClassList {
  private readonly values = new Set<string>();

  add(value: string): void { this.values.add(value); }
  remove(value: string): void { this.values.delete(value); }
  contains(value: string): boolean { return this.values.has(value); }
}

type Listener = () => void;

class FakeVideo {
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  private time = 0;
  readonly seekWrites: number[] = [];
  duration = 2.417;
  loop = false;
  muted = false;
  paused = true;
  playbackRate = 1;
  playCalls = 0;
  playsInline = false;
  preload = 'metadata';
  seeking = false;
  loadCalls = 0;
  private frameCallback: (() => void) | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();

  get currentTime(): number {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    this.seekWrites.push(value);
    this.seeking = true;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  requestVideoFrameCallback(callback: () => void): number {
    this.frameCallback = callback;
    return 1;
  }

  cancelVideoFrameCallback(): void {
    this.frameCallback = undefined;
  }

  load(): void {
    this.loadCalls += 1;
  }

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

  presentRequestedFrame(): void {
    this.seeking = false;
    for (const listener of this.listeners.get('seeked') ?? []) {
      listener();
    }
    const callback = this.frameCallback;
    this.frameCallback = undefined;
    callback?.();
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

function directionalVideos() {
  const leftForward = new FakeVideo();
  const rightForward = new FakeVideo();
  const leftReverse = new FakeVideo();
  const rightReverse = new FakeVideo();
  leftForward.dataset.figure2Side = 'left';
  leftForward.dataset.figure2Direction = 'forward';
  rightForward.dataset.figure2Side = 'right';
  rightForward.dataset.figure2Direction = 'forward';
  leftReverse.dataset.figure2Side = 'left';
  leftReverse.dataset.figure2Direction = 'reverse';
  rightReverse.dataset.figure2Side = 'right';
  rightReverse.dataset.figure2Direction = 'reverse';
  leftForward.classList.add('is-active');
  rightForward.classList.add('is-active');
  leftReverse.duration = 5;
  rightReverse.duration = 5;
  return { leftForward, rightForward, leftReverse, rightReverse };
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

  it('restores the exact opening hold without mutating media lifecycle from render code', () => {
    const video = new FakeVideo();
    const root = new FakeStageRoot([video]);
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 1, { videoMode: 'seek' });

    renderFigure2Hold(root as unknown as HTMLElement);

    expect(root.attributes.get('data-figure2-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-figure2-background-opacity')).toBe('1.0000');
    expect(root.style.values.get('--r4-figure2-figure-opacity')).toBe('1.0000');
    expect(root.style.values.get('--r4-figure2-camera-scale')).toBe('1.0120');
    expect(root.retainedArch.style.values.get('--r4-figure2-near-arch-blur')).toBe('0.00px');
    expect(video.seekWrites).toHaveLength(0);
  });

  it('restores both canonical forward posters after every media surface is parked', async () => {
    const videos = directionalVideos();
    const root = new FakeVideoRoot(Object.values(videos));
    const mediaRun = {
      runId: 'figure2-hold-restore:1',
      direction: -1 as const
    };
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, mediaRun);
    videos.leftReverse.presentRequestedFrame();
    videos.rightReverse.presentRequestedFrame();
    await preparation;
    commitFigure2MediaLeg(root as unknown as HTMLElement, mediaRun);
    parkFigure2Media(root as unknown as HTMLElement);
    expect(videos.leftForward.classList.contains('is-active')).toBe(false);
    expect(videos.rightForward.classList.contains('is-active')).toBe(false);

    renderFigure2Hold(root as unknown as HTMLElement);

    expect(videos.leftForward.classList.contains('is-active')).toBe(true);
    expect(videos.rightForward.classList.contains('is-active')).toBe(true);
    expect(videos.leftReverse.classList.contains('is-active')).toBe(false);
    expect(videos.rightReverse.classList.contains('is-active')).toBe(false);
    expect(videos.leftForward.currentTime).toBe(0);
    expect(videos.rightForward.currentTime).toBe(0);
  });

  it('keeps both forward surfaces visible until both reverse first frames are presented', async () => {
    const videos = directionalVideos();
    const root = new FakeVideoRoot(Object.values(videos));
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, {
      runId: 'figure2-pair:1',
      direction: -1,
      timelineDurationMs: 2600
    });

    expect(videos.leftForward.classList.contains('is-active')).toBe(true);
    expect(videos.rightForward.classList.contains('is-active')).toBe(true);
    expect(videos.leftReverse.classList.contains('is-active')).toBe(false);
    expect(videos.rightReverse.classList.contains('is-active')).toBe(false);

    videos.leftReverse.presentRequestedFrame();
    await Promise.resolve();
    expect(videos.leftForward.classList.contains('is-active')).toBe(true);
    expect(videos.rightForward.classList.contains('is-active')).toBe(true);
    expect(videos.leftReverse.classList.contains('is-active')).toBe(false);

    videos.rightReverse.presentRequestedFrame();
    await preparation;
    expect(videos.leftForward.classList.contains('is-active')).toBe(true);
    expect(videos.rightForward.classList.contains('is-active')).toBe(true);
    expect(videos.leftReverse.classList.contains('is-active')).toBe(false);
    expect(videos.rightReverse.classList.contains('is-active')).toBe(false);

    commitFigure2MediaLeg(root as unknown as HTMLElement, {
      runId: 'figure2-pair:1',
      direction: -1,
      timelineDurationMs: 2600
    });
    expect(videos.leftForward.classList.contains('is-active')).toBe(false);
    expect(videos.rightForward.classList.contains('is-active')).toBe(false);
    expect(videos.leftReverse.classList.contains('is-active')).toBe(true);
    expect(videos.rightReverse.classList.contains('is-active')).toBe(true);
    expect(videos.leftReverse.playCalls).toBe(1);
    expect(videos.rightReverse.playCalls).toBe(1);
    expect(figure2DirectionalMediaSnapshot(root as unknown as HTMLElement)).toMatchObject({
      activeDirection: 'reverse',
      activeRunId: 'figure2-pair:1'
    });
    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it('derives native playback rates from each decoded asset and the 2.6 second leg', async () => {
    const videos = directionalVideos();
    const root = new FakeVideoRoot(Object.values(videos));
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, {
      runId: 'figure2-rate:1',
      direction: 1,
      timelineDurationMs: 2600
    });
    videos.leftForward.presentRequestedFrame();
    videos.rightForward.presentRequestedFrame();
    await preparation;
    commitFigure2MediaLeg(root as unknown as HTMLElement, {
      runId: 'figure2-rate:1',
      direction: 1,
      timelineDurationMs: 2600
    });

    expect(videos.leftForward.playbackRate).toBeGreaterThan(0.8);
    expect(videos.leftForward.playbackRate).toBeLessThan(1);
    expect(videos.rightForward.playbackRate).toBe(videos.leftForward.playbackRate);
    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it('plays reverse assets natively without a per-frame reverse seek storm', async () => {
    const videos = directionalVideos();
    const root = new FakeVideoRoot(Object.values(videos));
    const mediaRun = {
      runId: 'figure2-reverse-native:1',
      direction: -1 as const
    };
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, mediaRun);
    videos.leftReverse.presentRequestedFrame();
    videos.rightReverse.presentRequestedFrame();
    await preparation;
    commitFigure2MediaLeg(root as unknown as HTMLElement, mediaRun);
    const initialLeftSeeks = videos.leftReverse.seekWrites.length;
    const initialRightSeeks = videos.rightReverse.seekWrites.length;
    videos.leftReverse.setNaturalTime(1.1);
    videos.rightReverse.setNaturalTime(1.1);

    for (const progress of [0.7, 0.5, 0.3]) {
      renderFigure2AnimationProgress(root as unknown as HTMLElement, progress, {
        videoMode: 'native',
        mediaRun
      });
    }

    expect(initialLeftSeeks).toBeLessThanOrEqual(1);
    expect(initialRightSeeks).toBeLessThanOrEqual(1);
    expect(videos.leftReverse.seekWrites).toHaveLength(initialLeftSeeks);
    expect(videos.rightReverse.seekWrites).toHaveLength(initialRightSeeks);
    expect(videos.leftReverse.playCalls).toBe(1);
    expect(videos.rightReverse.playCalls).toBe(1);
    expect(videos.leftReverse.playbackRate).toBeGreaterThan(1.8);
    expect(videos.leftReverse.playbackRate).toBeLessThan(2);
    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it('cannot activate a prepared surface after its run is aborted and disposed', async () => {
    const videos = directionalVideos();
    const root = new FakeVideoRoot(Object.values(videos));
    const abortController = new AbortController();
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, {
      runId: 'figure2-dispose-prepare:1',
      direction: -1,
      timelineDurationMs: 2600,
      signal: abortController.signal
    });
    videos.leftReverse.presentRequestedFrame();

    abortController.abort();
    disposeFigure2Media(root as unknown as HTMLElement);
    videos.rightReverse.presentRequestedFrame();

    await expect(preparation).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_ABORTED' });
    expect(videos.leftReverse.classList.contains('is-active')).toBe(false);
    expect(videos.rightReverse.classList.contains('is-active')).toBe(false);
    expect(figure2DirectionalMediaSnapshot(root as unknown as HTMLElement)).toBeNull();
  });
});
