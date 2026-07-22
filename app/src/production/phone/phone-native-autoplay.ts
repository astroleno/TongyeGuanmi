type VisibilityDocument = Pick<
  Document,
  'hidden' | 'addEventListener' | 'removeEventListener'
>;
type PhoneNativeTimer = ReturnType<typeof setTimeout>;

export type PhoneNativeAutoplay = Readonly<{
  start(): void;
  retry(): void;
  stop(): void;
  reset(): void;
  dispose(): void;
}>;

type PhoneNativeAutoplayOptions = Readonly<{
  durationSeconds: number;
  stallTimeoutMs?: number;
  onProgress(progress: number): void;
  onComplete(): void;
  onFailure(): void;
  onFrameReady?(): void;
  visibilityDocument?: VisibilityDocument;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frame: number) => void;
  setTimer?: (callback: () => void, timeoutMs: number) => PhoneNativeTimer;
  clearTimer?: (timer: PhoneNativeTimer) => void;
}>;

const HAVE_CURRENT_DATA = 2;
export const PHONE_NATIVE_AUTOPLAY_STALL_TIMEOUT_MS = 2000;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Unit 6's native media clock is the AOD Route-B playback policy without any
 * AOD-specific retiming. Scroll chooses the run boundary; currentTime is the
 * only forward progress clock, and media events retry a blocked lazy decode.
 * As in AOD, this controller never calls play() before start(): an inactive,
 * hidden Safari decoder can leave that promise pending and block the real run.
 */
export function createPhoneNativeAutoplay(
  video: HTMLVideoElement,
  options: PhoneNativeAutoplayOptions
): PhoneNativeAutoplay {
  const visibilityDocument = options.visibilityDocument
    ?? (typeof document === 'undefined' ? undefined : document);
  const requestFrame = options.requestFrame
    ?? ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame
    ?? ((frame: number) => window.cancelAnimationFrame(frame));
  const setTimer = options.setTimer
    ?? ((callback: () => void, timeoutMs: number) => globalThis.setTimeout(callback, timeoutMs));
  const clearTimer = options.clearTimer
    ?? ((timer: PhoneNativeTimer) => globalThis.clearTimeout(timer));
  const duration = Math.max(0.001, options.durationSeconds);
  const stallTimeoutMs = Math.max(
    1,
    options.stallTimeoutMs ?? PHONE_NATIVE_AUTOPLAY_STALL_TIMEOUT_MS
  );
  let active = false;
  let disposed = false;
  let playPending = false;
  let playAttempt = 0;
  let frame = 0;
  let stallTimer: PhoneNativeTimer | undefined;
  let lastEvidenceProgress = 0;

  const cancelScheduledFrame = () => {
    if (!frame) return;
    cancelFrame(frame);
    frame = 0;
  };

  const cancelStallTimer = () => {
    if (stallTimer === undefined) return;
    clearTimer(stallTimer);
    stallTimer = undefined;
  };

  const fail = () => {
    if (!active || disposed) return;
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    cancelStallTimer();
    video.pause();
    video.dataset.phoneNativeAutoplay = 'failed';
    options.onFailure();
  };

  const armStallTimer = () => {
    cancelStallTimer();
    if (!active || disposed || visibilityDocument?.hidden) return;
    stallTimer = setTimer(fail, stallTimeoutMs);
  };

  const progress = () => clamp(video.currentTime / duration);

  const render = (forcedProgress?: number) => {
    const nextProgress = forcedProgress ?? progress();
    video.dataset.phoneNativeAutoplayProgress = nextProgress.toFixed(4);
    options.onProgress(nextProgress);
    return nextProgress;
  };

  const complete = () => {
    if (!active || disposed) return;
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    cancelStallTimer();
    video.pause();
    video.dataset.phoneNativeAutoplay = 'complete';
    render(1);
    options.onComplete();
  };

  const renderAndComplete = () => {
    const nextProgress = render();
    if (nextProgress < 0.999) return false;
    complete();
    return true;
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

  const markFrameReady = () => {
    if (video.readyState < HAVE_CURRENT_DATA) return;
    video.dataset.phoneNativeFrameReady = 'true';
    options.onFrameReady?.();
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
    video.dataset.phoneNativeAutoplay = 'starting';
    let playback: Promise<void> | undefined;
    try {
      playback = video.play();
    } catch {
      playback = Promise.reject(new Error('native playback rejected'));
    }
    void Promise.resolve(playback).then(
      () => {
        if (disposed || !active || attempt !== playAttempt) return;
        playPending = false;
        // iOS's one-time media unlock can resolve after this run starts and
        // immediately pause the same muted decoder. Recover that race while
        // the native run still owns time.
        if (video.paused) {
          play();
          return;
        }
        video.dataset.phoneNativeAutoplay = 'playing';
        markFrameReady();
        schedule();
      },
      () => {
        if (disposed || !active || attempt !== playAttempt) return;
        playPending = false;
        video.dataset.phoneNativeAutoplay = 'blocked';
      }
    );
  };

  const onFrameEvidence = () => {
    if (!active) return;
    markFrameReady();
    if (renderAndComplete()) return;
    const nextProgress = progress();
    if (nextProgress > lastEvidenceProgress + 0.001) {
      lastEvidenceProgress = nextProgress;
      armStallTimer();
    }
    if (video.paused && !visibilityDocument?.hidden) play();
  };
  const onPlay = () => {
    if (!active || disposed) return;
    video.dataset.phoneNativeAutoplay = 'playing';
    markFrameReady();
    armStallTimer();
    schedule();
  };
  const onPause = () => {
    cancelScheduledFrame();
    if (!active) return;
    render();
    if (!visibilityDocument?.hidden) play();
  };
  const onEnded = () => complete();
  const onError = () => fail();
  const onVisibilityChange = () => {
    if (!active) return;
    if (visibilityDocument?.hidden) {
      playAttempt += 1;
      playPending = false;
      cancelStallTimer();
      video.pause();
      video.dataset.phoneNativeAutoplay = 'suspended';
      return;
    }
    armStallTimer();
    play();
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

  const stopCurrentRun = () => {
    active = false;
    playAttempt += 1;
    playPending = false;
    cancelScheduledFrame();
    cancelStallTimer();
    video.pause();
  };

  return {
    start() {
      if (disposed) return;
      stopCurrentRun();
      try {
        video.currentTime = 0;
      } catch {
        // Metadata may still be pending; loadeddata presents frame zero.
      }
      video.autoplay = false;
      video.loop = false;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('webkit-playsinline', 'true');
      active = true;
      lastEvidenceProgress = 0;
      video.dataset.phoneNativeAutoplay = 'starting';
      render(0);
      armStallTimer();
      play();
    },
    retry() {
      armStallTimer();
      play();
    },
    stop() {
      stopCurrentRun();
    },
    reset() {
      if (disposed) return;
      stopCurrentRun();
      try {
        video.currentTime = 0;
      } catch {
        // Metadata may still be pending; the source remains reusable.
      }
      video.dataset.phoneNativeAutoplay = 'idle';
      render(0);
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
      video.removeEventListener('error', onError);
      visibilityDocument?.removeEventListener('visibilitychange', onVisibilityChange);
      delete video.dataset.phoneNativeAutoplay;
      delete video.dataset.phoneNativeAutoplayProgress;
      delete video.dataset.phoneNativeFrameReady;
    }
  };
}
