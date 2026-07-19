import { setPackedAlphaVideoSource } from '../../media/packed-alpha-video';
import {
  aodPlaybackRateForMediaProgress,
  mapAodMediaToTimelineProgress
} from '../../scenes/aod-animation/progress';

export const PORTRAIT_AOD_METHOD_START_PROGRESS = 0.8;

type VisibilityDocument = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;

export type PortraitAodPlaybackDirection = 1 | -1;

export type PortraitAodPresentation = Readonly<{
  figureScale: number;
  figureShiftYVh: number;
  bottomMistOpacity: number;
}>;

export type PortraitAodBackdropPresentation = Readonly<{
  sunYVh: number;
  cloudYVh: number;
}>;

type PortraitAodAutoplayOptions = Readonly<{
  durationSeconds: number;
  forwardSourceUrl?: string;
  reverseSourceUrl?: string;
  onProgress(progress: number, direction: PortraitAodPlaybackDirection): void;
  onComplete?(direction: PortraitAodPlaybackDirection): void;
  visibilityDocument?: VisibilityDocument;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frame: number) => void;
}>;

export type PortraitAodAutoplay = Readonly<{
  start(direction?: PortraitAodPlaybackDirection): void;
  reset(): void;
  dispose(): void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

export function portraitAodMethodProgress(aodProgress: number): number {
  return clamp(
    (clamp(aodProgress) - PORTRAIT_AOD_METHOD_START_PROGRESS)
      / (1 - PORTRAIT_AOD_METHOD_START_PROGRESS)
  );
}

/**
 * The packed AOD plate is 16:9, while the portrait stage is much taller.
 * Keep the plate on one lower portrait camera and zoom it from the first
 * playback frame while the paper mist rises underneath it. Scale is the only
 * camera motion, removing both the initial upward pull and the late lower-edge
 * seam in either playback direction.
 */
export function portraitAodPresentation(
  rawProgress: number
): PortraitAodPresentation {
  const progress = clamp(rawProgress);
  const coverProgress = smoothstep(progress / 0.72);
  const mistProgress = smoothstep((progress - 0.48) / (0.68 - 0.48));

  return {
    figureScale: 1 + coverProgress * 0.46,
    // Portrait ignores the desktop figure-y track. A fixed lower camera
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
export function portraitAodBackdropPresentation(
  rawProgress: number
): PortraitAodBackdropPresentation {
  const progress = clamp(rawProgress);
  const cloudProgress = smoothstep(progress / 0.38);
  const sunProgress = smoothstep(progress / 0.47);

  return {
    sunYVh: -108 * sunProgress,
    cloudYVh: -124 * cloudProgress
  };
}

/**
 * Route B gives the AOD decoder native time ownership. Scroll only decides
 * when a forward or reverse run begins; each direction then plays a normal
 * H.264 source forwards so iOS never has to seek backwards through long GOPs.
 * The canonical progress remains 0 -> 1 in both directions, which makes the
 * Method entrance and every alpha/background layer genuinely reversible.
 */
export function createPortraitAodAutoplay(
  video: HTMLVideoElement,
  options: PortraitAodAutoplayOptions
): PortraitAodAutoplay {
  const visibilityDocument = options.visibilityDocument
    ?? (typeof document === 'undefined' ? undefined : document);
  const requestFrame = options.requestFrame
    ?? ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame
    ?? ((frame: number) => window.cancelAnimationFrame(frame));
  const duration = Math.max(0.001, options.durationSeconds);
  let active = false;
  let disposed = false;
  let playPending = false;
  let frame = 0;
  let playAttempt = 0;
  let direction: PortraitAodPlaybackDirection = 1;
  let selectedDirection: PortraitAodPlaybackDirection | 0 = 0;

  const cancelScheduledFrame = () => {
    if (frame) {
      cancelFrame(frame);
      frame = 0;
    }
  };

  const mediaProgress = () => clamp(video.currentTime / duration);

  const canonicalProgress = () => {
    const sourceProgress = direction === 1
      ? mediaProgress()
      : 1 - mediaProgress();
    return mapAodMediaToTimelineProgress(sourceProgress);
  };

  const applyPlaybackRate = () => {
    const sourceProgress = direction === 1
      ? mediaProgress()
      : 1 - mediaProgress();
    const playbackRate = aodPlaybackRateForMediaProgress(sourceProgress);
    if (Math.abs(video.playbackRate - playbackRate) > 0.001) {
      video.playbackRate = playbackRate;
    }
  };

  const render = (forcedProgress?: number): number => {
    if (disposed) {
      return direction === 1 ? 0 : 1;
    }
    const progress = forcedProgress ?? canonicalProgress();
    applyPlaybackRate();
    video.dataset.portraitAodAutoplayProgress = progress.toFixed(4);
    video.dataset.portraitAodAutoplayDirection = direction === 1 ? 'forward' : 'reverse';
    options.onProgress(progress, direction);
    return progress;
  };

  const runComplete = (progress: number) => (
    direction === 1 ? progress >= 0.999 : progress <= 0.001
  );

  const completeRun = () => {
    if (!active || disposed) {
      return;
    }
    const completedDirection = direction;
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    video.pause();
    video.dataset.portraitAodAutoplay = completedDirection === 1
      ? 'complete-forward'
      : 'complete-reverse';
    render(completedDirection === 1 ? 1 : 0);
    options.onComplete?.(completedDirection);
  };

  const renderAndComplete = () => {
    const progress = render();
    if (runComplete(progress)) {
      completeRun();
      return true;
    }
    return false;
  };

  const tick: FrameRequestCallback = () => {
    frame = 0;
    if (renderAndComplete()) {
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

  const play = () => {
    if (
      disposed
      || !active
      || playPending
      || visibilityDocument?.hidden
    ) {
      return;
    }
    const attempt = ++playAttempt;
    playPending = true;
    video.dataset.portraitAodAutoplay = 'starting';
    void Promise.resolve(video.play()).then(
      () => {
        if (disposed || !active || attempt !== playAttempt) {
          return;
        }
        playPending = false;
        video.dataset.portraitAodAutoplay = 'playing';
        schedule();
      },
      () => {
        if (disposed || !active || attempt !== playAttempt) {
          return;
        }
        playPending = false;
        video.dataset.portraitAodAutoplay = 'blocked';
      }
    );
  };

  const onFrameEvidence = () => {
    if (renderAndComplete()) {
      return;
    }
    if (active && video.paused && !visibilityDocument?.hidden) {
      play();
    }
  };
  const onPlay = () => {
    video.dataset.portraitAodAutoplay = 'playing';
    schedule();
  };
  const onPause = () => {
    cancelScheduledFrame();
    if (active) {
      render();
    }
  };
  const onEnded = () => {
    completeRun();
  };
  const onVisibilityChange = () => {
    if (!active) {
      return;
    }
    if (visibilityDocument?.hidden) {
      playAttempt += 1;
      playPending = false;
      video.pause();
      video.dataset.portraitAodAutoplay = 'suspended';
      return;
    }
    play();
  };

  video.addEventListener('loadeddata', onFrameEvidence);
  video.addEventListener('canplay', onFrameEvidence);
  video.addEventListener('timeupdate', onFrameEvidence);
  video.addEventListener('seeked', onFrameEvidence);
  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('ended', onEnded);
  visibilityDocument?.addEventListener('visibilitychange', onVisibilityChange);

  const selectSource = (nextDirection: PortraitAodPlaybackDirection) => {
    if (selectedDirection === nextDirection) {
      return;
    }
    const sourceUrl = nextDirection === 1
      ? options.forwardSourceUrl
      : options.reverseSourceUrl;
    if (sourceUrl) {
      setPackedAlphaVideoSource(video, sourceUrl);
    }
    selectedDirection = nextDirection;
  };

  const stopCurrentRun = () => {
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    video.pause();
  };

  return {
    start(nextDirection = 1) {
      if (disposed) {
        return;
      }
      if (active && direction === nextDirection) {
        play();
        return;
      }
      stopCurrentRun();
      direction = nextDirection;
      selectSource(direction);
      try {
        video.currentTime = 0;
      } catch {
        // A newly selected source starts at frame zero after loadeddata.
      }
      active = true;
      video.autoplay = false;
      video.loop = false;
      video.muted = true;
      video.playsInline = true;
      video.dataset.portraitAodAutoplay = direction === 1
        ? 'starting-forward'
        : 'starting-reverse';
      render(direction === 1 ? 0 : 1);
      play();
    },
    reset() {
      if (disposed) {
        return;
      }
      stopCurrentRun();
      direction = 1;
      selectSource(1);
      try {
        video.currentTime = 0;
      } catch {
        // Metadata can still be pending; loadeddata will present frame zero.
      }
      video.dataset.portraitAodAutoplay = 'idle';
      render(0);
    },
    dispose() {
      if (disposed) {
        return;
      }
      active = false;
      disposed = true;
      playAttempt += 1;
      playPending = false;
      cancelScheduledFrame();
      video.pause();
      video.removeEventListener('loadeddata', onFrameEvidence);
      video.removeEventListener('canplay', onFrameEvidence);
      video.removeEventListener('timeupdate', onFrameEvidence);
      video.removeEventListener('seeked', onFrameEvidence);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      visibilityDocument?.removeEventListener('visibilitychange', onVisibilityChange);
      delete video.dataset.portraitAodAutoplay;
      delete video.dataset.portraitAodAutoplayProgress;
      delete video.dataset.portraitAodAutoplayDirection;
    }
  };
}
