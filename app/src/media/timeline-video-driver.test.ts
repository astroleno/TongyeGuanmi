import { describe, expect, it, vi } from 'vitest';

import { createTimelineVideoDriver, timelineVideoDriverFor } from './timeline-video-driver';

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

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  presentFrame(mediaTime?: number): void {
    const callback = this.frameCallback;
    this.frameCallback = undefined;
    callback?.(0, mediaTime === undefined
      ? {} as VideoFrameCallbackMetadata
      : { mediaTime } as VideoFrameCallbackMetadata);
  }

  frameCallbackSnapshot(): ((
    now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata
  ) => void) | undefined {
    return this.frameCallback;
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
    expect(video.currentTimeWrites[0]).toBeGreaterThan(0);
    video.completeSeek();
    expect(video.currentTimeWrites.length).toBeGreaterThanOrEqual(2);
    expect(video.currentTimeWrites.at(-1)).toBe(0);
    let settled = false;
    void readiness.then(() => {
      settled = true;
    });
    video.presentFrame();
    await Promise.resolve();
    expect(settled).toBe(false);
    video.completeSeek();
    await Promise.resolve();
    expect(settled).toBe(true);

    await expect(readiness).resolves.toEqual([
      'ready',
      'media-endpoint-frame:1',
      1,
      1,
      0,
      null
    ]);
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
      expect(video.dataset.timelineVideoFrameReady).toBeUndefined();

      video.presentFrame();
      await expect(readiness).resolves.toEqual([
        'ready',
        'media-frame-strict:1',
        1,
        1,
        4.99,
        null
      ]);
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('returns the exact rVFC mediaTime with the prepared frame identity', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const readiness = driver.prepareFrame({
      runId: 'media-exact-time:1',
      direction: -1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });
    video.completeSeek();
    video.presentFrame(4.99);

    await expect(readiness).resolves.toEqual([
      'ready',
      'media-exact-time:1',
      -1,
      1,
      4.99,
      4.99
    ]);
    // Exact decoder mediaTime crosses the lazy boundary in the prepared
    // tuple; it is not reconstituted from a mutable DOM diagnostic field.
    expect(video.dataset.timelineVideoFrameMediaTime).toBeUndefined();
    driver.dispose();
  });

  it('re-arms one exact WebKit frame seek and rejects an older generation callback', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const staleReadiness = driver.prepareFrame({
        runId: 'media-exact-retry:stale',
        direction: -1,
        progress: 0.25,
        durationFallbackSeconds: 10,
        requireExactMediaFrame: true
      });
      video.completeSeek();
      const staleCallback = video.frameCallbackSnapshot();
      expect(staleCallback).toBeTypeOf('function');

      const readiness = driver.prepareFrame({
        runId: 'media-exact-retry:current',
        direction: -1,
        progress: 0.5,
        durationFallbackSeconds: 10,
        requireExactMediaFrame: true
      });
      await expect(staleReadiness).resolves.toEqual([
        'stale',
        'media-exact-retry:stale',
        -1,
        1,
        2.495,
        null
      ]);
      video.completeSeek();

      let settled = false;
      void readiness.then(() => {
        settled = true;
      });
      staleCallback?.(0, { mediaTime: 2.495 } as VideoFrameCallbackMetadata);
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(video.dataset.timelineVideoFrameReady).toBeUndefined();

      const writesBeforeRetry = video.currentTimeWrites.length;
      await vi.advanceTimersByTimeAsync(250);
      expect(video.currentTimeWrites.length).toBe(writesBeforeRetry + 1);
      expect(video.currentTimeWrites.at(-1)).toBeLessThan(4.99);

      video.completeSeek();
      expect(video.currentTimeWrites.at(-1)).toBeCloseTo(4.99, 3);
      video.completeSeek();
      const writesAfterRearm = video.currentTimeWrites.length;
      await vi.advanceTimersByTimeAsync(250);
      expect(video.currentTimeWrites).toHaveLength(writesAfterRearm);
      video.presentFrame(4.99);

      await expect(readiness).resolves.toEqual([
        'ready',
        'media-exact-retry:current',
        -1,
        2,
        4.99,
        4.99
      ]);
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('keeps the exact retry armed after an old mediaTime callback', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-exact-retry:stale-frame',
        direction: 1,
        progress: 0.5,
        durationFallbackSeconds: 10,
        requireExactMediaFrame: true
      });
      video.completeSeek();

      // The first decoded callback is a stale sample. The pending exact retry
      // must survive this re-registration so the physical nudge still runs.
      video.presentFrame(4.7);
      const writesBeforeRetry = video.currentTimeWrites.length;
      await vi.advanceTimersByTimeAsync(250);
      expect(video.currentTimeWrites.length).toBe(writesBeforeRetry + 1);

      // The retry's nudge completes, then the driver seeks back to the exact
      // target. The callback from that second seek is intentionally not fired
      // until the current frame is available.
      video.completeSeek();
      expect(video.currentTimeWrites.at(-1)).toBeCloseTo(4.99, 3);
      video.completeSeek();
      video.presentFrame(4.99);

      await expect(readiness).resolves.toEqual([
        'ready',
        'media-exact-retry:stale-frame',
        1,
        1,
        4.99,
        4.99
      ]);
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('retries the exact frame when the physical nudge cannot start', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));

    try {
      const readiness = driver.prepareFrame({
        runId: 'media-exact-retry:not-started',
        direction: -1,
        progress: 0.5,
        durationFallbackSeconds: 10,
        requireExactMediaFrame: true
      });
      video.completeSeek();

      // Move the playhead away before the retry fires. beginExactTargetSeek
      // must report started=false without consuming the only retry, then
      // recover by scheduling the target seek instead of waiting forever.
      video.currentTime = 4.8;
      await vi.advanceTimersByTimeAsync(250);
      expect(video.currentTimeWrites.at(-1)).toBeCloseTo(4.99, 3);

      video.completeSeek();
      video.presentFrame(4.99);
      await expect(readiness).resolves.toEqual([
        'ready',
        'media-exact-retry:not-started',
        -1,
        1,
        4.99,
        4.99
      ]);
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('re-seeks when rVFC reports a stale decoded sample after seek completion', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const readiness = driver.prepareFrame({
      runId: 'media-stale-rvfc:1',
      direction: -1,
      progress: 0.5,
      durationFallbackSeconds: 10
    });
    video.completeSeek();
    video.presentFrame(4.8);
    video.presentFrame(4.99);

    await expect(readiness).resolves.toEqual([
      'ready',
      'media-stale-rvfc:1',
      -1,
      1,
      4.99,
      4.99
    ]);
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
      expect(video.dataset.timelineVideoFrameReady).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);

      await expect(readiness).resolves.toEqual([
        'ready',
        'media-webkit-frame-stall:1',
        1,
        1,
        4.99,
        null
      ]);
      expect(video.dataset.timelineVideoFrameReady).toBe('true');
      expect(video.dataset.timelineVideoFrameEvidence).toBe('seeked-fallback');
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
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
      expect(video.dataset.timelineVideoFrameReady).toBeUndefined();

      video.readyState = 4;
      video.presentFrame();
      await expect(readiness).resolves.toEqual([
        'ready',
        'media-webkit-without-frame-data:1',
        1,
        1,
        4.99,
        null
      ]);
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

      await expect(readiness).resolves.toEqual([
        'ready',
        'media-webkit-frame-callback:1',
        1,
        1,
        4.99,
        null
      ]);
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

      await expect(readiness).resolves.toEqual([
        'ready',
        'media-webkit-frame-api:1',
        1,
        1,
        4.99,
        null
      ]);
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

      await expect(stale).resolves.toEqual([
        'stale',
        'media-webkit-stale:1',
        1,
        1,
        4.99,
        null
      ]);
      await vi.advanceTimersByTimeAsync(120);
      expect(video.dataset.timelineVideoFrameReady).toBeUndefined();
      expect(video.dataset.timelineVideoFrameEvidence).toBeUndefined();
    } finally {
      driver.dispose();
      vi.useRealTimers();
    }
  });

  it('reuses an acceptable presented endpoint at an exact playhead across a direction generation', async () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const first = driver.prepareFrame({
      runId: 'endpoint-reuse:1',
      direction: 1,
      progress: 0.996,
      durationFallbackSeconds: 10
    });
    video.completeSeek();
    video.presentFrame();
    await expect(first).resolves.toEqual([
      'ready',
      'endpoint-reuse:1',
      1,
      1,
      9.94008,
      null
    ]);
    video.currentTime = 9.98;
    video.completeSeek();
    const seekWrites = video.currentTimeWrites.length;
    const nextInput = {
      runId: 'endpoint-reuse:2',
      direction: -1 as const,
      progress: 1,
      durationFallbackSeconds: 10
    };
    driver.drive(nextInput);

    await expect(driver.prepareFrame(nextInput)).resolves.toEqual([
      'ready',
      'endpoint-reuse:2',
      -1,
      2,
      9.98,
      null
    ]);
    expect(video.currentTimeWrites).toHaveLength(seekWrites);
    driver.dispose();
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
    await expect(initial).resolves.toEqual([
      'ready',
      'media-ready-then-seek-error:1',
      -1,
      1,
      4.99,
      null
    ]);
    expect(video.dataset.timelineVideoFrameReady).toBe('true');

    video.throwOnCurrentTimeWrite = true;
    await expect(driver.prepareFrame({ ...input, progress: 0.6 })).rejects.toMatchObject({
      code: 'MEDIA_SEEK_FAILED'
    });
    expect(video.paused).toBe(true);
    expect(video.dataset.timelineVideoFrameReady).toBeUndefined();

    video.throwOnCurrentTimeWrite = false;
    const recovered = driver.prepareFrame({ ...input, progress: 0.7 });
    video.completeSeek();
    video.presentFrame();
    await expect(recovered).resolves.toEqual([
      'ready',
      'media-ready-then-seek-error:1',
      -1,
      1,
      6.986,
      null
    ]);
    expect(video.dataset.timelineVideoFrameReady).toBe('true');
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
    })).resolves.toEqual([
      'ready',
      'media-presented-native:2',
      -1,
      2,
      9.98,
      null
    ]);
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
    expect(video.dataset.timelineVideoRun).toBe('media-test:1');
    expect(video.dataset.timelineVideoDirection).toBe('1');
    expect(video.dataset.timelineVideoProgress).toBe('0.4000');

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

    const staleFrame = await stale;
    expect(staleFrame.slice(0, 4)).toEqual([
      'stale',
      'media-test:1',
      1,
      1
    ]);
    expect(staleFrame[4]).toBeCloseTo(1.996, 10);
    expect(video.currentTimeWrites).toHaveLength(1);

    video.completeSeek();
    expect(video.currentTimeWrites).toHaveLength(2);
    expect(video.currentTimeWrites.at(-1)).toBeCloseTo(5.988, 3);
    video.completeSeek();
    video.presentFrame();

    await expect(final).resolves.toEqual([
      'ready',
      'media-test:3',
      1,
      3,
      5.988,
      null
    ]);
    expect(video.dataset.timelineVideoRun).toBe('media-test:3');
    expect(video.dataset.timelineVideoDirection).toBe('1');
    expect(video.dataset.timelineVideoFrameReady).toBe('true');
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

    expect(video.dataset.timelineVideoRun).toBe('media-test:1');
    expect(video.playCalls).toBe(1);

    driver.drive({ ...base, runId: 'media-test:2' });
    video.completeSeek();
    video.presentFrame();
    await Promise.resolve();

    expect(video.playCalls).toBe(2);
    expect(video.dataset.timelineVideoRun).toBe('media-test:2');
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
    expect(video.dataset.timelineVideoRun).toBe('media-test:one-run');
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
    first.drive({
      runId: 'dispose-owner',
      direction: 1,
      progress: .5,
      durationFallbackSeconds: 10,
      mode: 'timeline'
    });
    expect(video.dataset.timelineVideoRun).toBe('dispose-owner');

    element.__r5TimelineVideoDispose?.();
    element.__r5TimelineVideoDispose?.();

    expect(element.__r5TimelineVideoDispose).toBeUndefined();
    expect(video.dataset).not.toHaveProperty('timelineVideoRun');
    expect(video.dataset).not.toHaveProperty('timelineVideoDirection');
    expect(video.dataset).not.toHaveProperty('timelineVideoGeneration');
    expect(video.dataset).not.toHaveProperty('timelineVideoProgress');
    expect(timelineVideoDriverFor(element)).not.toBe(first);
  });
});
