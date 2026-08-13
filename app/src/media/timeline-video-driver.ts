import type { Direction } from '../story/types';
import { MediaPreparationError } from './media-preparation';

export type TimelineVideoMode = 'timeline' | 'native-preferred';

export type TimelineVideoEndpointPolicy = Readonly<{
  start?: 'seek' | 'hold';
  end?: 'seek' | 'hold';
}>;

export type TimelineVideoDriveInput = Readonly<{
  runId: string;
  direction: Direction;
  progress: number;
  durationFallbackSeconds: number;
  startSeconds?: number;
  endSeconds?: number;
  endEpsilonSeconds?: number;
  timelineDurationMs?: number;
  mode?: TimelineVideoMode;
  nativePlaybackDirection?: Direction;
  endpointPolicy?: TimelineVideoEndpointPolicy;
  reducedMotion?: boolean | undefined;
  /**
   * WebKit can complete a paused HEVC seek without delivering its requested
   * video-frame callback. Keep this opt-in and limited to that browser/media
   * combination: the fallback still requires seek completion, decoded current
   * data, and a playhead within the accepted presentation window.
   */
  allowSeekedFrameFallback?: boolean | undefined;
  /** Keep a preparation seek paused; formal playback is issued by the runtime phase command. */
  allowPlaybackNudge?: boolean | undefined;
  /** Let a preparation started before the phase command hand playback back to the native clock. */
  preserveNativePlaybackOnSettle?: boolean | undefined;
  signal?: AbortSignal | undefined;
}>;

export type TimelineVideoFrameResult = Readonly<{
  status: 'ready' | 'stale';
  runId: string;
  direction: Direction;
  generation: number;
  targetTime: number;
}>;

export type TimelineVideoDriverSnapshot = Readonly<{
  runId: string | undefined;
  direction: Direction | undefined;
  generation: number;
  desiredProgress: number | undefined;
  targetTime: number | undefined;
  seekPending: boolean;
  nativeFallback: boolean;
  frameReady: boolean;
}>;

export type TimelineVideoDriver = Readonly<{
  drive(input: TimelineVideoDriveInput): TimelineVideoDriverSnapshot;
  prepareFrame(input: TimelineVideoDriveInput): Promise<TimelineVideoFrameResult>;
  snapshot(): TimelineVideoDriverSnapshot;
  dispose(): void;
}>;

type DesiredFrame = Readonly<{
  generation: number;
  runId: string;
  direction: Direction;
  progress: number;
  targetTime: number;
  allowSeekedFrameFallback: boolean;
}>;

type FramePresentationEvidence =
  | 'playhead-reuse'
  | 'seeked-fallback'
  | 'video-frame-callback';

type FrameWaiter = DesiredFrame & {
  resolve(result: TimelineVideoFrameResult): void;
  reject(error: Error): void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

type VideoWithFrameCallbacks = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

type TimelineManagedVideo = HTMLVideoElement & {
  __r5TimelineVideoDispose?: () => void;
};

const SEEK_TOLERANCE_SECONDS = 0.001;
export const TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS = 0.05;
const EXACT_TARGET_PRIME_OFFSET_SECONDS = 0.05;
const EXACT_TARGET_PRIME_SETTLE_DELAY_MS = 50;
const SEEKED_FRAME_FALLBACK_DELAY_MS = 120;
const PAUSED_COMPOSITOR_NUDGE_MS = 250;
const DEFAULT_END_EPSILON_SECONDS = 0.02;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function finiteDuration(video: HTMLVideoElement, fallback: number): number {
  return Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : Math.max(0.001, fallback);
}

function frameResult(frame: DesiredFrame, status: TimelineVideoFrameResult['status']): TimelineVideoFrameResult {
  return {
    status,
    runId: frame.runId,
    direction: frame.direction,
    generation: frame.generation,
    targetTime: frame.targetTime
  };
}

class TimelineVideoDriverImpl implements TimelineVideoDriver {
  private generation = 0;
  private runId: string | undefined;
  private direction: Direction | undefined;
  private latest: DesiredFrame | undefined;
  private latestInput: TimelineVideoDriveInput | undefined;
  private queuedSeek: DesiredFrame | undefined;
  private inFlightSeek: DesiredFrame | undefined;
  private primingSeek: DesiredFrame | undefined;
  private pendingEndpointPrime: DesiredFrame | undefined;
  private primingCompletionTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly waiters = new Set<FrameWaiter>();
  private nativeFallback = false;
  private nativeStarted = false;
  private nativeAttempt = 0;
  private pendingNative: Readonly<{
    desired: DesiredFrame;
    input: TimelineVideoDriveInput;
  }> | undefined;
  private frameReadyGeneration = 0;
  private readyTime = Number.NaN;
  private frameCallbackId: number | undefined;
  private presentingFrame: DesiredFrame | undefined;
  private seekedFrameFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  private seekedFrameFallbackFrame: DesiredFrame | undefined;
  private disposed = false;

  private readonly onSeeked = () => {
    if (this.primingSeek) {
      this.completePrimingSeek();
      return;
    }
    this.completeInFlightSeek();
  };

  private readonly onLoadedMetadata = () => {
    if (!this.latest || !this.latestInput || this.latest.generation !== this.generation) {
      return;
    }
    const refreshed = this.desiredFrame(this.latest.progress, this.latestInput);
    this.latest = refreshed;
    this.scheduleSeek(refreshed);
  };

  private readonly onMediaError = () => {
    const message = this.video.error?.message || 'media error';
    this.failAllWaiters(new MediaPreparationError('MEDIA_ELEMENT_ERROR', message));
  };

  private readonly onMediaAbort = () => {
    // Packed-alpha surfaces replace their <source> while retiring a parked
    // generation. WebKit emits `abort` for that source removal; when there is
    // no current media resource left, it is not a preparation failure for the
    // newly requested frame.
    if (!this.video.src
      && this.video.dataset.packedAlphaSource === 'rgb-alpha-side-by-side'
      && this.video.querySelector('source')) return;
    this.failAllWaiters(new MediaPreparationError(
      'MEDIA_PREPARATION_ABORTED',
      'media aborted'
    ));
  };

  constructor(private readonly video: HTMLVideoElement) {
    video.addEventListener('seeked', this.onSeeked);
    video.addEventListener('loadedmetadata', this.onLoadedMetadata);
    video.addEventListener('error', this.onMediaError);
    video.addEventListener('abort', this.onMediaAbort);
  }

  drive(input: TimelineVideoDriveInput): TimelineVideoDriverSnapshot {
    if (this.disposed) {
      return this.snapshot();
    }
    const desired = this.activate(input);
    this.latestInput = input;
    this.latest = desired;
    this.writeDiagnostics(desired);
    this.configureElement();

    const nativeEligible = input.mode === 'native-preferred'
      && (input.nativePlaybackDirection ?? input.direction) === 1
      && !input.reducedMotion;
    const endpoint = desired.progress <= 0.001
      ? 'start'
      : desired.progress >= 0.999
        ? 'end'
        : undefined;
    if (endpoint && !(endpoint === 'start' && nativeEligible)) {
      this.stopNativePlayback();
      if (this.canReusePresentedFrame(desired)) {
        this.markFrameReady(desired, 'playhead-reuse');
      }
      if ((input.endpointPolicy?.[endpoint] ?? 'seek') === 'seek') {
        if (!this.frameIsReady(desired)) {
          this.scheduleSeek(desired);
        }
      }
      return this.snapshot();
    }

    if (!nativeEligible || this.nativeFallback) {
      this.stopNativePlayback();
      this.scheduleSeek(desired);
      return this.snapshot();
    }

    this.driveNative(desired, input);
    return this.snapshot();
  }

  prepareFrame(input: TimelineVideoDriveInput): Promise<TimelineVideoFrameResult> {
    if (this.disposed) {
      const desired = this.desiredFrame(input.progress, input);
      return Promise.resolve(frameResult(desired, 'stale'));
    }
    if (input.signal?.aborted) {
      return Promise.reject(this.abortError(input.signal.reason, input.runId));
    }
    const desired = this.activate({ ...input, mode: 'timeline' });
    this.latestInput = { ...input, mode: 'timeline' };
    this.latest = desired;
    this.writeDiagnostics(desired);
    this.configureElement();
    this.stopNativePlayback();

    // Reuse an exact driver-owned proof across a generation handoff. Nearby
    // targets additionally require the physical playhead to remain in-window.
    if (this.canReusePresentedFrame(desired)) {
      this.markFrameReady(desired, 'playhead-reuse');
    }

    for (const waiter of [...this.waiters]) {
      if (
        waiter.generation === desired.generation
        && Math.abs(waiter.targetTime - desired.targetTime) > SEEK_TOLERANCE_SECONDS
      ) {
        this.resolveWaiter(waiter, 'stale');
      }
    }

    if (this.frameIsReady(desired)) {
      return Promise.resolve(frameResult(desired, 'ready'));
    }

    let waiter!: FrameWaiter;
    const promise = new Promise<TimelineVideoFrameResult>((resolve, reject) => {
      waiter = { ...desired, resolve, reject };
      this.waiters.add(waiter);
      if (input.signal) {
        waiter.signal = input.signal;
        waiter.onAbort = () => {
          this.rejectWaiter(waiter, this.abortError(input.signal?.reason, input.runId));
          this.cancelPresentationWhenUnused(waiter);
        };
        if (input.signal.aborted) {
          waiter.onAbort();
        } else {
          input.signal.addEventListener('abort', waiter.onAbort, { once: true });
        }
      }
    });
    if (this.waiters.has(waiter)) {
      const endpoint = desired.progress <= 0.001 || desired.progress >= 0.999;
      if (endpoint) {
        this.pendingEndpointPrime = desired;
      }
      const priming = endpoint
        ? this.startPendingEndpointPrime()
        : this.beginExactTargetSeek(desired);
      if (priming.error) {
        this.rejectWaiter(waiter, priming.error);
      } else if (!priming.started) {
        this.scheduleSeek(desired);
      }
    }
    return promise;
  }

  snapshot(): TimelineVideoDriverSnapshot {
    const frameReady = Boolean(
      this.latest
      && this.frameReadyGeneration === this.latest.generation
      && Math.abs(this.readyTime - this.latest.targetTime) <= SEEK_TOLERANCE_SECONDS
    );
    return {
      runId: this.runId,
      direction: this.direction,
      generation: this.generation,
      desiredProgress: this.latest?.progress,
      targetTime: this.latest?.targetTime,
      seekPending: Boolean(
        this.pendingEndpointPrime || this.primingSeek || this.inFlightSeek || this.queuedSeek
      ),
      nativeFallback: this.nativeFallback,
      frameReady
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation += 1;
    this.stopNativePlayback();
    this.cancelFrameCallback();
    this.resolveAllWaitersAsStale();
    this.video.removeEventListener('seeked', this.onSeeked);
    this.video.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    this.video.removeEventListener('error', this.onMediaError);
    this.video.removeEventListener('abort', this.onMediaAbort);
    this.queuedSeek = undefined;
    this.inFlightSeek = undefined;
    this.primingSeek = undefined;
    this.pendingEndpointPrime = undefined;
    this.cancelPrimingCompletion();
    this.latest = undefined;
    this.latestInput = undefined;
  }

  private activate(input: TimelineVideoDriveInput): DesiredFrame {
    if (this.runId !== input.runId || this.direction !== input.direction) {
      this.generation += 1;
      this.runId = input.runId;
      this.direction = input.direction;
      this.nativeFallback = false;
      this.nativeStarted = false;
      this.pendingNative = undefined;
      this.nativeAttempt += 1;
      this.frameReadyGeneration = 0;
      // The generation identity is stale, but its last presented media time is
      // still useful evidence if the next generation targets the same frame.
      this.queuedSeek = undefined;
      this.primingSeek = undefined;
      this.pendingEndpointPrime = undefined;
      this.cancelPrimingCompletion();
      // A decoder can clear `seeking` without delivering the old generation's
      // final event. Do not let that settled ownership record block the new
      // generation's first causal seek.
      if (!this.video.seeking) {
        this.inFlightSeek = undefined;
      }
      this.cancelFrameCallback();
      delete this.video.dataset.timelineVideoFrameEvidence;
      this.video.pause();
      this.resolveAllWaitersAsStale();
    }
    return this.desiredFrame(input.progress, input);
  }

  private desiredFrame(progress: number, input: TimelineVideoDriveInput): DesiredFrame {
    const duration = finiteDuration(this.video, input.durationFallbackSeconds);
    const epsilon = Math.max(0, input.endEpsilonSeconds ?? DEFAULT_END_EPSILON_SECONDS);
    const start = Math.min(duration, Math.max(0, input.startSeconds ?? 0));
    const defaultEnd = Math.max(start, duration - epsilon);
    const end = Math.max(start, Math.min(defaultEnd, input.endSeconds ?? defaultEnd));
    const clamped = clamp(progress);
    return {
      generation: this.generation,
      runId: input.runId,
      direction: input.direction,
      progress: clamped,
      targetTime: start + (end - start) * clamped,
      allowSeekedFrameFallback: input.allowSeekedFrameFallback === true
    };
  }

  private configureElement(): void {
    if (this.video.preload !== 'auto') {
      this.video.preload = 'auto';
      this.video.load();
    }
    this.video.loop = false;
    this.video.muted = true;
    this.video.playsInline = true;
  }

  private driveNative(desired: DesiredFrame, input: TimelineVideoDriveInput): void {
    if (this.nativeStarted && !this.video.paused) {
      return;
    }
    const frameReady = this.frameReadyGeneration === desired.generation
      && Math.abs(this.readyTime - desired.targetTime) <= SEEK_TOLERANCE_SECONDS;
    if (!frameReady) {
      this.pendingNative = { desired, input };
      this.scheduleSeek(desired);
      return;
    }
    this.pendingNative = undefined;
    this.startNativePlayback(desired, input);
  }

  private startNativePlayback(desired: DesiredFrame, input: TimelineVideoDriveInput): void {
    if (
      this.disposed
      || desired.generation !== this.generation
      || (this.nativeStarted && !this.video.paused)
    ) {
      return;
    }
    const duration = finiteDuration(this.video, input.durationFallbackSeconds);
    const end = Math.max(desired.targetTime, Math.min(duration, input.endSeconds ?? duration));
    const remainingMediaSeconds = Math.max(0.001, end - desired.targetTime);
    const remainingTimelineSeconds = Math.max(
      0.05,
      ((input.timelineDurationMs ?? remainingMediaSeconds * 1000) / 1000) * (1 - desired.progress)
    );
    this.video.playbackRate = Math.min(4, Math.max(0.25, remainingMediaSeconds / remainingTimelineSeconds));
    this.nativeStarted = true;
    const nativeAttempt = ++this.nativeAttempt;
    let playback: Promise<void> | undefined;
    try {
      playback = this.video.play();
    } catch {
      playback = Promise.reject(new Error('native playback rejected'));
    }
    void playback?.catch(() => {
      if (
        this.disposed
        || desired.generation !== this.generation
        || nativeAttempt !== this.nativeAttempt
      ) {
        return;
      }
      this.nativeFallback = true;
      this.nativeStarted = false;
      this.video.dataset.timelineVideoFallback = 'true';
      this.video.pause();
      if (this.latest?.generation === this.generation) {
        this.scheduleSeek(this.latest);
      }
    });
  }

  private stopNativePlayback(): void {
    this.nativeAttempt += 1;
    this.pendingNative = undefined;
    if (this.nativeStarted || !this.video.paused) {
      // Native playback has already presented this playhead; preserve it before
      // pausing so a reverse generation can reuse the terminal frame.
      this.readyTime = this.video.currentTime;
      this.video.pause();
    }
    this.nativeStarted = false;
  }

  private canReusePresentedFrame(desired: DesiredFrame): boolean {
    const readyDistance = Math.abs(this.readyTime - desired.targetTime);
    const playheadDistance = Math.abs(this.video.currentTime - desired.targetTime);
    return readyDistance <= TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS
      && playheadDistance <= TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS;
  }

  private frameIsReady(desired: DesiredFrame): boolean {
    return this.frameReadyGeneration === desired.generation
      && Math.abs(this.readyTime - desired.targetTime) <= SEEK_TOLERANCE_SECONDS;
  }

  private scheduleSeek(desired: DesiredFrame): void {
    this.queuedSeek = desired;
    this.flushQueuedSeek();
  }

  private beginExactTargetSeek(desired: DesiredFrame, force = false): {
    started: boolean;
    error?: Error;
  } {
    if (
      this.primingSeek
      || this.inFlightSeek
      || (!force && Math.abs(this.video.currentTime - desired.targetTime) > SEEK_TOLERANCE_SECONDS)
    ) {
      return { started: false };
    }
    // Metadata can still be unavailable for a cold endpoint preparation. Use
    // the caller's declared media duration so the start endpoint retains room
    // for the same cross-frame nudge used after metadata has loaded.
    const duration = finiteDuration(
      this.video,
      Math.max(
        desired.targetTime + EXACT_TARGET_PRIME_OFFSET_SECONDS,
        this.latestInput?.durationFallbackSeconds ?? 0
      )
    );
    // A sub-frame nudge can be quantized back onto the same decoded sample,
    // leaving paused Chromium with no new frame to satisfy RVFC. Cross at
    // least one common video-frame interval before seeking to the exact target.
    const offset = EXACT_TARGET_PRIME_OFFSET_SECONDS;
    const nudgedTime = desired.targetTime + offset <= duration
      ? desired.targetTime + offset
      : Math.max(0, desired.targetTime - offset);
    if (Math.abs(nudgedTime - desired.targetTime) <= SEEK_TOLERANCE_SECONDS) {
      return { started: false };
    }
    try {
      this.primingSeek = desired;
      this.video.currentTime = nudgedTime;
      if (!this.video.seeking) {
        // A synchronously settled setter has not necessarily given the
        // decoder/compositor a turn to present the nudged frame. Preserve one
        // frame interval before seeking back to the exact endpoint.
        this.primingCompletionTimer = setTimeout(() => {
          this.primingCompletionTimer = undefined;
          this.completePrimingSeek();
        }, EXACT_TARGET_PRIME_SETTLE_DELAY_MS);
      }
      return { started: true };
    } catch (cause) {
      this.primingSeek = undefined;
      const error = new MediaPreparationError(
        'MEDIA_SEEK_FAILED',
        'prime seek failed',
        { cause }
      );
      this.failFrame(desired, error);
      return {
        started: false,
        error
      };
    }
  }

  private startPendingEndpointPrime(): {
    started: boolean;
    error?: Error;
  } {
    const pending = this.pendingEndpointPrime;
    if (!pending || this.primingSeek || this.inFlightSeek) {
      return { started: false };
    }
    // Consume ownership before the seek. Some decoded endpoints settle
    // synchronously (`video.seeking` remains false), which re-enters through
    // completeInFlightSeek before beginExactTargetSeek returns.
    this.pendingEndpointPrime = undefined;
    const result = this.beginExactTargetSeek(pending, true);
    if (result.started || result.error) {
      return result;
    }
    // A degenerate media interval has no alternate frame to cross. Fall back
    // to the ordinary exact seek without retaining a permanently pending
    // prime request.
    return result;
  }

  private completePrimingSeek(): void {
    const primed = this.primingSeek;
    if (!primed) {
      return;
    }
    this.cancelPrimingCompletion();
    this.primingSeek = undefined;
    if (this.disposed || primed.generation !== this.generation) {
      return;
    }
    const next = this.queuedSeek ?? primed;
    this.queuedSeek = undefined;
    this.scheduleSeek(next);
  }

  private flushQueuedSeek(): void {
    if (this.disposed || this.inFlightSeek || !this.queuedSeek) {
      return;
    }
    const desired = this.queuedSeek;
    this.queuedSeek = undefined;
    if (desired.generation !== this.generation) {
      this.flushQueuedSeek();
      return;
    }
    if (Math.abs(this.video.currentTime - desired.targetTime) <= SEEK_TOLERANCE_SECONDS) {
      this.presentFrame(desired);
      this.flushQueuedSeek();
      return;
    }
    this.inFlightSeek = desired;
    // Register before assigning currentTime. A paused decoder may submit the
    // target frame immediately, and registering afterward can miss the only
    // causal presentation callback for that seek.
    this.presentFrame(desired);
    try {
      this.video.currentTime = desired.targetTime;
    } catch (cause) {
      this.inFlightSeek = undefined;
      this.cancelFrameCallback();
      this.failFrame(desired, new MediaPreparationError(
        'MEDIA_SEEK_FAILED',
        'media seek failed',
        { cause }
      ));
      return;
    }
    if (!this.video.seeking) {
      this.completeInFlightSeek();
    }
  }

  private completeInFlightSeek(): void {
    const completed = this.inFlightSeek;
    if (!completed) {
      return;
    }
    this.inFlightSeek = undefined;
    if (completed.generation === this.generation) {
      const callbackPending = this.frameCallbackId !== undefined
        && this.presentingFrame?.generation === completed.generation
        && Math.abs(this.presentingFrame.targetTime - completed.targetTime) <= SEEK_TOLERANCE_SECONDS;
      if (callbackPending) {
        this.armSeekedFrameFallback(completed);
      } else {
        this.presentFrame(completed);
      }
    }
    const endpointPriming = this.startPendingEndpointPrime();
    if (endpointPriming.started || endpointPriming.error) {
      return;
    }
    this.flushQueuedSeek();
  }

  private presentFrame(frame: DesiredFrame): void {
    if (
      this.frameCallbackId !== undefined
      && this.presentingFrame?.generation === frame.generation
      && Math.abs(this.presentingFrame.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      return;
    }
    this.cancelFrameCallback();
    const video = this.video as VideoWithFrameCallbacks;
    if (typeof video.requestVideoFrameCallback !== 'function') {
      if (frame.allowSeekedFrameFallback) {
        this.presentingFrame = frame;
        this.armSeekedFrameFallback(frame);
        return;
      }
      this.presentingFrame = undefined;
      this.failFrame(frame, new MediaPreparationError(
        'MEDIA_FRAME_CALLBACK_UNAVAILABLE',
        'frame callback unavailable'
      ));
      return;
    }
    const generation = frame.generation;
    this.presentingFrame = frame;
    try {
      this.frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
        this.cancelSeekedFrameFallback();
        this.frameCallbackId = undefined;
        this.presentingFrame = undefined;
        if (this.disposed || generation !== this.generation) {
          return;
        }
        if (
          Number.isFinite(metadata?.mediaTime)
          && Math.abs(metadata.mediaTime - frame.targetTime) > TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS
        ) {
          // A compositor nudge can advance beyond the requested sample before
          // its first callback. Re-seek the proof target instead of following
          // playback away from the only frame this waiter may accept.
          this.scheduleSeek(frame);
          return;
        }
        if (
          this.inFlightSeek?.generation === frame.generation
          && Math.abs(this.inFlightSeek.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
        ) {
          this.inFlightSeek = undefined;
        }
        this.markFrameReady(frame, 'video-frame-callback');
        this.flushQueuedSeek();
      });
      this.armSeekedFrameFallback(frame);
    } catch (cause) {
      this.frameCallbackId = undefined;
      if (frame.allowSeekedFrameFallback) {
        this.presentingFrame = frame;
        this.armSeekedFrameFallback(frame);
        return;
      }
      this.presentingFrame = undefined;
      this.failFrame(frame, new MediaPreparationError(
        'MEDIA_FRAME_CALLBACK_UNAVAILABLE',
        'frame callback failed',
        { cause }
      ));
    }
  }

  private armSeekedFrameFallback(frame: DesiredFrame): void {
    if (
      !frame.allowSeekedFrameFallback
      || this.disposed
      || frame.generation !== this.generation
    ) {
      return;
    }
    if (
      this.seekedFrameFallbackTimer !== undefined
      && this.seekedFrameFallbackFrame?.generation === frame.generation
      && Math.abs(this.seekedFrameFallbackFrame.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      return;
    }
    this.cancelSeekedFrameFallback();
    this.seekedFrameFallbackFrame = frame;
    this.seekedFrameFallbackTimer = setTimeout(() => {
      this.seekedFrameFallbackTimer = undefined;
      this.seekedFrameFallbackFrame = undefined;
      if (
        this.disposed
        || frame.generation !== this.generation
      ) {
        return;
      }
      if (
        this.video.readyState < 2
        || this.video.seeking
        || Math.abs(this.video.currentTime - frame.targetTime) > TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS
      ) {
        const waiting = [...this.waiters].some((waiter) => (
          waiter.generation === frame.generation
          && Math.abs(waiter.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
        ));
        const pendingNative = this.pendingNative?.desired;
        if (waiting || pendingNative?.generation === frame.generation
          && Math.abs(pendingNative.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS) {
          this.armSeekedFrameFallback(frame);
        }
        return;
      }
      if (this.inFlightSeek?.generation === frame.generation
        && Math.abs(this.inFlightSeek.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS) {
        this.inFlightSeek = undefined;
      }
      this.markFrameReady(frame, 'seeked-fallback');
      this.flushQueuedSeek();
    }, SEEKED_FRAME_FALLBACK_DELAY_MS);
  }

  private cancelSeekedFrameFallback(): void {
    if (this.seekedFrameFallbackTimer !== undefined) {
      clearTimeout(this.seekedFrameFallbackTimer);
    }
    this.seekedFrameFallbackTimer = undefined;
    this.seekedFrameFallbackFrame = undefined;
  }

  private cancelPrimingCompletion(): void {
    if (this.primingCompletionTimer !== undefined) {
      clearTimeout(this.primingCompletionTimer);
    }
    this.primingCompletionTimer = undefined;
  }

  private markFrameReady(frame: DesiredFrame, evidence: FramePresentationEvidence): void {
    if (frame.generation !== this.generation) {
      return;
    }
    if (
      this.video.readyState < 2
      || (this.video.seeking && evidence !== 'video-frame-callback')
    ) {
      this.presentFrame(frame);
      return;
    }
    this.cancelFrameCallback();
    this.frameReadyGeneration = frame.generation;
    this.readyTime = frame.targetTime;
    if (
      this.pendingEndpointPrime?.generation === frame.generation
      && Math.abs(this.pendingEndpointPrime.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      this.pendingEndpointPrime = undefined;
    }
    this.video.dataset.timelineVideoFrameReady = 'true';
    this.video.dataset.timelineVideoFrameEvidence = evidence;
    delete this.video.dataset.timelineVideoStaticFallback;
    for (const waiter of [...this.waiters]) {
      if (
        waiter.generation === frame.generation
        && Math.abs(waiter.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
      ) {
        this.resolveWaiter(waiter, 'ready');
      }
    }
    const pendingNative = this.pendingNative;
    if (
      pendingNative
      && pendingNative.desired.generation === frame.generation
      && Math.abs(pendingNative.desired.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      this.pendingNative = undefined;
      this.startNativePlayback(pendingNative.desired, pendingNative.input);
    }
  }

  private cancelFrameCallback(): void {
    this.cancelSeekedFrameFallback();
    if (this.frameCallbackId === undefined) {
      this.presentingFrame = undefined;
      return;
    }
    const video = this.video as VideoWithFrameCallbacks;
    video.cancelVideoFrameCallback?.(this.frameCallbackId);
    this.frameCallbackId = undefined;
    this.presentingFrame = undefined;
  }

  private resolveAllWaitersAsStale(): void {
    for (const waiter of [...this.waiters]) {
      this.resolveWaiter(waiter, 'stale');
    }
  }

  private resolveWaiter(waiter: FrameWaiter, status: TimelineVideoFrameResult['status']): void {
    if (!this.waiters.delete(waiter)) {
      return;
    }
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    }
    waiter.resolve(frameResult(waiter, status));
  }

  private rejectWaiter(waiter: FrameWaiter, error: Error): void {
    if (!this.waiters.delete(waiter)) {
      return;
    }
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    }
    waiter.reject(error);
  }

  private rejectWaitersForFrame(frame: DesiredFrame, error: Error): void {
    for (const waiter of [...this.waiters]) {
      if (
        waiter.generation === frame.generation
        && Math.abs(waiter.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
      ) {
        this.rejectWaiter(waiter, error);
      }
    }
  }

  private failFrame(frame: DesiredFrame, error: Error): void {
    this.markStaticFallback();
    this.rejectWaitersForFrame(frame, error);
  }

  private failAllWaiters(error: Error): void {
    this.markStaticFallback();
    for (const waiter of [...this.waiters]) {
      this.rejectWaiter(waiter, error);
    }
  }

  private cancelPresentationWhenUnused(frame: DesiredFrame): void {
    const stillWaiting = [...this.waiters].some((waiter) => (
      waiter.generation === frame.generation
      && Math.abs(waiter.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ));
    if (
      !stillWaiting
      && this.pendingEndpointPrime?.generation === frame.generation
      && Math.abs(this.pendingEndpointPrime.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      this.pendingEndpointPrime = undefined;
    }
    if (
      !this.presentingFrame
      || this.presentingFrame.generation !== frame.generation
      || Math.abs(this.presentingFrame.targetTime - frame.targetTime) > SEEK_TOLERANCE_SECONDS
    ) {
      return;
    }
    const pendingNative = this.pendingNative?.desired;
    if (
      stillWaiting
      || (
        pendingNative?.generation === frame.generation
        && Math.abs(pendingNative.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
      )
    ) {
      return;
    }
    this.cancelFrameCallback();
  }

  private abortError(reason: unknown, runId: string): Error {
    if (reason instanceof MediaPreparationError) {
      return reason;
    }
    return new MediaPreparationError(
      'MEDIA_PREPARATION_ABORTED',
      `media frame preparation aborted for ${runId}`,
      reason === undefined ? {} : { cause: reason }
    );
  }

  private writeDiagnostics(desired: DesiredFrame): void {
    this.video.dataset.timelineVideoRun = desired.runId;
    this.video.dataset.timelineVideoDirection = String(desired.direction);
    this.video.dataset.timelineVideoGeneration = String(desired.generation);
    this.video.dataset.timelineVideoProgress = desired.progress.toFixed(4);
    this.video.dataset.timelineVideoTarget = desired.targetTime.toFixed(4);
    this.video.dataset.timelineVideoFallback = String(this.nativeFallback);
  }

  private markStaticFallback(): void {
    this.stopNativePlayback();
    this.nativeFallback = true;
    this.frameReadyGeneration = 0;
    this.readyTime = Number.NaN;
    this.queuedSeek = undefined;
    this.inFlightSeek = undefined;
    this.primingSeek = undefined;
    this.pendingEndpointPrime = undefined;
    this.cancelPrimingCompletion();
    this.cancelFrameCallback();
    delete this.video.dataset.timelineVideoFrameReady;
    delete this.video.dataset.timelineVideoFrameEvidence;
    this.video.dataset.timelineVideoFallback = 'true';
    this.video.dataset.timelineVideoStaticFallback = 'true';
  }
}

const sharedDrivers = new WeakMap<HTMLVideoElement, TimelineVideoDriver>();
const framePreparationOwners = new WeakMap<HTMLVideoElement, symbol>();

export function createTimelineVideoDriver(video: HTMLVideoElement): TimelineVideoDriver {
  return new TimelineVideoDriverImpl(video);
}

export function timelineVideoDriverFor(video: HTMLVideoElement): TimelineVideoDriver {
  const existing = sharedDrivers.get(video);
  if (existing) {
    return existing;
  }
  const driver = createTimelineVideoDriver(video);
  sharedDrivers.set(video, driver);
  const managedVideo = video as TimelineManagedVideo;
  const dispose = () => {
    if (sharedDrivers.get(video) !== driver) {
      return;
    }
    sharedDrivers.delete(video);
    driver.dispose();
    if (managedVideo.__r5TimelineVideoDispose === dispose) {
      delete managedVideo.__r5TimelineVideoDispose;
    }
  };
  managedVideo.__r5TimelineVideoDispose = dispose;
  return driver;
}

export function disposeTimelineVideoDriver(video: HTMLVideoElement): void {
  framePreparationOwners.delete(video);
  const managedVideo = video as TimelineManagedVideo;
  if (managedVideo.__r5TimelineVideoDispose) {
    managedVideo.__r5TimelineVideoDispose();
    return;
  }
  sharedDrivers.get(video)?.dispose();
  sharedDrivers.delete(video);
}

export function driveTimelineVideo(
  video: HTMLVideoElement | null | undefined,
  input: TimelineVideoDriveInput
): TimelineVideoDriverSnapshot | undefined {
  return video ? timelineVideoDriverFor(video).drive(input) : undefined;
}

export function prepareTimelineVideoFrame(
  video: HTMLVideoElement | null | undefined,
  input: TimelineVideoDriveInput
): Promise<TimelineVideoFrameResult | undefined> {
  if (!video) return Promise.resolve(undefined);
  const owner = Symbol(input.runId);
  framePreparationOwners.set(video, owner);
  const preparation = timelineVideoDriverFor(video).prepareFrame(input);
  // A covered paused video may settle its seek without submitting an rVFC.
  // Muted playback only nudges the compositor; readiness still requires the
  // causal callback, and the element is paused again before preparation exits.
  const nudge = input.allowPlaybackNudge === false ? undefined : setTimeout(() => {
    if (!input.signal?.aborted && framePreparationOwners.get(video) === owner) {
      void video.play().catch(() => undefined);
    }
  }, PAUSED_COMPOSITOR_NUDGE_MS);
  return preparation.finally(() => {
    if (nudge !== undefined) clearTimeout(nudge);
    if (framePreparationOwners.get(video) !== owner) return;
    framePreparationOwners.delete(video);
    if (input.preserveNativePlaybackOnSettle !== true) video.pause();
  });
}
