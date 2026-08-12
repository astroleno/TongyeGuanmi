import { describe, expect, it, vi } from 'vitest';
import { createPhoneAodAutoplay } from './aod-autoplay';

class FakeVideo extends EventTarget {
  autoplay = true;
  currentTime = 0;
  ended = false;
  loop = true;
  muted = false;
  paused = true;
  playbackRate = 1;
  playsInline = false;
  readyState = 2;
  readonly dataset: Record<string, string> = {};
  readonly pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  readonly play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  });
}

describe('phone AOD autoplay lifecycle', () => {
  it('reports a blocked first play so the owning session can roll back', async () => {
    const video = new FakeVideo();
    video.play.mockRejectedValueOnce(new Error('blocked'));
    const controller = createPhoneAodAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 1,
        onProgress: vi.fn(),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    const result = await controller.start(1);

    expect(result).toBe('blocked');
    expect(video.dataset.phoneAodAutoplay).toBe('blocked');
    controller.dispose();
  });

  it('waits for forward media progress before reporting a playable first frame', async () => {
    const video = new FakeVideo();
    let resolvePlay: (() => void) | undefined;
    video.play.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolvePlay = resolve;
    }));
    const controller = createPhoneAodAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 1,
        onProgress: vi.fn(),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    const start = controller.start(1);
    let settled = false;
    void start.then(() => {
      settled = true;
    });
    resolvePlay?.();
    video.paused = false;
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);

    video.currentTime = .04;
    video.dispatchEvent(new Event('timeupdate'));

    await expect(start).resolves.toBe('playing');
    controller.dispose();
  });

  it('retains the start identity for progress and terminal playback evidence', async () => {
    const video = new FakeVideo();
    const onProgress = vi.fn();
    const onComplete = vi.fn();
    const identity = [
      'authority-a',
      'session-a',
      7,
      0,
      1
    ] as const;
    const controller = createPhoneAodAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 1,
        onProgress,
        onComplete,
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    const start = controller.start(1, identity);
    video.currentTime = .04;
    video.dispatchEvent(new Event('timeupdate'));
    await expect(start).resolves.toBe('playing');
    expect(onProgress).toHaveBeenCalledWith(0, 1, identity);

    video.currentTime = 1;
    video.dispatchEvent(new Event('timeupdate'));

    expect(onComplete).toHaveBeenCalledWith(1, identity);
    controller.dispose();
  });
});
