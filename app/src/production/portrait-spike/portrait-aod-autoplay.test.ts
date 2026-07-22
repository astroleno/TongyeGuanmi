import { describe, expect, it, vi } from 'vitest';
import {
  createPortraitAodAutoplay,
  portraitAodBackdropPresentation,
  portraitAodMethodProgress,
  portraitAodPresentation
} from './portrait-aod-autoplay';
import {
  AOD_PHONE_TIMELINE_ALPHA_END,
  AOD_PHONE_TIMELINE_ALPHA_START,
  AOD_SOURCE_ALPHA_END,
  AOD_TIMELINE_ALPHA_END
} from '../../scenes/aod-animation/progress';

class FakeVideo extends EventTarget {
  autoplay = true;
  currentTime = 0;
  ended = false;
  loop = true;
  muted = false;
  paused = true;
  playbackRate = 0.5;
  playsInline = false;
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

describe('portrait AOD autoplay', () => {
  it('time-warps the alpha third and natively plays both directions', async () => {
    const video = new FakeVideo();
    const visibility = new FakeVisibilityDocument();
    const progress: number[] = [];
    const completed: number[] = [];
    const controller = createPortraitAodAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 2.5,
        onProgress: (value) => progress.push(value),
        onComplete: (direction) => completed.push(direction),
        visibilityDocument: visibility as unknown as Document,
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start();
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.loop).toBe(false);
    expect(video.playbackRate).toBeLessThan(1);

    video.currentTime = AOD_SOURCE_ALPHA_END * 2.5;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.at(-1)).toBeCloseTo(AOD_TIMELINE_ALPHA_END);

    video.currentTime += 0.01;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.playbackRate).toBeGreaterThan(1);

    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(video.pause).toHaveBeenCalled();
    expect(video.dataset.phoneAodAutoplay).toBe('suspended');

    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledTimes(2);

    video.ended = true;
    video.dispatchEvent(new Event('ended'));
    expect(progress.at(-1)).toBe(1);
    expect(completed).toEqual([1]);

    video.currentTime = 2.499;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.at(-1)).toBe(1);

    video.ended = false;
    video.play.mockClear();
    controller.start(-1);
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledOnce();
    expect(progress.at(-1)).toBe(1);
    expect(video.dataset.phoneAodAutoplayDirection).toBe('reverse');
    expect(video.playbackRate).toBeGreaterThan(1);

    video.currentTime = (1 - AOD_SOURCE_ALPHA_END) * 2.5;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.at(-1)).toBeCloseTo(AOD_TIMELINE_ALPHA_END);

    video.currentTime += 0.01;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.playbackRate).toBeLessThan(1);

    video.ended = true;
    video.dispatchEvent(new Event('ended'));
    expect(progress.at(-1)).toBe(0);
    expect(completed).toEqual([1, -1]);

    video.currentTime = 2.499;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.at(-1)).toBe(0);

    controller.dispose();
  });

  it('starts Method only for the final twenty percent of AOD time', () => {
    expect(portraitAodMethodProgress(0.79)).toBe(0);
    expect(portraitAodMethodProgress(0.8)).toBe(0);
    expect(portraitAodMethodProgress(0.9)).toBeCloseTo(0.5);
    expect(portraitAodMethodProgress(1)).toBe(1);
  });

  it('maps the first full-alpha source frame to the phone 59% timeline point', async () => {
    const video = new FakeVideo();
    const progress: number[] = [];
    const controller = createPortraitAodAutoplay(
      video as unknown as HTMLVideoElement,
      {
        durationSeconds: 2.5,
        alphaEndProgress: AOD_PHONE_TIMELINE_ALPHA_END,
        onProgress: (value) => progress.push(value),
        requestFrame: () => 1,
        cancelFrame: vi.fn()
      }
    );

    controller.start();
    await Promise.resolve();
    video.currentTime = AOD_SOURCE_ALPHA_END * 2.5;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.at(-1)).toBeCloseTo(AOD_PHONE_TIMELINE_ALPHA_END);

    controller.dispose();
  });

  it('keeps a lower fixed camera and uses scale alone to cover the portrait edge', () => {
    expect(portraitAodPresentation(0)).toEqual({
      figureScale: 1,
      figureShiftYVh: 9,
      bottomMistOpacity: 0
    });

    const opaquePhase = portraitAodPresentation(0.6);
    expect(opaquePhase.figureScale).toBeGreaterThan(1.41);
    expect(opaquePhase.figureShiftYVh).toBe(9);
    expect(opaquePhase.bottomMistOpacity).toBeGreaterThan(0.58);

    expect(portraitAodPresentation(1)).toEqual({
      figureScale: 1.46,
      figureShiftYVh: 9,
      bottomMistOpacity: 0.96
    });

    expect(
      portraitAodPresentation(AOD_PHONE_TIMELINE_ALPHA_START).bottomMistOpacity
    ).toBe(0);
    expect(portraitAodPresentation(0.52).bottomMistOpacity).toBeGreaterThan(0);
    expect(portraitAodPresentation(0.68).bottomMistOpacity).toBe(0.96);
  });

  it('starts the cloud and sun with AOD playback and gives the near cloud a faster exit', () => {
    const start = portraitAodBackdropPresentation(0);
    expect(start.sunYVh).toBeCloseTo(0);
    expect(start.cloudYVh).toBeCloseTo(0);

    const firstPositiveFrame = portraitAodBackdropPresentation(0.01);
    expect(firstPositiveFrame.sunYVh).toBeLessThan(0);
    expect(firstPositiveFrame.cloudYVh).toBeLessThan(0);

    const early = portraitAodBackdropPresentation(0.2);
    expect(Math.abs(early.cloudYVh) / 124).toBeGreaterThan(
      Math.abs(early.sunYVh) / 108
    );
    expect(early.cloudYVh).toBeLessThan(early.sunYVh);

    expect(portraitAodBackdropPresentation(1)).toEqual({
      sunYVh: -108,
      cloudYVh: -124
    });
  });
});
