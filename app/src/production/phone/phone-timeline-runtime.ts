import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  timelineVideoDriverFor,
  type TimelineVideoDriveInput,
  type TimelineVideoMode
} from '../../media/timeline-video-driver';
import type { Direction } from '../../story/types';

/**
 * Ordered data passed from lazy Phone scenes to the shared timeline-driver
 * chunk. Keeping the driver input positional prevents per-chunk property
 * mangling from changing a media request's meaning.
 */
export type PhoneTimelineVideoInput = readonly [
  runId: string,
  direction: Direction,
  progress: number,
  durationFallbackSeconds: number,
  startSeconds: number | null,
  endSeconds: number | null,
  endEpsilonSeconds: number | null,
  timelineDurationMs: number | null,
  mode: TimelineVideoMode | null,
  nativePlaybackDirection: Direction | null,
  allowSeekedFrameFallback: boolean | null,
  signal: AbortSignal | null
];

/** Prepared-frame evidence is also positional; no driver snapshot leaks out. */
export type PhoneTimelineVideoFrame = readonly [
  status: 'ready' | 'stale' | null,
  runId: string | null,
  direction: Direction | null,
  generation: number | null,
  targetTime: number | null
];

/** Small read-only probe used by TTG endpoint verification. */
export type PhoneTimelineVideoSnapshot = readonly [
  runId: string | null,
  direction: Direction | null,
  desiredProgress: number | null,
  frameReady: boolean
];

function driverInput([
  runId,
  direction,
  progress,
  durationFallbackSeconds,
  startSeconds,
  endSeconds,
  endEpsilonSeconds,
  timelineDurationMs,
  mode,
  nativePlaybackDirection,
  allowSeekedFrameFallback,
  signal
]: PhoneTimelineVideoInput): TimelineVideoDriveInput {
  return {
    runId,
    direction,
    progress,
    durationFallbackSeconds,
    ...(startSeconds === null ? {} : { startSeconds }),
    ...(endSeconds === null ? {} : { endSeconds }),
    ...(endEpsilonSeconds === null ? {} : { endEpsilonSeconds }),
    ...(timelineDurationMs === null ? {} : { timelineDurationMs }),
    ...(mode === null ? {} : { mode }),
    ...(nativePlaybackDirection === null
      ? {}
      : { nativePlaybackDirection }),
    ...(allowSeekedFrameFallback === null
      ? {}
      : { allowSeekedFrameFallback }),
    ...(signal === null ? {} : { signal })
  };
}

/** Callable bridge for lazy Phone scenes; the raw driver input stays local. */
export function drivePhoneTimelineVideo(
  video: HTMLVideoElement | null | undefined,
  input: PhoneTimelineVideoInput
): void {
  driveTimelineVideo(video, driverInput(input));
}

/** Converts raw driver results to stable tuple evidence before returning. */
export async function preparePhoneTimelineVideoFrame(
  video: HTMLVideoElement | null | undefined,
  input: PhoneTimelineVideoInput
): Promise<PhoneTimelineVideoFrame> {
  const frame = await prepareTimelineVideoFrame(video, driverInput(input));
  return frame
    ? [frame[0], frame[1], frame[2], frame[3], frame[4]]
    : [null, null, null, null, null];
}

/** Hides the driver's mutable snapshot object behind a four-slot probe. */
export function phoneTimelineVideoSnapshot(
  video: HTMLVideoElement | null | undefined
): PhoneTimelineVideoSnapshot {
  if (!video) return [null, null, null, false];
  const snapshot = timelineVideoDriverFor(video).snapshot();
  return [
    snapshot.runId ?? null,
    snapshot.direction ?? null,
    snapshot.desiredProgress ?? null,
    snapshot.frameReady
  ];
}

export function disposePhoneTimelineVideo(
  video: HTMLVideoElement | null | undefined
): void {
  if (video) disposeTimelineVideoDriver(video);
}
