import { describe, expect, it, vi } from 'vitest';
import {
  createGroup45NativeAutoplay,
  group45VideoNeedsEndpointSeek
} from './group4-5-native-autoplay';

class FakeVideo extends EventTarget {
  autoplay = true;
  currentTime = 0;
  ended = false;
  loop = true;
  muted = false;
  paused = true;
  playbackRate = .5;
  playsInline = false;
  preload = 'metadata';
  readyState = 0;
  seeking = false;
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

class FakeVisibilityDocument extends EventTarget {
  hidden = false;
}

describe('Group 4–5 native autoplay', () => {
  it('copies the accepted AOD source-zero lifecycle without a paused-frame gate', async () => {
    const video = new FakeVideo();
    const visibility = new FakeVisibilityDocument();
    const progress: number[] = [];
    const status: string[] = [];
    const completed = vi.fn();
    const controller = createGroup45NativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 2.5,
        onProgress: (value) => progress.push(value),
        onStatus: (value) => status.push(value),
        onComplete: completed,
        visibilityDocument: visibility as unknown as Document,
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start();
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.currentTime).toBe(0);
    expect(video.loop).toBe(false);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.playbackRate).toBe(1);
    expect(status).toContain('playing');

    video.currentTime = 1.25;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.at(-1)).toBeCloseTo(.5);

    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(video.dataset.phoneGroup45Autoplay).toBe('suspended');

    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledTimes(2);

    video.currentTime = 2.5;
    video.ended = true;
    video.dispatchEvent(new Event('ended'));
    expect(progress.at(-1)).toBe(1);
    expect(completed).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);

    controller.dispose();
  });

  it('retries a rejected start when Safari later reports frame evidence', async () => {
    const video = new FakeVideo();
    video.play
      .mockRejectedValueOnce(new Error('decoder not ready'))
      .mockImplementation(async () => {
        video.paused = false;
        video.dispatchEvent(new Event('play'));
      });
    const controller = createGroup45NativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 2.5,
        onProgress: vi.fn(),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(video.dataset.phoneGroup45Autoplay).toBe('blocked');

    video.readyState = 2;
    video.dispatchEvent(new Event('canplay'));
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(video.dataset.phoneGroup45Autoplay).toBe('playing');
    expect(video.dataset.phoneGroup45FrameReady).toBe('true');

    controller.dispose();
  });

  it('holds stable endpoints without starting a second native run', () => {
    const video = new FakeVideo();
    const progress: number[] = [];
    const controller = createGroup45NativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 2.5,
        onProgress: (value) => progress.push(value),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.reset(0);
    expect(progress.at(-1)).toBe(0);
    controller.reset(1);
    expect(progress.at(-1)).toBe(1);
    expect(video.play).not.toHaveBeenCalled();

    controller.dispose();
  });

  it('does not reseek a decoded endpoint that Safari already presented', () => {
    expect(group45VideoNeedsEndpointSeek(2.447, 2, false, 2.467)).toBe(false);
    expect(group45VideoNeedsEndpointSeek(0, 2, false, 0)).toBe(false);
    expect(group45VideoNeedsEndpointSeek(2.2, 2, false, 2.467)).toBe(true);
    expect(group45VideoNeedsEndpointSeek(2.447, 1, false, 2.467)).toBe(true);
  });

  it('runs the short source backward on a decoder-safe canonical clock', () => {
    const video = new FakeVideo();
    video.readyState = 2;
    const progress: Array<readonly [number, 1 | -1]> = [];
    const completed = vi.fn();
    const callbacks: FrameRequestCallback[] = [];
    const controller = createGroup45NativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 2.5,
        onProgress: (value, direction) => progress.push([value, direction]),
        onComplete: completed,
        requestFrame: (callback) => {
          callbacks.push(callback);
          return callbacks.length;
        },
        cancelFrame: vi.fn()
      }
    );

    controller.start(-1);
    expect(video.play).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(2.5);
    callbacks.shift()?.(0);
    callbacks.shift()?.(1250);
    expect(progress.at(-1)).toEqual([.5, -1]);
    // The scene's shared timeline driver owns intermediate reverse seeks.
    // The clock must not race it by mutating currentTime every rAF.
    expect(video.currentTime).toBe(2.5);
    callbacks.shift()?.(2500);
    expect(progress.at(-1)).toEqual([0, -1]);
    expect(completed).toHaveBeenCalledWith(-1);
    expect(controller.active).toBe(false);

    controller.dispose();
  });

  it('starts reverse from a retained terminal frame without rewriting currentTime', () => {
    const video = new FakeVideo();
    video.readyState = 2;
    video.currentTime = 2.46;
    const controller = createGroup45NativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 2.467,
        onProgress: vi.fn(),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start(-1);

    expect(video.currentTime).toBe(2.46);
    expect(video.play).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('removes retry listeners and decoder diagnostics on dispose', async () => {
    const video = new FakeVideo();
    const controller = createGroup45NativeAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 2.5,
        onProgress: vi.fn(),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start();
    await Promise.resolve();
    controller.dispose();
    video.dispatchEvent(new Event('canplay'));

    expect(video.play).toHaveBeenCalledOnce();
    expect(video.paused).toBe(true);
    expect(video.dataset.phoneGroup45Autoplay).toBeUndefined();
    expect(video.dataset.phoneGroup45AutoplayProgress).toBeUndefined();
    expect(video.dataset.phoneGroup45FrameReady).toBeUndefined();
  });
});
