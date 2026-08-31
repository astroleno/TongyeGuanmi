import { useEffect, useRef } from 'react';
import {
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput,
  type TimelineVideoFrameResult
} from '../../media/strict-timeline-video-driver';
import { progressForFrameIndex } from '../../media/frame-timebase';
import { VIDEO_FRAME_MAPS } from '../../media/video-frame-maps';
import { FIGURE3_SERVICES_DURATION_MS } from '../../story/timings';
import type {
  SceneComponentProps,
  SceneModule,
  SegmentProgressReceipt,
  SegmentProgressRequest
} from '../../story/types';
import {
  FIGURE3_END_SECONDS,
  FIGURE3_MEDIA_KEY,
  Figure3AnimationSceneMarkup
} from './scene';
import {
  renderFigure3Hold
} from './visual';

export {
  FIGURE3_END_SECONDS,
  FIGURE3_HEVC_ALPHA_SRC,
  FIGURE3_MEDIA_KEY,
  FIGURE3_VIDEO_SRC
} from './scene';
export {
  FIGURE3_HOLD_PROGRESS,
  renderFigure3AnimationProgress,
  renderFigure3Hold,
  type Figure3RenderState
} from './visual';

export const FIGURE3_FRAME_MAP = VIDEO_FRAME_MAPS[FIGURE3_MEDIA_KEY];

export type Figure3MediaRun = Readonly<{
  runId: string;
  direction: 1 | -1;
  sequence?: number;
  reducedMotion?: boolean;
  signal?: AbortSignal;
}>;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const acceleratedProgress = (progress: number) => {
  const p = clamp(progress);
  return clamp(0.78 * p + 0.22 * p * p);
};

function inverseAcceleratedProgress(progress: number): number {
  const target = clamp(progress);
  let lower = 0;
  let upper = 1;
  for (let index = 0; index < 24; index += 1) {
    const middle = (lower + upper) / 2;
    if (acceleratedProgress(middle) < target) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  return (lower + upper) / 2;
}

function figure3Section(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="figure3-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="figure3-animation"]') ?? null;
}

function figure3MediaInput(progress: number, mediaRun: Figure3MediaRun): TimelineVideoDriveInput {
  return {
    runId: mediaRun.runId,
    direction: mediaRun.direction,
    progress,
    durationFallbackSeconds: 2.6,
    startSeconds: 0,
    endSeconds: FIGURE3_END_SECONDS,
    timelineDurationMs: FIGURE3_SERVICES_DURATION_MS,
    mode: 'timeline',
    nativePlaybackDirection: 1,
    reducedMotion: Boolean(mediaRun.reducedMotion),
    allowSeekedFrameFallback: false,
    allowPlaybackNudge: false,
    frameMap: FIGURE3_FRAME_MAP,
    ...(mediaRun.sequence !== undefined ? { sequence: mediaRun.sequence } : {}),
    ...(mediaRun.signal ? { signal: mediaRun.signal } : {})
  };
}

export function figure3MediaProgressForFrame(frameIndex: number): number {
  return inverseAcceleratedProgress(progressForFrameIndex(FIGURE3_FRAME_MAP, frameIndex));
}

export function figure3MediaProgressForRawProgress(rawProgress: number): number {
  return acceleratedProgress(rawProgress);
}

export function figure3SegmentProgressReceipt(
  request: SegmentProgressRequest,
  frame: TimelineVideoFrameResult
): SegmentProgressReceipt {
  return {
    status: frame.status === 'ready' ? 'presented' : 'stale',
    runId: request.runId,
    sequence: request.sequence,
    desiredProgress: request.desiredProgress,
    presentedProgress: frame.status === 'ready'
      ? figure3MediaProgressForFrame(frame.presentedFrameIndex)
      : request.desiredProgress,
    evidence: frame.evidence === 'video-frame-callback'
      ? 'video-frame-callback'
      : 'runtime'
  };
}

export function requestFigure3AnimationFrame(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: Figure3MediaRun
): Promise<TimelineVideoFrameResult> {
  const section = figure3Section(root);
  const video = section?.querySelector<HTMLVideoElement>('[data-figure3-alpha-video]');
  if (!video) {
    return Promise.reject(new Error('figure3 media unavailable'));
  }
  return prepareTimelineVideoFrame(video, figure3MediaInput(figure3MediaProgressForRawProgress(rawProgress), mediaRun)).then((result) => {
    if (!result) {
      throw new Error('figure3 frame preparation returned no result');
    }
    if (result.status === 'ready') {
      section?.setAttribute('data-figure3-desired-frame', String(result.targetFrameIndex));
      section?.setAttribute('data-figure3-presented-frame', String(result.presentedFrameIndex));
      section?.setAttribute('data-figure3-frame-evidence', result.evidence ?? 'runtime');
    }
    return result;
  });
}

export function prepareFigure3AnimationFrame(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: Figure3MediaRun
): Promise<void> {
  return requestFigure3AnimationFrame(root, rawProgress, mediaRun).then((result) => {
    if (result.status !== 'ready') {
      throw new Error('figure3 frame stale');
    }
  });
}

function Figure3AnimationScene({ registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => {
    const video = rootRef.current?.querySelector<HTMLVideoElement>('[data-figure3-alpha-video]');
    if (video) {
      disposeTimelineVideoDriver(video);
      video.pause();
    }
  }, []);

  return (
    <Figure3AnimationSceneMarkup
      scene="figure3-animation"
      hidden={false}
      {...(registerHandle ? { registerHandle } : {})}
      onRoot={(element) => {
        rootRef.current = element;
      }}
    />
  );
}

export const figure3AnimationScene: SceneModule = {
  id: 'figure3-animation',
  Component: Figure3AnimationScene,
  renderHold: renderFigure3Hold,
  requiredHandles: ['field', 'figure3-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
