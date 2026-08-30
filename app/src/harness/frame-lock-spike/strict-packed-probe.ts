import type { PhonePackedAlphaSurfaceFrame } from '../../media/phone-packed-alpha-surface';
import {
  frameIndexForMediaTime,
  frameIndexForProgress,
  mediaTimeForFrame,
} from './spike-frame-map';
import {
  createStrictVideoProbe,
  type StrictVideoProbe,
  type StrictVideoProbeCapability,
  type StrictVideoProbeReceipt,
  type StrictVideoProbeRequest
} from './strict-video-probe';

export type StrictPackedProbeRequest = StrictVideoProbeRequest;

export type StrictPackedProbeReceipt = Readonly<{
  status: 'presented' | 'stale';
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  mediaTimeSeconds: number;
  evidence: 'packed-canvas-draw' | 'none';
  generation?: number;
  capability: StrictVideoProbeCapability;
}>;

export type StrictPackedProbe = Readonly<{
  request(request: StrictPackedProbeRequest): Promise<StrictPackedProbeReceipt>;
  notifyFrame(frame: PhonePackedAlphaSurfaceFrame): void;
  render(): boolean;
  fail(error: Error): void;
  dispose(): void;
}>;

type PackedCanvasFrame = Readonly<{
  generation: number;
  mediaTimeSeconds: number;
}>;

type PendingRequest = {
  request: StrictPackedProbeRequest;
  desiredFrameIndex: number;
  targetTime: number;
  expectedGeneration: number;
  controller: AbortController;
  canvasFrame?: PackedCanvasFrame;
  videoReceipt?: StrictVideoProbeReceipt;
  timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
  settled: boolean;
  resolve(receipt: StrictPackedProbeReceipt): void;
  reject(error: Error): void;
  onAbort: () => void;
};

type StrictPackedProbeOptions = Readonly<{
  video: HTMLVideoElement;
  render: () => boolean;
  getActiveGeneration: () => number;
  capability?: Partial<StrictVideoProbeCapability>;
  timeoutMs?: number;
}>;

function staleReceipt(
  pending: Pick<PendingRequest, 'request' | 'desiredFrameIndex' | 'targetTime'>,
  capability: StrictVideoProbeCapability
): StrictPackedProbeReceipt {
  return {
    status: 'stale',
    runId: pending.request.runId,
    direction: pending.request.direction,
    sequence: pending.request.sequence,
    desiredFrameIndex: pending.desiredFrameIndex,
    presentedFrameIndex: pending.desiredFrameIndex,
    mediaTimeSeconds: pending.targetTime,
    evidence: 'none',
    capability
  };
}

function canvasMediaTime(frame: PhonePackedAlphaSurfaceFrame): number | undefined {
  if (frame.canvas.dataset.packedAlphaFrameReady !== 'true') return undefined;
  const mediaTime = Number(frame.canvas.dataset.packedAlphaMediaTime);
  return Number.isFinite(mediaTime) ? mediaTime : undefined;
}

export function createStrictPackedProbe(
  options: StrictPackedProbeOptions
): StrictPackedProbe {
  const videoProbe: StrictVideoProbe = createStrictVideoProbe(
    options.video,
    options.capability
  );
  const timeoutMs = options.timeoutMs ?? 3_000;
  let latestSequence = -1;
  let pending: PendingRequest | undefined;
  let disposed = false;
  let failed = false;
  const capabilitySnapshot: StrictVideoProbeCapability = {
    rvfcAvailable: true,
    callbackFailure: false,
    evidenceType: 'video-frame-callback',
    browserEngine: 'unknown',
    browserVersion: 'unknown',
    osVersion: 'unknown',
    deviceModel: 'unknown',
    ...options.capability
  };

  const cleanupPending = (request: PendingRequest) => {
    if (request.timeoutHandle !== undefined) {
      globalThis.clearTimeout(request.timeoutHandle);
      request.timeoutHandle = undefined;
    }
    if (!request.request.signal) return;
    request.request.signal.removeEventListener('abort', request.onAbort);
  };

  const settle = (
    request: PendingRequest,
    receipt: StrictPackedProbeReceipt
  ) => {
    if (request.settled) return;
    request.settled = true;
    cleanupPending(request);
    if (pending === request) pending = undefined;
    request.resolve(receipt);
  };

  const reject = (request: PendingRequest, error: Error) => {
    if (request.settled) return;
    request.settled = true;
    cleanupPending(request);
    if (pending === request) pending = undefined;
    request.reject(error);
  };

  const settleCurrentStale = () => {
    if (!pending) return;
    const current = pending;
    current.controller.abort();
    settle(current, staleReceipt(current, capabilitySnapshot));
  };

  const tryCommit = () => {
    const current = pending;
    if (!current || current.settled) return;
    if (current.expectedGeneration !== options.getActiveGeneration()) {
      settle(current, staleReceipt(current, capabilitySnapshot));
      return;
    }
    const videoReceipt = current.videoReceipt;
    const canvasFrame = current.canvasFrame;
    if (!videoReceipt || !canvasFrame) return;
    if (videoReceipt.status !== 'presented') {
      settle(current, staleReceipt(current, videoReceipt.capability));
      return;
    }
    settle(current, {
      status: 'presented',
      runId: current.request.runId,
      direction: current.request.direction,
      sequence: current.request.sequence,
      desiredFrameIndex: current.desiredFrameIndex,
      presentedFrameIndex: current.desiredFrameIndex,
      mediaTimeSeconds: canvasFrame.mediaTimeSeconds,
      evidence: 'packed-canvas-draw',
      generation: canvasFrame.generation,
      capability: videoReceipt.capability
    });
  };

  const request = (input: StrictPackedProbeRequest): Promise<StrictPackedProbeReceipt> => {
    const desiredFrameIndex = frameIndexForProgress(input.frameMap, input.desiredProgress);
    const targetTime = mediaTimeForFrame(input.frameMap, desiredFrameIndex);
    if (disposed || failed || input.sequence <= latestSequence) {
      return Promise.resolve(staleReceipt(
        { request: input, desiredFrameIndex, targetTime },
        capabilitySnapshot
      ));
    }
    latestSequence = input.sequence;
    settleCurrentStale();

    let resolve!: (receipt: StrictPackedProbeReceipt) => void;
    let rejectRequest!: (error: Error) => void;
    const result = new Promise<StrictPackedProbeReceipt>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      rejectRequest = promiseReject;
    });
    const controller = new AbortController();
    const current: PendingRequest = {
      request: input,
      desiredFrameIndex,
      targetTime,
      expectedGeneration: options.getActiveGeneration(),
      controller,
      timeoutHandle: undefined,
      settled: false,
      resolve,
      reject: rejectRequest,
      onAbort: () => {
        controller.abort();
        settle(current, staleReceipt(current, capabilitySnapshot));
      }
    };
    pending = current;
    if (input.signal) {
      if (input.signal.aborted) current.onAbort();
      else input.signal.addEventListener('abort', current.onAbort, { once: true });
    }
    current.timeoutHandle = globalThis.setTimeout(() => {
      if (current.settled) return;
      controller.abort();
      reject(current, new Error('packed-alpha frame receipt timed out'));
    }, timeoutMs);

    void videoProbe.request({ ...input, signal: controller.signal }).then((videoReceipt) => {
      if (current.settled) return;
      current.videoReceipt = videoReceipt;
      tryCommit();
    }, (error: unknown) => {
      if (current.settled) return;
      reject(current, error instanceof Error ? error : new Error(String(error)));
    });
    return result;
  };

  const probe: StrictPackedProbe = {
    request,
    notifyFrame(frame) {
      const current = pending;
      if (!current || current.settled) return;
      const mediaTimeSeconds = canvasMediaTime(frame);
      if (mediaTimeSeconds === undefined) return;
      if (frame.generation !== current.expectedGeneration
        || frame.generation !== options.getActiveGeneration()) {
        settle(current, staleReceipt(current, capabilitySnapshot));
        return;
      }
      const frameIndex = frameIndexForMediaTime(current.request.frameMap, mediaTimeSeconds);
      if (frameIndex !== current.desiredFrameIndex) return;
      current.canvasFrame = { generation: frame.generation, mediaTimeSeconds };
      tryCommit();
    },
    render() {
      const rendered = options.render();
      if (!rendered) probe.fail(new Error('packed-alpha render failed'));
      return rendered;
    },
    fail(error) {
      if (disposed || failed) return;
      failed = true;
      videoProbe.dispose();
      if (pending) reject(pending, error);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      videoProbe.dispose();
      if (pending) {
        const current = pending;
        current.controller.abort();
        settle(current, staleReceipt(current, capabilitySnapshot));
      }
    }
  };

  return Object.freeze(probe);
}
