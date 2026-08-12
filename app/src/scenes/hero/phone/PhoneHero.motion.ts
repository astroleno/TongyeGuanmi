import { browserPrefersHevcAlpha } from '../../../media/alpha-video-sources';
import { primePhoneNativeVideo } from '../../../media/phone-native-video-prime';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame
} from '../../../media/timeline-video-driver';
import { setPackedAlphaVideoSource } from '../../../media/packed-alpha-video';

export type PhoneMotionDriver = Readonly<{
  set(target: HTMLElement, vars: Readonly<Record<string, string | number>>): void;
  quickTo(
    target: HTMLElement,
    property: 'x' | 'y',
    vars: Readonly<{ duration: number; ease: string }>
  ): (value: number) => void;
}>;

export const PHONE_FIGURE_DURATION_SECONDS = 2.042;
const PHONE_FIGURE_END_EPSILON_SECONDS = 0.03;

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
  setRun(runId: string, direction?: 'forward' | 'reverse' | null): void;
  setActive(active: boolean): void;
  scrub(progress: number): void;
  settle(): void;
  primeFromGesture(
    direction?: 'forward' | 'reverse' | null,
    onRejected?: (error: unknown) => void
  ): Promise<void>;
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
 * A single timeline owner arbitrates the Figure video for the complete
 * Hero-pattern segment. Native play is used only to consume Safari activation
 * credit during prime; it never becomes a second visible clock.
 */
export function createPhoneFigurePlayback(
  video: HTMLVideoElement,
  packedSourceUrl: string
): PhoneFigurePlayback {
  let active = false;
  let disposed = false;
  let runDirection: 1 | -1 = 1;
  let currentRunId = 'phone-story-hero-figure:unbound';
  let primeGeneration = 0;

  const onLoadedData = () => {
    video.dataset.phoneFigureFrame = 'ready';
    video.parentElement?.setAttribute('data-phone-figure-frame', 'ready');
    video.dataset.phoneFigurePlayback = 'scrub-ready';
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
    setRun(runId, direction = 'forward') {
      if (currentRunId === runId) return;
      currentRunId = runId;
      runDirection = direction === 'reverse' ? -1 : 1;
      primeGeneration += 1;
      disposeTimelineVideoDriver(video);
    },
    setActive(nextActive) {
      if (active !== nextActive) primeGeneration += 1;
      active = nextActive;
      if (!active) {
        video.pause();
        video.dataset.phoneFigurePlayback = 'paused';
        return;
      }
      video.pause();
      video.loop = false;
      video.playbackRate = 1;
      video.dataset.phoneFigurePlayback = 'scrub-ready';
    },
    scrub(rawProgress) {
      if (disposed || !active) {
        return;
      }
      const progress = clamp(rawProgress);

      video.pause();
      video.loop = false;
      video.playbackRate = 1;
      video.dataset.phoneFigurePlayback = 'scrubbing';
      driveTimelineVideo(video, {
        runId: currentRunId,
        direction: runDirection,
        progress,
        durationFallbackSeconds: PHONE_FIGURE_DURATION_SECONDS,
        startSeconds: 0,
        endSeconds: PHONE_FIGURE_DURATION_SECONDS - PHONE_FIGURE_END_EPSILON_SECONDS,
        mode: 'timeline',
        allowSeekedFrameFallback: true
      });
    },
    settle() {
      video.pause();
      video.loop = false;
      video.playbackRate = 1;
      if (active) video.dataset.phoneFigurePlayback = 'scrub-ready';
    },
    primeFromGesture(direction = 'forward', onRejected) {
      const generation = ++primeGeneration;
      return primePhoneNativeVideo(video, {
        isCurrent: () => !disposed && generation === primeGeneration,
        phase: () => active ? 'playing' : 'primed',
        ...(onRejected ? { onRejected } : {})
      }).then(async () => {
        if (disposed || generation !== primeGeneration) return;
        await prepareTimelineVideoFrame(video, {
          runId: currentRunId,
          direction: direction === 'reverse' ? -1 : 1,
          progress: direction === 'reverse' ? 1 : 0,
          durationFallbackSeconds: PHONE_FIGURE_DURATION_SECONDS,
          startSeconds: 0,
          endSeconds: PHONE_FIGURE_DURATION_SECONDS - PHONE_FIGURE_END_EPSILON_SECONDS,
          mode: 'timeline',
          allowSeekedFrameFallback: true
        });
      });
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      primeGeneration += 1;
      video.pause();
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('error', onError);
      disposeTimelineVideoDriver(video);
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
