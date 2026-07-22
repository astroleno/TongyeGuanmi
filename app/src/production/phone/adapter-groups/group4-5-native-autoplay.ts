export type Group45NativeAutoplayStatus =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'blocked'
  | 'suspended'
  | 'complete'
  | 'error';

export type Group45NativeAutoplayDirection = 1 | -1;

type VisibilityDocument = Pick<
  Document,
  'hidden' | 'addEventListener' | 'removeEventListener'
>;

export type Group45NativeAutoplayOptions = Readonly<{
  durationSeconds: number;
  onProgress(
    progress: number,
    direction: Group45NativeAutoplayDirection
  ): void;
  onComplete?(direction: Group45NativeAutoplayDirection): void;
  onError?(): void;
  onReady?(): void;
  onStatus?(
    status: Group45NativeAutoplayStatus,
    direction: Group45NativeAutoplayDirection
  ): void;
  visibilityDocument?: VisibilityDocument;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frame: number) => void;
}>;

export type Group45NativeAutoplay = Readonly<{
  readonly active: boolean;
  start(direction?: Group45NativeAutoplayDirection): void;
  retry(): void;
  reset(endpoint?: 0 | 1): void;
  dispose(): void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const ENDPOINT_REUSE_TOLERANCE_SECONDS = .05;

/**
 * Reassigning currentTime to an already-presented Safari frame can briefly
 * clear its hardware video plane. Keep the physical endpoint when decoded
 * current data already covers the requested time.
 */
export function group45VideoNeedsEndpointSeek(
  currentTime: number,
  readyState: number,
  seeking: boolean,
  targetTime: number
): boolean {
  return readyState < 2
    || seeking
    || Math.abs(currentTime - targetTime) > ENDPOINT_REUSE_TOLERANCE_SECONDS;
}

/**
 * Unit 5's direct-video equivalent of the accepted phone AOD controller.
 *
 * The decoder owns forward time after entry. Scroll only starts the run and
 * remains pinned by the shell. Reverse runs publish the same canonical clock
 * while the scene adapter's shared timeline driver coalesces decoder seeks;
 * this controller never races that driver by writing every intermediate
 * playhead itself.
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
  let direction: Group45NativeAutoplayDirection = 1;
  let reverseProgress = 1;
  let reverseElapsedMs = 0;
  let reverseFrameTime: number | undefined;

  const publishStatus = (status: Group45NativeAutoplayStatus) => {
    video.dataset.phoneGroup45Autoplay = status;
    video.dataset.phoneGroup45AutoplayDirection = direction === 1
      ? 'forward'
      : 'reverse';
    options.onStatus?.(status, direction);
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
    const progress = forcedProgress
      ?? (direction === 1 ? mediaProgress() : reverseProgress);
    video.dataset.phoneGroup45AutoplayProgress = progress.toFixed(4);
    options.onProgress(progress, direction);
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
    const endpoint = direction === 1 ? 1 : 0;
    render(endpoint);
    options.onComplete?.(direction);
  };

  const renderAndComplete = () => {
    const progress = render();
    const complete = direction === 1
      ? video.ended || progress >= .999
      : progress <= .001;
    if (complete) {
      completeRun();
      return true;
    }
    return false;
  };

  const tick: FrameRequestCallback = (time) => {
    frame = 0;
    if (direction === -1) {
      if (!active || disposed || visibilityDocument?.hidden) return;
      if (reverseFrameTime === undefined) reverseFrameTime = time;
      const elapsed = Math.max(0, time - reverseFrameTime);
      reverseFrameTime = time;
      reverseElapsedMs += elapsed;
      reverseProgress = clamp(1 - reverseElapsedMs / (duration * 1000));
      if (renderAndComplete()) return;
      frame = requestFrame(tick);
      return;
    }
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
      || direction !== 1
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
    if (direction === -1) {
      publishStatus('playing');
      schedule();
      return;
    }
    if (video.paused && !visibilityDocument?.hidden) play();
    else schedule();
  };
  const onPlay = () => {
    if (!active) {
      video.pause();
      return;
    }
    if (direction === -1) {
      video.pause();
      publishStatus('playing');
      schedule();
      return;
    }
    markReady();
    publishStatus('playing');
    schedule();
  };
  const onPause = () => {
    if (direction === 1) {
      cancelScheduledFrame();
      if (active) render();
    }
  };
  const onEnded = () => {
    if (direction === 1) completeRun();
  };
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
      reverseFrameTime = undefined;
      cancelScheduledFrame();
      video.pause();
      publishStatus('suspended');
      return;
    }
    if (direction === 1) play();
    else {
      publishStatus('playing');
      schedule();
    }
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
    reverseFrameTime = undefined;
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
    start(nextDirection = 1) {
      if (disposed) return;
      if (active && direction === nextDirection) {
        if (direction === 1) play();
        else schedule();
        return;
      }
      stopCurrentRun();
      direction = nextDirection;
      reverseProgress = 1;
      reverseElapsedMs = 0;
      reverseFrameTime = undefined;
      const endpointTime = direction === 1 ? 0 : duration;
      if (group45VideoNeedsEndpointSeek(
        video.currentTime,
        video.readyState,
        video.seeking,
        endpointTime
      )) {
        try {
          video.currentTime = endpointTime;
        } catch {
          // loadeddata/canplay will retry once the endpoint can be addressed.
        }
      }
      video.autoplay = false;
      video.loop = false;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.playbackRate = 1;
      active = true;
      render(direction === 1 ? 0 : 1);
      publishStatus('starting');
      if (direction === 1) {
        play();
      } else if (video.readyState >= 2) {
        markReady();
        publishStatus('playing');
        schedule();
      }
    },
    retry() {
      if (direction === 1) play();
      else if (active && video.readyState >= 2) {
        markReady();
        publishStatus('playing');
        schedule();
      }
    },
    reset(endpoint = 0) {
      if (disposed) return;
      stopCurrentRun();
      direction = endpoint === 1 ? -1 : 1;
      reverseProgress = endpoint;
      reverseElapsedMs = endpoint === 1 ? 0 : duration * 1000;
      const endpointTime = endpoint === 1 ? duration : 0;
      if (group45VideoNeedsEndpointSeek(
        video.currentTime,
        video.readyState,
        video.seeking,
        endpointTime
      )) {
        try {
          video.currentTime = endpointTime;
        } catch {
          // A not-yet-loaded endpoint is still represented by canonical progress.
        }
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
      delete video.dataset.phoneGroup45AutoplayDirection;
      delete video.dataset.phoneGroup45AutoplayProgress;
      delete video.dataset.phoneGroup45FrameReady;
    }
  };
}
