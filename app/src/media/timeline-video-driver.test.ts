import { describe, expect, it, vi } from 'vitest';

import {
  createTimelineVideoDriver,
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame,
  timelineVideoDriverFor
} from './timeline-video-driver';

type Listener = () => void;

class FakeVideo {
  readonly dataset: Record<string, string> = {};
  duration = 10;
  readyState = 4;
  currentTimeWrites: number[] = [];
  paused = true;
  seeking = false;
  loop = false;
  muted = false;
  playsInline = false;
  playbackRate = 1;
  playCalls = 0;
  rejectNextPlay = false;
  throwOnCurrentTimeWrite = false;
  presentFrameOnCurrentTimeWrite = false;
  remainSettledOnCurrentTimeWrite = false;
  private time = 0;
  private frameCallback: ((now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void) | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();

  get currentTime(): number {
    return this.time;
  }

  set currentTime(value: number) {
    if (this.throwOnCurrentTimeWrite) {
      throw new Error('seek rejected');
    }
    this.time = value;
    this.currentTimeWrites.push(value);
    this.seeking = !this.remainSettledOnCurrentTimeWrite;
    if (this.presentFrameOnCurrentTimeWrite) this.presentFrame();
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
    if (this.rejectNextPlay) {
      this.rejectNextPlay = false;
      this.paused = true;
      return Promise.reject(new Error('autoplay denied'));
    }
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

  completeSeek(): void {
    this.seeking = false;
    for (const listener of this.listeners.get('seeked') ?? []) {
      listener();
    }
  }

  completeSeekBeforeClearingSeeking(): void {
    for (const listener of this.listeners.get('seeked') ?? []) {
      listener();
    }
    this.seeking = false;
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  presentFrame(mediaTime = this.time): void {
    const callback = this.frameCallback;
    this.frameCallback = undefined;
    callback?.(0, { mediaTime } as VideoFrameCallbackMetadata);
  }

  advancePlaybackTo(value: number): void {
    this.time = value;
  }
}

const videoElement = (video: FakeVideo) => video as unknown as HTMLVideoElement;

describe('timeline video driver', () => {
  it('forces an exact-target seek before waiting for a paused endpoint frame', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const readiness = driver.prepareFrame({
      runId: 'media-endpoint-frame:1',
      direction: 1,
      progress: 0,
      durationFallbackSeconds: 10
    });

    expect(video.currentTimeWrites).toHaveLength(1);
    expect(video.currentTimeWrites[0]).toBeGreaterThanOrEqual(0.05);
    video.completeSeek();
    expect(video.currentTimeWrites.length).toBeGreaterThanOrEqual(2);
    expect(video.currentTimeWrites.at(-1)).toBe(0);
    let settled = false;
    void readiness.then(() => {
      settled = true;
    });
    video.presentFrame();
    await Promise.resolve();
    expect(settled).toBe(true);

    await expect(readiness).resolves.toMatchObject({ status: 'ready' });
  });

  it('defers endpoint priming until an older in-flight seek has settled', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const input = {
      runId: 'media-deferred-endpoint:1',
      direction: 1 as const,
      durationFallbackSeconds: 10
    };

    driver.drive({ ...input, progress: 0.98 });
    const readiness = driver.prepareFrame({ ...input, progress: 1 });
    video.completeSeek();

    expect(video.currentTimeWrites.at(-1)).toBeCloseTo(9.93, 2);
    video.completeSeek();
    expect(video.currentTimeWrites.at(-1)).toBeCloseTo(9.98, 2);
    video.presentFrame();
    video.completeSeek();

    await expect(readiness).resolves.toMatchObject({ status: 'ready' });
    driver.dispose();
  });

  it('consumes a pending endpoint prime before a synchronously settled seek can re-enter it', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    video.remainSettledOnCurrentTimeWrite = true;
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-synchronous-endpoint:1',
        direction: -1,
        progress: 1,
        durationFallbackSeconds: 2.042,
        endSeconds: 0.9
      });

      expect(video.currentTimeWrites).toHaveLength(1);
      expect(video.currentTimeWrites[0]).toBeCloseTo(0.95);
      await vi.advanceTimersByTimeAsync(50);
      expect(video.currentTimeWrites).toHaveLength(2);
      expect(video.currentTimeWrites[1]).toBe(0.9);
      video.presentFrame();
      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('uses the declared media duration to prime the start endpoint before metadata is ready', () => {
    const video = new FakeVideo();
    video.duration = Number.NaN;
    video.readyState = 0;
    const driver = createTimelineVideoDriver(videoElement(video));

    void driver.prepareFrame({
      runId: 'media-cold-start-frame:1',
      direction: 1,
      progress: 0,
      durationFallbackSeconds: 2.042
    });

    expect(video.currentTimeWrites).toHaveLength(1);
    expect(video.currentTimeWrites[0]).toBeGreaterThanOrEqual(0.05);
    driver.dispose();
  });

  it('does not claim frame readiness when the frame callback has not fired', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    let settled = false;

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-frame-strict:1',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10
      });
      void readiness.finally(() => {
        settled = true;
      });
      video.completeSeek();

      await vi.advanceTimersByTimeAsync(80);

      expect(settled).toBe(false);
      expect(driver.snapshot().frameReady).toBe(false);

      video.presentFrame();
      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('nudges a stalled strict frame without treating playback as frame evidence', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    let settled = false;

    try {
      const readiness = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'media-compositor-nudge:1',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10
      });
      void readiness.then(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(249);
      expect(video.playCalls).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(video.playCalls).toBe(1);
      expect(video.paused).toBe(false);
      expect(settled).toBe(false);

      video.completeSeek();
      video.presentFrame();
      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
      expect(video.dataset.timelineVideoFrameEvidence).toBe('video-frame-callback');
      expect(video.paused).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-seeks the requested frame when a compositor nudge presents a drifted frame', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    let settled = false;

    try {
      const readiness = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'media-compositor-drift:1',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10
      });
      void readiness.then(() => { settled = true; });
      video.completeSeek();

      await vi.advanceTimersByTimeAsync(250);
      expect(video.playCalls).toBe(1);
      const seekWritesBeforeDriftRecovery = video.currentTimeWrites.length;
      video.advancePlaybackTo(10);
      video.presentFrame(10);

      expect(video.currentTimeWrites).toHaveLength(seekWritesBeforeDriftRecovery + 1);
      expect(video.currentTimeWrites.at(-1)).toBeCloseTo(4.99);
      expect(video.paused).toBe(false);
      expect(settled).toBe(false);

      video.completeSeek();
      video.presentFrame(4.99);
      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
      expect(video.paused).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the compositor nudge when preparation aborts before playback', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const controller = new AbortController();

    try {
      const readiness = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'media-compositor-abort:1',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10,
        signal: controller.signal
      });
      controller.abort();

      await expect(readiness).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_ABORTED' });
      await vi.advanceTimersByTimeAsync(250);
      expect(video.playCalls).toBe(0);
      expect(video.paused).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a disposed preparation pause successor playback', async () => {
    const video = new FakeVideo();
    const readiness = prepareTimelineVideoFrame(videoElement(video), {
      runId: 'media-disposed-owner:1',
      direction: 1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });

    disposeTimelineVideoDriver(videoElement(video));
    await video.play();
    expect(video.paused).toBe(false);

    await expect(readiness).resolves.toMatchObject({ status: 'stale' });
    expect(video.paused).toBe(false);
  });

  it('registers the frame callback before a target seek can present', async () => {
    const video = new FakeVideo();
    video.presentFrameOnCurrentTimeWrite = true;
    const driver = createTimelineVideoDriver(videoElement(video));
    let settled = false;

    const readiness = driver.prepareFrame({
      runId: 'media-seek-frame-race:1',
      direction: 1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });
    void readiness.then(() => { settled = true; });
    video.completeSeek();
    await Promise.resolve();

    expect(settled).toBe(true);
    await expect(readiness).resolves.toMatchObject({ status: 'ready' });
    driver.dispose();
  });

  it('accepts a matching causal frame even when Chromium has not cleared seeking yet', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    let settled = false;

    const readiness = driver.prepareFrame({
      runId: 'media-frame-before-seek-flag:1',
      direction: 1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });
    void readiness.then(() => { settled = true; });
    video.presentFrame(4.99);
    await Promise.resolve();

    expect(settled).toBe(true);
    await expect(readiness).resolves.toMatchObject({ status: 'ready' });
    driver.dispose();
  });

  it('retires a settled seek from an older generation when its event was missed', () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    driver.drive({
      runId: 'media-old-generation:1',
      direction: 1,
      progress: 0.4,
      durationFallbackSeconds: 10
    });
    expect(video.currentTimeWrites).toHaveLength(1);
    video.seeking = false;

    void driver.prepareFrame({
      runId: 'media-current-generation:2',
      direction: 1,
      progress: 0,
      durationFallbackSeconds: 10
    });

    expect(video.currentTimeWrites).toHaveLength(2);
    expect(video.currentTimeWrites.at(-1)).toBeGreaterThanOrEqual(0.05);
    driver.dispose();
  });

  it('accepts a completed WebKit seek when its opted-in frame callback stalls', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-webkit-frame-stall:1',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10,
        allowSeekedFrameFallback: true
      });
      video.completeSeek();

      await vi.advanceTimersByTimeAsync(119);
      expect(driver.snapshot().frameReady).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
      expect(driver.snapshot().frameReady).toBe(true);
      expect(video.dataset.timelineVideoFrameEvidence).toBe('seeked-fallback');
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('arms the WebKit fallback when seeked fires before the seeking flag clears', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-webkit-exact-endpoint:1',
        direction: 1,
        progress: 0,
        durationFallbackSeconds: 10,
        allowSeekedFrameFallback: true
      });
      video.completeSeek();
      video.completeSeekBeforeClearingSeeking();
      await vi.advanceTimersByTimeAsync(120);

      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
      expect(video.dataset.timelineVideoFrameEvidence).toBe('seeked-fallback');
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('retries the WebKit fallback while the completed seek remains unsettled', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-webkit-late-seek-settlement:1',
        direction: 1,
        progress: 0,
        durationFallbackSeconds: 10,
        allowSeekedFrameFallback: true
      });
      video.completeSeek();
      video.dispatch('seeked');
      await vi.advanceTimersByTimeAsync(120);
      expect(driver.snapshot().frameReady).toBe(false);

      video.seeking = false;
      await vi.advanceTimersByTimeAsync(120);

      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
      expect(video.dataset.timelineVideoFrameEvidence).toBe('seeked-fallback');
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('accepts the matching frame when WebKit clears seeking without another seeked event', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    const readiness = driver.prepareFrame({
      runId: 'media-webkit-frame-is-final-event:1',
      direction: 1,
      progress: 0,
      durationFallbackSeconds: 10,
      allowSeekedFrameFallback: true
    });
    video.completeSeek();
    video.seeking = false;
    video.presentFrame();

    await expect(readiness).resolves.toMatchObject({ status: 'ready' });
    expect(video.dataset.timelineVideoFrameEvidence).toBe('video-frame-callback');
    driver.dispose();
  });

  it('keeps the WebKit fallback pending until decoded current data is available', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    video.readyState = 1;
    const driver = createTimelineVideoDriver(videoElement(video));
    let settled = false;

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-webkit-without-frame-data:1',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10,
        allowSeekedFrameFallback: true
      });
      void readiness.then(() => {
        settled = true;
      });
      video.completeSeek();
      await vi.advanceTimersByTimeAsync(120);

      expect(settled).toBe(false);
      expect(driver.snapshot().frameReady).toBe(false);
      video.presentFrame();
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(driver.snapshot().frameReady).toBe(false);

      video.readyState = 4;
      video.presentFrame();
      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
      expect(video.dataset.timelineVideoFrameEvidence).toBe('video-frame-callback');
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('prefers WebKit frame-callback evidence when it arrives before the fallback', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-webkit-frame-callback:1',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10,
        allowSeekedFrameFallback: true
      });
      video.completeSeek();
      video.presentFrame();

      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
      await vi.advanceTimersByTimeAsync(120);
      expect(video.dataset.timelineVideoFrameEvidence).toBe('video-frame-callback');
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('uses the opted-in seeked fallback when WebKit exposes no frame-callback API', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-webkit-frame-api:1',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10,
        allowSeekedFrameFallback: true
      });
      video.completeSeek();
      await vi.advanceTimersByTimeAsync(120);

      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
      expect(video.dataset.timelineVideoFrameEvidence).toBe('seeked-fallback');
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('cancels an opted-in seeked fallback when its generation is replaced', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const stale = driver.prepareFrame({
        runId: 'media-webkit-stale:1',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10,
        allowSeekedFrameFallback: true
      });
      video.completeSeek();
      driver.drive({
        runId: 'media-webkit-stale:2',
        direction: -1,
        progress: 0.25,
        durationFallbackSeconds: 10
      });

      await expect(stale).resolves.toMatchObject({ status: 'stale' });
      await vi.advanceTimersByTimeAsync(120);
      expect(driver.snapshot().frameReady).toBe(false);
      expect(video.dataset.timelineVideoFrameEvidence).toBeUndefined();
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('does not transfer an exact proof across generations after narrow physical drift', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const first = driver.prepareFrame({
      runId: 'endpoint-reuse:1',
      direction: 1,
      progress: 1,
      durationFallbackSeconds: 10
    });
    video.completeSeek();
    video.presentFrame();
    await expect(first).resolves.toMatchObject({ status: 'ready' });
    video.currentTime = 9.928056;
    video.completeSeek();
    const seekWrites = video.currentTimeWrites.length;
    const nextInput = {
      runId: 'endpoint-reuse:2',
      direction: -1 as const,
      progress: 1,
      durationFallbackSeconds: 10
    };
    const second = driver.prepareFrame(nextInput);

    expect(video.currentTimeWrites).toHaveLength(seekWrites + 1);
    driver.dispose();
    await expect(second).resolves.toMatchObject({ status: 'stale' });
  });

  it('does not reuse an exact old-generation proof when the physical playhead is far away', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const first = driver.prepareFrame({
      runId: 'physical-proof:1',
      direction: 1,
      progress: 0,
      durationFallbackSeconds: 10
    });
    video.completeSeek();
    video.presentFrame();
    await expect(first).resolves.toMatchObject({ status: 'ready', targetTime: 0 });

    video.currentTime = 8;
    video.completeSeek();
    const seekWrites = video.currentTimeWrites.length;
    const second = driver.prepareFrame({
      runId: 'physical-proof:2',
      direction: -1,
      progress: 0,
      durationFallbackSeconds: 10
    });

    expect(video.currentTimeWrites).toHaveLength(seekWrites + 1);
    expect(video.currentTimeWrites.at(-1)).toBeGreaterThan(0);
    video.completeSeek();
    expect(video.currentTimeWrites.at(-1)).toBe(0);
    video.presentFrame();
    await expect(second).resolves.toMatchObject({ status: 'ready', targetTime: 0 });
    driver.dispose();
  });

  it('treats presented-frame and playhead tolerances as independent bounds', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const first = driver.prepareFrame({
      runId: 'presentation-window:1',
      direction: 1,
      progress: 0.496,
      durationFallbackSeconds: 10
    });
    video.completeSeek();
    video.presentFrame();
    await expect(first).resolves.toMatchObject({ status: 'ready' });

    video.currentTime = 5.01;
    video.completeSeek();
    const seekWrites = video.currentTimeWrites.length;
    const second = driver.prepareFrame({
      runId: 'presentation-window:1',
      direction: 1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });

    await expect(second).resolves.toMatchObject({ status: 'ready' });
    expect(video.currentTimeWrites).toHaveLength(seekWrites);
    driver.dispose();
  });

  it('does not reuse a nearby proof when the physical playhead is outside its presentation window', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const first = driver.prepareFrame({
      runId: 'nearby-presentation-window:1',
      direction: 1,
      progress: 0.496,
      durationFallbackSeconds: 10
    });
    video.completeSeek();
    video.presentFrame();
    await expect(first).resolves.toMatchObject({ status: 'ready' });

    video.currentTime = 5.051944;
    video.completeSeek();
    const seekWrites = video.currentTimeWrites.length;
    const second = driver.prepareFrame({
      runId: 'nearby-presentation-window:1',
      direction: 1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });

    expect(video.currentTimeWrites).toHaveLength(seekWrites + 1);
    driver.dispose();
    await expect(second).resolves.toMatchObject({ status: 'stale' });
  });

  it('rejects preparation when the media seek setter throws', async () => {
    const video = new FakeVideo();
    video.throwOnCurrentTimeWrite = true;
    const driver = createTimelineVideoDriver(videoElement(video));
    let rejection: unknown;

    const readiness = driver.prepareFrame({
      runId: 'media-seek-error:1',
      direction: 1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });
    void readiness.catch((error: unknown) => {
      rejection = error;
    });
    await Promise.resolve();

    expect(rejection).toMatchObject({ code: 'MEDIA_SEEK_FAILED' });
    expect(video.paused).toBe(true);
    expect(video.dataset.timelineVideoFrameReady).toBeUndefined();
    expect(video.dataset.timelineVideoStaticFallback).toBe('true');
    driver.dispose();
  });

  it('hides a previously ready frame after a seek failure and clears fallback after recovery', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const input = {
      runId: 'media-ready-then-seek-error:1',
      direction: -1 as const,
      durationFallbackSeconds: 10,
      mode: 'timeline' as const
    };
    const initial = driver.prepareFrame({ ...input, progress: 0.5 });
    video.completeSeek();
    video.presentFrame();
    await expect(initial).resolves.toMatchObject({ status: 'ready' });
    expect(video.dataset.timelineVideoFrameReady).toBe('true');

    video.throwOnCurrentTimeWrite = true;
    await expect(driver.prepareFrame({ ...input, progress: 0.6 })).rejects.toMatchObject({
      code: 'MEDIA_SEEK_FAILED'
    });
    expect(video.paused).toBe(true);
    expect(video.dataset.timelineVideoFrameReady).toBeUndefined();
    expect(video.dataset.timelineVideoStaticFallback).toBe('true');

    video.throwOnCurrentTimeWrite = false;
    const recovered = driver.prepareFrame({ ...input, progress: 0.7 });
    video.completeSeek();
    video.presentFrame();
    await expect(recovered).resolves.toMatchObject({ status: 'ready' });
    expect(video.dataset.timelineVideoFrameReady).toBe('true');
    expect(video.dataset.timelineVideoStaticFallback).toBeUndefined();
    driver.dispose();
  });

  it.each([
    ['error', 'MEDIA_ELEMENT_ERROR'],
    ['abort', 'MEDIA_PREPARATION_ABORTED']
  ] as const)('rejects preparation on a media %s event', async (event, code) => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    let rejection: unknown;

    const readiness = driver.prepareFrame({
      runId: `media-${event}:1`,
      direction: 1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });
    void readiness.catch((error: unknown) => {
      rejection = error;
    });
    video.dispatch(event);
    await Promise.resolve();

    expect(rejection).toMatchObject({ code });
    expect(video.dataset.timelineVideoStaticFallback).toBe('true');
    driver.dispose();
  });

  it('rejects only the aborted preparation waiter through its AbortSignal', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const abortController = new AbortController();
    let rejection: unknown;

    const readiness = driver.prepareFrame({
      runId: 'media-signal-abort:1',
      direction: 1,
      progress: 0.5,
      durationFallbackSeconds: 10,
      signal: abortController.signal
    });
    void readiness.catch((error: unknown) => {
      rejection = error;
    });
    abortController.abort();
    await Promise.resolve();

    expect(rejection).toMatchObject({ code: 'MEDIA_PREPARATION_ABORTED' });
    driver.dispose();
  });

  it('rejects strict preparation when requestVideoFrameCallback is unavailable', async () => {
    const video = new FakeVideo();
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    const driver = createTimelineVideoDriver(videoElement(video));
    let rejection: unknown;

    const readiness = driver.prepareFrame({
      runId: 'media-frame-api:1',
      direction: 1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });
    void readiness.catch((error: unknown) => {
      rejection = error;
    });
    video.completeSeek();
    await Promise.resolve();

    expect(rejection).toMatchObject({ code: 'MEDIA_FRAME_CALLBACK_UNAVAILABLE' });
    driver.dispose();
  });

  it('starts native only after its initial frame and preserves its presented terminal', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const input = {
      runId: 'media-presented-native:1',
      direction: 1 as const,
      durationFallbackSeconds: 10,
      timelineDurationMs: 2_000,
      mode: 'native-preferred' as const
    };

    driver.drive({ ...input, progress: 0.2 });

    expect(video.playCalls).toBe(0);
    video.completeSeek();
    expect(video.playCalls).toBe(0);
    video.presentFrame();
    await Promise.resolve();
    expect(video.playCalls).toBe(1);

    video.currentTime = 9.98;
    video.completeSeek();
    driver.drive({ ...input, progress: 1 });
    await expect(driver.prepareFrame({
      ...input,
      runId: 'media-presented-native:2',
      direction: -1,
      progress: 1
    })).resolves.toMatchObject({ status: 'ready', direction: -1 });
  });

  it('uses the transition direction and coalesces unresolved seeks to the latest progress', () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const input = {
      runId: 'media-test:1',
      direction: 1 as const,
      durationFallbackSeconds: 10,
      mode: 'timeline' as const
    };

    driver.drive({ ...input, progress: 0 });
    video.completeSeek();
    video.presentFrame();
    video.dataset.timelineVideoDirection = '-1';

    driver.drive({ ...input, progress: 0.6 });
    driver.drive({ ...input, progress: 0.4 });

    expect(video.currentTimeWrites.at(-1)).toBeCloseTo(5.988, 3);
    expect(driver.snapshot()).toMatchObject({
      runId: 'media-test:1',
      direction: 1,
      desiredProgress: 0.4,
      seekPending: true
    });

    video.completeSeek();
    expect(video.currentTimeWrites.at(-1)).toBeCloseTo(3.992, 3);
    expect(video.currentTimeWrites).toHaveLength(2);
  });

  it('ignores stale reverse callbacks during rapid forward/reverse/forward replacement', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const base = { durationFallbackSeconds: 10, mode: 'timeline' as const };

    const stale = driver.prepareFrame({ ...base, runId: 'media-test:1', direction: 1, progress: 0.2 });
    driver.drive({ ...base, runId: 'media-test:2', direction: -1, progress: 0.8 });
    const final = driver.prepareFrame({ ...base, runId: 'media-test:3', direction: 1, progress: 0.6 });

    await expect(stale).resolves.toMatchObject({ status: 'stale' });
    expect(video.currentTimeWrites).toHaveLength(1);

    video.completeSeek();
    expect(video.currentTimeWrites).toHaveLength(2);
    expect(video.currentTimeWrites.at(-1)).toBeCloseTo(5.988, 3);
    video.completeSeek();
    video.presentFrame();

    await expect(final).resolves.toMatchObject({
      status: 'ready',
      runId: 'media-test:3',
      direction: 1
    });
    expect(driver.snapshot()).toMatchObject({
      runId: 'media-test:3',
      direction: 1,
      frameReady: true
    });
  });

  it('keeps native playback rejection local to one run', async () => {
    const video = new FakeVideo();
    video.rejectNextPlay = true;
    const driver = createTimelineVideoDriver(videoElement(video));
    const base = {
      direction: 1 as const,
      progress: 0.2,
      durationFallbackSeconds: 10,
      timelineDurationMs: 2_000,
      mode: 'native-preferred' as const
    };

    driver.drive({ ...base, runId: 'media-test:1' });
    video.completeSeek();
    video.presentFrame();
    await Promise.resolve();

    expect(driver.snapshot()).toMatchObject({ runId: 'media-test:1', nativeFallback: true });
    expect(video.playCalls).toBe(1);

    driver.drive({ ...base, runId: 'media-test:2' });
    video.completeSeek();
    video.presentFrame();
    await Promise.resolve();

    expect(video.playCalls).toBe(2);
    expect(driver.snapshot()).toMatchObject({ runId: 'media-test:2', nativeFallback: false });
  });

  it('ignores an older play rejection after a newer attempt in the same run', async () => {
    const video = new FakeVideo();
    const pending: Array<{
      resolve(): void;
      reject(error: Error): void;
    }> = [];
    video.play = () => {
      video.playCalls += 1;
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    };
    const driver = createTimelineVideoDriver(videoElement(video));
    const input = {
      runId: 'media-test:one-run',
      direction: 1 as const,
      durationFallbackSeconds: 10,
      timelineDurationMs: 2_000,
      mode: 'native-preferred' as const
    };

    driver.drive({ ...input, progress: 0.2 });
    video.completeSeek();
    video.presentFrame();
    driver.drive({ ...input, progress: 0.3 });
    video.completeSeek();
    video.presentFrame();
    pending[0]?.reject(new Error('stale autoplay rejection'));
    pending[1]?.resolve();
    await Promise.resolve();

    expect(video.playCalls).toBe(2);
    expect(driver.snapshot()).toMatchObject({
      runId: 'media-test:one-run',
      nativeFallback: false
    });
  });

  it('resolves reduced motion directly to the requested endpoint without playback', () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    driver.drive({
      runId: 'media-test:reduced',
      direction: -1,
      progress: 0,
      durationFallbackSeconds: 10,
      mode: 'native-preferred',
      reducedMotion: true
    });

    expect(video.playCalls).toBe(0);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(0);
  });

  it('exposes an idempotent element-owned disposer for SceneLayer unmount cleanup', () => {
    const video = new FakeVideo();
    const element = videoElement(video) as HTMLVideoElement & {
      __r5TimelineVideoDispose?: () => void;
    };
    const first = timelineVideoDriverFor(element);

    element.__r5TimelineVideoDispose?.();
    element.__r5TimelineVideoDispose?.();

    expect(element.__r5TimelineVideoDispose).toBeUndefined();
    expect(timelineVideoDriverFor(element)).not.toBe(first);
  });
});
