import { MediaPreparationError } from './media-preparation';
import {
  frameIndexForProgress,
  mediaTimeForFrame,
  progressForFrameIndex,
  validateVideoFrameMap
} from './frame-timebase';
import type {
  PresentedFrameClock,
  PresentedFrameClockSnapshot,
  PresentedFrameEvidence,
  PresentedFrameReceipt,
  PresentedFrameRequest
} from './presented-frame-clock';

export type SceneCanvasPresentedFrameClockOptions = Readonly<{
  draw(request: PresentedFrameRequest): boolean | Promise<boolean>;
}>;

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    throw new Error('desiredProgress must be finite');
  }
  return Math.min(1, Math.max(0, progress));
}

function staleReceipt(
  request: PresentedFrameRequest,
  desiredFrameIndex: number,
  presentedProgress: number,
  evidence: PresentedFrameEvidence = 'scene-canvas-draw'
): PresentedFrameReceipt {
  return {
    status: 'stale',
    runId: request.runId,
    sequence: request.sequence,
    desiredFrameIndex,
    presentedFrameIndex: -1,
    mediaTimeSeconds: Number.NaN,
    presentedProgress,
    evidence
  };
}

function isCurrentRequest(
  latest: PresentedFrameRequest | undefined,
  request: PresentedFrameRequest
): boolean {
  return latest?.runId === request.runId
    && latest.direction === request.direction
    && latest.sequence === request.sequence;
}

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
      const mediaTimeSeconds = mediaTimeForFrame(frameMap, desiredFrameIndex);
      latestSnapshot = {
        ...latestSnapshot,
        presentedProgress,
        presentedFrameIndex: desiredFrameIndex,
        mediaTimeSeconds,
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
        mediaTimeSeconds,
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
