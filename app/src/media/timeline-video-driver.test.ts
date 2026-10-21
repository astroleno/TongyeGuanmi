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
  loadCalls = 0;
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

  load(): void {
    this.loadCalls++;
    this.readyState = 0;
    this.seeking = false;
    this.dispatch('abort');
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
  it('promotes preload before the explicit source-reselection load', async () => {
    const video = new FakeVideo();
    video.readyState = 0;
    Object.assign(video, { networkState: 3, preload: 'none' });
    const preloadAtLoad: string[] = [];
    const load = video.load.bind(video);
    video.load = () => { preloadAtLoad.push((video as FakeVideo & { preload: string }).preload); load(); };
    const driver = createTimelineVideoDriver(videoElement(video));
    const pending = driver.prepareFrame({ runId: 'cold-reselection', direction: 1, progress: 0, durationFallbackSeconds: 10 });
    try { expect(preloadAtLoad).toEqual(['auto']); }
    finally { driver.dispose(); await pending; }
  });
  it.each([[.033333, 0], [2.433333, 1]])('does not relabel a nearby scroll frame %s as endpoint %s', async (previousTime, progress) => {
    const video = new FakeVideo(); video.duration = 2.5;
    Object.assign(video, { closest: () => ({}) });
    const driver = createTimelineVideoDriver(videoElement(video));
    const input = { runId: 'scroll-endpoint', direction: 1 as const,
      durationFallbackSeconds: 2.5, endSeconds: 2.467, frameRate: 30 };
    try {
      const ready = driver.prepareFrame({ ...input, progress: previousTime! / 2.467 });
      video.completeSeek(); video.presentFrame(); await ready;
      const writes = video.currentTimeWrites.length;
      driver.drive({ ...input, progress: progress! });
      expect(video.currentTimeWrites).toHaveLength(writes + 1);
      expect(video.currentTime).toBeCloseTo(progress! * 2.467);
      expect(driver.snapshot().frameReady).toBe(false);
      video.completeSeek(); video.presentFrame();
      expect(driver.snapshot().frameReady).toBe(true);
    } finally { driver.dispose(); }
  });

  it.each([1, -1] as const)('does not let a late mismatched frame replace the latest queued seek (%i)', (direction) => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const input = { runId: 'late-frame', direction,
      durationFallbackSeconds: 10, endSeconds: 9, mode: 'timeline' as const };
    driver.drive({ ...input, progress: direction === 1 ? .2 : .8 });
    driver.drive({ ...input, progress: direction === 1 ? .8 : .2 });
    video.presentFrame(.1);
    video.completeSeek();
    expect(video.currentTimeWrites.at(-1)).toBeCloseTo(direction === 1 ? 7.2 : 1.8);
    video.completeSeek();
    video.presentFrame();
    expect(driver.snapshot().frameReady).toBe(true);
    driver.dispose();
  });

  it('retries failed source selection on explicit preparation and ignores its own reload abort', async () => {
    const video = new FakeVideo();
    video.readyState = 0;
    Object.assign(video, {
      networkState: 3,
      load: vi.fn(() => video.dispatch('abort'))
    });
    const driver = createTimelineVideoDriver(videoElement(video));
    const ready = driver.prepareFrame({ runId: 'retry-source', direction: 1,
      progress: 0, durationFallbackSeconds: 10 });
    expect((video as FakeVideo & { load: ReturnType<typeof vi.fn> }).load).toHaveBeenCalledOnce();
    video.readyState = 1; video.dispatch('loadedmetadata');
    video.readyState = 4; video.dispatch('loadeddata');
    video.completeSeek(); video.completeSeek(); video.presentFrame();
    await expect(ready).resolves.toMatchObject({ status: 'ready' });
    driver.dispose();
  });

  it.each([24, 30])('keeps %i fps forward/reverse targets within half a source frame at every progress sample', (frameRate) => {
    const video = new FakeVideo();
    video.duration = 3;
    const driver = createTimelineVideoDriver(videoElement(video));
    const startSeconds = .07;
    const endSeconds = 2.67;
    for (const direction of [1, -1] as const) {
      let previous = direction === 1 ? startSeconds : endSeconds;
      for (let index = 0; index <= 1000; index++) {
        const progress = direction === 1 ? index / 1000 : 1 - index / 1000;
        const target = driver.drive({
          runId: `alignment:${direction}`, direction, progress,
          durationFallbackSeconds: 3, startSeconds, endSeconds,
          frameRate, mode: 'timeline', allowPlaybackNudge: false
        }).targetTime!;
        const exact = startSeconds + (endSeconds - startSeconds) * progress;
        expect(Math.abs(target - exact)).toBeLessThanOrEqual(.5 / frameRate + 1e-10);
        expect(target).toBeGreaterThanOrEqual(startSeconds);
        expect(target).toBeLessThanOrEqual(endSeconds);
        expect((target - previous) * direction).toBeGreaterThanOrEqual(-1e-10);
        if (progress === 0 || progress === 1) expect(target).toBe(exact);
        previous = target;
        video.completeSeek();
        video.presentFrame();
      }
    }
    driver.dispose();
  });

  it('coalesces subframe scroll samples while preserving exact preparation and terminal frames', async () => {
    const video = new FakeVideo();
    video.duration = 2;
    const driver = createTimelineVideoDriver(videoElement(video));
    const input = { runId: 'scroll', direction: 1 as const, durationFallbackSeconds: 2,
      endSeconds: 1.97, frameRate: 24, mode: 'timeline' as const, progress: .31 };
    const target = driver.drive(input).targetTime!;
    expect(target * 24).toBeCloseTo(Math.round(target * 24));
    video.completeSeek(); video.presentFrame();
    const writes = video.currentTimeWrites.length;
    driver.drive({ ...input, progress: .312 });
    expect(video.currentTimeWrites).toHaveLength(writes);
    const prepared = driver.prepareFrame(input);
    expect(driver.snapshot().targetTime).toBeCloseTo(1.97 * .31);
    video.completeSeek(); video.presentFrame();
    expect((await prepared).status).toBe('ready');
    driver.drive({ ...input, progress: 1 });
    expect(driver.snapshot().targetTime).toBe(1.97);
    video.completeSeek(); video.presentFrame();
    driver.drive({ ...input, runId: 'reverse', direction: -1, progress: 0 });
    expect(driver.snapshot().targetTime).toBe(0);
    driver.dispose();
  });

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

  it.each(['seeked', 'loadeddata', 'loadeddata-during-seek'])(
    'releases completed seek ownership before a waiting endpoint primes via %s', async (event) => {
      vi.useFakeTimers();
      const video = new FakeVideo();
      const driver = createTimelineVideoDriver(videoElement(video));
      const input = {
        runId: 'media-data-handoff:1',
        direction: 1 as const,
        durationFallbackSeconds: 10
      };
      try {
        driver.drive({ ...input, progress: 0.8 });
        video.readyState = 1;
        const readiness = driver.prepareFrame({ ...input, progress: 1 });
        await vi.advanceTimersByTimeAsync(100);
        expect(video.currentTimeWrites).toHaveLength(1);
        video.readyState = 4;
        if (event === 'loadeddata-during-seek') {
          video.dispatch('loadeddata');
          expect(video.currentTimeWrites).toHaveLength(1);
          video.completeSeek();
        } else if (event === 'loadeddata') {
          video.seeking = false;
          video.dispatch('loadeddata');
        } else {
          video.completeSeek();
        }
        expect(video.currentTimeWrites.at(-1)).toBeCloseTo(9.93, 2);
        expect(driver.snapshot().frameReady).toBe(false);
        video.completeSeek();
        expect(video.currentTimeWrites.at(-1)).toBeCloseTo(9.98, 2);
        video.completeSeek();
        expect(driver.snapshot().frameReady).toBe(false);
        video.presentFrame();
        await expect(readiness).resolves.toMatchObject({ status: 'ready', targetTime: 9.98 });
      } finally {
        driver.dispose();
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
      }
    }
  );

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

  it('defers a cold endpoint prime until the initial sample exists, then proves the return seek', async () => {
    const video = new FakeVideo();
    video.duration = Number.NaN;
    video.readyState = 0;
    const driver = createTimelineVideoDriver(videoElement(video));

    const ready = driver.prepareFrame({
      runId: 'media-cold-start-frame:1',
      direction: 1,
      progress: 0,
      durationFallbackSeconds: 2.042
    });

    expect(video.currentTimeWrites).toHaveLength(0);
    video.duration = 2.042;
    video.readyState = 1;
    video.dispatch('loadedmetadata');
    expect(video.currentTimeWrites).toHaveLength(0);
    video.readyState = 2;
    video.dispatch('loadeddata');
    expect(video.currentTimeWrites).toHaveLength(1);
    expect(video.currentTimeWrites[0]).toBeGreaterThanOrEqual(0.05);
    video.completeSeek(); video.completeSeek(); video.presentFrame();
    await expect(ready).resolves.toMatchObject({ status: 'ready', targetTime: 0 });
    driver.dispose();
  });

  it('resumes a cold terminal prepare when another loadeddata listener seeks first', async () => {
    const video = new FakeVideo();
    video.duration = Number.NaN;
    video.readyState = 0;
    video.addEventListener('loadeddata', () => {
      video.currentTime = 2.567;
      video.readyState = 1;
    });
    const driver = createTimelineVideoDriver(videoElement(video));
    const ready = driver.prepareFrame({
      runId: 'cold-terminal', direction: -1, progress: 1,
      durationFallbackSeconds: 2.567, endSeconds: 2.567
    });
    video.duration = 2.6;
    video.readyState = 1;
    video.dispatch('loadedmetadata');
    expect(driver.snapshot().targetTime).toBe(2.567);
    video.readyState = 2;
    video.dispatch('loadeddata');
    expect(video.currentTimeWrites).toEqual([2.567]);
    video.readyState = 4;
    video.completeSeek();
    expect(video.currentTimeWrites.at(-1)).toBeCloseTo(2.517);
    video.completeSeek(); video.completeSeek(); video.presentFrame();
    await expect(ready).resolves.toMatchObject({ status: 'ready', targetTime: 2.567 });
    driver.dispose();
  });

  it('finishes an endpoint nudge when seeking clears without a seeked event', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    try {
      const ready = driver.prepareFrame({ runId: 'missing-seeked', direction: 1,
        progress: 0, durationFallbackSeconds: 10 });
      await vi.advanceTimersByTimeAsync(100);
      expect(video.currentTimeWrites).toEqual([.05]);
      expect(driver.snapshot().frameReady).toBe(false);
      video.seeking = false;
      await vi.advanceTimersByTimeAsync(50);
      expect(video.currentTimeWrites).toEqual([.05, 0]);
      expect(driver.snapshot().frameReady).toBe(false);
      video.completeSeek(); video.presentFrame();
      await expect(ready).resolves.toMatchObject({ status: 'ready', targetTime: 0 });
    } finally {
      driver.dispose();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });

  it('cancels a still-seeking endpoint nudge poll when its preparation is aborted', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const controller = new AbortController();
    try {
      const ready = driver.prepareFrame({ runId: 'abort-nudge', direction: 1,
        progress: 0, durationFallbackSeconds: 10, signal: controller.signal });
      const rejected = expect(ready).rejects.toThrow();
      controller.abort();
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      video.seeking = false;
      await vi.advanceTimersByTimeAsync(200);
      expect(video.currentTimeWrites).toEqual([.05]);
    } finally { driver.dispose(); vi.useRealTimers(); }
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
      // Freeze the nudge before re-seeking, otherwise every late callback can
      // advance beyond the target again and repeat until the prepare deadline.
      expect(video.paused).toBe(true);
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

  it('does not let a stale preparation release its successor', async () => {
    const video = new FakeVideo();
    const first = prepareTimelineVideoFrame(videoElement(video), {
      runId: 'probe:1', direction: 1, progress: .5, durationFallbackSeconds: 10
    });
    const second = prepareTimelineVideoFrame(videoElement(video), {
      runId: 'probe:2', direction: -1, progress: .6, durationFallbackSeconds: 10
    });
    await video.play();
    await expect(first).resolves.toMatchObject({ status: 'stale' });
    expect(video.paused).toBe(false);
    video.completeSeek();
    video.completeSeek();
    video.presentFrame();
    await expect(second).resolves.toMatchObject({ status: 'ready' });
    expect(video.paused).toBe(true);
  });

  it.each([false, true])('proves a covered desktop frame by decoded readback, never a failed draw (%s)', async (drawFails) => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const drawImage = vi.fn(() => { if (drawFails) throw new Error('decoder unavailable'); });
    const getImageData = vi.fn();
    Object.assign(video, {
      closest: () => ({}),
      ownerDocument: { createElement: () => ({ getContext: () => ({ drawImage, getImageData }) }) }
    });
    let settled = false;
    try {
      const readiness = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'covered:1', direction: 1, progress: .5, durationFallbackSeconds: 10
      });
      void readiness.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(120);
      expect(drawImage).not.toHaveBeenCalled(); // Still seeking: no decoded proof.
      video.completeSeek();
      await vi.advanceTimersByTimeAsync(120);
      expect(settled).toBe(!drawFails);
      if (drawFails) {
        expect(getImageData).not.toHaveBeenCalled();
        video.presentFrame();
      } else {
        expect(getImageData).toHaveBeenCalledWith(0, 0, 1, 1);
        expect(video.dataset.timelineVideoFrameEvidence).toBe('decoded-canvas');
      }
      await expect(readiness).resolves.toMatchObject({ status: 'ready' });
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });

  it('freezes a preparation nudge before publishing its physical scroll-frame proof', async () => {
    const video = new FakeVideo();
    Object.assign(video, { closest: () => ({}) });
    const driver = createTimelineVideoDriver(video as unknown as HTMLVideoElement);
    driver.drive({ runId: 'scroll', direction: 1, progress: .2, durationFallbackSeconds: 10 });
    await video.play();
    video.completeSeek(); video.presentFrame();
    expect(video.paused).toBe(true);
    expect(driver.snapshot().presentedPlayheadTime).toBe(video.currentTime);
    driver.dispose();
  });
  it('does not start native playback while a scroll preparation is waiting', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    Object.assign(video, { closest: () => ({}) });
    const controller = new AbortController();
    const ready = prepareTimelineVideoFrame(videoElement(video), {
      runId: 'paused-scroll-prepare', direction: 1, progress: .5,
      durationFallbackSeconds: 10, signal: controller.signal
    });
    const rejected = expect(ready).rejects.toThrow();
    try {
      await vi.advanceTimersByTimeAsync(300);
      expect(video.playCalls).toBe(0);
      controller.abort(); await rejected;
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });
  it('proves paused scroll samples without compositor callbacks and rejects undecoded samples', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const drawImage = vi.fn();
    const getImageData = vi.fn();
    Object.assign(video, {
      closest: (selector: string) => selector === '[data-scroll-platform]' ? {} : null,
      ownerDocument: { createElement: () => ({ getContext: () => ({ drawImage, getImageData }) }) }
    });
    const driver = timelineVideoDriverFor(videoElement(video));
    try {
      driver.drive({ runId: 'scroll:1', direction: 1, progress: .5, durationFallbackSeconds: 10 });
      await vi.advanceTimersByTimeAsync(32);
      expect(driver.snapshot().frameReady).toBe(false);
      expect(drawImage).not.toHaveBeenCalled();
      // Some paused decoders settle after the first probe without another
      // seeked event. An active scroll proof must continue probing.
      video.seeking = false;
      await vi.advanceTimersByTimeAsync(32);
      expect(driver.snapshot().frameReady).toBe(true);
      expect(video.dataset.timelineVideoFrameEvidence).toBe('decoded-canvas');
      driver.drive({ runId: 'scroll:1', direction: 1, progress: .2, durationFallbackSeconds: 10 });
      expect(driver.snapshot().frameReady).toBe(false);
      video.completeSeek();
      await vi.advanceTimersByTimeAsync(32);
      expect(driver.snapshot()).toMatchObject({ frameReady: true, generation: 1 });
      expect(driver.snapshot().targetTime).toBeCloseTo(1.996);
    } finally { driver.dispose(); vi.useRealTimers(); }
  });
  it('reissues a paused scroll seek silently reset by source selection instead of waiting forever', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    Object.assign(video, { closest: () => ({}) });
    const driver = createTimelineVideoDriver(videoElement(video));
    try {
      driver.drive({ runId: 'scroll-reset', direction: 1, progress: .5,
        durationFallbackSeconds: 10, allowSeekedFrameFallback: true });
      const target = driver.snapshot().targetTime!;
      video.currentTime = 0; video.seeking = false;
      await vi.advanceTimersByTimeAsync(8);
      expect(video.currentTime).toBe(target);
      expect(driver.snapshot().frameReady).toBe(false);
      video.completeSeek();
      await vi.advanceTimersByTimeAsync(8);
      expect(driver.snapshot()).toMatchObject({ frameReady: true, presentedTime: target });
      expect(video.playCalls).toBe(0);
    } finally { driver.dispose(); vi.useRealTimers(); }
  });

  it('shares prewarm/admission work while cancellation releases only its own lease', async () => {
    const video = new FakeVideo();
    const controller = new AbortController();
    const input = { direction: 1 as const, progress: .5, durationFallbackSeconds: 10 };
    const first = prepareTimelineVideoFrame(videoElement(video), {
      ...input, runId: 'prewarm', signal: controller.signal
    });
    const writes = video.currentTimeWrites.length;
    const second = prepareTimelineVideoFrame(videoElement(video), { ...input, runId: 'entry' });
    expect(video.currentTimeWrites).toHaveLength(writes);
    controller.abort();
    await expect(first).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_ABORTED' });
    video.completeSeek(); video.presentFrame();
    await expect(second).resolves.toMatchObject({ status: 'ready', runId: 'entry' });
    disposeTimelineVideoDriver(videoElement(video));
  });

  it('recovers one stalled source without accepting readiness before the exact frame', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    video.readyState = 1;
    try {
      const pending = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'retry', direction: 1, progress: .5, durationFallbackSeconds: 10,
        allowPlaybackNudge: false
      });
      let settled = false;
      void pending.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(4500);
      expect(video.loadCalls).toBe(1);
      expect(settled).toBe(false);
      video.readyState = 4; video.dispatch('loadeddata');
      video.completeSeek(); video.presentFrame();
      await expect(pending).resolves.toMatchObject({ status: 'ready' });
      expect(video.playCalls).toBe(0);
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });

  it.each([false, true])('keeps the final loading transfer inside the original deadline instead of failing before its first byte (%s)', async (failedSelection) => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    video.readyState = 0;
    Object.assign(video, { networkState: failedSelection ? 3 : 2 });
    const load = video.load.bind(video);
    video.load = () => { load(); Object.assign(video, { networkState: 2 }); };
    const controller = new AbortController();
    try {
      const pending = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'late-first-byte', direction: 1, progress: .5,
        durationFallbackSeconds: 10, allowPlaybackNudge: false, signal: controller.signal
      });
      let rejection: unknown;
      let settled = false;
      void pending.then(() => { settled = true; }, error => { rejection = error; });
      await vi.advanceTimersByTimeAsync(10500);
      expect(video.loadCalls).toBe(1);
      expect(rejection).toBeUndefined();
      expect(settled).toBe(false);
      video.readyState = 4; Object.assign(video, { networkState: 1 });
      video.dispatch('loadeddata'); video.completeSeek(); video.presentFrame();
      await expect(pending).resolves.toMatchObject({ status: 'ready' });
      expect(video.playCalls).toBe(0);
    } finally { controller.abort(); disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });

  it('still expires a permanently loading final request at the original 19 second deadline', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo(); video.readyState = 0;
    Object.assign(video, { networkState: 2 });
    try {
      const pending = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'permanent-transfer', direction: 1, progress: 0,
        durationFallbackSeconds: 10, allowPlaybackNudge: false
      });
      let failure: unknown;
      void pending.catch(error => { failure = error; });
      await vi.advanceTimersByTimeAsync(18999);
      expect(failure).toBeUndefined();
      expect(video.loadCalls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_TIMEOUT' });
      expect(vi.getTimerCount()).toBe(0);
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });

  it('cancels the final active download without waiting for the hard deadline or starting another load', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo(); video.readyState = 0;
    Object.assign(video, { networkState: 2 });
    const controller = new AbortController();
    try {
      const pending = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'cancel-final-transfer', direction: 1, progress: 0,
        durationFallbackSeconds: 10, allowPlaybackNudge: false, signal: controller.signal
      });
      void pending.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(10500);
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_ABORTED' });
      expect(video.loadCalls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });

  it('reuses one readback surface for successive decoded scroll frames and releases it on retirement', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const context = { drawImage: vi.fn(), getImageData: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
    const createElement = vi.fn(() => canvas);
    Object.assign(video, { closest: () => ({}), ownerDocument: { createElement } });
    const driver = createTimelineVideoDriver(videoElement(video));
    try {
      for (const progress of [.2, .4, .6]) {
        driver.drive({ runId: 'probe-reuse', direction: 1, progress, durationFallbackSeconds: 10 });
        video.completeSeek();
        await vi.advanceTimersByTimeAsync(8);
        expect(driver.snapshot().frameReady).toBe(true);
      }
      expect(createElement).toHaveBeenCalledTimes(1);
      expect(canvas.getContext).toHaveBeenCalledExactlyOnceWith('2d', { willReadFrequently: true });
      expect(context.drawImage).toHaveBeenCalledTimes(3);
      expect(context.getImageData).toHaveBeenCalledTimes(3);
      expect(canvas.width).toBe(1); expect(canvas.height).toBe(1);
    } finally { driver.dispose(); vi.useRealTimers(); }
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });

  it('does not keep a tainted readback surface or invent proof after a failed pixel read', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    const failed = { width: 1, height: 1, getContext: () => ({
      drawImage: vi.fn(), getImageData: () => { throw new Error('tainted'); }
    }) };
    const read = vi.fn();
    const valid = { width: 1, height: 1, getContext: () => ({ drawImage: vi.fn(), getImageData: read }) };
    const createElement = vi.fn().mockReturnValueOnce(failed).mockReturnValue(valid);
    Object.assign(video, { closest: () => ({}), ownerDocument: { createElement } });
    const driver = createTimelineVideoDriver(videoElement(video));
    try {
      driver.drive({ runId: 'failed-probe', direction: 1, progress: .2, durationFallbackSeconds: 10 });
      video.completeSeek(); await vi.advanceTimersByTimeAsync(8);
      expect(driver.snapshot().frameReady).toBe(false);
      expect(failed.width).toBe(0); expect(failed.height).toBe(0);
      driver.drive({ runId: 'valid-probe', direction: 1, progress: .4, durationFallbackSeconds: 10 });
      video.completeSeek(); await vi.advanceTimersByTimeAsync(8);
      expect(driver.snapshot().frameReady).toBe(true);
      expect(read).toHaveBeenCalledOnce();
      driver.drive({ runId: 'valid-probe', direction: 1, progress: .6, durationFallbackSeconds: 10 });
      video.completeSeek(); driver.dispose(); await vi.advanceTimersByTimeAsync(8);
      expect(read).toHaveBeenCalledOnce();
    } finally { driver.dispose(); vi.useRealTimers(); }
  });

  it('does not hide a terminal media error behind the remaining download allowance', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo(); video.readyState = 0;
    Object.assign(video, { networkState: 2 });
    try {
      const pending = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'error-on-final-transfer', direction: 1, progress: 0,
        durationFallbackSeconds: 10, allowPlaybackNudge: false
      });
      void pending.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(10500);
      Object.assign(video, { error: { code: 3, message: 'bad media' } });
      video.dispatch('error');
      await expect(pending).rejects.toMatchObject({ code: 'MEDIA_ELEMENT_ERROR', message: 'bad media' });
      expect(video.loadCalls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });

  it('stops a cancelled final lease before any retry can reload the source', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    video.readyState = 0;
    const controller = new AbortController();
    try {
      const pending = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'cancel', direction: 1, progress: 0, durationFallbackSeconds: 10,
        signal: controller.signal
      });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_ABORTED' });
      await vi.advanceTimersByTimeAsync(20000);
      expect(video.loadCalls).toBe(0);
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });

  it('does not reload a progressing download but still enforces the overall deadline', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    video.readyState = 0;
    try {
      const pending = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'slow-download', direction: 1, progress: 0, durationFallbackSeconds: 10
      });
      const rejection = expect(pending).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_TIMEOUT' });
      for (let index = 0; index < 6; index++) {
        await vi.advanceTimersByTimeAsync(3000);
        video.dispatch('progress');
        expect(video.loadCalls).toBe(0);
      }
      await vi.advanceTimersByTimeAsync(1000);
      await rejection;
      expect(video.loadCalls).toBe(0);
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });

  it('counts failed source reselection against the same single reload allowance', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    video.readyState = 0;
    Object.assign(video, { networkState: 3 });
    try {
      const pending = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'failed-source', direction: 1, progress: 0, durationFallbackSeconds: 10
      });
      const rejection = expect(pending).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_STALLED' });
      await vi.advanceTimersByTimeAsync(19000);
      await rejection;
      expect(video.loadCalls).toBe(1);
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
  });

  it('unwinds a cold desktop preparation before the ink build deadline', async () => {
    vi.useFakeTimers();
    const video = new FakeVideo();
    video.readyState = 0;
    Object.assign(video, { closest: () => ({}) });
    try {
      const readiness = prepareTimelineVideoFrame(videoElement(video), {
        runId: 'cold-deadline:1', direction: 1, progress: 0, durationFallbackSeconds: 10
      });
      const rejection = expect(readiness).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_STALLED' });
      await vi.advanceTimersByTimeAsync(19000);
      await rejection;
      expect(video.loadCalls).toBe(1);
      expect(video.paused).toBe(true);
    } finally { disposeTimelineVideoDriver(videoElement(video)); vi.useRealTimers(); }
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

  it('keeps legacy native requests on the paused seek clock in either direction', () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    for (const direction of [1, -1] as const) {
      for (const progress of [0, .2, .6, 1]) {
        driver.drive({ runId: 'seek:' + direction, direction, progress,
          durationFallbackSeconds: 10, mode: 'native-preferred' });
        video.completeSeek(); video.presentFrame();
        expect(video.playCalls).toBe(0);
        expect(video.paused).toBe(true);
        expect(video.currentTime).toBeCloseTo(progress * 9.98);
      }
    }
    driver.dispose();
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

  it('maps a real reverse runtime sequence monotonically from the closing frame to zero', () => {
    const video = new FakeVideo();
    const driver = createTimelineVideoDriver(videoElement(video));
    const input = {
      runId: 'media-reverse-endpoint:1',
      direction: -1 as const,
      durationFallbackSeconds: 2.6,
      startSeconds: 0,
      endSeconds: 2.6,
      mode: 'timeline' as const
    };
    const presented: number[] = [];

    for (const progress of [1, .5, 0]) {
      driver.drive({ ...input, progress });
      video.completeSeek();
      video.presentFrame();
      presented.push(video.currentTime);
    }

    expect(presented).toEqual([2.6, 1.3, 0]);
    expect(presented).toEqual([...presented].sort((left, right) => right - left));
    driver.dispose();
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
