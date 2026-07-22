import { describe, expect, it, vi } from 'vitest';
import { unlockStoryMedia } from '../mobile-media-unlock';
import { createPhoneNativeAutoplay } from './phone-native-autoplay';

class FakeVideo extends EventTarget {
  autoplay = true;
  currentTime = 0;
  ended = false;
  loop = true;
  muted = false;
  paused = true;
  playsInline = false;
  preload = 'none';
  readyState = 2;
  readonly dataset: Record<string, string> = {};
  readonly setAttribute = vi.fn();
  readonly pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  readonly play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  });
}

class FakeVisibilityDocument extends EventTarget {
  hidden = false;
}

describe('phone native autoplay', () => {
  it('does not start an inactive lazy decoder before the scene owns playback', async () => {
    const video = new FakeVideo();
    const controller = createPhoneNativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        runIdPrefix: 'phone-test',
        durationSeconds: 1,
        onProgress: vi.fn(),
        onComplete: vi.fn(),
        onFailure: vi.fn(),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    expect(video.play).not.toHaveBeenCalled();
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(0);

    controller.start();
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.dataset.phoneNativeAutoplay).toBe('playing');
    controller.dispose();
  });

  it('never inherits a pending hidden-scene play promise at scene entry', async () => {
    const video = new FakeVideo();
    const controller = createPhoneNativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        runIdPrefix: 'phone-test',
        durationSeconds: 1,
        onProgress: vi.fn(),
        onComplete: vi.fn(),
        onFailure: vi.fn(),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start();
    expect(video.play).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(video.paused).toBe(false);
    expect(video.dataset.phoneNativeAutoplay).toBe('playing');
    controller.dispose();
  });

  it('uses native currentTime as the only forward clock and resumes after visibility', async () => {
    const video = new FakeVideo();
    const visibility = new FakeVisibilityDocument();
    const progress: number[] = [];
    const complete = vi.fn();
    const controller = createPhoneNativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        runIdPrefix: 'phone-test',
        durationSeconds: 2,
        onProgress: (value) => progress.push(value),
        onComplete: complete,
        onFailure: vi.fn(),
        visibilityDocument: visibility as unknown as Document,
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start();
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.dataset.phoneNativeAutoplay).toBe('playing');
    expect(video.dataset.phoneNativeFrameReady).toBeUndefined();
    video.currentTime = 0.1;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.dataset.phoneNativeFrameReady).toBe('true');
    expect(video.loop).toBe(false);
    expect(video.preload).toBe('auto');

    video.currentTime = 1;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.at(-1)).toBe(0.5);

    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(video.dataset.phoneNativeAutoplay).toBe('suspended');

    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledTimes(2);

    video.currentTime = 2;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.at(-1)).toBe(1);
    expect(complete).toHaveBeenCalledOnce();

    controller.dispose();
  });

  it('keeps a blocked run retryable and reports a real media error', async () => {
    const video = new FakeVideo();
    video.play.mockRejectedValueOnce(new Error('blocked'));
    const failure = vi.fn();
    const controller = createPhoneNativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        runIdPrefix: 'phone-test',
        durationSeconds: 1,
        onProgress: vi.fn(),
        onComplete: vi.fn(),
        onFailure: failure,
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(video.dataset.phoneNativeAutoplay).toBe('blocked');

    controller.retry();
    await Promise.resolve();
    expect(video.dataset.phoneNativeAutoplay).toBe('playing');

    video.dispatchEvent(new Event('error'));
    expect(video.dataset.phoneNativeAutoplay).toBe('failed');
    expect(failure).toHaveBeenCalledOnce();

    controller.dispose();
  });

  it('recovers when the iOS unlock promise pauses an active native run', async () => {
    const video = new FakeVideo();
    const controller = createPhoneNativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        runIdPrefix: 'phone-test',
        durationSeconds: 1,
        onProgress: vi.fn(),
        onComplete: vi.fn(),
        onFailure: vi.fn(),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start();
    await Promise.resolve();
    video.pause();
    await Promise.resolve();

    expect(video.play).toHaveBeenCalledTimes(2);
    expect(video.paused).toBe(false);
    expect(video.dataset.phoneNativeAutoplay).toBe('playing');
    controller.dispose();
  });

  it('keeps a real run alive when a pending gesture prewarm resolves late', async () => {
    const video = new FakeVideo();
    let resolvePrewarm: () => void = () => undefined;
    video.play
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolvePrewarm = resolve;
      }))
      .mockImplementation(async () => {
        video.paused = false;
        video.dispatchEvent(new Event('play'));
      });

    unlockStoryMedia({
      querySelectorAll: () => [video]
    } as unknown as ParentNode);

    const controller = createPhoneNativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        runIdPrefix: 'phone-ph-figure',
        durationSeconds: 1,
        onProgress: vi.fn(),
        onComplete: vi.fn(),
        onFailure: vi.fn(),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );
    const idleRun = video.dataset.timelineVideoRun;

    controller.start();
    await Promise.resolve();
    const activeRun = video.dataset.timelineVideoRun;
    const pausesAfterTakeover = video.pause.mock.calls.length;

    expect(idleRun).toMatch(/^phone-ph-figure-idle:/);
    expect(activeRun).toMatch(/^phone-ph-figure-forward:/);
    expect(activeRun).not.toBe(idleRun);
    expect(video.paused).toBe(false);

    resolvePrewarm();
    await Promise.resolve();

    expect(video.pause).toHaveBeenCalledTimes(pausesAfterTakeover);
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(video.paused).toBe(false);
    expect(video.dataset.timelineVideoRun).toBe(activeRun);
    controller.dispose();
  });

  it('fails a stalled run instead of retaining the cinematic snap forever', async () => {
    vi.useFakeTimers();
    try {
      const video = new FakeVideo();
      const failure = vi.fn();
      const controller = createPhoneNativeAutoplay(
        video as unknown as HTMLVideoElement,
        {
          runIdPrefix: 'phone-test',
          durationSeconds: 3,
          stallTimeoutMs: 50,
          onProgress: vi.fn(),
          onComplete: vi.fn(),
          onFailure: failure,
          requestFrame: () => 1,
          cancelFrame: vi.fn()
        }
      );

      controller.start();
      await Promise.resolve();
      expect(video.dataset.phoneNativeAutoplay).toBe('playing');

      vi.advanceTimersByTime(49);
      expect(failure).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(video.dataset.phoneNativeAutoplay).toBe('failed');
      expect(failure).toHaveBeenCalledOnce();
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renews the stall deadline when native currentTime advances', async () => {
    vi.useFakeTimers();
    try {
      const video = new FakeVideo();
      const failure = vi.fn();
      const controller = createPhoneNativeAutoplay(
        video as unknown as HTMLVideoElement,
        {
          runIdPrefix: 'phone-test',
          durationSeconds: 2,
          stallTimeoutMs: 50,
          onProgress: vi.fn(),
          onComplete: vi.fn(),
          onFailure: failure,
          requestFrame: () => 1,
          cancelFrame: vi.fn()
        }
      );

      controller.start();
      await Promise.resolve();
      vi.advanceTimersByTime(40);
      video.currentTime = 0.5;
      video.dispatchEvent(new Event('timeupdate'));
      vi.advanceTimersByTime(40);
      expect(failure).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10);
      expect(failure).toHaveBeenCalledOnce();
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
