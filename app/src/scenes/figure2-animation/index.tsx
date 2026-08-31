import { useEffect, useRef } from 'react';
import {
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame,
  timelineVideoDriverSnapshot,
  type TimelineVideoDriveInput,
  type TimelineVideoDriverSnapshot,
  type TimelineVideoFrameResult
} from '../../media/strict-timeline-video-driver';
import { progressForFrameIndex } from '../../media/frame-timebase';
import { VIDEO_FRAME_MAPS } from '../../media/video-frame-maps';
import type {
  SceneComponentProps,
  SceneModule,
  SegmentProgressReceipt,
  SegmentProgressRequest
} from '../../story/types';
import {
  FIGURE2_MEDIA_KEY,
  Figure2AnimationSceneMarkup
} from './scene';
import {
  renderFigure2Hold,
  retainedFigure2Arch
} from './visual';

export { FIGURE2_HEVC_ALPHA_VIDEO, FIGURE2_MEDIA_KEY, FIGURE2_VIDEO } from './scene';
export {
  figure2DepthTransformForProgress,
  renderFigure2AnimationProgress,
  renderFigure2Hold,
  renderFigure2ProofTransitionProgress,
  type Figure2AnimationRenderState
} from './visual';

export const FIGURE2_INTRO_PLAYBACK_MS = 2600;
const FIGURE2_REVERSE_START_SECONDS = 2.6;
const FIGURE2_VIDEO_DURATION_SECONDS = 5.2;
const FIGURE2_FRAME_MAP = VIDEO_FRAME_MAPS[FIGURE2_MEDIA_KEY];
const FIGURE2_FORWARD_FRAME_MAP = {
  ...FIGURE2_FRAME_MAP,
  startFrame: 0,
  endFrame: FIGURE2_FRAME_MAP.frameCount / 2
} as const;
const FIGURE2_REVERSE_FRAME_MAP = {
  ...FIGURE2_FRAME_MAP,
  startFrame: FIGURE2_FRAME_MAP.frameCount / 2,
  endFrame: FIGURE2_FRAME_MAP.frameCount - 1
} as const;
const FIGURE2_COMBINED_VIDEO_SELECTOR = '[data-figure2-combined-video]';
const FIGURE2_OPENING_FRAME_HANDLE = 'opening-frame';
const FIGURE2_UNAVAILABLE = 'Figure2 unavailable';
const FIGURE2_PREPARE_ABORTED = 'Figure2 prepare aborted';

type Figure2Root = HTMLElement & {
  __r4Figure2Progress?: number;
};

type Figure2MediaManager = {
  video: HTMLVideoElement;
  generation: number;
  activeDirection?: 1 | -1;
  activeRunId?: string;
  playbackEnabled: boolean;
  prepared?: {
    runId: string;
    direction: 1 | -1;
    progress: number;
    generation: number;
  };
  snapshot?: TimelineVideoDriverSnapshot | undefined;
};

export type Figure2MediaPreparation = Readonly<{
  runId: string;
  direction: 1 | -1;
  sequence?: number;
  timelineDurationMs?: number;
  reducedMotion?: boolean;
  signal?: AbortSignal | undefined;
  startPlayback?: boolean;
}>;

export type Figure2DirectionalMediaSnapshot = Readonly<{
  activeDirection: 1 | -1 | undefined;
  activeRunId: string | undefined;
  media: TimelineVideoDriverSnapshot | undefined;
}>;

const mediaManagers = new WeakMap<HTMLElement, Figure2MediaManager>();
const holdFramePreparations = new WeakMap<HTMLElement, {
  promise: Promise<void>;
  signal?: AbortSignal;
}>();
function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mediaProgress(direction: 1 | -1, progress: number): number {
  return direction === 1 ? clamp(progress) : 1 - clamp(progress);
}

function frameMapForDirection(direction: 1 | -1) {
  return direction === 1 ? FIGURE2_FORWARD_FRAME_MAP : FIGURE2_REVERSE_FRAME_MAP;
}

function managerFor(root: HTMLElement): Figure2MediaManager {
  const existing = mediaManagers.get(root);
  if (existing) {
    return existing;
  }
  const video = root.querySelector<HTMLVideoElement>(FIGURE2_COMBINED_VIDEO_SELECTOR);
  if (!video) {
    throw new Error('Figure2 media missing');
  }
  const manager: Figure2MediaManager = {
    video,
    generation: 0,
    playbackEnabled: false
  };
  mediaManagers.set(root, manager);
  return manager;
}

function mediaInput(
  preparation: Figure2MediaPreparation,
  progress: number,
  mode: TimelineVideoDriveInput['mode'] = 'timeline'
): TimelineVideoDriveInput {
  return {
    runId: preparation.runId,
    direction: preparation.direction,
    progress: clamp(progress),
    durationFallbackSeconds: FIGURE2_VIDEO_DURATION_SECONDS,
    startSeconds: preparation.direction === 1 ? 0 : FIGURE2_REVERSE_START_SECONDS,
    endSeconds: preparation.direction === 1
      ? FIGURE2_REVERSE_START_SECONDS
      : FIGURE2_VIDEO_DURATION_SECONDS,
    timelineDurationMs: preparation.timelineDurationMs ?? FIGURE2_INTRO_PLAYBACK_MS,
    mode: mode ?? 'timeline',
    nativePlaybackDirection: 1,
    reducedMotion: preparation.reducedMotion,
    allowSeekedFrameFallback: false,
    allowPlaybackNudge: false,
    frameMap: frameMapForDirection(preparation.direction),
    ...(preparation.sequence !== undefined ? { sequence: preparation.sequence } : {}),
    ...(preparation.signal ? { signal: preparation.signal } : {})
  };
}

function heldProgress(root: HTMLElement, direction: 1 | -1): number {
  const current = (root as Figure2Root).__r4Figure2Progress;
  return current !== undefined && current > 0.001 && current < 0.999
    ? current
    : direction === 1 ? 0 : 1;
}

async function prepareFigure2Pair(
  root: HTMLElement,
  preparation: Figure2MediaPreparation,
  progress: number
): Promise<void> {
  if (preparation.signal?.aborted) {
    throw new Error(FIGURE2_PREPARE_ABORTED);
  }
  const manager = managerFor(root);
  const generation = ++manager.generation;
  const input = mediaInput(preparation, mediaProgress(preparation.direction, progress), 'timeline');
  try {
    const frame = await prepareTimelineVideoFrame(manager.video, input);
    if (
      preparation.signal?.aborted
      || manager.generation !== generation
      || frame?.status !== 'ready'
    ) {
      throw new Error('Figure2 media stale');
    }
    root.dataset.figure2DesiredFrame = String(frame.targetFrameIndex);
    root.dataset.figure2PresentedFrame = String(frame.presentedFrameIndex);
    root.dataset.figure2FrameEvidence = frame.evidence;
  } catch (error) {
    root.dataset.figure2StaticMediaFallback = 'true';
    delete root.dataset.figure2DesiredFrame;
    delete root.dataset.figure2PresentedFrame;
    delete root.dataset.figure2FrameEvidence;
    throw error;
  }
  manager.prepared = {
    runId: preparation.runId,
    direction: preparation.direction,
    progress: clamp(progress),
    generation
  };
  root.dataset.figure2PendingMediaRun = preparation.runId;
  root.dataset.figure2PendingMediaDirection = String(preparation.direction);
  delete root.dataset.figure2StaticMediaFallback;
}

export function requestFigure2AnimationFrame(
  root: HTMLElement | null,
  introProgress: number,
  preparation: Figure2MediaPreparation
): Promise<TimelineVideoFrameResult> {
  if (!root) {
    return Promise.reject(new Error(FIGURE2_UNAVAILABLE));
  }
  const manager = managerFor(root);
  const input = mediaInput(
    preparation,
    mediaProgress(preparation.direction, introProgress),
    'timeline'
  );
  return prepareTimelineVideoFrame(manager.video, input).then((result) => {
    if (!result) {
      throw new Error('Figure2 media frame preparation returned no result');
    }
    if (result.status === 'ready') {
      root.dataset.figure2DesiredFrame = String(result.targetFrameIndex);
      root.dataset.figure2PresentedFrame = String(result.presentedFrameIndex);
      root.dataset.figure2FrameEvidence = result.evidence;
    }
    return result;
  });
}

export function figure2IntroProgressForFrame(
  frameIndex: number,
  direction: 1 | -1
): number {
  const map = frameMapForDirection(direction);
  const media = progressForFrameIndex(map, frameIndex);
  return direction === 1 ? media : 1 - media;
}

export function figure2SegmentProgressReceipt(
  request: SegmentProgressRequest,
  frame: TimelineVideoFrameResult
): SegmentProgressReceipt {
  return {
    status: frame.status === 'ready' ? 'presented' : 'stale',
    runId: request.runId,
    sequence: request.sequence,
    desiredProgress: request.desiredProgress,
    presentedProgress: frame.status === 'ready'
      ? figure2IntroProgressForFrame(frame.presentedFrameIndex, request.direction)
      : request.desiredProgress,
    evidence: frame.evidence === 'video-frame-callback'
      ? 'video-frame-callback'
      : 'runtime'
  };
}

export async function prepareFigure2MediaLeg(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): Promise<void> {
  if (!root) {
    throw new Error(FIGURE2_UNAVAILABLE);
  }
  await prepareFigure2Pair(root, preparation, heldProgress(root, preparation.direction));
}

export function ensureFigure2HoldFrame(
  root: HTMLElement,
  signal?: AbortSignal
): Promise<void> {
  const existing = holdFramePreparations.get(root);
  if (existing && !existing.signal?.aborted) {
    return existing.promise;
  }
  if (existing) {
    holdFramePreparations.delete(root);
  }
  const preparation: Figure2MediaPreparation = {
    runId: 'figure2-hold-frame',
    direction: 1,
    startPlayback: false,
    signal
  };
  const retainedArch = retainedFigure2Arch(root);
  const imagePreparation = Promise.all([
    ...root.querySelectorAll<HTMLImageElement>('img'),
    retainedArch
  ].map((image) => image?.decode?.()));
  const promise = Promise.all([
    prepareFigure2MediaLeg(root, preparation)
      .then(() => commitFigure2MediaLeg(root, preparation)),
    imagePreparation
  ])
    .then(() => {
      if (signal?.aborted) {
        throw new Error(FIGURE2_PREPARE_ABORTED);
      }
      root.dataset.figure2HoldFrameReady = 'true';
    });
  holdFramePreparations.set(root, { promise, ...(signal ? { signal } : {}) });
  void promise.catch(() => {
    if (holdFramePreparations.get(root)?.promise === promise) {
      holdFramePreparations.delete(root);
    }
  });
  return promise;
}

export async function prepareFigure2TerminalPair(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): Promise<void> {
  if (!root) {
    throw new Error(FIGURE2_UNAVAILABLE);
  }
  await prepareFigure2Pair(root, preparation, 1);
}

function commitFigure2Pair(
  root: HTMLElement,
  preparation: Figure2MediaPreparation,
  startPlayback: boolean
): void {
  const manager = managerFor(root);
  const prepared = manager.prepared;
  if (
    preparation.signal?.aborted
    || !prepared
    || prepared.runId !== preparation.runId
    || prepared.direction !== preparation.direction
    || prepared.generation !== manager.generation
  ) {
    throw new Error('Figure2 not ready');
  }
  manager.snapshot = timelineVideoDriverSnapshot(manager.video);
  manager.activeRunId = preparation.runId;
  manager.activeDirection = preparation.direction;
  manager.playbackEnabled = startPlayback;
  delete manager.prepared;
  root.dataset.figure2MediaRun = preparation.runId;
  root.dataset.figure2MediaDirection = String(preparation.direction);
  delete root.dataset.figure2PendingMediaRun;
  delete root.dataset.figure2PendingMediaDirection;
  delete root.dataset.figure2StaticMediaFallback;
}

export function commitFigure2MediaLeg(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): void {
  if (!root) {
    throw new Error(FIGURE2_UNAVAILABLE);
  }
  commitFigure2Pair(
    root,
    preparation,
    preparation.startPlayback !== false
  );
}

export function commitFigure2TerminalPair(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): void {
  if (!root) {
    throw new Error(FIGURE2_UNAVAILABLE);
  }
  commitFigure2Pair(root, preparation, false);
}

export function driveFigure2MediaLeg(
  root: HTMLElement | null,
  progress: number,
  preparation: Figure2MediaPreparation
): void {
  void root;
  void progress;
  void preparation;
}

export function parkFigure2Media(root: HTMLElement | null): void {
  if (!root) {
    return;
  }
  const manager = mediaManagers.get(root);
  if (!manager) {
    return;
  }
  manager.generation += 1;
  manager.video.pause();
  disposeTimelineVideoDriver(manager.video);
  mediaManagers.delete(root);
  delete root.dataset.figure2MediaRun;
  delete root.dataset.figure2MediaDirection;
  delete root.dataset.figure2PendingMediaRun;
  delete root.dataset.figure2PendingMediaDirection;
}

export function disposeFigure2Media(root: HTMLElement | null): void {
  parkFigure2Media(root);
  if (root) {
    holdFramePreparations.delete(root);
    delete root.dataset.figure2HoldFrameReady;
  }
}

export function figure2DirectionalMediaSnapshot(
  root: HTMLElement | null
): Figure2DirectionalMediaSnapshot | null {
  if (!root) {
    return null;
  }
  const manager = mediaManagers.get(root);
  return manager
    ? {
        activeDirection: manager.activeDirection,
        activeRunId: manager.activeRunId,
        media: manager.snapshot
      }
    : null;
}

function Figure2AnimationScene({ registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (root?.dataset.phoneRuntimeOwned === 'true') {
      return () => registerHandle?.(FIGURE2_OPENING_FRAME_HANDLE, null);
    }
    const controller = new AbortController();
    for (const video of root?.querySelectorAll<HTMLVideoElement>('[data-figure2-video]') ?? []) {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.pause();
    }
    if (root) {
      void ensureFigure2HoldFrame(root, controller.signal)
        .then(() => {
          registerHandle?.(FIGURE2_OPENING_FRAME_HANDLE, root.querySelector(FIGURE2_COMBINED_VIDEO_SELECTOR));
        })
        .catch(() => undefined);
    }
    return () => {
      controller.abort();
      registerHandle?.(FIGURE2_OPENING_FRAME_HANDLE, null);
      disposeFigure2Media(root);
    };
  }, [registerHandle]);

  return (
    <Figure2AnimationSceneMarkup
      {...{
        scene: 'figure2-animation',
        hidden: false,
        ...(registerHandle ? { registerHandle } : {}),
        onRoot: (element) => {
          rootRef.current = element;
        }
      }}
    />
  );
}

export const figure2AnimationScene: SceneModule = {
  id: 'figure2-animation',
  Component: Figure2AnimationScene,
  renderHold: renderFigure2Hold,
  requiredHandles: ['stage', 'figures', 'combined-video', FIGURE2_OPENING_FRAME_HANDLE],
  preload: () => ({ milestones: ['targetReady'] })
};
