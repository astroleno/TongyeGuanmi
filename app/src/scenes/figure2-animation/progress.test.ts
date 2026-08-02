import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FIGURE2_INTRO_PLAYBACK_MS,
  commitFigure2MediaLeg,
  disposeFigure2Media,
  ensureFigure2HoldFrame,
  figure2AnimationScene,
  figure2DepthTransformForProgress,
  figure2DirectionalMediaSnapshot,
  prepareFigure2MediaLeg,
  renderFigure2AnimationProgress,
  renderFigure2Hold
} from './index';

type Listener = () => void;

class FakeStyle {
  readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeVideo {
  readonly dataset: Record<string, string>;
  readonly seekWrites: number[] = [];
  duration = 5.2;
  loop = false;
  muted = false;
  paused = true;
  playbackRate = 1;
  playsInline = false;
  preload = 'metadata';
  seeking = false;
  playCalls = 0;
  private time = 0;
  private frameCallback: ((now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void) | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor() {
    this.dataset = {};
  }

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

  pause(): void {
    this.paused = true;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }

  requestVideoFrameCallback(
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
  ): number {
    this.frameCallback = callback;
    return 1;
  }

  cancelVideoFrameCallback(): void {
    this.frameCallback = undefined;
  }

  presentRequestedFrame(): void {
    while (this.seeking) {
      this.seeking = false;
      this.dispatch('seeked');
    }
    const callback = this.frameCallback;
    this.frameCallback = undefined;
    callback?.(0, { mediaTime: this.currentTime } as VideoFrameCallbackMetadata);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}

class FakeImage {
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  decodeCalls = 0;

  decode(): Promise<void> {
    this.decodeCalls += 1;
    return Promise.resolve();
  }
}

class FakeStage {
  constructor(private readonly retainedArch: FakeImage | null = null) {}

  querySelector(selector: string): FakeImage | null {
    return selector === '[data-stage-retained-figure2-arch="true"]' ? this.retainedArch : null;
  }
}

class FakeRoot {
  readonly style = new FakeStyle();
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  clientWidth = 1440;
  clientHeight = 900;

  constructor(
    readonly videos: readonly FakeVideo[] = [],
    readonly images: readonly FakeImage[] = [],
    private readonly stage: FakeStage | null = null
  ) {}

  querySelector(selector: string): FakeVideo | null {
    return selector === '[data-figure2-combined-video]' ? this.videos[0] ?? null : null;
  }

  querySelectorAll(selector: string): readonly (FakeVideo | FakeImage)[] {
    if (selector === '[data-figure2-video]') {
      return this.videos;
    }
    return selector === 'img' ? this.images : [];
  }

  closest(selector: string): FakeStage | null {
    return selector === '[data-testid="r2-stage"]' ? this.stage : null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function mediaRoot(images: readonly FakeImage[] = [], retainedArch: FakeImage | null = null) {
  const video = new FakeVideo();
  return {
    root: new FakeRoot([video], images, new FakeStage(retainedArch)),
    video
  };
}

describe('Figure2 canonical media', () => {
  it('renders one bidirectional canonical surface with no poster or bridge surface', () => {
    const markup = renderToStaticMarkup(createElement(figure2AnimationScene.Component, {
      scene: 'figure2-animation',
      hidden: false
    }));

    expect(markup.match(/data-figure2-video=/g)).toHaveLength(1);
    expect(markup).toContain('data-figure2-combined-video="true"');
    expect(markup).toContain('data-media-key="figure2-pair-motion"');
    expect(markup).toContain('figure2-pair-motion.webm');
    expect(markup).toContain('figure2-pair-motion-hevc-alpha.mp4');
    expect(markup).not.toContain('poster');
    expect(markup).not.toContain('bridge');
  });

  it('preserves the depth layout and binary hold rendering', () => {
    const root = new FakeRoot();
    const start = renderFigure2AnimationProgress(root as unknown as HTMLElement, 0);
    const end = renderFigure2AnimationProgress(root as unknown as HTMLElement, 1);

    expect(figure2DepthTransformForProgress(root as unknown as HTMLElement, 1)).toEqual({
      viewport: { width: 1440, height: 900 },
      cover: { x: -80, y: 0, width: 1600, height: 900 },
      camera: { scale: 1.142, translateX: 0, translateY: -34, originX: 0.5, originY: 0.56 }
    });
    expect(start.progress).toBe(0);
    expect(end.progress).toBe(1);
    renderFigure2Hold(root as unknown as HTMLElement);
    expect(root.attributes.get('data-figure2-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-figure2-video-opacity')).toBe('1');
  });

  it('does not apply the z-depth transform to a fixed foreground arch', () => {
    const fixedArch = new FakeImage();
    fixedArch.dataset.figure2ArchMotion = 'fixed';
    const fixedRoot = new FakeRoot([], [], new FakeStage(fixedArch));
    renderFigure2AnimationProgress(fixedRoot as unknown as HTMLElement, 1);
    expect(fixedArch.style.values.has('--r4-figure2-near-arch-scale')).toBe(false);
    expect(fixedArch.style.values.has('--r4-figure2-near-arch-blur')).toBe(false);

    const depthArch = new FakeImage();
    const depthRoot = new FakeRoot([], [], new FakeStage(depthArch));
    renderFigure2AnimationProgress(depthRoot as unknown as HTMLElement, 1);
    expect(depthArch.style.values.get('--r4-figure2-near-arch-scale')).toBe('1.1350');
    expect(depthArch.style.values.get('--r4-figure2-near-arch-blur')).toBe('3.60px');
  });

  it('maps document scrub progress into the authored forward and reverse halves', () => {
    const { root, video } = mediaRoot();
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.5, {
      videoMode: 'seek',
      mediaRun: { runId: 'phone-forward:1', direction: 1 }
    });
    expect(video.dataset.timelineVideoTarget).toBe('1.3000');
    expect(video.dataset.timelineVideoDirection).toBe('1');

    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.5, {
      videoMode: 'seek',
      mediaRun: { runId: 'phone-reverse:1', direction: -1 }
    });
    expect(video.dataset.timelineVideoTarget).toBe('3.8900');
    expect(video.dataset.timelineVideoDirection).toBe('-1');
    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it('requires a presented combined opening frame before target readiness', () => {
    expect(figure2AnimationScene.requiredHandles).toEqual([
      'stage',
      'figures',
      'combined-video',
      'opening-frame'
    ]);
    expect(figure2AnimationScene.preload()).toEqual({ milestones: ['targetReady'] });
  });

  it('shares a hold-frame preparation and registers only after presentation', async () => {
    const { root, video } = mediaRoot();
    const registerHandle = vi.fn();
    const first = ensureFigure2HoldFrame(root as unknown as HTMLElement);
    const second = ensureFigure2HoldFrame(root as unknown as HTMLElement);
    const registerOpeningFrame = first.then(() => {
      registerHandle('opening-frame', video);
    });

    expect(first).toBe(second);
    expect(root.dataset.figure2HoldFrameReady).toBeUndefined();
    expect(registerHandle).not.toHaveBeenCalled();

    video.presentRequestedFrame();
    await first;
    await registerOpeningFrame;

    expect(root.dataset.figure2HoldFrameReady).toBe('true');
    expect(registerHandle).toHaveBeenCalledWith('opening-frame', video);
    expect(video.playCalls).toBe(0);

    disposeFigure2Media(root as unknown as HTMLElement);
    expect(root.dataset.figure2HoldFrameReady).toBeUndefined();
  });

  it('decodes static Figure2 opening imagery before marking the hold frame ready', async () => {
    const images = [new FakeImage(), new FakeImage(), new FakeImage()];
    const retainedArch = new FakeImage();
    const { root, video } = mediaRoot(images, retainedArch);
    const preparation = ensureFigure2HoldFrame(root as unknown as HTMLElement);

    expect(images.map((image) => image.decodeCalls)).toEqual([1, 1, 1]);
    expect(retainedArch.decodeCalls).toBe(1);
    expect(root.dataset.figure2HoldFrameReady).toBeUndefined();

    video.presentRequestedFrame();
    await preparation;

    expect(root.dataset.figure2HoldFrameReady).toBe('true');
    expect(video.playCalls).toBe(0);
    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it('does not register a failed opening frame and creates a fresh preparation for retry', async () => {
    const { root, video } = mediaRoot();
    const registerHandle = vi.fn();
    const first = ensureFigure2HoldFrame(root as unknown as HTMLElement);
    const registerOpeningFrame = first.then(() => {
      registerHandle('opening-frame', video);
    });

    video.dispatch('error');
    await expect(first).rejects.toThrow(/media error/);
    await expect(registerOpeningFrame).rejects.toThrow(/media error/);
    expect(registerHandle).not.toHaveBeenCalled();
    expect(root.dataset.figure2HoldFrameReady).toBeUndefined();

    const retry = ensureFigure2HoldFrame(root as unknown as HTMLElement);
    expect(retry).not.toBe(first);
    video.presentRequestedFrame();
    await retry;
    expect(root.dataset.figure2HoldFrameReady).toBe('true');

    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it('prepare-firsts the combined video before native-preferred forward playback', async () => {
    const { root, video } = mediaRoot();
    const mediaRun = { runId: 'figure2-forward:1', direction: 1 as const, timelineDurationMs: FIGURE2_INTRO_PLAYBACK_MS };
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, mediaRun);

    video.presentRequestedFrame();
    await preparation;
    expect(video.dataset.timelineVideoFrameReady).toBe('true');

    commitFigure2MediaLeg(root as unknown as HTMLElement, mediaRun);
    await Promise.resolve();
    expect(video.playCalls).toBe(1);
    expect(figure2DirectionalMediaSnapshot(root as unknown as HTMLElement)).toMatchObject({
      activeDirection: 1,
      activeRunId: 'figure2-forward:1',
      media: { frameReady: true }
    });
    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it.each([1, -1] as const)(
    'nudges a stalled %s compositor but still waits for the requested Figure2 frame',
    async (direction) => {
      vi.useFakeTimers();
      const { root, video } = mediaRoot();

      try {
        const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, {
          runId: `figure2-stalled:${direction}`,
          direction,
          timelineDurationMs: FIGURE2_INTRO_PLAYBACK_MS
        });
        let settled = false;
        void preparation.then(() => { settled = true; });

        await vi.advanceTimersByTimeAsync(249);
        expect(video.playCalls).toBe(0);
        await vi.advanceTimersByTimeAsync(1);
        expect(video.playCalls).toBe(1);
        expect(settled).toBe(false);

        video.presentRequestedFrame();
        await preparation;
        expect(video.dataset.timelineVideoFrameEvidence).toBe('video-frame-callback');
        expect(video.paused).toBe(true);
      } finally {
        disposeFigure2Media(root as unknown as HTMLElement);
        vi.useRealTimers();
      }
    }
  );

  it('plays the second half natively for reverse without per-progress seeks', async () => {
    const { root, video } = mediaRoot();
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.62);
    const reverse = { runId: 'figure2-reverse:2', direction: -1 as const, timelineDurationMs: FIGURE2_INTRO_PLAYBACK_MS };
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, reverse);

    video.presentRequestedFrame();
    await preparation;
    const seekWrites = video.seekWrites.length;
    commitFigure2MediaLeg(root as unknown as HTMLElement, reverse);
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.43, { videoMode: 'native', mediaRun: reverse });

    expect(video.playCalls).toBe(1);
    expect(video.seekWrites).toHaveLength(seekWrites);
    expect(video.dataset.timelineVideoProgress).toBe('0.5700');
    expect(video.dataset.timelineVideoDirection).toBe('-1');
    expect(figure2DirectionalMediaSnapshot(root as unknown as HTMLElement)).toMatchObject({
      activeDirection: -1,
      activeRunId: 'figure2-reverse:2'
    });
    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it('keeps the static scene composition visible when either canonical decode fails', async () => {
    const { root, video } = mediaRoot();
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, {
      runId: 'figure2-decode-failure:1',
      direction: 1
    });

    video.dispatch('error');
    await expect(preparation).rejects.toThrow(/media error/);
    expect(root.dataset.figure2StaticMediaFallback).toBe('true');
    disposeFigure2Media(root as unknown as HTMLElement);
  });
});
