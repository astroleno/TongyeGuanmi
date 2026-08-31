import type { Direction } from '../story/types';
import type { VideoFrameMap } from './frame-timebase';

export type PresentedFrameEvidence =
  | 'video-frame-callback'
  | 'packed-canvas-draw'
  | 'scene-canvas-draw'
  | 'legacy-migration'
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

export { createVideoPresentedFrameClock } from './strict-timeline-video-driver';
