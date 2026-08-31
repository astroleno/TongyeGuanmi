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
  PresentedFrameRequest
} from './presented-frame-clock';

export type PresentedFrameBarrierChild = Readonly<{
  clock: Pick<PresentedFrameClock, 'request'>;
  frameMap: VideoFrameMap;
  /** Map the shared scene progress onto this surface's local animation. */
  mapProgress?: (progress: number) => number;
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

function childProgressFor(
  child: PresentedFrameBarrierChild,
  progress: number
): number {
  return clampProgress(child.mapProgress?.(progress) ?? progress);
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

    const childProgresses = this.children.map((child) => childProgressFor(child, desiredProgress));
    const childRequests = this.children.map((child, index) => child.clock.request({
      ...request,
      desiredProgress: childProgresses[index] ?? desiredProgress,
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
            childProgresses[index] ?? desiredProgress
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
