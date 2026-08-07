import { setPackedAlphaVideoSource } from '../../media/packed-alpha-video';
import {
  AOD_PHONE_TIMELINE_ALPHA_START,
  AOD_TIMELINE_ALPHA_END,
  aodPlaybackRateForMediaProgress,
  mapAodMediaToTimelineProgress,
  mapAodTimelineToMediaProgress
} from '../../scenes/aod-animation/progress';
import type { PhoneAodExecution } from './phone-story/runtime';
export {
  PHONE_AOD_METHOD_START_PROGRESS,
  phoneAodMethodProgress
} from './transitions/aod-method-top';

type VisibilityDocument = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;

export type PhoneAodPlaybackDirection = 1 | -1;

export type PhoneAodStartResult = 'playing' | 'blocked' | 'error';

export type PhoneAodPresentation = Readonly<{
  figureScale: number;
  figureShiftYVh: number;
  bottomMistOpacity: number;
}>;

export type PhoneAodBackdropPresentation = Readonly<{
  sunYVh: number;
  cloudYVh: number;
}>;

type PhoneAodAutoplayOptions = Readonly<{
  durationSeconds: number;
  alphaEndProgress?: number;
  sourceUrl?: string;
  driveReverseFrame?(mediaProgress: number, runId: string): void;
  disposeReverseDriver?(): void;
  onProgress(
    progress: number,
    execution: PhoneAodExecution | null
  ): void;
  onComplete?(
    execution: PhoneAodExecution | null
  ): void;
  visibilityDocument?: VisibilityDocument;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frame: number) => void;
}>;

export type PhoneAodAutoplay = Readonly<{
  start(execution?: PhoneAodExecution | null): Promise<PhoneAodStartResult>;
  reset(): void;
  dispose(): void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sameExecution(
  left: PhoneAodExecution | null,
  right: PhoneAodExecution | null
): boolean {
  return left === right;
}

function smoothstep(value: number): number {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

/**
 * The packed AOD plate is 16:9, while the phone stage is much taller.
 * Keep the plate on one lower phone camera and zoom it from the first
 * playback frame while the paper mist rises underneath it. Scale is the only
 * camera motion, removing both the initial upward pull and the late lower-edge
 * seam in either playback direction.
 */
export function phoneAodPresentation(
  rawProgress: number
): PhoneAodPresentation {
  const progress = clamp(rawProgress);
  const coverProgress = smoothstep(progress / 0.72);
  const mistProgress = smoothstep(
    (progress - AOD_PHONE_TIMELINE_ALPHA_START)
      / (0.68 - AOD_PHONE_TIMELINE_ALPHA_START)
  );

  return {
    figureScale: 1 + coverProgress * 0.46,
    // Phone ignores the desktop figure-y track. A fixed lower camera
    // prevents the plate from climbing at playback start and reserves more
    // overscan for the lower browser edge while scale alone creates motion.
    figureShiftYVh: 9,
    bottomMistOpacity: mistProgress * 0.96
  };
}

/**
 * The near cloud leaves faster and travels farther than the sun. Both tracks
 * start at AOD progress zero, so their parallax begins on the same native
 * playback frame as the packed-alpha figure and reverses through the same
 * canonical progress.
 */
export function phoneAodBackdropPresentation(
  rawProgress: number
): PhoneAodBackdropPresentation {
  const progress = clamp(rawProgress);
  const cloudProgress = smoothstep(progress / 0.38);
  const sunProgress = smoothstep(progress / 0.47);

  return {
    sunYVh: -108 * sunProgress,
    cloudYVh: -124 * cloudProgress
  };
}

/**
 * Route B keeps native decoder time for the forward run. The reverse run uses
 * the shared timeline driver against the same short-GOP packed-alpha source,
 * so AOD follows the same single-media contract as the other story videos.
 * Scroll still only decides when either uninterrupted run begins.
 */
export function createPhoneAodAutoplay(
  video: HTMLVideoElement,
  options: PhoneAodAutoplayOptions
): PhoneAodAutoplay {
  const visibilityDocument = options.visibilityDocument
    ?? (typeof document === 'undefined' ? undefined : document);
  const requestFrame = options.requestFrame
    ?? ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame
    ?? ((frame: number) => window.cancelAnimationFrame(frame));
  const duration = Math.max(0.001, options.durationSeconds);
  const alphaEnd = options.alphaEndProgress ?? AOD_TIMELINE_ALPHA_END;
  let active = false;
  let disposed = false;
  let playPending = false;
  let frame = 0;
  let playAttempt = 0;
  let direction: PhoneAodPlaybackDirection = 1;
  let sourceSelected = false;
  let runRevision = 0;
  let reverseProgress = 1;
  let reverseAnchorProgress = 1;
  let reverseStartedAt: number | undefined;
  let execution: PhoneAodExecution | null = null;
  let resolveStart: ((result: PhoneAodStartResult) => void) | undefined;

  const beginStartResult = () => (
    new Promise<PhoneAodStartResult>((resolve) => {
      resolveStart = resolve;
    })
  );
  const settleStart = (result: PhoneAodStartResult) => {
    const resolve = resolveStart;
    resolveStart = undefined;
    resolve?.(result);
  };

  const publishPlaybackOwnership = (phase: string) => {
    video.dataset.timelineVideoRun = `phone-aod-${phase}:${runRevision}`;
  };

  const cancelScheduledFrame = () => {
    if (frame) {
      cancelFrame(frame);
      frame = 0;
    }
  };

  const mediaProgress = () => clamp(video.currentTime / duration);

  const canonicalProgress = () => (
    mapAodMediaToTimelineProgress(mediaProgress(), alphaEnd)
  );

  const applyPlaybackRate = () => {
    const playbackRate = aodPlaybackRateForMediaProgress(mediaProgress(), alphaEnd);
    if (Math.abs(video.playbackRate - playbackRate) > 0.001) {
      video.playbackRate = playbackRate;
    }
  };

  const render = (forcedProgress?: number, nativeRate = direction === 1): number => {
    if (disposed) {
      return direction === 1 ? 0 : 1;
    }
    const progress = forcedProgress ?? canonicalProgress();
    if (nativeRate) {
      applyPlaybackRate();
    }
    if (import.meta.env.DEV) {
      video.dataset.phoneAodAutoplayProgress = progress.toFixed(4);
    }
    if (import.meta.env.DEV) {
      video.dataset.phoneAodAutoplayDirection = direction === 1
        ? 'forward'
        : 'reverse';
    }
    options.onProgress(progress, execution);
    return progress;
  };

  const completeRun = () => {
    if (!active || disposed) {
      return;
    }
    const completedDirection = direction;
    const completedExecution = execution;
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    video.pause();
    if (import.meta.env.DEV) {
      video.dataset.phoneAodAutoplay = completedDirection === 1
        ? 'complete-forward'
        : 'complete-reverse';
    }
    publishPlaybackOwnership(
      completedDirection === 1 ? 'complete-forward' : 'complete-reverse'
    );
    render(completedDirection === 1 ? 1 : 0, false);
    options.onComplete?.(completedExecution);
    execution = null;
  };

  const renderForwardAndComplete = () => {
    const progress = render();
    if (progress >= 0.999) {
      completeRun();
      return true;
    }
    return false;
  };

  const renderReverseFrame = (progress: number) => {
    reverseProgress = clamp(progress);
    render(reverseProgress, false);
    if (video.readyState < 2) {
      return;
    }
    options.driveReverseFrame?.(
      mapAodTimelineToMediaProgress(reverseProgress, alphaEnd),
      `phone-aod-reverse:${runRevision}`
    );
  };

  const tick: FrameRequestCallback = (timestamp) => {
    frame = 0;
    if (!active || disposed || visibilityDocument?.hidden) {
      return;
    }
    if (direction === -1) {
      if (video.readyState < 2) {
        if (import.meta.env.DEV) {
          video.dataset.phoneAodAutoplay = 'waiting-reverse-frame';
        }
        // `loadeddata`/`canplay` are advisory evidence, not a reliable clock
        // on iOS after a source is rebound. Keep the same execution alive and
        // poll on the route-owned frame clock until the decoder can expose a
        // real reverse frame. Returning without re-arming here strands the
        // admission promise forever when WebKit misses the media event.
        frame = requestFrame(tick);
        return;
      }
      reverseStartedAt ??= timestamp;
      const elapsedSeconds = Math.max(0, timestamp - reverseStartedAt) / 1000;
      const progress = reverseAnchorProgress - elapsedSeconds / duration;
      renderReverseFrame(progress);
      // The frame clock is the fallback evidence path when WebKit does not
      // emit loadeddata/canplay after a source rebind. Once the decoder is
      // actually ready and this tick has submitted its physical frame, join
      // the playback fact instead of leaving the admission promise pending.
      if (resolveStart) {
        if (import.meta.env.DEV) {
          video.dataset.phoneAodAutoplay = 'playing-reverse-timeline';
        }
        settleStart('playing');
      }
      if (reverseProgress <= 0.001) {
        completeRun();
        return;
      }
      frame = requestFrame(tick);
      return;
    }
    if (renderForwardAndComplete()) {
      return;
    }
    if (active && !video.paused && !video.ended) {
      frame = requestFrame(tick);
    }
  };

  const schedule = () => {
    if (!disposed && active && !frame) {
      frame = requestFrame(tick);
    }
  };

  const playForward = () => {
    if (
      disposed
      || !active
      || direction !== 1
      || playPending
      || visibilityDocument?.hidden
    ) {
      return;
    }
    const attempt = ++playAttempt;
    playPending = true;
    if (import.meta.env.DEV) video.dataset.phoneAodAutoplay = 'starting';
    void Promise.resolve(video.play()).then(
      () => {
        if (disposed || !active || attempt !== playAttempt) {
          return;
        }
        playPending = false;
        if (import.meta.env.DEV) video.dataset.phoneAodAutoplay = 'playing';
        settleStart('playing');
        schedule();
      },
      () => {
        if (disposed || !active || attempt !== playAttempt) {
          return;
        }
        playPending = false;
        if (import.meta.env.DEV) video.dataset.phoneAodAutoplay = 'blocked';
        active = false;
        settleStart('blocked');
      }
    );
  };

  const onFrameEvidence = (event: Event) => {
    if (!active) {
      return;
    }
    if (direction === -1) {
      if (event.type === 'loadeddata' || event.type === 'canplay') {
        if (import.meta.env.DEV) {
          video.dataset.phoneAodAutoplay = 'playing-reverse-timeline';
        }
        renderReverseFrame(reverseProgress);
        settleStart('playing');
      }
      schedule();
      return;
    }
    if (renderForwardAndComplete()) {
      return;
    }
    if (active && video.paused && !visibilityDocument?.hidden) {
      playForward();
    }
  };
  const onPlay = () => {
    if (direction !== 1) {
      video.pause();
      return;
    }
    if (import.meta.env.DEV) video.dataset.phoneAodAutoplay = 'playing';
    schedule();
  };
  const onPause = () => {
    if (direction === 1) {
      cancelScheduledFrame();
    }
    if (active && direction === 1) {
      render();
    }
  };
  const onEnded = () => {
    if (direction === 1) {
      completeRun();
    }
  };
  const onError = () => {
    if (!active) return;
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    if (import.meta.env.DEV) video.dataset.phoneAodAutoplay = 'failed';
    settleStart('error');
  };
  const onVisibilityChange = () => {
    if (!active) {
      return;
    }
    if (visibilityDocument?.hidden) {
      playAttempt += 1;
      playPending = false;
      if (direction === -1) {
        reverseAnchorProgress = reverseProgress;
        reverseStartedAt = undefined;
        cancelScheduledFrame();
      } else {
        video.pause();
      }
      if (import.meta.env.DEV) video.dataset.phoneAodAutoplay = 'suspended';
      return;
    }
    if (direction === -1) {
      if (import.meta.env.DEV) {
        video.dataset.phoneAodAutoplay = 'playing-reverse-timeline';
      }
      schedule();
    } else {
      playForward();
    }
  };

  video.addEventListener('loadeddata', onFrameEvidence);
  video.addEventListener('canplay', onFrameEvidence);
  video.addEventListener('timeupdate', onFrameEvidence);
  video.addEventListener('seeked', onFrameEvidence);
  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('ended', onEnded);
  video.addEventListener('error', onError);
  visibilityDocument?.addEventListener('visibilitychange', onVisibilityChange);

  const selectSource = (force = false) => {
    if (sourceSelected && !force) {
      return;
    }
    if (options.sourceUrl) {
      setPackedAlphaVideoSource(video, options.sourceUrl);
    }
    sourceSelected = true;
  };

  const stopCurrentRun = () => {
    if (resolveStart) {
      settleStart('error');
    }
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    video.pause();
    reverseStartedAt = undefined;
    options.disposeReverseDriver?.();
  };

  return {
    start(nextExecution = null) {
      if (disposed) {
        return Promise.resolve('error');
      }
      const nextDirection = nextExecution?.[1] ?? 1;
      if (active && sameExecution(execution, nextExecution)) {
        if (direction === -1) {
          schedule();
        } else {
          playForward();
        }
        return Promise.resolve('playing');
      }
      stopCurrentRun();
      const result = beginStartResult();
      direction = nextDirection;
      execution = nextExecution;
      // Safari can discard decoded data after the forward leg retires its
      // compositor. Rebind the source before a reverse leg when no decoder
      // frame is currently available; otherwise the reverse timeline can
      // wait forever for a loadeddata event that belongs to the old source
      // generation.
      selectSource(direction === -1 && video.readyState < 2);
      runRevision += 1;
      publishPlaybackOwnership(direction === 1 ? 'forward' : 'reverse');
      active = true;
      video.autoplay = false;
      video.loop = false;
      video.muted = true;
      video.playsInline = true;
      if (import.meta.env.DEV) {
        video.dataset.phoneAodAutoplay = direction === 1
          ? 'starting-forward'
          : 'playing-reverse-timeline';
      }
      if (direction === 1) {
        try {
          video.currentTime = 0;
        } catch {
          // A newly selected source starts at frame zero after loadeddata.
        }
        render(0);
        playForward();
        return result;
      }
      video.playbackRate = 1;
      reverseProgress = 1;
      reverseAnchorProgress = 1;
      reverseStartedAt = undefined;
      renderReverseFrame(1);
      if (video.readyState >= 2) settleStart('playing');
      schedule();
      return result;
    },
    reset() {
      if (disposed) {
        return;
      }
      stopCurrentRun();
      execution = null;
      direction = 1;
      selectSource();
      runRevision += 1;
      publishPlaybackOwnership('idle');
      try {
        video.currentTime = 0;
      } catch {
        // Metadata can still be pending; loadeddata will present frame zero.
      }
      if (import.meta.env.DEV) video.dataset.phoneAodAutoplay = 'idle';
      render(0);
    },
    dispose() {
      if (disposed) {
        return;
      }
      active = false;
      execution = null;
      disposed = true;
      playAttempt += 1;
      playPending = false;
      cancelScheduledFrame();
      video.pause();
      options.disposeReverseDriver?.();
      video.removeEventListener('loadeddata', onFrameEvidence);
      video.removeEventListener('canplay', onFrameEvidence);
      video.removeEventListener('timeupdate', onFrameEvidence);
      video.removeEventListener('seeked', onFrameEvidence);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      visibilityDocument?.removeEventListener('visibilitychange', onVisibilityChange);
      if (import.meta.env.DEV) {
        delete video.dataset.phoneAodAutoplay;
        delete video.dataset.phoneAodAutoplayProgress;
        delete video.dataset.phoneAodAutoplayDirection;
      }
      delete video.dataset.timelineVideoRun;
    }
  };
}
