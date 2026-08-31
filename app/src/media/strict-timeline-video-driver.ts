import type { Direction } from '../story/types';
import { MediaPreparationError } from './media-preparation';
import {
  frameIndexForMediaTime,
  frameIndexForProgress,
  mediaTimeForFrame,
  progressForFrameIndex,
  validateVideoFrameMap,
  type VideoFrameMap
} from './frame-timebase';
import type {
  PresentedFrameClock,
  PresentedFrameClockSnapshot,
  PresentedFrameEvidence,
  PresentedFrameReceipt,
  PresentedFrameRequest
} from './presented-frame-clock';

export type StrictTimelineVideoFrameInput = Readonly<{
  runId: string;
  direction: Direction;
  progress: number;
  frameMap: VideoFrameMap;
  durationFallbackSeconds: number;
  sequence?: number;
  signal?: AbortSignal;
}>;

export type StrictTimelineVideoFrameResult = Readonly<{
  status: 'ready' | 'stale';
  runId: string;
  direction: Direction;
  generation: number;
  targetTime: number;
  targetFrameIndex: number;
  presentedFrameIndex: number;
  mediaTimeSeconds: number;
  evidence: 'video-frame-callback' | undefined;
}>;

export type StrictTimelineVideoDriverSnapshot = Readonly<{
  runId: string | undefined;
  direction: Direction | undefined;
  generation: number;
  desiredProgress: number | undefined;
  targetTime: number | undefined;
  seekPending: boolean;
  nativeFallback: false;
  frameReady: boolean;
}>;

export type StrictTimelineVideoDriver = Readonly<{
  prepareFrame(input: StrictTimelineVideoFrameInput): Promise<StrictTimelineVideoFrameResult>;
  snapshot(): StrictTimelineVideoDriverSnapshot;
  dispose(): void;
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
  mode?: 'timeline' | 'native-preferred';
  nativePlaybackDirection?: Direction;
  reducedMotion?: boolean | undefined;
  allowSeekedFrameFallback?: boolean | undefined;
  allowPlaybackNudge?: boolean | undefined;
  preserveNativePlaybackOnSettle?: boolean | undefined;
  frameMap?: VideoFrameMap | undefined;
  sequence?: number | undefined;
  signal?: AbortSignal | undefined;
}>;

export type TimelineVideoFrameResult = StrictTimelineVideoFrameResult;
export type TimelineVideoDriverSnapshot = StrictTimelineVideoDriverSnapshot;

type DesiredFrame = Readonly<{
  generation: number;
  runId: string;
  direction: Direction;
  sequence?: number;
  progress: number;
  targetTime: number;
  targetFrameIndex: number;
  frameMap: VideoFrameMap;
}>;

type Pending = DesiredFrame & {
  resolve(result: StrictTimelineVideoFrameResult): void;
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

const SEEK_TOLERANCE_SECONDS = 0.001;
const PRIME_OFFSET_SECONDS = 0.05;
const PRIME_SETTLE_DELAY_MS = 50;
const END_SEEK_OFFSET_SECONDS = 0.002;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function fallbackDuration(video: HTMLVideoElement, fallback: number): number {
  return Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : Math.max(0.001, fallback);
}

function sameFrame(left: DesiredFrame | undefined, right: DesiredFrame): boolean {
  return left?.generation === right.generation
    && left.runId === right.runId
    && left.direction === right.direction
    && left.sequence === right.sequence
    && left.targetFrameIndex === right.targetFrameIndex;
}

function result(
  frame: DesiredFrame,
  status: StrictTimelineVideoFrameResult['status'],
  presentedFrameIndex = -1,
  mediaTimeSeconds = Number.NaN
): StrictTimelineVideoFrameResult {
  return {
    status,
    runId: frame.runId,
    direction: frame.direction,
    generation: frame.generation,
    targetTime: frame.targetTime,
    targetFrameIndex: frame.targetFrameIndex,
    presentedFrameIndex,
    mediaTimeSeconds,
    evidence: status === 'ready' ? 'video-frame-callback' : undefined
  };
}

class StrictTimelineVideoDriverImpl implements StrictTimelineVideoDriver {
  private disposed = false;
  private generation = 0;
  private runId: string | undefined;
  private direction: Direction | undefined;
  private latest: DesiredFrame | undefined;
  private queued: DesiredFrame | undefined;
  private inFlight: DesiredFrame | undefined;
  private priming: DesiredFrame | undefined;
  private primeTimer: ReturnType<typeof setTimeout> | undefined;
  private pending: Pending | undefined;
  private frameCallbackId: number | undefined;
  private readyGeneration = 0;
  private readyFrameIndex = -1;
  private readyTime = Number.NaN;

  constructor(private readonly video: HTMLVideoElement) {
    video.addEventListener('seeked', this.onSeeked);
    video.addEventListener('error', this.onError);
    video.addEventListener('abort', this.onAbort);
  }

  prepareFrame(input: StrictTimelineVideoFrameInput): Promise<StrictTimelineVideoFrameResult> {
    this.activate(input);
    const frame = this.makeFrame(input);
    if (this.disposed) return Promise.resolve(result(frame, 'stale'));
    if (input.signal?.aborted) {
      return Promise.reject(this.abortError(input.signal.reason, input.runId));
    }

    this.latest = frame;
    this.configure();
    this.writeDiagnostics(frame);
    this.resolvePendingStale();
    if (this.readyMatches(frame)) return Promise.resolve(this.readyResult(frame));

    const promise = new Promise<StrictTimelineVideoFrameResult>((resolve, reject) => {
      const pending: Pending = {
        ...frame,
        resolve,
        reject,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      };
      pending.onAbort = () => {
        if (this.pending !== pending) return;
        this.pending = undefined;
        reject(this.abortError(input.signal?.reason, input.runId));
        this.flush();
      };
      this.pending = pending;
      if (input.signal) {
        if (input.signal.aborted) pending.onAbort();
        else input.signal.addEventListener('abort', pending.onAbort, { once: true });
      }
    });
    if (this.pending?.targetFrameIndex === frame.targetFrameIndex) {
      this.queued = frame;
      this.flush();
    }
    return promise;
  }

  snapshot(): StrictTimelineVideoDriverSnapshot {
    return {
      runId: this.runId,
      direction: this.direction,
      generation: this.generation,
      desiredProgress: this.latest?.progress,
      targetTime: this.latest?.targetTime,
      seekPending: Boolean(this.queued || this.inFlight || this.priming || this.frameCallbackId !== undefined),
      nativeFallback: false,
      frameReady: Boolean(this.latest && this.readyMatches(this.latest))
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.cancelCallback();
    this.cancelPrime();
    this.resolvePendingStale();
    this.video.pause();
    this.video.removeEventListener('seeked', this.onSeeked);
    this.video.removeEventListener('error', this.onError);
    this.video.removeEventListener('abort', this.onAbort);
    this.queued = undefined;
    this.inFlight = undefined;
    this.priming = undefined;
    this.latest = undefined;
    this.clearDiagnostics();
  }

  private readonly onSeeked = () => {
    if (this.priming) {
      this.finishPrime();
      return;
    }
    if (this.inFlight) {
      this.inFlight = undefined;
      this.flush();
    }
  };

  private readonly onError = () => {
    this.fail(new MediaPreparationError(
      'MEDIA_ELEMENT_ERROR',
      this.video.error?.message || 'media error'
    ));
  };

  private readonly onAbort = () => {
    if (!this.video.src && this.video.dataset.packedAlphaSource === 'rgb-alpha-side-by-side'
      && this.video.querySelector('source')) return;
    this.fail(new MediaPreparationError('MEDIA_PREPARATION_ABORTED', 'media aborted'));
  };

  private makeFrame(input: StrictTimelineVideoFrameInput): DesiredFrame {
    const frameMap = validateVideoFrameMap(input.frameMap);
    const progress = clamp(input.progress);
    const targetFrameIndex = frameIndexForProgress(frameMap, progress);
    return {
      generation: this.generation,
      runId: input.runId,
      direction: input.direction,
      ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
      progress,
      targetTime: mediaTimeForFrame(frameMap, targetFrameIndex),
      targetFrameIndex,
      frameMap
    };
  }

  private activate(input: StrictTimelineVideoFrameInput): void {
    if (this.runId === input.runId && this.direction === input.direction) return;
    this.generation += 1;
    this.runId = input.runId;
    this.direction = input.direction;
    this.latest = undefined;
    this.queued = undefined;
    this.inFlight = undefined;
    this.readyGeneration = 0;
    this.readyFrameIndex = -1;
    this.readyTime = Number.NaN;
    this.cancelCallback();
    this.cancelPrime();
    this.video.pause();
    this.resolvePendingStale();
    delete this.video.dataset.timelineVideoStaticFallback;
  }

  private configure(): void {
    this.video.preload = 'auto';
    this.video.loop = false;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.pause();
  }

  private flush(): void {
    if (this.disposed || this.priming || this.inFlight || !this.queued) return;
    const frame = this.queued;
    this.queued = undefined;
    if (!sameFrame(this.latest, frame)) {
      this.flush();
      return;
    }

    const physicalTargetTime = this.physicalSeekTime(frame, this.latestInputDuration());
    const currentTimeIsNearTarget = Math.abs(this.video.currentTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
      || Math.abs(this.video.currentTime - physicalTargetTime) <= SEEK_TOLERANCE_SECONDS;
    if (currentTimeIsNearTarget) {
      const duration = fallbackDuration(this.video, frame.targetTime + PRIME_OFFSET_SECONDS);
      const nudge = frame.targetTime + PRIME_OFFSET_SECONDS <= duration
        ? frame.targetTime + PRIME_OFFSET_SECONDS
        : Math.max(0, frame.targetTime - PRIME_OFFSET_SECONDS);
      if (Math.abs(nudge - frame.targetTime) > SEEK_TOLERANCE_SECONDS) {
        this.priming = frame;
        try {
          this.video.currentTime = nudge;
          if (!this.video.seeking) {
            this.primeTimer = setTimeout(() => {
              this.primeTimer = undefined;
              this.finishPrime();
            }, PRIME_SETTLE_DELAY_MS);
          }
        } catch (cause) {
          this.priming = undefined;
          this.failFrame(frame, new MediaPreparationError('MEDIA_SEEK_FAILED', 'prime seek failed', { cause }));
        }
        return;
      }
    }

    this.inFlight = frame;
    this.watch(frame);
    try {
      this.video.currentTime = this.physicalSeekTime(frame, this.latestInputDuration());
    } catch (cause) {
      this.inFlight = undefined;
      this.cancelCallback();
      this.failFrame(frame, new MediaPreparationError('MEDIA_SEEK_FAILED', 'media seek failed', { cause }));
      return;
    }
    if (!this.video.seeking) this.inFlight = undefined;
  }

  private finishPrime(): void {
    const frame = this.priming;
    if (!frame) return;
    this.cancelPrime();
    this.priming = undefined;
    if (this.disposed || !sameFrame(this.latest, frame)) {
      this.flush();
      return;
    }
    this.queued = this.latest;
    this.flush();
  }

  private physicalSeekTime(frame: DesiredFrame, durationFallbackSeconds: number): number {
    if (frame.targetFrameIndex !== frame.frameMap.endFrame) return frame.targetTime;
    const duration = fallbackDuration(
      this.video,
      Math.max(frame.targetTime + END_SEEK_OFFSET_SECONDS, durationFallbackSeconds)
    );
    return Math.min(duration, frame.targetTime + END_SEEK_OFFSET_SECONDS);
  }

  private latestInputDuration(): number {
    return this.latest?.targetTime ?? 0;
  }

  private watch(frame: DesiredFrame): void {
    this.cancelCallback();
    const video = this.video as VideoWithFrameCallbacks;
    if (typeof video.requestVideoFrameCallback !== 'function') {
      this.failFrame(frame, new MediaPreparationError(
        'MEDIA_FRAME_CALLBACK_UNAVAILABLE',
        'frame callback unavailable'
      ));
      return;
    }
    try {
      this.frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
        this.frameCallbackId = undefined;
        if (this.disposed || frame.generation !== this.generation) return;
        const mediaTimeSeconds = metadata?.mediaTime;
        const presentedFrameIndex = Number.isFinite(mediaTimeSeconds)
          ? frameIndexForMediaTime(frame.frameMap, mediaTimeSeconds)
          : -1;
        if (!Number.isFinite(mediaTimeSeconds) || presentedFrameIndex !== frame.targetFrameIndex) {
          if (sameFrame(this.latest, frame)) this.queued = frame;
          this.flush();
          return;
        }
        if (!sameFrame(this.latest, frame)) {
          this.flush();
          return;
        }
        this.inFlight = undefined;
        this.readyGeneration = frame.generation;
        this.readyFrameIndex = presentedFrameIndex;
        this.readyTime = mediaTimeSeconds;
        this.video.dataset.timelineVideoFrameReady = 'true';
        this.video.dataset.timelineVideoFrameEvidence = 'video-frame-callback';
        delete this.video.dataset.timelineVideoStaticFallback;
        const pending = this.pending;
        if (pending && sameFrame(pending, frame)) this.resolvePending(pending, 'ready');
        this.flush();
      });
    } catch (cause) {
      this.cancelCallback();
      this.failFrame(frame, new MediaPreparationError(
        'MEDIA_FRAME_CALLBACK_UNAVAILABLE',
        'frame callback failed',
        { cause }
      ));
    }
  }

  private readyMatches(frame: DesiredFrame): boolean {
    return frame.generation === this.readyGeneration
      && frame.targetFrameIndex === this.readyFrameIndex
      && Number.isFinite(this.readyTime)
      && frameIndexForMediaTime(frame.frameMap, this.video.currentTime) === frame.targetFrameIndex;
  }

  private readyResult(frame: DesiredFrame): StrictTimelineVideoFrameResult {
    return result(frame, 'ready', this.readyFrameIndex, this.readyTime);
  }

  private resolvePendingStale(): void {
    const pending = this.pending;
    if (!pending) return;
    this.resolvePending(pending, 'stale');
  }

  private resolvePending(pending: Pending, status: StrictTimelineVideoFrameResult['status']): void {
    if (this.pending !== pending) return;
    this.pending = undefined;
    if (pending.signal && pending.onAbort) pending.signal.removeEventListener('abort', pending.onAbort);
    pending.resolve(status === 'ready'
      ? this.readyResult(pending)
      : result(pending, 'stale'));
  }

  private failFrame(frame: DesiredFrame, error: Error): void {
    this.markStaticFallback();
    if (this.pending && sameFrame(this.pending, frame)) {
      const pending = this.pending;
      this.pending = undefined;
      if (pending.signal && pending.onAbort) pending.signal.removeEventListener('abort', pending.onAbort);
      pending.reject(error);
    }
  }

  private fail(error: Error): void {
    const frame = this.latest;
    if (frame) this.failFrame(frame, error);
  }

  private markStaticFallback(): void {
    this.cancelCallback();
    this.cancelPrime();
    this.queued = undefined;
    this.inFlight = undefined;
    this.readyGeneration = 0;
    this.readyFrameIndex = -1;
    this.readyTime = Number.NaN;
    delete this.video.dataset.timelineVideoFrameReady;
    delete this.video.dataset.timelineVideoFrameEvidence;
    this.video.dataset.timelineVideoStaticFallback = 'true';
  }

  private cancelCallback(): void {
    if (this.frameCallbackId !== undefined) {
      (this.video as VideoWithFrameCallbacks).cancelVideoFrameCallback?.(this.frameCallbackId);
    }
    this.frameCallbackId = undefined;
  }

  private cancelPrime(): void {
    if (this.primeTimer !== undefined) clearTimeout(this.primeTimer);
    this.primeTimer = undefined;
  }

  private abortError(reason: unknown, runId: string): Error {
    return new MediaPreparationError(
      'MEDIA_PREPARATION_ABORTED',
      `media frame preparation aborted for ${runId}`,
      reason === undefined ? {} : { cause: reason }
    );
  }

  private writeDiagnostics(frame: DesiredFrame): void {
    this.video.dataset.timelineVideoRun = frame.runId;
    this.video.dataset.timelineVideoDirection = String(frame.direction);
    this.video.dataset.timelineVideoGeneration = String(frame.generation);
    this.video.dataset.timelineVideoProgress = frame.progress.toFixed(4);
    this.video.dataset.timelineVideoTarget = frame.targetTime.toFixed(4);
    this.video.dataset.timelineVideoTargetFrame = String(frame.targetFrameIndex);
    if (frame.sequence === undefined) delete this.video.dataset.timelineVideoSequence;
    else this.video.dataset.timelineVideoSequence = String(frame.sequence);
  }

  private clearDiagnostics(): void {
    delete this.video.dataset.timelineVideoRun;
    delete this.video.dataset.timelineVideoDirection;
    delete this.video.dataset.timelineVideoGeneration;
    delete this.video.dataset.timelineVideoProgress;
    delete this.video.dataset.timelineVideoTarget;
    delete this.video.dataset.timelineVideoTargetFrame;
    delete this.video.dataset.timelineVideoSequence;
    delete this.video.dataset.timelineVideoFrameReady;
    delete this.video.dataset.timelineVideoFrameEvidence;
    delete this.video.dataset.timelineVideoStaticFallback;
  }
}

const strictDrivers = new WeakMap<HTMLVideoElement, StrictTimelineVideoDriver>();

export function createStrictTimelineVideoDriver(video: HTMLVideoElement): StrictTimelineVideoDriver {
  return new StrictTimelineVideoDriverImpl(video);
}

export function strictTimelineVideoDriverFor(video: HTMLVideoElement): StrictTimelineVideoDriver {
  const existing = strictDrivers.get(video);
  if (existing) return existing;
  const driver = createStrictTimelineVideoDriver(video);
  strictDrivers.set(video, driver);
  return driver;
}

export function prepareStrictTimelineVideoFrame(
  video: HTMLVideoElement,
  input: StrictTimelineVideoFrameInput
): Promise<StrictTimelineVideoFrameResult> {
  return strictTimelineVideoDriverFor(video).prepareFrame(input);
}

export function disposeStrictTimelineVideoDriver(video: HTMLVideoElement): void {
  strictDrivers.get(video)?.dispose();
  strictDrivers.delete(video);
}

export function prepareTimelineVideoFrame(
  video: HTMLVideoElement,
  input: TimelineVideoDriveInput
): Promise<TimelineVideoFrameResult> {
  if (!input.frameMap) {
    return Promise.reject(new Error('strict timeline frame map is required'));
  }
  return prepareStrictTimelineVideoFrame(video, {
    runId: input.runId,
    direction: input.direction,
    progress: input.progress,
    frameMap: input.frameMap,
    durationFallbackSeconds: input.durationFallbackSeconds,
    ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
}

export function disposeTimelineVideoDriver(video: HTMLVideoElement): void {
  disposeStrictTimelineVideoDriver(video);
}

export function timelineVideoDriverSnapshot(video: HTMLVideoElement): TimelineVideoDriverSnapshot {
  return strictTimelineVideoDriverFor(video).snapshot();
}

const EMPTY_CLOCK_SNAPSHOT: PresentedFrameClockSnapshot = {
  runId: undefined,
  direction: undefined,
  sequence: undefined,
  desiredProgress: undefined,
  desiredFrameIndex: undefined,
  presentedProgress: undefined,
  presentedFrameIndex: undefined,
  mediaTimeSeconds: undefined,
  frameLag: undefined,
  lagFrames: undefined,
  evidence: undefined,
  seekLatencyMs: undefined,
  staleCount: 0,
  pending: false
};

function clockStale(
  request: PresentedFrameRequest,
  desiredFrameIndex: number,
  presentedProgress: number
): PresentedFrameReceipt {
  return {
    status: 'stale',
    runId: request.runId,
    sequence: request.sequence,
    desiredFrameIndex,
    presentedFrameIndex: -1,
    mediaTimeSeconds: Number.NaN,
    presentedProgress,
    evidence: 'runtime'
  };
}

function sameRequest(left: PresentedFrameRequest | undefined, right: PresentedFrameRequest): boolean {
  return left?.runId === right.runId
    && left.direction === right.direction
    && left.sequence === right.sequence;
}

class StrictPresentedFrameClock implements PresentedFrameClock {
  private disposed = false;
  private latest: PresentedFrameRequest | undefined;
  private snapshotValue: PresentedFrameClockSnapshot = EMPTY_CLOCK_SNAPSHOT;
  private staleCount = 0;

  constructor(private readonly video: HTMLVideoElement) {}

  request(request: PresentedFrameRequest): Promise<PresentedFrameReceipt> {
    const frameMap = validateVideoFrameMap(request.frameMap);
    const desiredProgress = clamp(request.desiredProgress);
    const desiredFrameIndex = frameIndexForProgress(frameMap, desiredProgress);
    if (
      this.latest
      && this.latest.runId === request.runId
      && this.latest.direction === request.direction
      && request.sequence < this.latest.sequence
    ) {
      this.staleCount += 1;
      return Promise.resolve(clockStale(request, desiredFrameIndex, this.snapshotValue.presentedProgress ?? desiredProgress));
    }
    if (this.disposed) return Promise.resolve(clockStale(request, desiredFrameIndex, desiredProgress));

    this.latest = request;
    const startedAt = performance.now();
    this.snapshotValue = {
      ...this.snapshotValue,
      runId: request.runId,
      direction: request.direction,
      sequence: request.sequence,
      desiredProgress,
      desiredFrameIndex,
      frameLag: this.snapshotValue.presentedFrameIndex === undefined
        ? undefined
        : desiredFrameIndex - this.snapshotValue.presentedFrameIndex,
      lagFrames: this.snapshotValue.presentedFrameIndex === undefined
        ? undefined
        : desiredFrameIndex - this.snapshotValue.presentedFrameIndex,
      pending: true,
      staleCount: this.staleCount
    };
    this.writeDiagnostics();
    return strictTimelineVideoDriverFor(this.video).prepareFrame({
      runId: request.runId,
      direction: request.direction,
      progress: desiredProgress,
      frameMap,
      durationFallbackSeconds: mediaTimeForFrame(frameMap, frameMap.endFrame) + 1 / frameMap.fpsNumerator,
      sequence: request.sequence,
      signal: request.signal
    }).then((frame) => {
      const latency = Math.max(0, performance.now() - startedAt);
      const current = sameRequest(this.latest, request);
      const exact = frame.status === 'ready'
        && frame.evidence === 'video-frame-callback'
        && frame.presentedFrameIndex === desiredFrameIndex;
      if (!current || !exact) {
        this.staleCount += 1;
        this.snapshotValue = {
          ...this.snapshotValue,
          seekLatencyMs: latency,
          pending: current,
          staleCount: this.staleCount
        };
        this.writeDiagnostics();
        return clockStale(request, desiredFrameIndex, this.snapshotValue.presentedProgress ?? desiredProgress);
      }
      const presentedProgress = progressForFrameIndex(frameMap, frame.presentedFrameIndex);
      this.snapshotValue = {
        ...this.snapshotValue,
        seekLatencyMs: latency,
        presentedProgress,
        presentedFrameIndex: frame.presentedFrameIndex,
        mediaTimeSeconds: frame.mediaTimeSeconds,
        frameLag: frame.presentedFrameIndex - desiredFrameIndex,
        lagFrames: frame.presentedFrameIndex - desiredFrameIndex,
        evidence: 'video-frame-callback',
        pending: false,
        staleCount: this.staleCount
      };
      this.writeDiagnostics();
      return {
        status: 'presented' as const,
        runId: request.runId,
        sequence: request.sequence,
        desiredFrameIndex,
        presentedFrameIndex: frame.presentedFrameIndex,
        mediaTimeSeconds: frame.mediaTimeSeconds,
        presentedProgress,
        evidence: 'video-frame-callback' as const
      };
    }).catch((error: unknown) => {
      if (sameRequest(this.latest, request)) {
        this.snapshotValue = {
          ...this.snapshotValue,
          seekLatencyMs: Math.max(0, performance.now() - startedAt),
          pending: false,
          staleCount: this.staleCount
        };
        this.writeDiagnostics();
      }
      throw error;
    });
  }

  snapshot(): PresentedFrameClockSnapshot {
    return this.snapshotValue;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.latest = undefined;
    strictTimelineVideoDriverFor(this.video).dispose();
    this.clearDiagnostics();
    this.snapshotValue = { ...EMPTY_CLOCK_SNAPSHOT, staleCount: this.staleCount };
  }

  private writeDiagnostics(): void {
    const dataset = this.video.dataset;
    const snapshot = this.snapshotValue;
    if (snapshot.desiredFrameIndex !== undefined) dataset.timelineVideoDesiredFrame = String(snapshot.desiredFrameIndex);
    if (snapshot.presentedFrameIndex !== undefined) dataset.timelineVideoPresentedFrame = String(snapshot.presentedFrameIndex);
    if (snapshot.frameLag !== undefined) dataset.timelineVideoFrameLag = String(snapshot.frameLag);
    dataset.timelineVideoSequence = snapshot.sequence === undefined ? '' : String(snapshot.sequence);
    if (snapshot.evidence !== undefined) dataset.timelineVideoEvidence = snapshot.evidence;
    if (snapshot.seekLatencyMs !== undefined) dataset.timelineVideoSeekMs = snapshot.seekLatencyMs.toFixed(2);
    dataset.timelineVideoStaleCount = String(snapshot.staleCount);
    dataset.timelineVideoClockPending = String(snapshot.pending);
  }

  private clearDiagnostics(): void {
    const dataset = this.video.dataset;
    delete dataset.timelineVideoDesiredFrame;
    delete dataset.timelineVideoPresentedFrame;
    delete dataset.timelineVideoFrameLag;
    delete dataset.timelineVideoSequence;
    delete dataset.timelineVideoEvidence;
    delete dataset.timelineVideoSeekMs;
    delete dataset.timelineVideoStaleCount;
    delete dataset.timelineVideoClockPending;
  }
}

export function createVideoPresentedFrameClock(video: HTMLVideoElement): PresentedFrameClock {
  return new StrictPresentedFrameClock(video);
}

export type { PresentedFrameEvidence };
