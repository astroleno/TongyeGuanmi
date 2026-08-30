import { createLinkedAbortController } from '../../media/media-preparation';

import {
  frameIndexForMediaTime,
  frameIndexForProgress,
  mediaTimeForFrame,
  type SpikeVideoFrameMap
} from './spike-frame-map';

export type StrictVideoFrameCallbackMetadata = Readonly<{
  mediaTime: number;
}>;

export type StrictVideoProbeCapability = Readonly<{
  rvfcAvailable: boolean;
  callbackFailure: boolean;
  evidenceType: 'video-frame-callback' | 'none';
  browserEngine: string;
  browserVersion: string;
  osVersion: string;
  deviceModel: string;
}>;

export type StrictVideoProbeRequest = Readonly<{
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredProgress: number;
  frameMap: SpikeVideoFrameMap;
  signal?: AbortSignal;
}>;

export type StrictVideoProbeReceipt = Readonly<{
  status: 'presented' | 'stale';
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  mediaTimeSeconds: number;
  evidence: 'video-frame-callback' | 'none';
  capability: StrictVideoProbeCapability;
}>;

type Callback = (
  now: number,
  metadata: StrictVideoFrameCallbackMetadata
) => void;

type StrictVideoElement = {
  currentTime: number;
  seeking: boolean;
  requestVideoFrameCallback?: (callback: Callback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
  addEventListener(type: 'seeked', listener: () => void): void;
  removeEventListener(type: 'seeked', listener: () => void): void;
  pause(): void;
};

type StrictVideoProbeOptions = Readonly<{
  onExactSeekRetry?: () => void;
}>;

type PendingRequest = StrictVideoProbeRequest & {
  desiredFrameIndex: number;
  targetTime: number;
  settled: boolean;
  obsolete: boolean;
  seekSettled: boolean;
  retryPlaybackPending: boolean;
  exactSeekRetries: number;
  retryHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
  resolve(receipt: StrictVideoProbeReceipt): void;
  disposeAbortListener(): void;
};

export type StrictVideoProbe = Readonly<{
  request(request: StrictVideoProbeRequest): Promise<StrictVideoProbeReceipt>;
  dispose(): void;
}>;

const defaultCapability: StrictVideoProbeCapability = {
  rvfcAvailable: true,
  callbackFailure: false,
  evidenceType: 'video-frame-callback',
  browserEngine: 'unknown',
  browserVersion: 'unknown',
  osVersion: 'unknown',
  deviceModel: 'unknown'
};

const MAX_EXACT_SEEK_RETRIES = 8;
const EXACT_SEEK_RETRY_DELAY_MS = 50;

function staleReceipt(
  request: PendingRequest,
  capability: StrictVideoProbeCapability
): StrictVideoProbeReceipt {
  return {
    status: 'stale',
    runId: request.runId,
    direction: request.direction,
    sequence: request.sequence,
    desiredFrameIndex: request.desiredFrameIndex,
    presentedFrameIndex: request.desiredFrameIndex,
    mediaTimeSeconds: request.targetTime,
    evidence: 'none',
    capability
  };
}

class StrictVideoProbeImpl implements StrictVideoProbe {
  private readonly lifecycle = createLinkedAbortController();
  private readonly capability: StrictVideoProbeCapability;
  private readonly options: StrictVideoProbeOptions;
  private active: PendingRequest | undefined;
  private queued: PendingRequest | undefined;
  private callbackHandle: number | undefined;
  private latestSequence = -1;
  private disposed = false;

  private readonly onSeeked = () => {
    const active = this.active;
    if (!active) return;
    active.seekSettled = true;
    if (active.obsolete) {
      this.flushObsoleteActive();
    } else {
      const shouldNudgeDecoder = active.retryPlaybackPending;
      active.retryPlaybackPending = false;
      this.cancelCallback();
      this.armCallback(active);
      if (shouldNudgeDecoder && !active.settled) {
        this.options.onExactSeekRetry?.();
      }
    }
  };

  constructor(
    private readonly video: StrictVideoElement,
    capability: Partial<StrictVideoProbeCapability> = {},
    options: StrictVideoProbeOptions = {}
  ) {
    this.capability = { ...defaultCapability, ...capability };
    this.options = options;
    video.addEventListener('seeked', this.onSeeked);
  }

  request(request: StrictVideoProbeRequest): Promise<StrictVideoProbeReceipt> {
    const desiredFrameIndex = frameIndexForProgress(
      request.frameMap,
      request.desiredProgress
    );
    const targetTime = mediaTimeForFrame(request.frameMap, desiredFrameIndex);
    if (this.disposed || request.sequence <= this.latestSequence) {
      return Promise.resolve(staleReceipt(
        {
          ...request,
          desiredFrameIndex,
          targetTime,
          settled: true,
          obsolete: true,
          seekSettled: true,
          retryPlaybackPending: false,
          exactSeekRetries: 0,
          retryHandle: undefined,
          resolve: () => undefined,
          disposeAbortListener: () => undefined
        },
        this.capability
      ));
    }
    this.latestSequence = request.sequence;
    let resolve!: (receipt: StrictVideoProbeReceipt) => void;
    const result = new Promise<StrictVideoProbeReceipt>((promiseResolve) => {
      resolve = promiseResolve;
    });
    const pending = this.createPending(
      request,
      desiredFrameIndex,
      targetTime,
      resolve
    );
    if (this.queued) this.settleStale(this.queued);
    this.queued = pending;
    if (this.active) {
      this.active.obsolete = true;
      this.settleStale(this.active);
      if (this.active.seekSettled || !this.video.seeking) this.flushObsoleteActive();
    } else {
      this.flushQueued();
    }
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycle.controller.abort();
    this.cancelCallback();
    this.video.removeEventListener('seeked', this.onSeeked);
    if (this.active) this.settleStale(this.active);
    if (this.queued) this.settleStale(this.queued);
    this.active = undefined;
    this.queued = undefined;
    this.video.pause();
    this.lifecycle.dispose();
  }

  private createPending(
    request: StrictVideoProbeRequest,
    desiredFrameIndex: number,
    targetTime: number,
    resolve: (receipt: StrictVideoProbeReceipt) => void
  ): PendingRequest {
    const pending: PendingRequest = {
      ...request,
      desiredFrameIndex,
      targetTime,
      settled: false,
      obsolete: false,
      seekSettled: false,
      retryPlaybackPending: false,
      exactSeekRetries: 0,
      retryHandle: undefined,
      resolve,
      disposeAbortListener: () => undefined
    };
    pending.disposeAbortListener = () => {
      request.signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      pending.obsolete = true;
      this.settleStale(pending);
      if (this.active === pending && (pending.seekSettled || !this.video.seeking)) {
        this.flushObsoleteActive();
      }
      if (this.queued === pending) {
        this.queued = undefined;
        this.flushQueued();
      }
    };
    if (request.signal) {
      if (request.signal.aborted) onAbort();
      else request.signal.addEventListener('abort', onAbort, { once: true });
    }
    return pending;
  }

  private flushQueued(): void {
    if (this.disposed || this.active || !this.queued) return;
    const pending = this.queued;
    this.queued = undefined;
    if (pending.settled) {
      this.flushQueued();
      return;
    }
    this.active = pending;
    pending.seekSettled = !this.video.seeking;
    this.armCallback(pending);
    if (pending.settled) return;
    try {
      this.video.currentTime = pending.targetTime;
      pending.seekSettled = !this.video.seeking;
    } catch {
      pending.obsolete = true;
      this.settleStale(pending);
      this.flushObsoleteActive();
    }
  }

  private armCallback(pending: PendingRequest): void {
    this.clearRetryWatchdog(pending);
    if (typeof this.video.requestVideoFrameCallback !== 'function') {
      pending.obsolete = true;
      this.settleStale(pending);
      this.active = undefined;
      this.flushQueued();
      return;
    }
    try {
      this.callbackHandle = this.video.requestVideoFrameCallback((_now, metadata) => {
        this.callbackHandle = undefined;
        if (this.disposed || this.active !== pending) return;
        if (pending.obsolete || pending.sequence !== this.latestSequence) {
          if (pending.seekSettled || !this.video.seeking) {
            this.flushObsoleteActive();
          } else {
            this.armCallback(pending);
          }
          return;
        }
        if (!pending.seekSettled) {
          this.armCallback(pending);
          return;
        }
        const presentedFrameIndex = frameIndexForMediaTime(
          pending.frameMap,
          metadata.mediaTime
        );
        if (presentedFrameIndex !== pending.desiredFrameIndex) {
          if (pending.exactSeekRetries < MAX_EXACT_SEEK_RETRIES) {
            pending.exactSeekRetries += 1;
            this.reissueExactSeek(pending);
          } else {
            this.armCallback(pending);
          }
          return;
        }
        this.active = undefined;
        this.settle(pending, {
          status: 'presented',
          runId: pending.runId,
          direction: pending.direction,
          sequence: pending.sequence,
          desiredFrameIndex: pending.desiredFrameIndex,
          presentedFrameIndex,
          mediaTimeSeconds: metadata.mediaTime,
          evidence: 'video-frame-callback',
          capability: this.capability
        });
        this.flushQueued();
      });
      if (this.active === pending && !pending.settled) this.armRetryWatchdog(pending);
    } catch {
      pending.obsolete = true;
      this.settleStale(pending);
      this.active = undefined;
      this.flushQueued();
    }
  }

  private flushObsoleteActive(): void {
    const active = this.active;
    if (!active || !active.obsolete) return;
    this.cancelCallback();
    this.active = undefined;
    this.flushQueued();
  }

  private reissueExactSeek(pending: PendingRequest): void {
    this.clearRetryWatchdog(pending);
    pending.seekSettled = false;
    pending.retryPlaybackPending = true;
    try {
      // currentTime only restarts the browser seek. The receipt below still
      // requires an RVFC metadata timestamp that maps to the requested frame.
      this.video.pause();
      this.video.currentTime = pending.targetTime;
      pending.seekSettled = !this.video.seeking;
      if (pending.seekSettled) {
        pending.retryPlaybackPending = false;
        this.armCallback(pending);
        if (!pending.settled) this.options.onExactSeekRetry?.();
      }
    } catch {
      pending.obsolete = true;
      this.settleStale(pending);
      this.active = undefined;
      this.flushQueued();
    }
  }

  private armRetryWatchdog(pending: PendingRequest): void {
    this.clearRetryWatchdog(pending);
    if (pending.settled || pending.obsolete || this.active !== pending) return;
    pending.retryHandle = globalThis.setTimeout(() => {
      pending.retryHandle = undefined;
      if (this.disposed || this.active !== pending || pending.settled || pending.obsolete) return;
      if (!pending.seekSettled) {
        this.armRetryWatchdog(pending);
        return;
      }
      // Safari can emit seeked but no fresh RVFC for the requested frame.
      // Restart the seek as a bounded recovery; never synthesize a receipt.
      if (pending.exactSeekRetries >= MAX_EXACT_SEEK_RETRIES) return;
      pending.exactSeekRetries += 1;
      this.reissueExactSeek(pending);
    }, EXACT_SEEK_RETRY_DELAY_MS);
  }

  private clearRetryWatchdog(pending: PendingRequest): void {
    if (pending.retryHandle === undefined) return;
    globalThis.clearTimeout(pending.retryHandle);
    pending.retryHandle = undefined;
  }

  private cancelCallback(): void {
    if (this.callbackHandle !== undefined) {
      this.video.cancelVideoFrameCallback?.(this.callbackHandle);
    }
    this.callbackHandle = undefined;
  }

  private settleStale(pending: PendingRequest): void {
    this.settle(pending, staleReceipt(pending, this.capability));
  }

  private settle(
    pending: PendingRequest,
    receipt: StrictVideoProbeReceipt
  ): void {
    if (pending.settled) return;
    pending.settled = true;
    this.clearRetryWatchdog(pending);
    pending.disposeAbortListener();
    pending.resolve(receipt);
  }
}

export function createStrictVideoProbe(
  video: HTMLVideoElement | StrictVideoElement,
  capability: Partial<StrictVideoProbeCapability> = {},
  options: StrictVideoProbeOptions = {}
): StrictVideoProbe {
  return new StrictVideoProbeImpl(video as StrictVideoElement, capability, options);
}
