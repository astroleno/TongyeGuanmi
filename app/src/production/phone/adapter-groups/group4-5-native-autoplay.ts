export type Group45NativeAutoplayStatus =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'blocked'
  | 'suspended'
  | 'complete'
  | 'error';

type VisibilityDocument = Pick<
  Document,
  'hidden' | 'addEventListener' | 'removeEventListener'
>;

export type Group45NativeAutoplayOptions = Readonly<{
  durationSeconds: number;
  onProgress(progress: number): void;
  onComplete?(): void;
  onError?(): void;
  onReady?(): void;
  onStatus?(status: Group45NativeAutoplayStatus): void;
  visibilityDocument?: VisibilityDocument;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frame: number) => void;
}>;

export type Group45NativeAutoplay = Readonly<{
  readonly active: boolean;
  start(): void;
  retry(): void;
  reset(endpoint?: 0 | 1): void;
  dispose(): void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Unit 5's direct-video equivalent of the accepted phone AOD controller.
 *
 * The decoder owns time after entry. Scroll only starts the run and remains
 * pinned by the shell. Unlike the old implementation, startup never waits on
 * a paused seek or requestVideoFrameCallback: iOS may begin decoding directly
 * from source time zero, and loaded/canplay evidence retries a blocked start.
 */
export function createGroup45NativeAutoplay(
  video: HTMLVideoElement,
  options: Group45NativeAutoplayOptions
): Group45NativeAutoplay {
  const visibilityDocument = options.visibilityDocument
    ?? (typeof document === 'undefined' ? undefined : document);
  const requestFrame = options.requestFrame
    ?? ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame
    ?? ((frame: number) => window.cancelAnimationFrame(frame));
  const duration = Math.max(.001, options.durationSeconds);
  let active = false;
  let disposed = false;
  let readyReported = false;
  let playPending = false;
  let frame = 0;
  let playAttempt = 0;

  const publishStatus = (status: Group45NativeAutoplayStatus) => {
    video.dataset.phoneGroup45Autoplay = status;
    options.onStatus?.(status);
  };

  const cancelScheduledFrame = () => {
    if (!frame) return;
    cancelFrame(frame);
    frame = 0;
  };

  const markReady = () => {
    video.dataset.phoneGroup45FrameReady = 'true';
    if (readyReported) return;
    readyReported = true;
    options.onReady?.();
  };

  const mediaProgress = () => clamp(video.currentTime / duration);

  const render = (forcedProgress?: number): number => {
    const progress = forcedProgress ?? mediaProgress();
    video.dataset.phoneGroup45AutoplayProgress = progress.toFixed(4);
    options.onProgress(progress);
    return progress;
  };

  const completeRun = () => {
    if (!active || disposed) return;
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    video.pause();
    markReady();
    publishStatus('complete');
    render(1);
    options.onComplete?.();
  };

  const renderAndComplete = () => {
    const progress = render();
    if (video.ended || progress >= .999) {
      completeRun();
      return true;
    }
    return false;
  };

  const tick: FrameRequestCallback = () => {
    frame = 0;
    if (!active || disposed || renderAndComplete()) return;
    if (!video.paused && !video.ended) {
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
    if (!video.paused && !video.ended) {
      publishStatus('playing');
      schedule();
      return;
    }
    const attempt = ++playAttempt;
    playPending = true;
    publishStatus('starting');
    let playback: Promise<void>;
    try {
      playback = Promise.resolve(video.play());
    } catch {
      playback = Promise.reject(new Error('native playback rejected'));
    }
    void playback.then(
      () => {
        if (disposed || !active || attempt !== playAttempt) return;
        playPending = false;
        markReady();
        publishStatus('playing');
        schedule();
      },
      () => {
        if (disposed || !active || attempt !== playAttempt) return;
        playPending = false;
        publishStatus('blocked');
      }
    );
  };

  const onFrameEvidence = () => {
    markReady();
    if (!active || renderAndComplete()) return;
    if (video.paused && !visibilityDocument?.hidden) play();
    else schedule();
  };
  const onPlay = () => {
    if (!active) {
      video.pause();
      return;
    }
    markReady();
    publishStatus('playing');
    schedule();
  };
  const onPause = () => {
    cancelScheduledFrame();
    if (active) render();
  };
  const onEnded = () => completeRun();
  const onMediaError = () => {
    if (disposed) return;
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    publishStatus('error');
    options.onError?.();
  };
  const onVisibilityChange = () => {
    if (!active) return;
    if (visibilityDocument?.hidden) {
      playAttempt += 1;
      playPending = false;
      video.pause();
      publishStatus('suspended');
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
  video.addEventListener('error', onMediaError);
  visibilityDocument?.addEventListener('visibilitychange', onVisibilityChange);

  const stopCurrentRun = () => {
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    video.pause();
  };

  if (video.readyState >= 2) {
    markReady();
  }

  return {
    get active() {
      return active;
    },
    start() {
      if (disposed) return;
      if (active) {
        play();
        return;
      }
      stopCurrentRun();
      try {
        video.currentTime = 0;
      } catch {
        // A source without metadata still begins at zero when play() resolves.
      }
      video.autoplay = false;
      video.loop = false;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.playbackRate = 1;
      active = true;
      render(0);
      publishStatus('starting');
      play();
    },
    retry() {
      play();
    },
    reset(endpoint = 0) {
      if (disposed) return;
      stopCurrentRun();
      try {
        video.currentTime = endpoint === 1 ? duration : 0;
      } catch {
        // A not-yet-loaded endpoint is still represented by canonical progress.
      }
      publishStatus(endpoint === 1 ? 'complete' : 'idle');
      render(endpoint);
    },
    dispose() {
      if (disposed) return;
      stopCurrentRun();
      disposed = true;
      video.removeEventListener('loadeddata', onFrameEvidence);
      video.removeEventListener('canplay', onFrameEvidence);
      video.removeEventListener('timeupdate', onFrameEvidence);
      video.removeEventListener('seeked', onFrameEvidence);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onMediaError);
      visibilityDocument?.removeEventListener('visibilitychange', onVisibilityChange);
      delete video.dataset.phoneGroup45Autoplay;
      delete video.dataset.phoneGroup45AutoplayProgress;
      delete video.dataset.phoneGroup45FrameReady;
    }
  };
}
