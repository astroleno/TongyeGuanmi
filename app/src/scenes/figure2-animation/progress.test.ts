import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FIGURE2_INTRO_PLAYBACK_MS,
  commitFigure2MediaLeg,
  disposeFigure2Media,
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
  duration = 2.6;
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

  constructor(side: 'left' | 'right', direction: 1 | -1) {
    this.dataset = {
      figure2Side: side,
      figure2Direction: String(direction),
      ...(direction === -1 ? { figure2Inactive: 'true' } : {})
    };
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

class FakeRoot {
  readonly style = new FakeStyle();
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  clientWidth = 1440;
  clientHeight = 900;

  constructor(readonly videos: readonly FakeVideo[] = []) {}

  querySelectorAll(selector: string): readonly FakeVideo[] {
    return selector === '[data-figure2-video]' ? this.videos : [];
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function mediaRoot() {
  const left = new FakeVideo('left', 1);
  const right = new FakeVideo('right', 1);
  const reverseLeft = new FakeVideo('left', -1);
  const reverseRight = new FakeVideo('right', -1);
  return {
    root: new FakeRoot([left, right, reverseLeft, reverseRight]),
    left,
    right,
    reverseLeft,
    reverseRight
  };
}

describe('Figure2 canonical media', () => {
  it('renders one canonical pair per direction with no poster or bridge surface', () => {
    const markup = renderToStaticMarkup(createElement(figure2AnimationScene.Component, {
      scene: 'figure2-animation',
      hidden: false
    }));

    expect(markup.match(/data-figure2-video=/g)).toHaveLength(4);
    expect(markup).toContain('data-media-key="figure2-left-motion"');
    expect(markup).toContain('data-media-key="figure2-right-motion"');
    expect(markup).toContain('figure2-left-motion.webm');
    expect(markup).toContain('figure2-right-motion.webm');
    expect(markup).toContain('data-media-key="figure2-left-motion-reverse"');
    expect(markup).toContain('data-media-key="figure2-right-motion-reverse"');
    expect(markup).toContain('figure2-left-motion-reverse.webm');
    expect(markup).toContain('figure2-right-motion-reverse.webm');
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

  it('prepare-firsts both videos before native-preferred forward playback', async () => {
    const { root, left, right } = mediaRoot();
    const mediaRun = { runId: 'figure2-forward:1', direction: 1 as const, timelineDurationMs: FIGURE2_INTRO_PLAYBACK_MS };
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, mediaRun);

    left.presentRequestedFrame();
    right.presentRequestedFrame();
    await preparation;
    expect(left.dataset.timelineVideoFrameReady).toBe('true');
    expect(right.dataset.timelineVideoFrameReady).toBe('true');

    commitFigure2MediaLeg(root as unknown as HTMLElement, mediaRun);
    await Promise.resolve();
    expect(left.playCalls).toBe(1);
    expect(right.playCalls).toBe(1);
    expect(figure2DirectionalMediaSnapshot(root as unknown as HTMLElement)).toMatchObject({
      activeDirection: 1,
      activeRunId: 'figure2-forward:1',
      left: { frameReady: true },
      right: { frameReady: true }
    });
    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it('plays the dedicated reverse pair natively without per-progress seeks', async () => {
    const { root, left, right, reverseLeft, reverseRight } = mediaRoot();
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.62);
    const reverse = { runId: 'figure2-reverse:2', direction: -1 as const, timelineDurationMs: FIGURE2_INTRO_PLAYBACK_MS };
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, reverse);

    reverseLeft.presentRequestedFrame();
    reverseRight.presentRequestedFrame();
    await preparation;
    const leftSeekWrites = reverseLeft.seekWrites.length;
    const rightSeekWrites = reverseRight.seekWrites.length;
    commitFigure2MediaLeg(root as unknown as HTMLElement, reverse);
    renderFigure2AnimationProgress(root as unknown as HTMLElement, 0.43, { videoMode: 'native', mediaRun: reverse });

    expect(reverseLeft.playCalls).toBe(1);
    expect(reverseRight.playCalls).toBe(1);
    expect(reverseLeft.seekWrites).toHaveLength(leftSeekWrites);
    expect(reverseRight.seekWrites).toHaveLength(rightSeekWrites);
    expect(reverseLeft.dataset.timelineVideoProgress).toBe('0.5700');
    expect(reverseRight.dataset.timelineVideoProgress).toBe('0.5700');
    expect(left.playCalls).toBe(0);
    expect(right.playCalls).toBe(0);
    expect(left.dataset.figure2Inactive).toBe('true');
    expect(right.dataset.figure2Inactive).toBe('true');
    expect(reverseLeft.dataset.figure2Inactive).toBeUndefined();
    expect(reverseRight.dataset.figure2Inactive).toBeUndefined();
    expect(reverseLeft.dataset.timelineVideoDirection).toBe('-1');
    expect(reverseRight.dataset.timelineVideoDirection).toBe('-1');
    expect(figure2DirectionalMediaSnapshot(root as unknown as HTMLElement)).toMatchObject({
      activeDirection: -1,
      activeRunId: 'figure2-reverse:2'
    });
    disposeFigure2Media(root as unknown as HTMLElement);
  });

  it('keeps the static scene composition visible when either canonical decode fails', async () => {
    const { root, left } = mediaRoot();
    const preparation = prepareFigure2MediaLeg(root as unknown as HTMLElement, {
      runId: 'figure2-decode-failure:1',
      direction: 1
    });

    left.dispatch('error');
    await expect(preparation).rejects.toThrow(/media error/);
    expect(root.dataset.figure2StaticMediaFallback).toBe('true');
    disposeFigure2Media(root as unknown as HTMLElement);
  });
});
