import { afterEach, describe, expect, it, vi } from 'vitest';

const timeline = vi.hoisted(() => ({
  dispose: vi.fn(),
  drive: vi.fn()
}));

vi.mock('../../media/alpha-video-sources', () => ({
  browserPrefersHevcAlpha: () => true
}));

vi.mock('../../media/timeline-video-driver', () => ({
  disposeTimelineVideoDriver: timeline.dispose,
  driveTimelineVideo: timeline.drive
}));

import {
  createPortraitFigurePlayback,
  PORTRAIT_FIGURE_AUTOPLAY_START_PROGRESS,
  portraitDeviceParallaxSample,
  portraitFigureFallbackSourceFor,
  portraitFigureSourceFor
} from './portrait-motion';

class FakeVideo extends EventTarget {
  autoplay = false;
  currentTime = 0;
  loop = false;
  muted = false;
  paused = true;
  playbackRate = 1;
  playsInline = false;
  preload = 'metadata';
  readyState = 2;
  src = '';
  readonly dataset: Record<string, string> = {};
  readonly parentElement = {
    dataset: {} as Record<string, string>,
    setAttribute: vi.fn((name: string, value: string) => {
      this.parentElement.dataset[name] = value;
    })
  };
  readonly load = vi.fn();
  readonly setAttribute = vi.fn();
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
  readonly play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
}

afterEach(() => {
  timeline.dispose.mockReset();
  timeline.drive.mockReset();
});

describe('portrait motion ownership', () => {
  const sources = { webm: '/figure.webm', hevc: '/figure-hevc.mp4' };

  it('selects HEVC alpha for the iPhone path and retains a deterministic fallback', () => {
    const hevc = portraitFigureSourceFor(sources, true);
    expect(hevc).toEqual({ format: 'hevc', src: '/figure-hevc.mp4' });
    expect(portraitFigureFallbackSourceFor(sources, hevc)).toEqual({
      format: 'webm',
      src: '/figure.webm'
    });
    expect(portraitFigureSourceFor(sources, false)).toEqual({ format: 'webm', src: '/figure.webm' });
  });

  it('prefers the packed compositor source when the mobile route provides one', () => {
    expect(portraitFigureSourceFor({
      ...sources,
      packed: '/figure-rgb-alpha.mp4'
    }, true)).toEqual({
      format: 'packed',
      src: '/figure-rgb-alpha.mp4'
    });
  });

  it('keeps Figure 1 under scroll control, then hands off only after the outro threshold', async () => {
    const video = new FakeVideo();
    const playback = createPortraitFigurePlayback(
      video as unknown as HTMLVideoElement,
      '/figure-rgb-alpha.mp4'
    );

    expect(video.src).toBe('/figure-rgb-alpha.mp4');
    expect(video.dataset.phoneFigureSource).toBe('packed');
    expect(video.load).toHaveBeenCalledOnce();

    playback.setActive(true);
    await Promise.resolve();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.loop).toBe(false);

    playback.scrub(0.6);
    expect(video.pause).toHaveBeenCalled();
    expect(video.loop).toBe(false);
    expect(timeline.drive).toHaveBeenCalledWith(
      video,
      expect.objectContaining({
        runId: 'phone-story-hero-figure',
        direction: 1,
        progress: 0.6,
        mode: 'timeline'
      })
    );

    playback.scrub(PORTRAIT_FIGURE_AUTOPLAY_START_PROGRESS + 0.01);
    await Promise.resolve();
    expect(timeline.drive).toHaveBeenLastCalledWith(
      video,
      expect.objectContaining({
        progress: PORTRAIT_FIGURE_AUTOPLAY_START_PROGRESS,
        mode: 'timeline'
      })
    );
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.loop).toBe(true);

    playback.settle();
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.loop).toBe(true);

    playback.dispose();
    expect(timeline.dispose).toHaveBeenCalledWith(video);
  });

  it('keeps device motion centered at calibration and clamps extreme tilt', () => {
    expect(portraitDeviceParallaxSample(10, -4, { beta: 10, gamma: -4 })).toEqual({ x: 0, y: 0 });
    expect(portraitDeviceParallaxSample(34, 16, { beta: 10, gamma: -4 })).toEqual({ x: 1, y: 1 });
    expect(portraitDeviceParallaxSample(-20, -30, { beta: 10, gamma: -4 })).toEqual({ x: -1, y: -1 });
  });
});
