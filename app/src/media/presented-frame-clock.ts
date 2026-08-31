import type { Direction } from '../story/types';
import {
  frameIndexForProgress,
  mediaTimeForFrame,
  progressForFrameIndex,
  validateVideoFrameMap,
  type VideoFrameMap
} from './frame-timebase';
import {
  timelineVideoDriverFor
} from './timeline-video-driver';

export type PresentedFrameEvidence =
  | 'video-frame-callback'
  | 'packed-canvas-draw'
  | 'scene-canvas-draw'
  | 'runtime';

export type PresentedFrameRequest = Readonly<{
  runId: string;
  direction: Direction;
  sequence: number;
  desiredProgress: number;
  frameMap: VideoFrameMap;
  signal: AbortSignal;
}>;

export type PresentedFrameReceipt = Readonly<{
  status: 'presented' | 'stale';
  runId: string;
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  mediaTimeSeconds: number;
  presentedProgress: number;
  evidence: PresentedFrameEvidence;
}>;

export type PresentedFrameClockSnapshot = Readonly<{
  runId: string | undefined;
  direction: Direction | undefined;
  sequence: number | undefined;
  desiredProgress: number | undefined;
  desiredFrameIndex: number | undefined;
  presentedProgress: number | undefined;
  presentedFrameIndex: number | undefined;
  mediaTimeSeconds: number | undefined;
  frameLag: number | undefined;
  lagFrames: number | undefined;
  evidence: PresentedFrameEvidence | undefined;
  seekLatencyMs: number | undefined;
  staleCount: number;
  pending: boolean;
}>;

export type PresentedFrameClock = Readonly<{
  request(request: PresentedFrameRequest): Promise<PresentedFrameReceipt>;
  snapshot(): PresentedFrameClockSnapshot;
  dispose(): void;
}>;

type LatestRequest = PresentedFrameRequest;

const EMPTY_SNAPSHOT: PresentedFrameClockSnapshot = {
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

function durationFallbackSeconds(map: VideoFrameMap): number {
  const frameDuration = map.fpsDenominator / map.fpsNumerator;
  return Math.max(0.001, mediaTimeForFrame(map, map.endFrame) + frameDuration);
}

function isSameRequest(left: LatestRequest | undefined, right: PresentedFrameRequest): boolean {
  return left?.runId === right.runId
    && left.direction === right.direction
    && left.sequence === right.sequence;
}

function staleReceipt(
  request: PresentedFrameRequest,
  desiredFrameIndex: number,
  presentedProgress: number,
  evidence: PresentedFrameEvidence = 'runtime'
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

class VideoPresentedFrameClockImpl implements PresentedFrameClock {
  private disposed = false;
  private readonly driver: ReturnType<typeof timelineVideoDriverFor>;
  private latestRequest: LatestRequest | undefined;
  private latestSnapshot: PresentedFrameClockSnapshot = EMPTY_SNAPSHOT;
  private staleCount = 0;

  constructor(private readonly video: HTMLVideoElement) {
    this.driver = timelineVideoDriverFor(video);
  }

  request(request: PresentedFrameRequest): Promise<PresentedFrameReceipt> {
    const frameMap = validateVideoFrameMap(request.frameMap);
    const desiredProgress = Math.min(1, Math.max(0, request.desiredProgress));
    const desiredFrameIndex = frameIndexForProgress(frameMap, desiredProgress);
    const previous = this.latestRequest;
    if (
      previous
      && previous.runId === request.runId
      && previous.direction === request.direction
      && request.sequence < previous.sequence
    ) {
      this.staleCount += 1;
      this.latestSnapshot = {
        ...this.latestSnapshot,
        staleCount: this.staleCount
      };
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
    this.latestSnapshot = {
      ...this.latestSnapshot,
      runId: request.runId,
      direction: request.direction,
      sequence: request.sequence,
      desiredProgress,
      desiredFrameIndex,
      frameLag: this.latestSnapshot.presentedFrameIndex === undefined
        ? undefined
        : desiredFrameIndex - this.latestSnapshot.presentedFrameIndex,
      lagFrames: this.latestSnapshot.presentedFrameIndex === undefined
        ? undefined
        : desiredFrameIndex - this.latestSnapshot.presentedFrameIndex,
      pending: true,
      staleCount: this.staleCount
    };
    this.writeDiagnostics();
    const startedAt = performance.now();
    const preparation = this.driver.prepareFrame({
      runId: request.runId,
      direction: request.direction,
      sequence: request.sequence,
      progress: desiredProgress,
      frameMap,
      durationFallbackSeconds: durationFallbackSeconds(frameMap),
      mode: 'timeline',
      allowSeekedFrameFallback: false,
      allowPlaybackNudge: false,
      signal: request.signal
    });

    return preparation.then((result) => {
      if (this.disposed) {
        return staleReceipt(request, desiredFrameIndex, desiredProgress);
      }
      const latency = Math.max(0, performance.now() - startedAt);
      const current = this.latestRequest;
      const currentRequest = isSameRequest(current, request);
      const strictReady = result.status === 'ready'
        && result.evidence === 'video-frame-callback'
        && result.presentedFrameIndex === desiredFrameIndex;
      if (!currentRequest || !strictReady) {
        this.staleCount += 1;
        this.latestSnapshot = {
          ...this.latestSnapshot,
          seekLatencyMs: latency,
          pending: currentRequest,
          staleCount: this.staleCount
        };
        this.writeDiagnostics();
        return staleReceipt(
          request,
          desiredFrameIndex,
          this.latestSnapshot.presentedProgress ?? desiredProgress,
          result.evidence === 'video-frame-callback' ? 'video-frame-callback' : 'runtime'
        );
      }

      const presentedProgress = progressForFrameIndex(frameMap, result.presentedFrameIndex);
      const frameLag = result.presentedFrameIndex - desiredFrameIndex;
      this.latestSnapshot = {
        ...this.latestSnapshot,
        seekLatencyMs: latency,
        presentedProgress,
        presentedFrameIndex: result.presentedFrameIndex,
        mediaTimeSeconds: result.mediaTimeSeconds,
        frameLag,
        lagFrames: frameLag,
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
        presentedFrameIndex: result.presentedFrameIndex,
        mediaTimeSeconds: result.mediaTimeSeconds,
        presentedProgress,
        evidence: 'video-frame-callback' as const
      };
    }).catch((error: unknown) => {
      if (!this.disposed && isSameRequest(this.latestRequest, request)) {
        this.latestSnapshot = {
          ...this.latestSnapshot,
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
    return this.latestSnapshot;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.latestRequest = undefined;
    this.driver.dispose();
    this.clearDiagnostics();
    this.latestSnapshot = {
      ...EMPTY_SNAPSHOT,
      staleCount: this.staleCount
    };
  }

  private writeDiagnostics(): void {
    const dataset = this.video.dataset;
    const snapshot = this.latestSnapshot;
    if (snapshot.desiredFrameIndex !== undefined) {
      dataset.timelineVideoDesiredFrame = String(snapshot.desiredFrameIndex);
    }
    if (snapshot.presentedFrameIndex !== undefined) {
      dataset.timelineVideoPresentedFrame = String(snapshot.presentedFrameIndex);
    }
    if (snapshot.frameLag !== undefined) {
      dataset.timelineVideoFrameLag = String(snapshot.frameLag);
    }
    if (snapshot.sequence !== undefined) {
      dataset.timelineVideoSequence = String(snapshot.sequence);
    }
    if (snapshot.evidence !== undefined) {
      dataset.timelineVideoEvidence = snapshot.evidence;
    }
    if (snapshot.seekLatencyMs !== undefined) {
      dataset.timelineVideoSeekMs = snapshot.seekLatencyMs.toFixed(2);
    }
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
  return new VideoPresentedFrameClockImpl(video);
}
