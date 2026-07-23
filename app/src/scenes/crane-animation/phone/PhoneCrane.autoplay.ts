import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import {
  CRANE_PLAYBACK_MS,
  CRANE_TIMELINE_DURATION_SECONDS,
  CRANE_VIDEO_END_SECONDS,
  prepareCraneAnimationFrame
} from '..';
import {
  createPhoneNativeAutoplay,
  type PhoneNativeAutoplay
} from '../../../production/phone/phone-native-autoplay';
import {
  createPhonePresentedReversePlayback,
  type PhonePresentedReversePlayback
} from '../../../production/phone/phone-presented-reverse-playback';
import {
  type PhoneCranePlaybackDirection
} from './PhoneCrane.motion';

const FIGURE_START_SECONDS = 0.5;
const FLOCK_END_SECONDS = 2.5;

/** The desktop figure starts at 0.5s and owns the rest of the 3s timeline. */
export const PHONE_CRANE_FIGURE_MEDIA_SECONDS = Math.max(
  0.001,
  CRANE_TIMELINE_DURATION_SECONDS - FIGURE_START_SECONDS
);
/** Desktop plays the safe 2.467s endpoint across the authored 2.5s lane. */
export const PHONE_CRANE_FIGURE_PLAYBACK_RATE = (
  CRANE_VIDEO_END_SECONDS / PHONE_CRANE_FIGURE_MEDIA_SECONDS
);
/** Desktop stretches the shared 2.467s safe endpoint across the 2.5s lane. */
export const PHONE_CRANE_FLOCK_MEDIA_SECONDS = FLOCK_END_SECONDS;
export const PHONE_CRANE_FLOCK_PLAYBACK_RATE = (
  CRANE_VIDEO_END_SECONDS / PHONE_CRANE_FLOCK_MEDIA_SECONDS
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

export function phoneCraneTimelineProgressForFlockMediaProgress(
  rawProgress: number
): number {
  return clamp(
    clamp(rawProgress)
      * PHONE_CRANE_FLOCK_MEDIA_SECONDS
      / CRANE_TIMELINE_DURATION_SECONDS
  );
}

export type PhoneCraneForwardRun = Readonly<{
  start(): void;
  stop(): void;
  dispose(): void;
}>;

export type PhoneCranePresentedReverse = PhonePresentedReversePlayback;

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
  let firstVisibleFrameReady = false;

  const markFrameReady = (video: HTMLVideoElement, owner: 'figure' | 'flock') => {
    video.dataset.phoneCraneFrameReady = 'true';
    video.dataset.timelineVideoFrameReady = 'true';
    video.dataset.phoneCraneNativePlayback = `playing-${owner}`;
    root.dataset.phoneCraneMedia = 'playing';
    if (owner === 'flock' && !firstVisibleFrameReady) {
      firstVisibleFrameReady = true;
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
      if (!figureStarted) {
        fail();
        return;
      }
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
      const authoredSeconds = progress * PHONE_CRANE_FLOCK_MEDIA_SECONDS;
      publishProgress(
        phoneCraneTimelineProgressForFlockMediaProgress(progress)
      );
      if (
        active
        && !figureStarted
        && authoredSeconds >= FIGURE_START_SECONDS
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
    // The safe video endpoint is 33ms shorter than the authored flock lane.
    // Publish the lane endpoint explicitly so the retained Canvas is already
    // fully transparent while the figure owns the final half-second.
    onComplete: () => publishProgress(
      phoneCraneTimelineProgressForFlockMediaProgress(1)
    ),
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
      firstVisibleFrameReady = false;
      lastProgress = 0;
      delete flock.dataset.phoneCraneFrameReady;
      delete figure.dataset.phoneCraneFrameReady;
      delete flock.dataset.timelineVideoFrameReady;
      delete figure.dataset.timelineVideoFrameReady;
      delete root.dataset.phoneCraneFigurePreroll;
      render(0, 1);
      figure.playbackRate = PHONE_CRANE_FIGURE_PLAYBACK_RATE;
      flock.playbackRate = PHONE_CRANE_FLOCK_PLAYBACK_RATE;
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

/**
 * Port d208a86's presented-frame reverse ownership to both Crane decoders.
 * The paper camera is published only after both matching packed-alpha frames
 * are ready, preventing the figure from freezing at its terminal frame while
 * Education is already being revealed.
 */
export function createPhoneCranePresentedReverse(
  root: HTMLElement,
  render: (progress: number, direction: PhoneCranePlaybackDirection) => void,
  onComplete: () => void,
  onFailure: () => void
): PhoneCranePresentedReverse {
  let runSequence = 0;
  let runId = 'phone-crane-reverse-0';
  const playback = createPhonePresentedReversePlayback({
    durationMs: CRANE_PLAYBACK_MS,
    prepare: async (progress) => {
      await prepareCraneAnimationFrame(root, progress, {
        runId,
        direction: -1
      });
      return true;
    },
    render: (progress) => render(progress, -1),
    onComplete,
    onError: onFailure,
    onStatus: (status) => {
      root.dataset.phoneCraneReverse = status;
    }
  });

  return {
    get active() {
      return playback.active;
    },
    start() {
      runSequence += 1;
      runId = `phone-crane-reverse-${runSequence}`;
      playback.start();
    },
    retry: playback.retry,
    stop: playback.stop,
    dispose() {
      playback.dispose();
      delete root.dataset.phoneCraneReverse;
    }
  };
}
