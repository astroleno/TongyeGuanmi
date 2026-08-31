import { MediaPreparationError } from '../media/media-preparation';
import type {
  Direction,
  SegmentProgressReceipt,
  SegmentProgressRequest,
  SegmentRunId
} from './types';

export type SegmentProgressPresenter = (
  request: SegmentProgressRequest
) => Promise<SegmentProgressReceipt> | SegmentProgressReceipt;

export type PresentedProgressCoordinatorOptions = Readonly<{
  runId: SegmentRunId;
  direction: Direction;
  present: SegmentProgressPresenter;
  timeoutMs?: number;
  onPresented?(receipt: SegmentProgressReceipt): void;
}>;

export type PresentedProgressCoordinatorSnapshot = Readonly<{
  runId: SegmentRunId;
  direction: Direction;
  sequence: number | undefined;
  desiredProgress: number | undefined;
  presentedProgress: number | undefined;
  pending: boolean;
  queued: boolean;
  staleCount: number;
}>;

export type PresentedProgressCoordinator = Readonly<{
  request(desiredProgress: number): Promise<SegmentProgressReceipt>;
  snapshot(): PresentedProgressCoordinatorSnapshot;
  dispose(reason?: unknown): void;
}>;

type Work = {
  request: SegmentProgressRequest;
  controller: AbortController;
  resolve(receipt: SegmentProgressReceipt): void;
  reject(error: Error): void;
  settled: boolean;
  superseded: boolean;
};

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    throw new Error('desiredProgress must be finite');
  }
  return Math.min(1, Math.max(0, progress));
}

function staleReceipt(
  request: SegmentProgressRequest,
  presentedProgress: number
): SegmentProgressReceipt {
  return {
    status: 'stale',
    runId: request.runId,
    sequence: request.sequence,
    desiredProgress: request.desiredProgress,
    presentedProgress,
    evidence: 'runtime'
  };
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function createRuntimeSegmentProgressReceipt(
  request: SegmentProgressRequest,
  presentedProgress = request.desiredProgress
): SegmentProgressReceipt {
  return {
    status: 'presented',
    runId: request.runId,
    sequence: request.sequence,
    desiredProgress: request.desiredProgress,
    presentedProgress,
    evidence: 'runtime'
  };
}

export class PresentedProgressCoordinatorImpl implements PresentedProgressCoordinator {
  private disposed = false;
  private nextSequence = 0;
  private active: Work | undefined;
  private queued: Work | undefined;
  private presentedProgress: number | undefined;
  private latestSequence: number | undefined;
  private desiredProgress: number | undefined;
  private staleCount = 0;

  constructor(private readonly options: PresentedProgressCoordinatorOptions) {}

  request(desiredProgressInput: number): Promise<SegmentProgressReceipt> {
    const desiredProgress = clampProgress(desiredProgressInput);
    const sequence = ++this.nextSequence;
    const controller = new AbortController();
    const request: SegmentProgressRequest = {
      runId: this.options.runId,
      direction: this.options.direction,
      sequence,
      desiredProgress,
      signal: controller.signal
    };
    return new Promise<SegmentProgressReceipt>((resolve, reject) => {
      const work: Work = {
        request,
        controller,
        resolve,
        reject,
        settled: false,
        superseded: false
      };
      if (this.disposed) {
        this.staleCount += 1;
        work.settled = true;
        resolve(staleReceipt(request, this.presentedProgress ?? desiredProgress));
        return;
      }

      this.desiredProgress = desiredProgress;
      this.latestSequence = sequence;
      if (this.queued) {
        this.resolveStale(this.queued);
      }
      this.queued = work;
      if (this.active) {
        this.active.superseded = true;
        if (!this.active.controller.signal.aborted) {
          this.active.controller.abort('superseded');
        }
        this.resolveStale(this.active);
      } else {
        this.startNext();
      }
    });
  }

  snapshot(): PresentedProgressCoordinatorSnapshot {
    return {
      runId: this.options.runId,
      direction: this.options.direction,
      sequence: this.latestSequence,
      desiredProgress: this.desiredProgress,
      presentedProgress: this.presentedProgress,
      pending: this.active !== undefined,
      queued: this.queued !== undefined,
      staleCount: this.staleCount
    };
  }

  dispose(reason?: unknown): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.queued) {
      this.resolveStale(this.queued);
      this.queued = undefined;
    }
    if (this.active) {
      this.active.superseded = true;
      if (!this.active.controller.signal.aborted) {
        this.active.controller.abort(reason ?? 'disposed');
      }
      this.resolveStale(this.active);
      this.active = undefined;
    }
  }

  private resolveStale(work: Work): void {
    if (work.settled) return;
    work.settled = true;
    this.staleCount += 1;
    work.resolve(staleReceipt(work.request, this.presentedProgress ?? work.request.desiredProgress));
  }

  private startNext(): void {
    if (this.disposed || this.active || !this.queued) return;
    const work = this.queued;
    this.queued = undefined;
    this.active = work;
    void this.execute(work);
  }

  private async execute(work: Work): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const presentation = Promise.resolve().then(() => this.options.present(work.request));
      const result = this.options.timeoutMs === undefined
        ? await presentation
        : await Promise.race([
            presentation,
            new Promise<SegmentProgressReceipt>((_, reject) => {
              timeout = setTimeout(() => {
                const timeoutError = new MediaPreparationError(
                  'MEDIA_PREPARATION_TIMEOUT',
                  `segment progress presentation timed out for ${work.request.runId} after ${this.options.timeoutMs}ms`
                );
                if (!work.controller.signal.aborted) work.controller.abort(timeoutError);
                reject(timeoutError);
              }, Math.max(0, this.options.timeoutMs ?? 0));
            })
          ]);

      const current = this.active === work && !this.disposed && !work.superseded;
      const presented = result.status === 'presented'
        && result.runId === work.request.runId
        && result.sequence === work.request.sequence;
      if (!current || !presented) {
        this.resolveStale(work);
        return;
      }
      if (!work.settled) {
        work.settled = true;
        this.presentedProgress = result.presentedProgress;
        this.options.onPresented?.(result);
        work.resolve(result);
      }
    } catch (error) {
      if (work.superseded || this.disposed || this.active !== work) {
        this.resolveStale(work);
      } else if (!work.settled) {
        work.settled = true;
        work.reject(asError(error));
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      if (this.active === work) this.active = undefined;
      this.startNext();
    }
  }
}

export function createPresentedProgressCoordinator(
  options: PresentedProgressCoordinatorOptions
): PresentedProgressCoordinator {
  return new PresentedProgressCoordinatorImpl(options);
}

export const createSegmentProgressCoordinator = createPresentedProgressCoordinator;
