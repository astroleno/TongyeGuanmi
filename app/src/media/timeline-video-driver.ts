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
  /** Do not satisfy preparation from a retained playhead; require a new rVFC. */
  requireExactMediaFrame?: boolean | undefined;
  signal?: AbortSignal | undefined;
}>;

/**
 * Public prepared-frame evidence. This tuple crosses lazy chunks, so it must
 * not expose property names that independent Terser passes can mangle
 * differently in the producer and consumer chunks.
 */
export type TimelineVideoFrameResult = readonly [
  status: 'ready' | 'stale',
  runId: string,
  direction: Direction,
  generation: number,
  targetTime: number,
  /** Exact requestVideoFrameCallback mediaTime, or null for reuse/fallback. */
  mediaTime: number | null
];

export type TimelineVideoDriver = Readonly<{
  drive(input: TimelineVideoDriveInput): void;
  prepareFrame(input: TimelineVideoDriveInput): Promise<TimelineVideoFrameResult>;
  dispose(): void;
}>;

// Internal frame state stays positional so the driver does not pay for a
// second long-lived object ABI on every lazy chunk. The prepared-frame result
// remains the only tuple that crosses the chunk boundary.
type DesiredFrame = [
  generation: number,
  runId: string,
  direction: Direction,
  progress: number,
  targetTime: number,
  allowSeekedFrameFallback: boolean,
  retryArmed?: boolean,
  retryConsumed?: boolean
];

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
const PRESENTATION_TOLERANCE_SECONDS = 0.05;
const SEEKED_FRAME_FALLBACK_DELAY_MS = 120;
const EXACT_FRAME_RETRY_DELAY_MS = 250;
const EXACT_FRAME_NUDGE_SECONDS = 1 / 15;
const DEFAULT_END_EPSILON_SECONDS = 0.02;
const DATA_RUN = 'timelineVideoRun';
const DATA_DIRECTION = 'timelineVideoDirection';
const DATA_GENERATION = 'timelineVideoGeneration';
const DATA_PROGRESS = 'timelineVideoProgress';
const DATA_TARGET = 'timelineVideoTarget';
const DATA_FRAME_READY = 'timelineVideoFrameReady';
const DATA_FRAME_EVIDENCE = 'timelineVideoFrameEvidence';

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function finiteDuration(video: HTMLVideoElement, fallback: number): number {
  return Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : Math.max(0.001, fallback);
}

function frameResult(
  frame: DesiredFrame,
  status: TimelineVideoFrameResult[0],
  mediaTime: number | null = null
): TimelineVideoFrameResult {
  return [
    status,
    frame[1],
    frame[2],
    frame[0],
    frame[4],
    mediaTime
  ];
}

const near = (a: number, b: number, tolerance = SEEK_TOLERANCE_SECONDS): boolean =>
  Math.abs(a - b) <= tolerance;
const sameFrame = (a: DesiredFrame, b: DesiredFrame, tolerance?: number): boolean =>
  a[0] === b[0] && near(a[4], b[4], tolerance);

class TimelineVideoDriverImpl implements TimelineVideoDriver {
  private generation = 0;
  private runId: string | undefined;
  private direction: Direction | undefined;
  private latest: DesiredFrame | undefined;
  private latestInput: TimelineVideoDriveInput | undefined;
  private queuedSeek: DesiredFrame | undefined;
  private inFlightSeek: DesiredFrame | undefined;
  private primingSeek: DesiredFrame | undefined;
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
  private readyMediaTime = Number.NaN;
  private frameCallbackId: number | undefined;
  private presentingFrame: DesiredFrame | undefined;
  private presentedSeekFrame: DesiredFrame | undefined;
  private presentedSeekMediaTime = Number.NaN;
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
    if (!this.latest || !this.latestInput || this.latest[0] !== this.generation) {
      return;
    }
    const refreshed = this.desiredFrame(this.latest[3], this.latestInput);
    this.latest = refreshed;
    this.scheduleSeek(refreshed);
  };

  private readonly onMediaError = () => {
    const message = this.video.error?.message || 'media error';
    this.failAllWaiters(new MediaPreparationError('MEDIA_ELEMENT_ERROR', message));
  };

  private readonly onMediaAbort = () => {
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

  drive(input: TimelineVideoDriveInput): void {
    if (this.disposed) {
      return;
    }
    const desired = this.activate(input);
    this.latestInput = input;
    this.latest = desired;
    this.writeDiagnostics(desired);
    this.configureElement();

    const nativeEligible = input.mode === 'native-preferred'
      && (input.nativePlaybackDirection ?? input.direction) === 1
      && !input.reducedMotion;
    const endpoint = desired[3] <= 0.001
      ? 'start'
      : desired[3] >= 0.999
        ? 'end'
        : undefined;
    if (endpoint && !(endpoint === 'start' && nativeEligible)) {
      this.stopNativePlayback();
      if ((input.endpointPolicy?.[endpoint] ?? 'seek') === 'seek') {
        this.scheduleSeek(desired);
      }
      return;
    }

    if (!nativeEligible || this.nativeFallback) {
      this.stopNativePlayback();
      this.scheduleSeek(desired);
      return;
    }

    this.driveNative(desired, input);
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

    // Reuse only when the last presented frame and physical playhead together
    // remain within the same accepted presentation window as the new target.
    if (!input.requireExactMediaFrame
      && Math.abs(this.readyTime - desired[4])
      + Math.abs(this.video.currentTime - desired[4]) <= PRESENTATION_TOLERANCE_SECONDS) {
      this.markFrameReady(desired, 'playhead-reuse');
    }

    for (const waiter of [...this.waiters]) {
      if (
        waiter[0] === desired[0]
        && !near(waiter[4], desired[4])
      ) {
        this.resolveWaiter(waiter, 'stale');
      }
    }

    if (
      !input.requireExactMediaFrame
      &&
      this.frameReadyGeneration === desired[0]
      && near(this.readyTime, desired[4])
    ) {
      return Promise.resolve(frameResult(
        desired,
        'ready',
        Number.isFinite(this.readyMediaTime) ? this.readyMediaTime : null
      ));
    }

    let waiter!: FrameWaiter;
    const promise = new Promise<TimelineVideoFrameResult>((resolve, reject) => {
      waiter = { ...desired, resolve, reject } as FrameWaiter;
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
      const priming = this.beginExactTargetSeek(desired);
      if (priming.error) {
        this.rejectWaiter(waiter, priming.error);
      } else if (!priming.started) {
        this.scheduleSeek(desired);
      }
    }
    return promise;
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
    delete this.video.dataset[DATA_TARGET];
    delete this.video.dataset[DATA_FRAME_READY];
    delete this.video.dataset[DATA_FRAME_EVIDENCE];
    this.readyMediaTime = Number.NaN;
    this.queuedSeek = undefined;
    this.inFlightSeek = undefined;
    this.primingSeek = undefined;
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
      this.readyMediaTime = Number.NaN;
      // The generation identity is stale, but its last presented media time is
      // still useful evidence if the next generation targets the same frame.
      this.queuedSeek = undefined;
      this.primingSeek = undefined;
      this.cancelFrameCallback();
      delete this.video.dataset[DATA_FRAME_EVIDENCE];
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
    return [
      this.generation,
      input.runId,
      input.direction,
      clamped,
      start + (end - start) * clamped,
      input.allowSeekedFrameFallback === true
    ];
  }

  private configureElement(): void {
    if (this.video.preload !== 'auto') {
      this.video.preload = 'auto';
    }
    this.video.loop = false;
    this.video.muted = true;
    this.video.playsInline = true;
  }

  private driveNative(desired: DesiredFrame, input: TimelineVideoDriveInput): void {
    if (this.nativeStarted && !this.video.paused) {
      return;
    }
    const frameReady = this.frameReadyGeneration === desired[0]
      && near(this.readyTime, desired[4]);
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
      || desired[0] !== this.generation
      || (this.nativeStarted && !this.video.paused)
    ) {
      return;
    }
    const duration = finiteDuration(this.video, input.durationFallbackSeconds);
    const end = Math.max(desired[4], Math.min(duration, input.endSeconds ?? duration));
    const remainingMediaSeconds = Math.max(0.001, end - desired[4]);
    const remainingTimelineSeconds = Math.max(
      0.05,
      ((input.timelineDurationMs ?? remainingMediaSeconds * 1000) / 1000) * (1 - desired[3])
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
        || desired[0] !== this.generation
        || nativeAttempt !== this.nativeAttempt
      ) {
        return;
      }
      this.nativeFallback = true;
      this.nativeStarted = false;
      this.video.pause();
      if (this.latest?.[0] === this.generation) {
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

  private scheduleSeek(desired: DesiredFrame): void {
    this.queuedSeek = desired;
    this.flushQueuedSeek();
  }

  private beginExactTargetSeek(
    desired: DesiredFrame,
    offset = SEEK_TOLERANCE_SECONDS * 2
  ): {
    started: boolean;
    error?: Error;
  } {
    if (
      this.primingSeek
      || this.inFlightSeek
      || !near(this.video.currentTime, desired[4])
    ) {
      return { started: false };
    }
    const duration = finiteDuration(this.video, desired[4] + 0.01);
    const candidate = desired[4] + offset;
    const nudgedTime = candidate >= 0 && candidate <= duration
      ? candidate
      : Math.max(0, desired[4] - offset);
    if (near(nudgedTime, desired[4])) {
      return { started: false };
    }
    try {
      this.primingSeek = desired;
      this.video.currentTime = nudgedTime;
      if (!this.video.seeking) {
        this.completePrimingSeek();
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

  private completePrimingSeek(): void {
    const primed = this.primingSeek;
    if (!primed) {
      return;
    }
    this.primingSeek = undefined;
    if (this.disposed || primed[0] !== this.generation) {
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
    if (desired[0] !== this.generation) {
      this.flushQueuedSeek();
      return;
    }
    if (near(this.video.currentTime, desired[4])) {
      this.presentFrame(desired);
      this.flushQueuedSeek();
      return;
    }
    this.inFlightSeek = desired;
    try {
      this.video.currentTime = desired[4];
    } catch (cause) {
      this.inFlightSeek = undefined;
      this.failFrame(desired, new MediaPreparationError(
        'MEDIA_SEEK_FAILED',
        'media seek failed',
        { cause }
      ));
      return;
    }
    this.presentFrame(desired);
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
    if (completed[0] === this.generation) {
      const frameWasPresented = Boolean(
        this.presentedSeekFrame
        && sameFrame(this.presentedSeekFrame, completed)
      );
      if (frameWasPresented) {
        this.presentedSeekFrame = undefined;
        const mediaTime = this.presentedSeekMediaTime;
        this.presentedSeekMediaTime = Number.NaN;
        this.markFrameReady(completed, 'video-frame-callback', mediaTime);
      } else {
        const callbackPending = this.frameCallbackId !== undefined
          && this.presentingFrame !== undefined
          && sameFrame(this.presentingFrame, completed);
        if (callbackPending) {
          this.armSeekedFrameFallback(completed);
        } else {
          this.presentFrame(completed);
        }
      }
    }
    this.flushQueuedSeek();
  }

  private presentFrame(frame: DesiredFrame): void {
    if (
      this.frameCallbackId !== undefined
      && this.presentingFrame !== undefined
      && sameFrame(this.presentingFrame, frame)
    ) {
      return;
    }
    // A stale callback must not cancel the exact retry owned by this frame;
    // superseded retry callbacks self-invalidate by presenting-frame identity.
    this.cancelFrameCallback();
    const video = this.video as VideoWithFrameCallbacks;
    if (typeof video.requestVideoFrameCallback !== 'function') {
      if (frame[5]) {
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
    const generation = frame[0];
    this.presentingFrame = frame;
    try {
      // The test/browser adapters may invoke the callback synchronously.
      // eslint-disable-next-line prefer-const
      let callbackId: number | undefined;
      callbackId = video.requestVideoFrameCallback((_now, metadata) => {
        if (
          generation !== this.generation
          || this.frameCallbackId !== callbackId
        ) return;
        this.cancelSeekedFrameFallback();
        this.frameCallbackId = undefined;
        this.presentingFrame = undefined;
        if (
          Number.isFinite(metadata?.mediaTime)
          && !near(metadata.mediaTime, frame[4], PRESENTATION_TOLERANCE_SECONDS)
        ) {
          // A stale rVFC can arrive after the seek event has already cleared
          // inFlightSeek. Re-queue the same token-bound target so the decoder
          // gets a fresh physical seek instead of waiting forever on the old
          // decoded sample.
          this.presentFrame(frame);
          return;
        }
        if (
          this.inFlightSeek !== undefined
          && sameFrame(this.inFlightSeek, frame)
        ) {
          this.presentedSeekFrame = frame;
          this.presentedSeekMediaTime = Number.isFinite(metadata?.mediaTime)
            ? metadata.mediaTime
            : Number.NaN;
          return;
        }
        this.markFrameReady(frame, 'video-frame-callback', metadata?.mediaTime);
      });
      this.frameCallbackId = callbackId;
      this.armSeekedFrameFallback(frame);
      this.armExactFrameRetry(frame);
    } catch (cause) {
      this.frameCallbackId = undefined;
      if (frame[5]) {
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
      !frame[5]
      || this.disposed
      || frame[0] !== this.generation
      || this.video.seeking
    ) {
      return;
    }
    if (
      this.seekedFrameFallbackTimer !== undefined
      && this.seekedFrameFallbackFrame !== undefined
      && sameFrame(this.seekedFrameFallbackFrame, frame)
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
        || frame[0] !== this.generation
        || this.video.readyState < 2
        || this.video.seeking
        || !near(this.video.currentTime, frame[4], PRESENTATION_TOLERANCE_SECONDS)
      ) {
        return;
      }
      this.markFrameReady(frame, 'seeked-fallback');
    }, SEEKED_FRAME_FALLBACK_DELAY_MS);
  }

  private cancelSeekedFrameFallback(): void {
    if (this.seekedFrameFallbackTimer !== undefined) {
      clearTimeout(this.seekedFrameFallbackTimer);
    }
    this.seekedFrameFallbackTimer = undefined;
    this.seekedFrameFallbackFrame = undefined;
  }

  private armExactFrameRetry(frame: DesiredFrame): void {
    if (
      !this.latestInput?.requireExactMediaFrame
      || !sameFrame(this.latest!, frame)
      || frame[6]
      || frame[7]
    ) return;
    frame[6] = true;
    setTimeout(() => {
      if (this.presentingFrame !== frame) {
        return;
      }
      this.cancelFrameCallback();
      // This immutable generation/target gets one physical re-arm. A second
      // missing rVFC remains fail-closed under the route transaction timeout.
      const priming = this.beginExactTargetSeek(
        frame,
        frame[2] * EXACT_FRAME_NUDGE_SECONDS
      );
      frame[6] = false;
      if (priming.error) {
        return;
      }
      if (!priming.started) {
        this.scheduleSeek(frame);
      } else {
        frame[7] = true;
      }
    }, EXACT_FRAME_RETRY_DELAY_MS);
  }

  private markFrameReady(
    frame: DesiredFrame,
    evidence: FramePresentationEvidence,
    mediaTime?: number
  ): void {
    if (frame[0] !== this.generation) {
      return;
    }
    this.cancelFrameCallback();
    this.frameReadyGeneration = frame[0];
    this.readyTime = frame[4];
    this.readyMediaTime = Number.isFinite(mediaTime) ? mediaTime! : Number.NaN;
    this.video.dataset[DATA_FRAME_READY] = 'true';
    this.video.dataset[DATA_FRAME_EVIDENCE] = evidence;
    for (const waiter of [...this.waiters]) {
      if (
        sameFrame(waiter, frame)
      ) {
        this.resolveWaiter(waiter, 'ready');
      }
    }
    const pendingNative = this.pendingNative;
    if (
      pendingNative
      && sameFrame(pendingNative.desired, frame)
    ) {
      this.pendingNative = undefined;
      this.startNativePlayback(pendingNative.desired, pendingNative.input);
    }
  }

  private cancelFrameCallback(): void {
    this.cancelSeekedFrameFallback();
    this.presentedSeekFrame = undefined;
    this.presentedSeekMediaTime = Number.NaN;
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

  private resolveWaiter(waiter: FrameWaiter, status: TimelineVideoFrameResult[0]): void {
    if (!this.waiters.delete(waiter)) {
      return;
    }
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    }
    waiter.resolve(frameResult(
      waiter,
      status,
      status === 'ready' && Number.isFinite(this.readyMediaTime)
        ? this.readyMediaTime
        : null
    ));
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
        sameFrame(waiter, frame)
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
    if (
      !this.presentingFrame
      || !sameFrame(this.presentingFrame, frame)
    ) {
      return;
    }
    const stillWaiting = [...this.waiters].some((waiter) => (
      sameFrame(waiter, frame)
    ));
    const pendingNative = this.pendingNative?.desired;
    if (
      stillWaiting
      || (
        pendingNative !== undefined
        && sameFrame(pendingNative, frame)
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
    this.video.dataset[DATA_RUN] = desired[1];
    this.video.dataset[DATA_DIRECTION] = String(desired[2]);
    this.video.dataset[DATA_GENERATION] = String(desired[0]);
    this.video.dataset[DATA_PROGRESS] = desired[3].toFixed(4);
    this.video.dataset[DATA_TARGET] = desired[4].toFixed(4);
  }

  private markStaticFallback(): void {
    this.stopNativePlayback();
    this.nativeFallback = true;
    this.frameReadyGeneration = 0;
    this.readyTime = Number.NaN;
    this.readyMediaTime = Number.NaN;
    this.queuedSeek = undefined;
    this.inFlightSeek = undefined;
    this.primingSeek = undefined;
    this.cancelFrameCallback();
    delete this.video.dataset[DATA_FRAME_READY];
    delete this.video.dataset[DATA_FRAME_EVIDENCE];
  }
}

const sharedDrivers = new WeakMap<HTMLVideoElement, TimelineVideoDriver>();

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
): void {
  if (video) timelineVideoDriverFor(video).drive(input);
}

export function prepareTimelineVideoFrame(
  video: HTMLVideoElement | null | undefined,
  input: TimelineVideoDriveInput
): Promise<TimelineVideoFrameResult | undefined> {
  return video
    ? timelineVideoDriverFor(video).prepareFrame(input)
    : Promise.resolve(undefined);
}
