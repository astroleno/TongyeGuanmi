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
  reducedMotion?: boolean;
  signal?: AbortSignal;
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
}>;

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
  private readonly waiters = new Set<FrameWaiter>();
  private nativeFallback = false;
  private nativeStarted = false;
  private nativeAttempt = 0;
  private pendingNative: Readonly<{
    desired: DesiredFrame;
    input: TimelineVideoDriveInput;
  }> | undefined;
  private frameReadyGeneration = 0;
  private frameReadyTime = Number.NaN;
  private frameCallbackId: number | undefined;
  private presentingFrame: DesiredFrame | undefined;
  private presentedSeekFrame: DesiredFrame | undefined;
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
    const message = this.video.error?.message || 'media element reported an error';
    this.failAllWaiters(new MediaPreparationError('MEDIA_ELEMENT_ERROR', message));
  };

  private readonly onMediaAbort = () => {
    this.failAllWaiters(new MediaPreparationError(
      'MEDIA_PREPARATION_ABORTED',
      'media element aborted frame preparation'
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
      if ((input.endpointPolicy?.[endpoint] ?? 'seek') === 'seek') {
        this.scheduleSeek(desired);
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

    for (const waiter of [...this.waiters]) {
      if (
        waiter.generation === desired.generation
        && Math.abs(waiter.targetTime - desired.targetTime) > SEEK_TOLERANCE_SECONDS
      ) {
        this.resolveWaiter(waiter, 'stale');
      }
    }

    if (
      this.frameReadyGeneration === desired.generation
      && Math.abs(this.frameReadyTime - desired.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
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
      const priming = this.beginExactTargetSeek(desired);
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
      && Math.abs(this.frameReadyTime - this.latest.targetTime) <= SEEK_TOLERANCE_SECONDS
    );
    return {
      runId: this.runId,
      direction: this.direction,
      generation: this.generation,
      desiredProgress: this.latest?.progress,
      targetTime: this.latest?.targetTime,
      seekPending: Boolean(this.primingSeek || this.inFlightSeek || this.queuedSeek),
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
      this.frameReadyTime = Number.NaN;
      this.queuedSeek = undefined;
      this.primingSeek = undefined;
      this.cancelFrameCallback();
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
      targetTime: start + (end - start) * clamped
    };
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
    const frameReady = this.frameReadyGeneration === desired.generation
      && Math.abs(this.frameReadyTime - desired.targetTime) <= SEEK_TOLERANCE_SECONDS;
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
      this.video.pause();
    }
    this.nativeStarted = false;
  }

  private scheduleSeek(desired: DesiredFrame): void {
    this.queuedSeek = desired;
    this.flushQueuedSeek();
  }

  private beginExactTargetSeek(desired: DesiredFrame): {
    started: boolean;
    error?: Error;
  } {
    if (
      this.primingSeek
      || this.inFlightSeek
      || Math.abs(this.video.currentTime - desired.targetTime) > SEEK_TOLERANCE_SECONDS
    ) {
      return { started: false };
    }
    const duration = finiteDuration(this.video, desired.targetTime + 0.01);
    const offset = SEEK_TOLERANCE_SECONDS * 2;
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
        this.completePrimingSeek();
      }
      return { started: true };
    } catch (cause) {
      this.primingSeek = undefined;
      return {
        started: false,
        error: new MediaPreparationError(
          'MEDIA_SEEK_FAILED',
          `failed to prime media seek for ${desired.runId} at ${desired.targetTime.toFixed(4)}s`,
          { cause }
        )
      };
    }
  }

  private completePrimingSeek(): void {
    const primed = this.primingSeek;
    if (!primed) {
      return;
    }
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
    try {
      this.video.currentTime = desired.targetTime;
    } catch (cause) {
      this.inFlightSeek = undefined;
      this.rejectWaitersForFrame(desired, new MediaPreparationError(
        'MEDIA_SEEK_FAILED',
        `failed to seek media for ${desired.runId} to ${desired.targetTime.toFixed(4)}s`,
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
    if (completed.generation === this.generation) {
      const frameWasPresented = Boolean(
        this.presentedSeekFrame
        && this.presentedSeekFrame.generation === completed.generation
        && Math.abs(this.presentedSeekFrame.targetTime - completed.targetTime) <= SEEK_TOLERANCE_SECONDS
      );
      if (frameWasPresented) {
        this.presentedSeekFrame = undefined;
        this.markFrameReady(completed);
      } else {
        const callbackPending = this.frameCallbackId !== undefined
          && this.presentingFrame?.generation === completed.generation
          && Math.abs(this.presentingFrame.targetTime - completed.targetTime) <= SEEK_TOLERANCE_SECONDS;
        if (!callbackPending) {
          this.presentFrame(completed);
        }
      }
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
      this.presentingFrame = undefined;
      this.failFrame(frame, new MediaPreparationError(
        'MEDIA_FRAME_CALLBACK_UNAVAILABLE',
        `requestVideoFrameCallback is unavailable for ${frame.runId}`
      ));
      return;
    }
    const generation = frame.generation;
    this.presentingFrame = frame;
    try {
      this.frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
        this.frameCallbackId = undefined;
        this.presentingFrame = undefined;
        if (this.disposed || generation !== this.generation) {
          return;
        }
        if (
          Number.isFinite(metadata?.mediaTime)
          && Math.abs(metadata.mediaTime - frame.targetTime) > PRESENTATION_TOLERANCE_SECONDS
        ) {
          this.presentFrame(frame);
          return;
        }
        if (
          this.inFlightSeek?.generation === frame.generation
          && Math.abs(this.inFlightSeek.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
        ) {
          this.presentedSeekFrame = frame;
          return;
        }
        this.markFrameReady(frame);
      });
    } catch (cause) {
      this.frameCallbackId = undefined;
      this.presentingFrame = undefined;
      this.failFrame(frame, new MediaPreparationError(
        'MEDIA_FRAME_CALLBACK_UNAVAILABLE',
        `requestVideoFrameCallback failed for ${frame.runId}`,
        { cause }
      ));
    }
  }

  private markFrameReady(frame: DesiredFrame): void {
    if (frame.generation !== this.generation) {
      return;
    }
    this.frameReadyGeneration = frame.generation;
    this.frameReadyTime = frame.targetTime;
    this.video.dataset.timelineVideoFrameReady = 'true';
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
    this.presentedSeekFrame = undefined;
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
    this.rejectWaitersForFrame(frame, error);
    const pendingNative = this.pendingNative;
    if (
      pendingNative
      && pendingNative.desired.generation === frame.generation
      && Math.abs(pendingNative.desired.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      this.pendingNative = undefined;
      this.nativeFallback = true;
      this.video.dataset.timelineVideoFallback = 'true';
    }
  }

  private failAllWaiters(error: Error): void {
    for (const waiter of [...this.waiters]) {
      this.rejectWaiter(waiter, error);
    }
    this.queuedSeek = undefined;
    this.inFlightSeek = undefined;
    this.primingSeek = undefined;
    this.pendingNative = undefined;
    this.cancelFrameCallback();
  }

  private cancelPresentationWhenUnused(frame: DesiredFrame): void {
    if (
      !this.presentingFrame
      || this.presentingFrame.generation !== frame.generation
      || Math.abs(this.presentingFrame.targetTime - frame.targetTime) > SEEK_TOLERANCE_SECONDS
    ) {
      return;
    }
    const stillWaiting = [...this.waiters].some((waiter) => (
      waiter.generation === frame.generation
      && Math.abs(waiter.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ));
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
    delete this.video.dataset.timelineVideoFrameReady;
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
): TimelineVideoDriverSnapshot | undefined {
  return video ? timelineVideoDriverFor(video).drive(input) : undefined;
}

export function prepareTimelineVideoFrame(
  video: HTMLVideoElement | null | undefined,
  input: TimelineVideoDriveInput
): Promise<TimelineVideoFrameResult | undefined> {
  return video
    ? timelineVideoDriverFor(video).prepareFrame(input)
    : Promise.resolve(undefined);
}
