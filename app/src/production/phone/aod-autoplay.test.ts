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
});
