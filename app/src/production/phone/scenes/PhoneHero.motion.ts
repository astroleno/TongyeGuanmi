import { browserPrefersHevcAlpha } from '../../../media/alpha-video-sources';
import {
  disposePhoneTimelineVideo,
  drivePhoneTimelineVideo
} from '../phone-timeline-runtime';
import { setPackedAlphaVideoSource } from '../../../media/packed-alpha-video';
import type { PhoneMotionDriver } from '../types';

export const PHONE_FIGURE_DURATION_SECONDS = 2.042;
/**
 * Figure 1 belongs to the finger until this point. Crossing it hands the
 * already-presented frame to native playback, so the ending can breathe
 * without fighting ScrollTrigger for the playhead.
 */
export const PHONE_FIGURE_AUTOPLAY_START_PROGRESS = 0.62;
const PHONE_FIGURE_END_EPSILON_SECONDS = 0.03;
const PHONE_FIGURE_RUN_ID = 'phone-story-hero-figure';
const HAVE_CURRENT_DATA = 2;

export type PhoneFigureSources = Readonly<{
  webm: string;
  hevc: string;
  packed?: string;
}>;

export type PhoneFigureSource = Readonly<{
  format: 'hevc' | 'webm' | 'packed';
  src: string;
}>;

export type PhoneFigurePlayback = Readonly<{
  setActive(active: boolean): void;
  scrub(progress: number): void;
  settle(): void;
  unlockFromGesture(): void;
  dispose(): void;
}>;

export type PhoneParallaxTarget = Readonly<{
  element: HTMLElement;
  x: number;
  y: number;
}>;

export type PhoneDeviceParallax = Readonly<{
  requestPermission(): void;
  dispose(): void;
}>;

type DeviceOrientationPermissionConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

type OrientationBaseline = Readonly<{
  beta: number;
  gamma: number;
}>;

type PhoneDeviceParallaxOptions = Readonly<{
  root: HTMLElement;
  targets: readonly PhoneParallaxTarget[];
  motionDriver: PhoneMotionDriver;
  eventTarget?: Window;
}>;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function orientationConstructor(): DeviceOrientationPermissionConstructor | undefined {
  if (typeof DeviceOrientationEvent === 'undefined') {
    return undefined;
  }
  return DeviceOrientationEvent as DeviceOrientationPermissionConstructor;
}

/** Keep the iPhone HEVC path deterministic instead of relying on source-sniffing. */
export function phoneFigureSourceFor(
  sources: PhoneFigureSources,
  preferHevc = browserPrefersHevcAlpha()
): PhoneFigureSource {
  if (sources.packed) {
    return { format: 'packed', src: sources.packed };
  }
  return preferHevc
    ? { format: 'hevc', src: sources.hevc }
    : { format: 'webm', src: sources.webm };
}

export function phoneFigureFallbackSourceFor(
  sources: PhoneFigureSources,
  selected: PhoneFigureSource
): PhoneFigureSource {
  if (selected.format === 'packed') {
    return phoneFigureSourceFor(
      { webm: sources.webm, hevc: sources.hevc },
      browserPrefersHevcAlpha()
    );
  }
  return selected.format === 'hevc'
    ? { format: 'webm', src: sources.webm }
    : { format: 'hevc', src: sources.hevc };
}

/**
 * A single owner arbitrates the Figure video. Scroll reclaims the playhead
 * through TimelineVideoDriver; once ScrollTrigger settles, native playback is
 * allowed to breathe again from that presented frame.
 */
export function createPhoneFigurePlayback(
  video: HTMLVideoElement,
  packedSourceUrl: string
): PhoneFigurePlayback {
  let active = false;
  let disposed = false;
  let lastProgress = 0;
  let playAttempt = 0;

  const canAutoplay = () => active && lastProgress >= PHONE_FIGURE_AUTOPLAY_START_PROGRESS;

  const playAmbient = () => {
    if (disposed || !canAutoplay()) {
      return;
    }
    if (
      video.dataset.phoneFigurePlayback === 'autoplay'
      || video.dataset.phoneFigurePlayback === 'starting-autoplay'
    ) {
      return;
    }
    if (video.readyState < HAVE_CURRENT_DATA) {
      video.dataset.phoneFigurePlayback = 'waiting';
      return;
    }
    const attempt = ++playAttempt;
    video.loop = true;
    video.playbackRate = 0.82;
    video.dataset.phoneFigurePlayback = 'starting-autoplay';
    void video.play().then(
      () => {
        if (!disposed && active && attempt === playAttempt) {
          video.dataset.phoneFigurePlayback = 'autoplay';
        }
      },
      () => {
        if (!disposed && active && attempt === playAttempt) {
          video.dataset.phoneFigurePlayback = 'blocked';
        }
      }
    );
  };

  const onLoadedData = () => {
    video.dataset.phoneFigureFrame = 'ready';
    video.parentElement?.setAttribute('data-phone-figure-frame', 'ready');
    if (canAutoplay()) {
      playAmbient();
    } else {
      video.dataset.phoneFigurePlayback = 'scrub-ready';
    }
  };

  const onError = () => {
    if (!disposed) {
      video.dataset.phoneFigurePlayback = 'failed';
    }
  };

  video.addEventListener('loadeddata', onLoadedData);
  video.addEventListener('error', onError);
  video.setAttribute?.('x-webkit-airplay', 'deny');
  video.dataset.phoneFigureSource = 'packed';
  video.dataset.phoneFigurePlayback = 'loading';
  video.dataset.phoneFigureAlpha = 'probing';
  video.parentElement?.setAttribute('data-phone-figure-alpha', 'probing');
  setPackedAlphaVideoSource(video, packedSourceUrl);

  return {
    setActive(nextActive) {
      active = nextActive;
      if (!active) {
        playAttempt += 1;
        video.pause();
        video.dataset.phoneFigurePlayback = 'paused';
        return;
      }
      if (lastProgress >= PHONE_FIGURE_AUTOPLAY_START_PROGRESS) {
        playAmbient();
      } else {
        video.dataset.phoneFigurePlayback = 'scrub-ready';
      }
    },
    scrub(rawProgress) {
      if (disposed || !active) {
        return;
      }
      const progress = clamp(rawProgress);
      const direction = progress >= lastProgress ? 1 : -1;
      lastProgress = progress;

      if (progress >= PHONE_FIGURE_AUTOPLAY_START_PROGRESS) {
        // Seek once at the handoff boundary, then release the playhead. This
        // is intentionally not a scroll-linked fade or a repeatedly-seeked
        // video while the native outro is playing.
        const alreadyPlayingAmbient = video.dataset.phoneFigurePlayback === 'autoplay'
          || video.dataset.phoneFigurePlayback === 'starting-autoplay';
        if (!alreadyPlayingAmbient) {
          video.pause();
          video.loop = false;
          video.playbackRate = 1;
          drivePhoneTimelineVideo(video, [
            PHONE_FIGURE_RUN_ID,
            direction,
            PHONE_FIGURE_AUTOPLAY_START_PROGRESS,
            PHONE_FIGURE_DURATION_SECONDS,
            0,
            PHONE_FIGURE_DURATION_SECONDS - PHONE_FIGURE_END_EPSILON_SECONDS,
            null,
            null,
            'timeline',
            null,
            true,
            null
          ]);
          playAmbient();
        }
        return;
      }

      playAttempt += 1;
      video.pause();
      video.loop = false;
      video.playbackRate = 1;
      video.dataset.phoneFigurePlayback = 'scrubbing';
      drivePhoneTimelineVideo(video, [
        PHONE_FIGURE_RUN_ID,
        direction,
        progress,
        PHONE_FIGURE_DURATION_SECONDS,
        0,
        PHONE_FIGURE_DURATION_SECONDS - PHONE_FIGURE_END_EPSILON_SECONDS,
        null,
        null,
        'timeline',
        null,
        true,
        null
      ]);
    },
    settle() {
      if (lastProgress >= PHONE_FIGURE_AUTOPLAY_START_PROGRESS) {
        playAmbient();
      }
    },
    unlockFromGesture() {
      if (lastProgress >= PHONE_FIGURE_AUTOPLAY_START_PROGRESS) {
        playAmbient();
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      playAttempt += 1;
      video.pause();
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('error', onError);
      disposePhoneTimelineVideo(video);
      delete video.dataset.phoneFigurePlayback;
      delete video.dataset.phoneFigureFrame;
      delete video.dataset.phoneFigureSource;
      delete video.dataset.phoneFigureAlpha;
      delete video.parentElement?.dataset.phoneFigureFrame;
      delete video.parentElement?.dataset.phoneFigureAlpha;
    }
  };
}

export function phoneDeviceParallaxSample(
  beta: number,
  gamma: number,
  baseline: OrientationBaseline
): Readonly<{ x: number; y: number }> {
  return {
    x: clamp((gamma - baseline.gamma) / 20, -1, 1),
    y: clamp((beta - baseline.beta) / 24, -1, 1)
  };
}

/**
 * iOS permits device orientation only from a user activation. Android and
 * browsers without that gate start listening immediately; iOS exposes the
 * same parallax after the first touch without competing with vertical scroll.
 */
export function attachPhoneDeviceParallax(
  options: PhoneDeviceParallaxOptions
): PhoneDeviceParallax {
  const eventTarget = options.eventTarget ?? window;
  const targets = options.targets.filter((target) => Boolean(target.element));
  const root = options.root;
  const motionDriver = options.motionDriver;
  const source = orientationConstructor();
  const permissionRequired = typeof source?.requestPermission === 'function';
  let disposed = false;
  let listening = false;
  let requesting = false;
  let baseline: OrientationBaseline | undefined;

  const setters = targets.map((target) => ({
    ...target,
    xTo: motionDriver.quickTo(target.element, 'x', { duration: 0.58, ease: 'power3.out' }),
    yTo: motionDriver.quickTo(target.element, 'y', { duration: 0.58, ease: 'power3.out' })
  }));

  const reset = () => {
    for (const target of setters) {
      target.xTo(0);
      target.yTo(0);
    }
  };

  const onOrientation = (event: Event) => {
    const orientation = event as DeviceOrientationEvent;
    if (!finite(orientation.beta) || !finite(orientation.gamma)) {
      return;
    }
    if (!baseline) {
      baseline = { beta: orientation.beta, gamma: orientation.gamma };
      root.dataset.phoneHeroParallax = 'calibrated';
      return;
    }
    const sample = phoneDeviceParallaxSample(orientation.beta, orientation.gamma, baseline);
    for (const target of setters) {
      target.xTo(sample.x * target.x);
      target.yTo(sample.y * target.y);
    }
  };

  const beginListening = () => {
    if (disposed || listening) {
      return;
    }
    listening = true;
    root.dataset.phoneHeroParallax = 'active';
    eventTarget.addEventListener('deviceorientation', onOrientation, { passive: true });
  };

  if (!source) {
    root.dataset.phoneHeroParallax = 'unavailable';
  } else if (permissionRequired) {
    root.dataset.phoneHeroParallax = 'gesture-required';
  } else {
    beginListening();
  }

  return {
    requestPermission() {
      if (disposed || listening || requesting || !source) {
        return;
      }
      if (!permissionRequired) {
        beginListening();
        return;
      }
      requesting = true;
      root.dataset.phoneHeroParallax = 'requesting';
      void source.requestPermission?.().then(
        (state) => {
          requesting = false;
          if (disposed) {
            return;
          }
          if (state === 'granted') {
            beginListening();
            return;
          }
          root.dataset.phoneHeroParallax = 'denied';
        },
        () => {
          requesting = false;
          if (!disposed) {
            root.dataset.phoneHeroParallax = 'denied';
          }
        }
      );
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (listening) {
        eventTarget.removeEventListener('deviceorientation', onOrientation);
      }
      reset();
      delete root.dataset.phoneHeroParallax;
    }
  };
}
