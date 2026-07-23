import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import {
  CRANE_TIMELINE_DURATION_SECONDS,
  CRANE_VIDEO_END_SECONDS
} from '..';
import {
  createPhoneNativeAutoplay,
  type PhoneNativeAutoplay
} from '../../../production/phone/phone-native-autoplay';
import {
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  type PhoneCranePlaybackDirection
} from './PhoneCrane.motion';

const FIGURE_START_SECONDS = 0.5;
const PHONE_CRANE_REVERSE_DISSOLVE_MS = 720;

/** The desktop figure starts at 0.5s and owns the rest of the 3s timeline. */
export const PHONE_CRANE_FIGURE_MEDIA_SECONDS = Math.max(
  0.001,
  CRANE_TIMELINE_DURATION_SECONDS - FIGURE_START_SECONDS
);
/** Desktop plays the safe 2.467s endpoint across the authored 2.5s lane. */
export const PHONE_CRANE_FIGURE_PLAYBACK_RATE = (
  CRANE_VIDEO_END_SECONDS / PHONE_CRANE_FIGURE_MEDIA_SECONDS
);

export function phoneCraneTimelineProgressForFigureMediaProgress(
  rawProgress: number
): number {
  return clamp(
    (FIGURE_START_SECONDS
      + clamp(rawProgress) * PHONE_CRANE_FIGURE_MEDIA_SECONDS)
      / CRANE_TIMELINE_DURATION_SECONDS
  );
}

export type PhoneCraneForwardRun = Readonly<{
  start(): void;
  stop(): void;
  dispose(): void;
}>;

export type PhoneCraneReverseDissolve = Readonly<{
  start(): void;
  stop(): void;
  dispose(): void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneCraneVideos(root: HTMLElement | null): readonly [
  HTMLVideoElement | null,
  HTMLVideoElement | null
] {
  return [
    root?.querySelector<HTMLVideoElement>('[data-crane-figure-video]') ?? null,
    root?.querySelector<HTMLVideoElement>('[data-crane-figure-front-video]') ?? null
  ];
}

/** Two staggered AOD-style native clocks; the delayed figure owns completion. */
export function createPhoneCraneForwardRun(
  root: HTMLElement,
  render: (progress: number, direction: PhoneCranePlaybackDirection) => void,
  onComplete: () => void,
  onFailure: () => void,
  onFrameReady?: () => void
): PhoneCraneForwardRun | null {
  const [figure, flock] = phoneCraneVideos(root);
  if (!figure || !flock) return null;
  let active = false;
  let disposed = false;
  let figureStarted = false;
  let lastProgress = 0;
  let failed = false;
  let firstFrameReady = false;

  const markFrameReady = (video: HTMLVideoElement, owner: 'figure' | 'flock') => {
    video.dataset.phoneCraneFrameReady = 'true';
    video.dataset.timelineVideoFrameReady = 'true';
    video.dataset.phoneCraneNativePlayback = `playing-${owner}`;
    root.dataset.phoneCraneMedia = 'playing';
    if (!firstFrameReady) {
      firstFrameReady = true;
      onFrameReady?.();
    }
  };

  const publishProgress = (nextProgress: number) => {
    if (!active || disposed) return;
    lastProgress = Math.max(lastProgress, clamp(nextProgress));
    render(lastProgress, 1);
  };

  const fail = () => {
    if (!active || failed || disposed) return;
    failed = true;
    active = false;
    flockClock.stop();
    figureClock.stop();
    onFailure();
  };

  const figureClock: PhoneNativeAutoplay = createPhoneNativeAutoplay(figure, {
    runIdPrefix: 'phone-crane-figure',
    durationSeconds: CRANE_VIDEO_END_SECONDS,
    onProgress: (progress) => {
      if (!figureStarted) return;
      publishProgress(phoneCraneTimelineProgressForFigureMediaProgress(progress));
    },
    onComplete: () => {
      if (!active || disposed) return;
      try {
        figure.currentTime = CRANE_VIDEO_END_SECONDS;
      } catch {
        // The compositor already holds the latest safe frame.
      }
      active = false;
      flockClock.stop();
      render(1, 1);
      onComplete();
    },
    onFailure: fail,
    onFrameReady: () => markFrameReady(figure, 'figure')
  });

  const flockClock: PhoneNativeAutoplay = createPhoneNativeAutoplay(flock, {
    runIdPrefix: 'phone-crane-flock',
    durationSeconds: CRANE_VIDEO_END_SECONDS,
    onProgress: (progress) => {
      const mediaSeconds = progress * CRANE_VIDEO_END_SECONDS;
      publishProgress(mediaSeconds / CRANE_TIMELINE_DURATION_SECONDS);
      if (
        active
        && !figureStarted
        && mediaSeconds >= FIGURE_START_SECONDS
      ) {
        figureStarted = true;
        // Both muted decoders were started by the threshold-crossing gesture.
        // Rewind the already-authorized figure once at its authored 0.5s cue
        // instead of issuing a fresh delayed play() that physical Safari can
        // reject or later pause when the flock clock ends.
        try {
          figure.currentTime = 0;
        } catch {
          // Metadata may still be pending; the native clock remains at zero.
        }
        root.dataset.phoneCraneFigurePreroll = 'released';
      }
    },
    onComplete: () => undefined,
    onFailure: fail,
    onFrameReady: () => markFrameReady(flock, 'flock')
  });

  return {
    start() {
      if (disposed) return;
      flockClock.stop();
      figureClock.stop();
      disposeTimelineVideoDriver(flock);
      disposeTimelineVideoDriver(figure);
      active = true;
      failed = false;
      figureStarted = false;
      firstFrameReady = false;
      lastProgress = 0;
      delete flock.dataset.phoneCraneFrameReady;
      delete figure.dataset.phoneCraneFrameReady;
      delete flock.dataset.timelineVideoFrameReady;
      delete figure.dataset.timelineVideoFrameReady;
      delete root.dataset.phoneCraneFigurePreroll;
      render(0, 1);
      figure.playbackRate = PHONE_CRANE_FIGURE_PLAYBACK_RATE;
      figureClock.start();
      flockClock.start();
    },
    stop() {
      active = false;
      flockClock.stop();
      figureClock.stop();
      delete root.dataset.phoneCraneFigurePreroll;
    },
    dispose() {
      active = false;
      disposed = true;
      flockClock.dispose();
      figureClock.dispose();
      delete root.dataset.phoneCraneFigurePreroll;
    }
  };
}

/** Crane has no reverse source, so reverse uses the declared endpoint dissolve. */
export function createPhoneCraneReverseDissolve(
  render: (progress: number, direction: PhoneCranePlaybackDirection) => void,
  onComplete: () => void
): PhoneCraneReverseDissolve {
  let disposed = false;
  let active = false;
  let frame = 0;
  let startedAt = 0;
  const cancel = () => {
    if (!frame) return;
    window.cancelAnimationFrame(frame);
    frame = 0;
  };
  const tick: FrameRequestCallback = (now) => {
    frame = 0;
    if (!active || disposed) return;
    const elapsed = clamp((now - startedAt) / PHONE_CRANE_REVERSE_DISSOLVE_MS);
    render(PHONE_CRANE_STABLE_HOLD_PROGRESS * (1 - elapsed), -1);
    if (elapsed >= 1) {
      active = false;
      onComplete();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };
  return {
    start() {
      if (disposed || active) return;
      cancel();
      active = true;
      startedAt = performance.now();
      render(PHONE_CRANE_STABLE_HOLD_PROGRESS, -1);
      frame = window.requestAnimationFrame(tick);
    },
    stop() {
      active = false;
      cancel();
    },
    dispose() {
      active = false;
      disposed = true;
      cancel();
    }
  };
}
