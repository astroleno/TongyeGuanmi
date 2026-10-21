import type { Direction } from '../story/types';
import { MediaPreparationError } from './media-preparation';
import { deferScrollMediaRequest } from './scroll-media-sampling';

/** Legacy native requests are accepted as paused timeline seeks. */
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
  /** Source frame rate: coalesce scrolling samples that address the same frame. */
  frameRate?: number | undefined;
  startSeconds?: number;
  endSeconds?: number;
  endEpsilonSeconds?: number;
  timelineDurationMs?: number;
  mode?: TimelineVideoMode;
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
  signal?: AbortSignal | undefined;
  /** Explicit preparation retry; independent of the bounded active-scroll recovery. */
  reloadSource?: boolean;
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
  presentedTime?: number;
  presentedPlayheadTime?: number;
  presentedGeneration?: number;
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
  | 'decoded-canvas'
  | 'video-frame-callback';

type FrameWaiter = Omit<DesiredFrame, 'targetTime'> & {
  targetTime: number;
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
const SCROLL_FRAME_PROBE_DELAY_MS = 8;
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
  #generation = 0;
  #runId: string | undefined;
  #direction: Direction | undefined;
  #latest: DesiredFrame | undefined;
  #latestInput: TimelineVideoDriveInput | undefined;
  #queuedSeek: DesiredFrame | undefined;
  #inFlightSeek: DesiredFrame | undefined;
  #primingSeek: DesiredFrame | undefined;
  #pendingEndpointPrime: DesiredFrame | undefined;
  #waitingForInitialData = false;
  #reloadingFailedSource = false;
  #primingCompletionTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #waiters = new Set<FrameWaiter>();
  #nativeFallback = false;
  #frameReadyGeneration = 0;
  #scrollFrameHeld = false;
  #readyTime = Number.NaN;
  #readyPlayheadTime = Number.NaN;
  #frameCallbackId: number | undefined;
  #presentingFrame: DesiredFrame | undefined;
  #seekedFrameFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  #seekedFrameFallbackFrame: DesiredFrame | undefined;
  #decodedFrameProbe: HTMLCanvasElement | undefined;
  #decodedFrameContext: CanvasRenderingContext2D | null = null;
  #scrollSeekWatch: ReturnType<typeof setTimeout> | undefined;
  #scrollSeekChangedAt = 0;
  #scrollSeekSignature = '';
  #scrollSeekRetried = false;
  #scrollSourceReloading = false;
  #disposed = false;

  readonly #onProgress = () => { this.#scrollSeekChangedAt = Date.now(); };

  readonly #onSeeked = () => {
    // A surface may seek during loadeddata before our listener runs, lowering
    // readyState again. The completed seek is also a valid first-data boundary.
    if (this.#waitingForInitialData && this.#video.readyState >= 2) {
      this.#onLoadedData();
      return;
    }
    if (this.#primingSeek) {
      this.#completePrimingSeek();
      return;
    }
    this.#completeInFlightSeek();
  };

  readonly #onLoadedMetadata = () => {
    this.#reloadingFailedSource = false;
    this.#scrollSourceReloading = false;
    if (!this.#latest || !this.#latestInput || this.#latest.generation !== this.#generation) {
      return;
    }
    const refreshed = this.#desiredFrame(this.#latest.progress, this.#latestInput);
    this.#latest = refreshed;
    this.#writeDiagnostics(refreshed);
    // Cold fallback duration can differ from metadata. The promise must follow
    // the same authored progress as the refreshed seek, not its obsolete time.
    for (const waiter of this.#waiters) {
      waiter.targetTime = this.#desiredFrame(waiter.progress, this.#latestInput).targetTime;
    }
    if (this.#waitingForInitialData) {
      this.#pendingEndpointPrime = refreshed;
      return;
    }
    this.#scheduleSeek(refreshed);
  };

  readonly #onLoadedData = () => {
    if (!this.#waitingForInitialData || this.#video.readyState < 2) return;
    this.#waitingForInitialData = false;
    // Endpoint preparation can start while the preceding animation seek has
    // lowered readyState. Its seeked event enters this branch, so retire the
    // physically settled seek before it can block the endpoint's own proof.
    if (!this.#video.seeking) this.#inFlightSeek = undefined;
    // A seek before the initial sample exists can be silently reset by source
    // selection. Prime only after loadeddata so the return seek owns a real frame.
    const result = this.#startPendingEndpointPrime();
    if (!result.started && !result.error && this.#latest) this.#scheduleSeek(this.#latest);
  };

  readonly #onMediaError = () => {
    this.#reloadingFailedSource = false;
    const message = this.#video.error?.message || 'media error';
    this.#failAllWaiters(new MediaPreparationError('MEDIA_ELEMENT_ERROR', message));
  };

  readonly #onMediaAbort = () => {
    if (this.#reloadingFailedSource) return;
    // Packed-alpha surfaces replace their <source> while retiring a parked
    // generation. WebKit emits `abort` for that source removal; when there is
    // no current media resource left, it is not a preparation failure for the
    // newly requested frame.
    if (!this.#video.src
      && this.#video.dataset.packedAlphaSource === 'rgb-alpha-side-by-side'
      && this.#video.querySelector('source')) return;
    this.#failAllWaiters(new MediaPreparationError(
      'MEDIA_PREPARATION_ABORTED',
      'media aborted'
    ));
  };

  readonly #video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.#video = video;
    video.addEventListener('seeked', this.#onSeeked);
    video.addEventListener('loadedmetadata', this.#onLoadedMetadata);
    video.addEventListener('loadeddata', this.#onLoadedData);
    video.addEventListener('error', this.#onMediaError);
    video.addEventListener('abort', this.#onMediaAbort);
    video.addEventListener('progress', this.#onProgress);
  }

  drive(input: TimelineVideoDriveInput): TimelineVideoDriverSnapshot {
    this.#scrollFrameHeld = false;
    if (this.#disposed) {
      return this.snapshot();
    }
    const desired = this.#activate(input);
    this.#latestInput = input;
    this.#latest = desired;
    this.#writeDiagnostics(desired);
    this.#configureElement();

    const endpoint = desired.progress <= 0.001
      ? 'start'
      : desired.progress >= 0.999
        ? 'end'
        : undefined;
    if (endpoint) {
      this.#stopNativePlayback();
      if (this.#canReusePresentedFrame(desired)) {
        this.#markFrameReady(desired, 'playhead-reuse');
      }
      if ((input.endpointPolicy?.[endpoint] ?? 'seek') === 'seek') {
        if (!this.#frameIsReady(desired)) {
          this.#scheduleSeek(desired);
        }
      }
      this.#watchScrollSeek();
      return this.snapshot();
    }

    this.#stopNativePlayback();
    this.#scheduleSeek(desired);
    this.#watchScrollSeek();
    return this.snapshot();
  }

  prepareFrame(input: TimelineVideoDriveInput): Promise<TimelineVideoFrameResult> {
    this.#scrollFrameHeld = false;
    if (this.#disposed) {
      const desired = this.#desiredFrame(input.progress, input);
      return Promise.resolve(frameResult(desired, 'stale'));
    }
    if (input.signal?.aborted) {
      return Promise.reject(this.#abortError(input.signal.reason, input.runId));
    }
    // A source reselect must not inherit preload=none and suspend before its
    // first sample. Configure before the sole explicit load, not after it.
    this.#configureElement();
    // Chromium can exhaust <source> candidates after a transient CDN timeout.
    // Retry selection only on an explicit preparation, never on animation ticks.
    if (input.reloadSource || (this.#video.networkState === 3 && this.#video.readyState === 0)) {
      this.#reloadingFailedSource = true;
      this.#video.load();
    }
    // Endpoint proofs retain the exact authored time, even for quantized playback.
    const exactInput = { ...input, frameRate: undefined, mode: 'timeline' as const };
    const desired = this.#activate(exactInput);
    this.#latestInput = exactInput;
    this.#latest = desired;
    this.#writeDiagnostics(desired);
    this.#stopNativePlayback();

    // Reuse an exact driver-owned proof across a generation handoff. Nearby
    // targets additionally require the physical playhead to remain in-window.
    if (this.#canReusePresentedFrame(desired)) {
      this.#markFrameReady(desired, 'playhead-reuse');
    }

    for (const waiter of [...this.#waiters]) {
      if (
        waiter.generation === desired.generation
        && Math.abs(waiter.targetTime - desired.targetTime) > SEEK_TOLERANCE_SECONDS
      ) {
        this.#resolveWaiter(waiter, 'stale');
      }
    }

    if (this.#frameIsReady(desired)) {
      return Promise.resolve(frameResult(desired, 'ready'));
    }

    let waiter!: FrameWaiter;
    const promise = new Promise<TimelineVideoFrameResult>((resolve, reject) => {
      waiter = { ...desired, resolve, reject };
      this.#waiters.add(waiter);
      if (input.signal) {
        waiter.signal = input.signal;
        waiter.onAbort = () => {
          this.#rejectWaiter(waiter, this.#abortError(input.signal?.reason, input.runId));
          this.#cancelPresentationWhenUnused(waiter);
        };
        if (input.signal.aborted) {
          waiter.onAbort();
        } else {
          input.signal.addEventListener('abort', waiter.onAbort, { once: true });
        }
      }
    });
    if (this.#waiters.has(waiter)) {
      const endpoint = desired.progress <= 0.001 || desired.progress >= 0.999;
      if (endpoint) {
        this.#pendingEndpointPrime = desired;
      }
      if (endpoint && this.#video.readyState < 2) {
        this.#waitingForInitialData = true;
        return promise;
      }
      const priming = endpoint
        ? this.#startPendingEndpointPrime()
        : this.#beginExactTargetSeek(desired);
      if (priming.error) {
        this.#rejectWaiter(waiter, priming.error);
      } else if (!priming.started) {
        this.#scheduleSeek(desired);
      }
    }
    return promise;
  }

  snapshot(): TimelineVideoDriverSnapshot {
    const frameReady = Boolean(
      this.#latest
      && this.#frameReadyGeneration === this.#latest.generation
      && Math.abs(this.#readyTime - this.#latest.targetTime) <= SEEK_TOLERANCE_SECONDS
    );
    return {
      runId: this.#runId,
      direction: this.#direction,
      generation: this.#generation,
      desiredProgress: this.#latest?.progress,
      targetTime: this.#latest?.targetTime,
      seekPending: Boolean(
        this.#pendingEndpointPrime || this.#primingSeek || this.#inFlightSeek || this.#queuedSeek
      ),
      nativeFallback: this.#nativeFallback,
      frameReady,
      ...(Number.isFinite(this.#readyPlayheadTime) ? { presentedPlayheadTime: this.#readyPlayheadTime } : {}),
      ...(Number.isFinite(this.#readyTime) ? { presentedTime: this.#readyTime, presentedGeneration: this.#frameReadyGeneration } : {})
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#cancelScrollSeekWatch();
    this.#generation += 1;
    this.#stopNativePlayback();
    this.#cancelFrameCallback();
    this.#resolveAllWaitersAsStale();
    this.#video.removeEventListener('seeked', this.#onSeeked);
    this.#video.removeEventListener('loadedmetadata', this.#onLoadedMetadata);
    this.#video.removeEventListener('loadeddata', this.#onLoadedData);
    this.#video.removeEventListener('error', this.#onMediaError);
    this.#video.removeEventListener('abort', this.#onMediaAbort);
    this.#video.removeEventListener('progress', this.#onProgress);
    this.#queuedSeek = undefined;
    this.#inFlightSeek = undefined;
    this.#primingSeek = undefined;
    this.#pendingEndpointPrime = undefined;
    this.#cancelPrimingCompletion();
    this.#disposeDecodedFrameProbe();
    this.#latest = undefined;
    this.#latestInput = undefined;
  }

  #activate(input: TimelineVideoDriveInput): DesiredFrame {
    if (this.#runId !== input.runId || this.#direction !== input.direction) {
      this.#generation += 1;
      this.#runId = input.runId;
      this.#direction = input.direction;
      this.#nativeFallback = false;
      this.#frameReadyGeneration = 0;
      // The generation identity is stale, but its last presented media time is
      // still useful evidence if the next generation targets the same frame.
      this.#queuedSeek = undefined;
      this.#primingSeek = undefined;
      this.#pendingEndpointPrime = undefined;
      this.#waitingForInitialData = false;
      this.#cancelPrimingCompletion();
      // A decoder can clear `seeking` without delivering the old generation's
      // final event. Do not let that settled ownership record block the new
      // generation's first causal seek.
      if (!this.#video.seeking) {
        this.#inFlightSeek = undefined;
      }
      this.#cancelFrameCallback();
      delete this.#video.dataset.timelineVideoFrameEvidence;
      delete this.#video.dataset.timelineVideoSourceTime;
      this.#video.pause();
      this.#resolveAllWaitersAsStale();
    }
    return this.#desiredFrame(input.progress, input);
  }

  #desiredFrame(progress: number, input: TimelineVideoDriveInput): DesiredFrame {
    const duration = finiteDuration(this.#video, input.durationFallbackSeconds);
    const epsilon = Math.max(0, input.endEpsilonSeconds ?? DEFAULT_END_EPSILON_SECONDS);
    const start = Math.min(duration, Math.max(0, input.startSeconds ?? 0));
    const defaultEnd = Math.max(start, duration - epsilon);
    const end = Math.max(start, Math.min(defaultEnd, input.endSeconds ?? defaultEnd));
    const clamped = clamp(progress);
    const time = start + (end - start) * clamped;
    const fps = input.frameRate ?? 0;
    const targetTime = Number.isFinite(fps) && fps > 0 && clamped > 0 && clamped < 1
      ? Math.max(start, Math.min(end, Math.round(time * fps) / fps)) : time;
    return {
      generation: this.#generation,
      runId: input.runId,
      direction: input.direction,
      progress: clamped,
      targetTime,
      allowSeekedFrameFallback: input.allowSeekedFrameFallback === true
    };
  }

  #configureElement(): void {
    if (this.#video.preload !== 'auto') {
      this.#video.preload = 'auto';
    }
    this.#video.loop = false;
    this.#video.muted = true;
    this.#video.playsInline = true;
  }

  #stopNativePlayback(): void {
    if (!this.#video.paused) {
      // Native playback has already presented this playhead; preserve it before
      // pausing so a reverse generation can reuse the terminal frame.
      this.#readyTime = this.#video.currentTime;
      this.#video.pause();
    }
  }

  #canReusePresentedFrame(desired: DesiredFrame): boolean {
    const readyDistance = Math.abs(this.#readyTime - desired.targetTime);
    const playheadDistance = Math.abs(this.#video.currentTime - desired.targetTime);
    // A paused scroll endpoint must be the requested frame, not a neighboring
    // sample relabeled with the endpoint's timestamp. Legacy playback keeps its
    // wider presentation window for native decoder handoffs.
    const tolerance = this.#video.closest?.('[data-scroll-platform]')
      ? SEEK_TOLERANCE_SECONDS : TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS;
    return readyDistance <= tolerance && playheadDistance <= tolerance;
  }

  #frameIsReady(desired: DesiredFrame): boolean {
    return this.#frameReadyGeneration === desired.generation
      && Math.abs(this.#readyTime - desired.targetTime) <= SEEK_TOLERANCE_SECONDS;
  }

  #scheduleSeek(desired: DesiredFrame): void {
    if (this.#frameIsReady(desired) && !this.#video.seeking && !this.#inFlightSeek
      && Math.abs(this.#video.currentTime - desired.targetTime) <= SEEK_TOLERANCE_SECONDS) {
      this.#queuedSeek = undefined;
      return;
    }
    this.#queuedSeek = desired;
    this.#flushQueuedSeek();
  }

  #beginExactTargetSeek(desired: DesiredFrame, force = false): {
    started: boolean;
    error?: Error;
  } {
    if (
      this.#primingSeek
      || this.#inFlightSeek
      || (!force && Math.abs(this.#video.currentTime - desired.targetTime) > SEEK_TOLERANCE_SECONDS)
    ) {
      return { started: false };
    }
    // Metadata can still be unavailable for a cold endpoint preparation. Use
    // the caller's declared media duration so the start endpoint retains room
    // for the same cross-frame nudge used after metadata has loaded.
    const duration = finiteDuration(
      this.#video,
      Math.max(
        desired.targetTime + EXACT_TARGET_PRIME_OFFSET_SECONDS,
        this.#latestInput?.durationFallbackSeconds ?? 0
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
      this.#primingSeek = desired;
      this.#video.currentTime = nudgedTime;
      // A settled seek can omit seeked, particularly across source selection.
      // Poll only for completion of this nudge; the return seek still needs
      // its own frame proof. Retirement cancels the pending poll.
      const settle = () => {
        this.#primingCompletionTimer = setTimeout(() => {
          if (this.#video.seeking) settle();
          else this.#completePrimingSeek();
        }, EXACT_TARGET_PRIME_SETTLE_DELAY_MS);
      };
      settle();
      return { started: true };
    } catch (cause) {
      this.#primingSeek = undefined;
      const error = new MediaPreparationError(
        'MEDIA_SEEK_FAILED',
        'prime seek failed',
        { cause }
      );
      this.#failFrame(desired, error);
      return {
        started: false,
        error
      };
    }
  }

  #startPendingEndpointPrime(): {
    started: boolean;
    error?: Error;
  } {
    const pending = this.#pendingEndpointPrime;
    if (!pending || this.#primingSeek || this.#inFlightSeek) {
      return { started: false };
    }
    // Consume ownership before the seek. Some decoded endpoints settle
    // synchronously (`video.seeking` remains false), which re-enters through
    // completeInFlightSeek before beginExactTargetSeek returns.
    this.#pendingEndpointPrime = undefined;
    const result = this.#beginExactTargetSeek(pending, true);
    if (result.started || result.error) {
      return result;
    }
    // A degenerate media interval has no alternate frame to cross. Fall back
    // to the ordinary exact seek without retaining a permanently pending
    // prime request.
    return result;
  }

  #completePrimingSeek(): void {
    const primed = this.#primingSeek;
    if (!primed) {
      return;
    }
    this.#cancelPrimingCompletion();
    this.#primingSeek = undefined;
    if (this.#disposed || primed.generation !== this.#generation) {
      return;
    }
    const next = this.#queuedSeek ?? primed;
    this.#queuedSeek = undefined;
    this.#scheduleSeek(next);
  }

  #flushQueuedSeek(): void {
    if (this.#video.closest?.('[data-scroll-platform]') && (this.#scrollFrameHeld || this.#presentingFrame)) return;
    if (this.#disposed || this.#scrollSourceReloading || this.#inFlightSeek || !this.#queuedSeek) {
      return;
    }
    const desired = this.#queuedSeek;
    this.#queuedSeek = undefined;
    if (desired.generation !== this.#generation) {
      this.#flushQueuedSeek();
      return;
    }
    if (Math.abs(this.#video.currentTime - desired.targetTime) <= SEEK_TOLERANCE_SECONDS) {
      this.#presentFrame(desired);
      this.#flushQueuedSeek();
      return;
    }
    this.#inFlightSeek = desired;
    // Register before assigning currentTime. A paused decoder may submit the
    // target frame immediately, and registering afterward can miss the only
    // causal presentation callback for that seek.
    this.#presentFrame(desired);
    try {
      this.#video.currentTime = desired.targetTime;
    } catch (cause) {
      this.#inFlightSeek = undefined;
      this.#cancelFrameCallback();
      this.#failFrame(desired, new MediaPreparationError(
        'MEDIA_SEEK_FAILED',
        'media seek failed',
        { cause }
      ));
      return;
    }
    if (!this.#video.seeking) {
      this.#completeInFlightSeek();
    }
  }

  #completeInFlightSeek(): void {
    const completed = this.#inFlightSeek;
    if (!completed) {
      return;
    }
    this.#inFlightSeek = undefined;
    if (completed.generation === this.#generation) {
      const callbackPending = this.#frameCallbackId !== undefined
        && this.#presentingFrame?.generation === completed.generation
        && Math.abs(this.#presentingFrame.targetTime - completed.targetTime) <= SEEK_TOLERANCE_SECONDS;
      if (callbackPending) {
        this.#armSeekedFrameFallback(completed, true);
      } else {
        this.#presentFrame(completed);
      }
    }
    const endpointPriming = this.#startPendingEndpointPrime();
    if (endpointPriming.started || endpointPriming.error) {
      return;
    }
    this.#flushQueuedSeek();
  }

  #presentFrame(frame: DesiredFrame): void {
    if (
      this.#frameCallbackId !== undefined
      && this.#presentingFrame?.generation === frame.generation
      && Math.abs(this.#presentingFrame.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      return;
    }
    this.#cancelFrameCallback();
    const video = this.#video as VideoWithFrameCallbacks;
    if (typeof video.requestVideoFrameCallback !== 'function') {
      if (frame.allowSeekedFrameFallback) {
        this.#presentingFrame = frame;
        this.#armSeekedFrameFallback(frame);
        return;
      }
      this.#presentingFrame = undefined;
      this.#failFrame(frame, new MediaPreparationError(
        'MEDIA_FRAME_CALLBACK_UNAVAILABLE',
        'frame callback unavailable'
      ));
      return;
    }
    const generation = frame.generation;
    this.#presentingFrame = frame;
    try {
      this.#frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
        this.#cancelSeekedFrameFallback();
        this.#frameCallbackId = undefined;
        this.#presentingFrame = undefined;
        if (this.#disposed || generation !== this.#generation) {
          return;
        }
        if (
          Number.isFinite(metadata?.mediaTime)
          && Math.abs(metadata.mediaTime - frame.targetTime) > TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS
        ) {
          // A compositor nudge can advance beyond the requested sample before
          // its first callback. Re-seek the proof target instead of following
          // playback away from the only frame this waiter may accept.
          if (this.#waiters.size > 0 && this.#latestInput?.allowPlaybackNudge !== false) {
            this.#video.pause();
          }
          // Animation ticks may already own a newer target. A late callback
          // must not replace that queued target with its obsolete sample.
          this.#scheduleSeek(this.#latest ?? frame);
          return;
        }
        if (
          this.#inFlightSeek?.generation === frame.generation
          && Math.abs(this.#inFlightSeek.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
        ) {
          this.#inFlightSeek = undefined;
        }
        this.#markFrameReady(frame, 'video-frame-callback', metadata?.mediaTime);
        this.#flushQueuedSeek();
      });
      this.#armSeekedFrameFallback(frame);
    } catch (cause) {
      this.#frameCallbackId = undefined;
      if (frame.allowSeekedFrameFallback) {
        this.#presentingFrame = frame;
        this.#armSeekedFrameFallback(frame);
        return;
      }
      this.#presentingFrame = undefined;
      this.#failFrame(frame, new MediaPreparationError(
        'MEDIA_FRAME_CALLBACK_UNAVAILABLE',
        'frame callback failed',
        { cause }
      ));
    }
  }

  #armSeekedFrameFallback(frame: DesiredFrame, settled = false): void {
    const scrollSampling = Boolean(this.#video.closest?.('[data-scroll-platform]'));
    // A hidden desktop receiver cannot reliably submit a compositor callback.
    // Explicit preparation may instead prove the settled decoded sample by
    // reading it through canvas. Ordinary playback remains callback-driven.
    const decodedProbe = !frame.allowSeekedFrameFallback && (
      scrollSampling
      || framePreparations.has(this.#video) && Boolean(this.#video.closest?.('[data-stage-layer]'))
    );
    if (
      (!frame.allowSeekedFrameFallback && !decodedProbe)
      || this.#disposed
      || frame.generation !== this.#generation
    ) {
      return;
    }
    if (
      !settled && this.#seekedFrameFallbackTimer !== undefined
      && this.#seekedFrameFallbackFrame?.generation === frame.generation
      && Math.abs(this.#seekedFrameFallbackFrame.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      return;
    }
    this.#cancelSeekedFrameFallback();
    this.#seekedFrameFallbackFrame = frame;
    const probe = () => {
      this.#seekedFrameFallbackTimer = undefined;
      this.#seekedFrameFallbackFrame = undefined;
      if (
        this.#disposed
        || frame.generation !== this.#generation
      ) {
        return;
      }
      if (scrollSampling && this.#video.readyState >= 2 && !this.#video.seeking
        && Math.abs(this.#video.currentTime - frame.targetTime) > TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS) {
        // Source selection can finish a paused seek at frame zero instead of
        // its requested time. That settled mismatch cannot prove this frame;
        // retire the stranded callback and issue the current target again.
        this.#cancelFrameCallback();
        this.#inFlightSeek = undefined;
        this.#scrollFrameHeld = false;
        this.#scheduleSeek(this.#latest ?? frame);
        return;
      }
      if (
        this.#video.readyState < 2
        || this.#video.seeking
        || Math.abs(this.#video.currentTime - frame.targetTime) > TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS
      ) {
        const waiting = [...this.#waiters].some((waiter) => (
          waiter.generation === frame.generation
          && Math.abs(waiter.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
        ));
        if (waiting || scrollSampling && this.#presentingFrame?.generation === frame.generation
          && Math.abs(this.#presentingFrame.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS) {
          this.#armSeekedFrameFallback(frame);
        }
        return;
      }
      if (this.#inFlightSeek?.generation === frame.generation
        && Math.abs(this.#inFlightSeek.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS) {
        this.#inFlightSeek = undefined;
      }
      if (decodedProbe) {
        // One private readback surface per live driver, not a new backing
        // store/GPU readback allocation for every paused scroll seek. The
        // decoded-data, physical target and real pixel-read proof stay intact.
        if (!this.#decodedFrameProbe) {
          const canvas = this.#video.ownerDocument.createElement('canvas');
          canvas.width = canvas.height = 1;
          this.#decodedFrameProbe = canvas;
          this.#decodedFrameContext = canvas.getContext('2d', { willReadFrequently: true });
        }
        const context = this.#decodedFrameContext;
        if (!context) return;
        try {
          context.drawImage(this.#video, 0, 0, 1, 1);
          context.getImageData(0, 0, 1, 1);
        } catch {
          // A tainted or lost surface must not poison a later valid source.
          this.#disposeDecodedFrameProbe();
          return;
        }
      }
      this.#markFrameReady(frame, decodedProbe ? 'decoded-canvas' : 'seeked-fallback');
      this.#flushQueuedSeek();
    // Scrub cannot spend 120ms waiting for a callback from a hidden surface.
    // The earlier probe retains the same decoded-data, settled-seek, identity
    // and target-time checks; it never promotes a pending seek to ready.
    };
    // seeked already gives a causal settled-data boundary. Prove those pixels
    // now rather than adding a timer turn (and often a whole display frame)
    // to every hidden scroll decoder. Unsettled/no-event cases keep the probe.
    if (settled && scrollSampling && decodedProbe && this.#video.readyState >= 2
      && !this.#video.seeking
      && Math.abs(this.#video.currentTime - frame.targetTime) <= TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS) probe();
    else this.#seekedFrameFallbackTimer = setTimeout(probe,
      scrollSampling ? SCROLL_FRAME_PROBE_DELAY_MS : SEEKED_FRAME_FALLBACK_DELAY_MS);
  }

  #cancelScrollSeekWatch(): void {
    if (this.#scrollSeekWatch !== undefined) clearTimeout(this.#scrollSeekWatch);
    this.#scrollSeekWatch = undefined;
  }

  #watchScrollSeek(): void {
    // Preparation already owns its one retry and original 19s deadline. This
    // watchdog covers only an active paused scrub, which previously could
    // retain a zero-body Range request until the runtime's 20s failure.
    if (this.#scrollSeekWatch !== undefined || this.#scrollSeekRetried || this.#disposed
      || this.#nativeFallback || framePreparations.has(this.#video)
      || !this.#video.closest?.('[data-scroll-platform]') || !this.#video.seeking) return;
    const signature = () => {
      const buffered = this.#video.buffered;
      return [this.#video.readyState, this.#video.seeking, this.#video.currentTime,
        buffered?.length ? buffered.end(buffered.length - 1) : 0].join(':');
    };
    this.#scrollSeekSignature = signature();
    this.#scrollSeekChangedAt = Date.now();
    const check = () => {
      this.#scrollSeekWatch = undefined;
      if (this.#disposed || this.#nativeFallback || !this.#video.seeking
        || framePreparations.has(this.#video) || this.#video.error) return;
      const next = signature();
      if (next !== this.#scrollSeekSignature) {
        this.#scrollSeekSignature = next; this.#scrollSeekChangedAt = Date.now();
      }
      if (Date.now() - this.#scrollSeekChangedAt >= FRAME_PREPARATION_STALL_MS
        && this.#video.networkState === 2 && this.#video.readyState < 2) {
        this.#scrollSeekRetried = true;
        this.#cancelFrameCallback(); this.#cancelPrimingCompletion();
        this.#inFlightSeek = this.#primingSeek = this.#pendingEndpointPrime = undefined;
        this.#queuedSeek = this.#latest;
        this.#frameReadyGeneration = 0; this.#readyTime = this.#readyPlayheadTime = NaN;
        this.#scrollFrameHeld = false;
        delete this.#video.dataset.timelineVideoFrameReady;
        delete this.#video.dataset.timelineVideoFrameEvidence;
        delete this.#video.dataset.timelineVideoSourceTime;
        this.#video.dataset.timelineVideoScrubRetry = '1';
        this.#configureElement();
        this.#reloadingFailedSource = this.#scrollSourceReloading = true;
        // Same source, same latest pose, same generation and same outer
        // convergence deadline. Coherence still holds every paired lane.
        try { this.#video.load(); }
        catch (cause) { this.#failAllWaiters(new MediaPreparationError('MEDIA_SEEK_FAILED', 'scroll source reload failed', { cause })); }
        return;
      }
      this.#scrollSeekWatch = setTimeout(check, 250);
    };
    this.#scrollSeekWatch = setTimeout(check, 250);
  }

  #cancelSeekedFrameFallback(): void {
    if (this.#seekedFrameFallbackTimer !== undefined) {
      clearTimeout(this.#seekedFrameFallbackTimer);
    }
    this.#seekedFrameFallbackTimer = undefined;
    this.#seekedFrameFallbackFrame = undefined;
  }

  #disposeDecodedFrameProbe(): void {
    if (this.#decodedFrameProbe) this.#decodedFrameProbe.width = this.#decodedFrameProbe.height = 0;
    this.#decodedFrameProbe = undefined;
    this.#decodedFrameContext = null;
  }

  #cancelPrimingCompletion(): void {
    if (this.#primingCompletionTimer !== undefined) {
      clearTimeout(this.#primingCompletionTimer);
    }
    this.#primingCompletionTimer = undefined;
  }

  #markFrameReady(frame: DesiredFrame, evidence: FramePresentationEvidence, sourceTime?: number): void {
    if (frame.generation !== this.#generation) {
      return;
    }
    if (
      this.#video.readyState < 2
      || (this.#video.seeking && evidence !== 'video-frame-callback')
    ) {
      this.#presentFrame(frame);
      return;
    }
    this.#cancelFrameCallback();
    this.#cancelScrollSeekWatch();
    const scrollSampling = Boolean(this.#video.closest?.('[data-scroll-platform]'));
    // Preparation may have nudged native playback to wake the compositor.
    // Freeze it before recording the physical proof, not in a later promise.
    if (scrollSampling) this.#video.pause();
    const newlyPresented = this.#frameReadyGeneration !== frame.generation || this.#readyTime !== frame.targetTime;
    this.#frameReadyGeneration = frame.generation;
    this.#readyTime = frame.targetTime;
    this.#readyPlayheadTime = this.#video.currentTime;
    this.#scrollFrameHeld = scrollSampling;
    if (
      this.#pendingEndpointPrime?.generation === frame.generation
      && Math.abs(this.#pendingEndpointPrime.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      this.#pendingEndpointPrime = undefined;
    }
    this.#video.dataset.timelineVideoFrameReady = 'true';
    this.#video.dataset.timelineVideoFrameEvidence = evidence;
    this.#video.dataset.timelineVideoPresentedTime = frame.targetTime.toFixed(4);
    this.#video.dataset.timelineVideoPresentedGeneration = String(frame.generation);
    if (sourceTime !== undefined && Number.isFinite(sourceTime)) this.#video.dataset.timelineVideoSourceTime = sourceTime.toFixed(6);
    else delete this.#video.dataset.timelineVideoSourceTime;
    delete this.#video.dataset.timelineVideoStaticFallback;
    for (const waiter of [...this.#waiters]) {
      if (
        waiter.generation === frame.generation
        && Math.abs(waiter.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
      ) {
        this.#resolveWaiter(waiter, 'ready');
      }
    }
    if (newlyPresented) this.#video.dispatchEvent?.(new Event('timelinevideoframe'));
  }

  #cancelFrameCallback(): void {
    this.#cancelSeekedFrameFallback();
    if (this.#frameCallbackId === undefined) {
      this.#presentingFrame = undefined;
      return;
    }
    const video = this.#video as VideoWithFrameCallbacks;
    video.cancelVideoFrameCallback?.(this.#frameCallbackId);
    this.#frameCallbackId = undefined;
    this.#presentingFrame = undefined;
  }

  #resolveAllWaitersAsStale(): void {
    for (const waiter of [...this.#waiters]) {
      this.#resolveWaiter(waiter, 'stale');
    }
  }

  #resolveWaiter(waiter: FrameWaiter, status: TimelineVideoFrameResult['status']): void {
    if (!this.#waiters.delete(waiter)) {
      return;
    }
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    }
    waiter.resolve(frameResult(waiter, status));
  }

  #rejectWaiter(waiter: FrameWaiter, error: Error): void {
    if (!this.#waiters.delete(waiter)) {
      return;
    }
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    }
    waiter.reject(error);
  }

  #rejectWaitersForFrame(frame: DesiredFrame, error: Error): void {
    for (const waiter of [...this.#waiters]) {
      if (
        waiter.generation === frame.generation
        && Math.abs(waiter.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
      ) {
        this.#rejectWaiter(waiter, error);
      }
    }
  }

  #failFrame(frame: DesiredFrame, error: Error): void {
    this.#markStaticFallback();
    this.#rejectWaitersForFrame(frame, error);
  }

  #failAllWaiters(error: Error): void {
    this.#markStaticFallback();
    for (const waiter of [...this.#waiters]) {
      this.#rejectWaiter(waiter, error);
    }
  }

  #cancelPresentationWhenUnused(frame: DesiredFrame): void {
    if (!this.#waiters.size) {
      this.#primingSeek = undefined;
      this.#cancelPrimingCompletion();
    }
    const stillWaiting = [...this.#waiters].some((waiter) => (
      waiter.generation === frame.generation
      && Math.abs(waiter.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ));
    if (
      !stillWaiting
      && this.#pendingEndpointPrime?.generation === frame.generation
      && Math.abs(this.#pendingEndpointPrime.targetTime - frame.targetTime) <= SEEK_TOLERANCE_SECONDS
    ) {
      this.#pendingEndpointPrime = undefined;
    }
    if (
      !this.#presentingFrame
      || this.#presentingFrame.generation !== frame.generation
      || Math.abs(this.#presentingFrame.targetTime - frame.targetTime) > SEEK_TOLERANCE_SECONDS
    ) {
      return;
    }
    if (stillWaiting) {
      return;
    }
    this.#cancelFrameCallback();
  }

  #abortError(reason: unknown, runId: string): Error {
    if (reason instanceof MediaPreparationError) {
      return reason;
    }
    return new MediaPreparationError(
      'MEDIA_PREPARATION_ABORTED',
      `media frame preparation aborted for ${runId}`,
      reason === undefined ? {} : { cause: reason }
    );
  }

  #writeDiagnostics(desired: DesiredFrame): void {
    this.#video.dataset.timelineVideoRun = desired.runId;
    this.#video.dataset.timelineVideoDirection = String(desired.direction);
    this.#video.dataset.timelineVideoGeneration = String(desired.generation);
    this.#video.dataset.timelineVideoProgress = desired.progress.toFixed(4);
    this.#video.dataset.timelineVideoTarget = desired.targetTime.toFixed(4);
    this.#video.dataset.timelineVideoFallback = String(this.#nativeFallback);
  }

  #markStaticFallback(): void {
    this.#cancelScrollSeekWatch();
    this.#scrollSourceReloading = this.#reloadingFailedSource = false;
    this.#stopNativePlayback();
    this.#nativeFallback = true;
    this.#frameReadyGeneration = 0;
    this.#readyTime = Number.NaN;
    this.#queuedSeek = undefined;
    this.#inFlightSeek = undefined;
    this.#primingSeek = undefined;
    this.#pendingEndpointPrime = undefined;
    this.#cancelPrimingCompletion();
    this.#cancelFrameCallback();
    delete this.#video.dataset.timelineVideoFrameReady;
    delete this.#video.dataset.timelineVideoFrameEvidence;
    delete this.#video.dataset.timelineVideoSourceTime;
    this.#video.dataset.timelineVideoFallback = 'true';
    this.#video.dataset.timelineVideoStaticFallback = 'true';
  }
}

const sharedDrivers = new WeakMap<HTMLVideoElement, TimelineVideoDriver>();
type SharedFramePreparation = {
  key: string;
  controller: AbortController;
  users: Set<symbol>;
  promise: Promise<TimelineVideoFrameResult>;
};
const framePreparations = new WeakMap<HTMLVideoElement, SharedFramePreparation>();
export const FRAME_PREPARATION_STALL_MS = 4000;
const FRAME_PREPARATION_DEADLINE_MS = 19000;

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
    framePreparations.get(video)?.controller.abort('retired');
    framePreparations.delete(video);
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
  framePreparations.get(video)?.controller.abort('retired');
  framePreparations.delete(video);
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
  if (!video) return undefined;
  const driver = timelineVideoDriverFor(video);
  if (deferScrollMediaRequest(video, () => { driver.drive(input); })) return driver.snapshot();
  return driver.drive(input);
}

export function prepareTimelineVideoFrame(
  video: HTMLVideoElement | null | undefined,
  input: TimelineVideoDriveInput
): Promise<TimelineVideoFrameResult | undefined> {
  if (!video) return Promise.resolve(undefined);
  if (input.signal?.aborted) return Promise.reject(preparationAbort(input.signal.reason));
  const duration = finiteDuration(video, input.durationFallbackSeconds);
  const start = Math.min(duration, Math.max(0, input.startSeconds ?? 0));
  const end = Math.max(start, Math.min(duration - (input.endEpsilonSeconds ?? DEFAULT_END_EPSILON_SECONDS), input.endSeconds ?? duration));
  // Run identities may change between prewarm, admission and build. A physical
  // endpoint with the same proof policy shares its decoder work, not its lease.
  const key = [start + (end - start) * clamp(input.progress), input.direction,
    input.allowPlaybackNudge === false, input.allowSeekedFrameFallback === true].join(':');
  let entry = framePreparations.get(video);
  if (!entry || entry.controller.signal.aborted || entry.key !== key) {
    entry?.controller.abort('superseded');
    const controller = new AbortController();
    entry = { key, controller, users: new Set(), promise: undefined! };
    framePreparations.set(video, entry);
    const owned = entry;
    entry.promise = runFramePreparation(video, input, controller).finally(() => {
      if (framePreparations.get(video) !== owned) return;
      framePreparations.delete(video);
      video.pause();
    });
  }
  const owned = entry;
  const lease = Symbol(input.runId);
  owned.users.add(lease);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      input.signal?.removeEventListener('abort', abort);
      owned.users.delete(lease);
      if (!owned.users.size) owned.controller.abort('unobserved');
      return true;
    };
    const abort = () => { if (finish()) reject(preparationAbort(input.signal?.reason)); };
    input.signal?.addEventListener('abort', abort, { once: true });
    owned.promise.then((result) => {
      if (finish()) resolve({ ...result, runId: input.runId, direction: input.direction });
    }, (error: unknown) => { if (finish()) reject(error); });
  });
}

function preparationAbort(reason: unknown): Error {
  return reason instanceof MediaPreparationError ? reason
    : new MediaPreparationError('MEDIA_PREPARATION_ABORTED', 'Media preparation cancelled', { cause: reason });
}

async function runFramePreparation(
  video: HTMLVideoElement, input: TimelineVideoDriveInput, controller: AbortController
): Promise<TimelineVideoFrameResult> {
  const deadline = setTimeout(() => controller.abort(new MediaPreparationError(
    'MEDIA_PREPARATION_TIMEOUT', `Frame deadline for ${input.runId}`
  )), FRAME_PREPARATION_DEADLINE_MS);
  let driver = timelineVideoDriverFor(video);
  const sourceAlreadyFailed = video.networkState === 3 && video.readyState === 0;
  try {
    for (let attempt = 0; ; attempt++) {
      const trial = new AbortController();
      const abort = () => trial.abort(controller.signal.reason);
      controller.signal.addEventListener('abort', abort, { once: true });
      if (controller.signal.aborted) abort();
      let signature = '';
      let changedAt = Date.now();
      const progress = () => { changedAt = Date.now(); };
      video.addEventListener('progress', progress);
      const watch = setInterval(() => {
        const buffered = video.buffered;
        const next = [video.readyState, video.currentTime, video.seeking,
          buffered?.length ? buffered.end(buffered.length - 1) : 0].join(':');
        if (next !== signature) { signature = next; changedAt = Date.now(); }
        else if (Date.now() - changedAt >= FRAME_PREPARATION_STALL_MS) {
          // The one allowed reload is already spent. NETWORK_LOADING still
          // owns a live request (often waiting for its first byte), so a lack
          // of decoded frames is not a terminal failure yet. Do not discard
          // that final request at 4s while its existing 19s deadline has time.
          // Idle/no-source, media errors and cancellation keep failing closed.
          if ((attempt > 0 || sourceAlreadyFailed) && video.networkState === 2 && !video.error) return;
          trial.abort(new MediaPreparationError('MEDIA_PREPARATION_STALLED',
            `Frame stalled for ${input.runId}; readyState=${video.readyState}; seeking=${video.seeking}`));
        }
      }, 250);
      // Scroll preparation has a settled decoded-frame probe even when hidden.
      // A native play nudge can resume after the proof and move a parked frame.
      const nudge = input.allowPlaybackNudge === false || video.closest?.('[data-scroll-platform]') ? undefined : setTimeout(() => {
        if (!trial.signal.aborted) void video.play().catch(() => undefined);
      }, PAUSED_COMPOSITOR_NUDGE_MS);
      try {
        return await driver.prepareFrame({ ...input, signal: trial.signal, reloadSource: attempt > 0 });
      } catch (error) {
        if (controller.signal.aborted) {
          if (typeof controller.signal.reason === 'string') {
            const state = driver.snapshot();
            return { status: 'stale', runId: input.runId, direction: input.direction,
              generation: state.generation, targetTime: state.targetTime ?? 0 };
          }
          throw preparationAbort(controller.signal.reason);
        }
        if (attempt > 0 || sourceAlreadyFailed || !(error instanceof MediaPreparationError)
          || error.code !== 'MEDIA_PREPARATION_STALLED') throw error;
        // Reset a physically stuck seek once, with the original overall deadline.
        driver.dispose();
        sharedDrivers.delete(video);
        driver = timelineVideoDriverFor(video);
        video.dataset.timelineVideoRetry = '1';
      } finally {
        clearInterval(watch);
        video.removeEventListener('progress', progress);
        if (nudge !== undefined) clearTimeout(nudge);
        controller.signal.removeEventListener('abort', abort);
      }
    }
  } finally { clearTimeout(deadline); }
}
