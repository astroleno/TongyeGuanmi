import { MediaPreparationError } from './media-preparation';
import {
  frameIndexForProgress,
  mediaTimeForFrame,
  progressForFrameIndex,
  validateVideoFrameMap,
  type VideoFrameMap
} from './frame-timebase';
import type {
  PresentedFrameClock,
  PresentedFrameEvidence,
  PresentedFrameReceipt,
  PresentedFrameRequest,
  PresentedFrameClockSnapshot
} from './presented-frame-clock';

export type PresentedFrameBarrierChild = Readonly<{
  clock: Pick<PresentedFrameClock, 'request'>;
  frameMap: VideoFrameMap;
}>;

export type PresentedFrameBarrierSnapshot = Readonly<{
  sequence: number | undefined;
  runId: string | undefined;
  direction: PresentedFrameRequest['direction'] | undefined;
  desiredProgress: number | undefined;
  desiredFrameIndex: number | undefined;
  presentedProgress: number | undefined;
  presentedFrameIndex: number | undefined;
  evidence: PresentedFrameEvidence | undefined;
  pending: boolean;
  childCount: number;
  staleCount: number;
}>;

export type PresentedFrameBarrier = Readonly<{
  request(request: PresentedFrameRequest): Promise<PresentedFrameReceipt>;
  snapshot(): PresentedFrameBarrierSnapshot;
  dispose(): void;
}>;

const EMPTY_SNAPSHOT: PresentedFrameBarrierSnapshot = {
  sequence: undefined,
  runId: undefined,
  direction: undefined,
  desiredProgress: undefined,
  desiredFrameIndex: undefined,
  presentedProgress: undefined,
  presentedFrameIndex: undefined,
  evidence: undefined,
  pending: false,
  childCount: 0,
  staleCount: 0
};

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    throw new Error('desiredProgress must be finite');
  }
  return Math.min(1, Math.max(0, progress));
}

function staleReceipt(
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
    evidence: 'scene-canvas-draw'
  };
}

function barrierEvidence(receipts: readonly PresentedFrameReceipt[]): PresentedFrameEvidence {
  const first = receipts[0]?.evidence;
  if (first && receipts.every((receipt) => receipt.evidence === first)) {
    return first;
  }
  return 'scene-canvas-draw';
}

function isCurrentRequest(
  latest: PresentedFrameRequest | undefined,
  request: PresentedFrameRequest
): boolean {
  return latest?.runId === request.runId
    && latest.direction === request.direction
    && latest.sequence === request.sequence;
}

class PresentedFrameBarrierImpl implements PresentedFrameBarrier {
  private disposed = false;
  private latestRequest: PresentedFrameRequest | undefined;
  private activeController: AbortController | undefined;
  private staleCount = 0;
  private latestSnapshot: PresentedFrameBarrierSnapshot;

  constructor(private readonly children: readonly PresentedFrameBarrierChild[]) {
    if (children.length < 2) {
      throw new Error('PresentedFrameBarrier requires at least two child clocks');
    }
    for (const child of children) {
      validateVideoFrameMap(child.frameMap);
    }
    this.latestSnapshot = { ...EMPTY_SNAPSHOT, childCount: children.length };
  }

  request(request: PresentedFrameRequest): Promise<PresentedFrameReceipt> {
    const masterMap = validateVideoFrameMap(request.frameMap);
    const desiredProgress = clampProgress(request.desiredProgress);
    const desiredFrameIndex = frameIndexForProgress(masterMap, desiredProgress);
    const previous = this.latestRequest;
    if (
      previous
      && previous.runId === request.runId
      && previous.direction === request.direction
      && request.sequence < previous.sequence
    ) {
      this.staleCount += 1;
      this.latestSnapshot = { ...this.latestSnapshot, staleCount: this.staleCount };
      return Promise.resolve(staleReceipt(
        request,
        desiredFrameIndex,
        this.latestSnapshot.presentedProgress ?? desiredProgress
      ));
    }
    if (this.disposed) {
      return Promise.resolve(staleReceipt(request, desiredFrameIndex, desiredProgress));
    }

    this.latestRequest = request;
    this.activeController?.abort();
    const controller = new AbortController();
    this.activeController = controller;
    const abortFromParent = () => {
      if (!controller.signal.aborted) controller.abort(request.signal.reason);
    };
    if (request.signal.aborted) {
      abortFromParent();
    } else {
      request.signal.addEventListener('abort', abortFromParent, { once: true });
    }
    this.latestSnapshot = {
      ...this.latestSnapshot,
      runId: request.runId,
      direction: request.direction,
      sequence: request.sequence,
      desiredProgress,
      desiredFrameIndex,
      pending: true,
      staleCount: this.staleCount
    };

    const childRequests = this.children.map((child) => child.clock.request({
      ...request,
      desiredProgress,
      frameMap: child.frameMap,
      signal: controller.signal
    }));
    return Promise.all(childRequests).then((receipts) => {
      const current = isCurrentRequest(this.latestRequest, request);
      const exact = receipts.length === this.children.length
        && receipts.every((receipt, index) => (
          receipt.status === 'presented'
          && receipt.sequence === request.sequence
          && receipt.desiredFrameIndex === frameIndexForProgress(
            this.children[index]!.frameMap,
            desiredProgress
          )
          && receipt.presentedFrameIndex === receipt.desiredFrameIndex
        ));
      if (!current || !exact) {
        this.staleCount += 1;
        this.latestSnapshot = {
          ...this.latestSnapshot,
          pending: false,
          staleCount: this.staleCount
        };
        return staleReceipt(
          request,
          desiredFrameIndex,
          this.latestSnapshot.presentedProgress ?? desiredProgress
        );
      }

      const presentedProgress = progressForFrameIndex(masterMap, desiredFrameIndex);
      const evidence = barrierEvidence(receipts);
      this.latestSnapshot = {
        ...this.latestSnapshot,
        presentedProgress,
        presentedFrameIndex: desiredFrameIndex,
        evidence,
        pending: false,
        staleCount: this.staleCount
      };
      return {
        status: 'presented' as const,
        runId: request.runId,
        sequence: request.sequence,
        desiredFrameIndex,
        presentedFrameIndex: desiredFrameIndex,
        mediaTimeSeconds: mediaTimeForFrame(masterMap, desiredFrameIndex),
        presentedProgress,
        evidence
      };
    }).catch((error: unknown) => {
      if (this.disposed) {
        return staleReceipt(request, desiredFrameIndex, desiredProgress);
      }
      if (!isCurrentRequest(this.latestRequest, request)) {
        return staleReceipt(
          request,
          desiredFrameIndex,
          this.latestSnapshot.presentedProgress ?? desiredProgress
        );
      }
      if (!controller.signal.aborted) controller.abort(error);
      if (isCurrentRequest(this.latestRequest, request)) {
        this.latestSnapshot = {
          ...this.latestSnapshot,
          pending: false,
          staleCount: this.staleCount
        };
      }
      throw error instanceof Error
        ? error
        : new MediaPreparationError('MEDIA_PREPARATION_ABORTED', String(error));
    }).finally(() => {
      request.signal.removeEventListener('abort', abortFromParent);
      if (this.activeController === controller) {
        this.activeController = undefined;
      }
    });
  }

  snapshot(): PresentedFrameBarrierSnapshot {
    return this.latestSnapshot;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.latestRequest = undefined;
    this.activeController?.abort();
    this.activeController = undefined;
    this.latestSnapshot = {
      ...EMPTY_SNAPSHOT,
      childCount: this.children.length,
      staleCount: this.staleCount
    };
  }
}

export function createPresentedFrameBarrier(
  children: readonly PresentedFrameBarrierChild[]
): PresentedFrameBarrier {
  return new PresentedFrameBarrierImpl(children);
}

export type SceneCanvasPresentedFrameClockOptions = Readonly<{
  draw(request: PresentedFrameRequest): boolean | Promise<boolean>;
}>;

export function createSceneCanvasPresentedFrameClock(
  options: SceneCanvasPresentedFrameClockOptions
): PresentedFrameClock {
  let disposed = false;
  let latestRequest: PresentedFrameRequest | undefined;
  const emptySceneSnapshot: PresentedFrameClockSnapshot = {
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
  let latestSnapshot: PresentedFrameClockSnapshot = emptySceneSnapshot;

  const request = (input: PresentedFrameRequest): Promise<PresentedFrameReceipt> => {
    const frameMap = validateVideoFrameMap(input.frameMap);
    const desiredProgress = clampProgress(input.desiredProgress);
    const desiredFrameIndex = frameIndexForProgress(frameMap, desiredProgress);
    if (disposed) return Promise.resolve(staleReceipt(input, desiredFrameIndex, desiredProgress));
    if (
      latestRequest
      && latestRequest.runId === input.runId
      && latestRequest.direction === input.direction
      && input.sequence < latestRequest.sequence
    ) {
      return Promise.resolve(staleReceipt(input, desiredFrameIndex, desiredProgress));
    }
    latestRequest = input;
    latestSnapshot = {
      ...latestSnapshot,
      runId: input.runId,
      direction: input.direction,
      sequence: input.sequence,
      desiredProgress,
      desiredFrameIndex,
      frameLag: latestSnapshot.presentedFrameIndex === undefined
        ? undefined
        : desiredFrameIndex - latestSnapshot.presentedFrameIndex,
      lagFrames: latestSnapshot.presentedFrameIndex === undefined
        ? undefined
        : desiredFrameIndex - latestSnapshot.presentedFrameIndex,
      pending: true
    };
    if (input.signal.aborted) {
      return Promise.reject(new MediaPreparationError(
        'MEDIA_PREPARATION_ABORTED',
        `scene canvas draw aborted for ${input.runId}`
      ));
    }
    return Promise.resolve(options.draw({ ...input, desiredProgress })).then((drawn) => {
      if (input.signal.aborted) {
        throw new MediaPreparationError(
          'MEDIA_PREPARATION_ABORTED',
          `scene canvas draw aborted for ${input.runId}`
        );
      }
      if (!drawn) {
        if (isCurrentRequest(latestRequest, input)) {
          latestSnapshot = { ...latestSnapshot, pending: false };
        }
        throw new Error('scene canvas draw failed');
      }
      if (!isCurrentRequest(latestRequest, input)) {
        latestSnapshot = {
          ...latestSnapshot,
          pending: false,
          staleCount: latestSnapshot.staleCount + 1
        };
        return staleReceipt(input, desiredFrameIndex, desiredProgress);
      }
      const presentedProgress = progressForFrameIndex(frameMap, desiredFrameIndex);
      latestSnapshot = {
        ...latestSnapshot,
        presentedProgress,
        presentedFrameIndex: desiredFrameIndex,
        mediaTimeSeconds: mediaTimeForFrame(frameMap, desiredFrameIndex),
        frameLag: 0,
        lagFrames: 0,
        evidence: 'scene-canvas-draw',
        pending: false
      };
      return {
        status: 'presented' as const,
        runId: input.runId,
        sequence: input.sequence,
        desiredFrameIndex,
        presentedFrameIndex: desiredFrameIndex,
        mediaTimeSeconds: mediaTimeForFrame(frameMap, desiredFrameIndex),
        presentedProgress,
        evidence: 'scene-canvas-draw' as const
      };
    });
  };

  return {
    request,
    snapshot: () => latestSnapshot,
    dispose() {
      disposed = true;
      latestRequest = undefined;
      latestSnapshot = emptySceneSnapshot;
    }
  };
}
