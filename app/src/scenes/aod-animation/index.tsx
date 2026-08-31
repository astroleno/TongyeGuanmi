import type { SceneModule } from '../../story/types';
import {
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput,
  type TimelineVideoFrameResult
} from '../../media/strict-timeline-video-driver';
import { progressForFrameIndex } from '../../media/frame-timebase';
import { VIDEO_FRAME_MAPS } from '../../media/video-frame-maps';
import type {
  SegmentProgressReceipt,
  SegmentProgressRequest
} from '../../story/types';
import {
  mapAodMediaToTimelineProgress,
  mapAodTimelineToMediaProgress,
  renderAodTransitionProgress
} from './progress';
import {
  AOD_FIGURE_END_SECONDS,
  AOD_MEDIA_KEY,
  AodAnimationScene
} from './scene';

export {
  AOD_PHONE_TIMELINE_ALPHA_START,
  AOD_PHONE_TIMELINE_ALPHA_END,
  AOD_TIMELINE_ALPHA_END,
  mapAodMediaToTimelineProgress,
  mapAodTimelineToMediaProgress,
  renderAodTransitionProgress
} from './progress';

export {
  AOD_CLOUD_SRC,
  AOD_FIGURE_END_SECONDS,
  AOD_FIGURE_HEVC_ALPHA_SRC,
  AOD_FIGURE_VIDEO_SRC,
  AOD_MEDIA_KEY,
  AOD_SUN_SRC
} from './scene';
const AOD_FRAME_MAP = VIDEO_FRAME_MAPS[AOD_MEDIA_KEY];

export type AodMediaRun = Readonly<{
  runId: string;
  direction: 1 | -1;
  sequence?: number;
  reducedMotion?: boolean;
  signal?: AbortSignal;
  timelineDurationMs?: number;
  video?: HTMLVideoElement | null;
}>;

const mediaRunByVideo = new WeakMap<HTMLVideoElement, string>();

function aodSection(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-aod-transition]')
    ? root
    : root?.querySelector<HTMLElement>('[data-aod-transition]') ?? null;
}

function aodVideo(
  root: HTMLElement | null | undefined,
  override?: HTMLVideoElement | null
): HTMLVideoElement | null {
  return override
    ?? root?.querySelector<HTMLVideoElement>('[data-aod-figure-video]')
    ?? aodSection(root)?.querySelector<HTMLVideoElement>('[data-aod-figure-video]')
    ?? null;
}

function aodMediaInput(
  progress: number,
  mediaRun: AodMediaRun,
  mode: TimelineVideoDriveInput['mode'] = 'timeline'
): TimelineVideoDriveInput {
  return {
    runId: mediaRun.runId,
    direction: mediaRun.direction,
    progress: mapAodTimelineToMediaProgress(progress),
    durationFallbackSeconds: 2.6,
    startSeconds: 0,
    endSeconds: AOD_FIGURE_END_SECONDS,
    timelineDurationMs: mediaRun.timelineDurationMs ?? 2600,
    mode,
    nativePlaybackDirection: 1,
    reducedMotion: Boolean(mediaRun.reducedMotion),
    allowSeekedFrameFallback: false,
    allowPlaybackNudge: false,
    frameMap: AOD_FRAME_MAP,
    ...(mediaRun.sequence !== undefined ? { sequence: mediaRun.sequence } : {}),
    ...(mediaRun.signal ? { signal: mediaRun.signal } : {})
  };
}

export function aodRawProgressForFrame(frameIndex: number): number {
  return mapAodMediaToTimelineProgress(progressForFrameIndex(AOD_FRAME_MAP, frameIndex));
}

export function aodSegmentProgressReceipt(
  request: SegmentProgressRequest,
  frame: TimelineVideoFrameResult
): SegmentProgressReceipt {
  return {
    status: frame.status === 'ready' ? 'presented' : 'stale',
    runId: request.runId,
    sequence: request.sequence,
    desiredProgress: request.desiredProgress,
    presentedProgress: frame.status === 'ready'
      ? aodRawProgressForFrame(frame.presentedFrameIndex)
      : request.desiredProgress,
    evidence: frame.evidence === 'video-frame-callback'
      ? 'video-frame-callback'
      : 'runtime'
  };
}

export function requestAodAnimationFrame(
  root: HTMLElement | null | undefined,
  progress: number,
  mediaRun: AodMediaRun
): Promise<TimelineVideoFrameResult> {
  const section = aodSection(root);
  const video = aodVideo(root, mediaRun.video);
  if (!section || !video) {
    return Promise.reject(new Error('AOD media unavailable'));
  }
  section.setAttribute('data-aod-playback-direction', String(mediaRun.direction));
  section.setAttribute('data-aod-playback-run', mediaRun.runId);
  return prepareTimelineVideoFrame(video, aodMediaInput(progress, mediaRun, 'timeline')).then((result) => {
    if (!result) {
      throw new Error('AOD frame preparation returned no result');
    }
    if (result.status === 'ready') {
      section.dataset.aodDesiredFrame = String(result.targetFrameIndex);
      section.dataset.aodPresentedFrame = String(result.presentedFrameIndex);
    }
    return result;
  });
}

export async function prepareAodAnimationFrame(
  root: HTMLElement | null | undefined,
  progress: number,
  mediaRun: AodMediaRun
): Promise<void> {
  const section = aodSection(root) ?? root ?? null;
  const video = aodVideo(root, mediaRun.video);
  if (!video) {
    throw new Error('AOD media unavailable');
  }
  try {
    const frame = await requestAodAnimationFrame(root, progress, mediaRun);
    if (frame?.status !== 'ready') {
      throw new Error('AOD frame stale');
    }
    mediaRunByVideo.set(video, mediaRun.runId);
    if (section) {
      delete section.dataset.aodStaticMediaFallback;
    }
  } catch (error) {
    if (section) {
      section.dataset.aodStaticMediaFallback = 'true';
    }
    throw error;
  }
}

export function renderAodExitProgress(
  root: HTMLElement | null | undefined,
  progress: number,
  mediaRun: AodMediaRun
): void {
  const section = aodSection(root);
  renderAodTransitionProgress(section ?? root, progress);
  section?.setAttribute('data-aod-exit-active', 'true');
  if (mediaRun) {
    section?.setAttribute('data-aod-playback-direction', String(mediaRun.direction));
    section?.setAttribute('data-aod-playback-run', mediaRun.runId);
  }
}

export function beginAodExitMedia(
  root: HTMLElement | null | undefined,
  runId: string,
  videoOverride?: HTMLVideoElement | null
): void {
  const video = aodVideo(root, videoOverride);
  if (!video) {
    return;
  }
  mediaRunByVideo.set(video, runId);
  video.pause();
  video.playbackRate = 1;
}

export function disposeAodExitMedia(
  root: HTMLElement | null | undefined,
  runId: string,
  videoOverride?: HTMLVideoElement | null
): void {
  const section = aodSection(root);
  section?.removeAttribute('data-aod-exit-active');
  section?.removeAttribute('data-aod-alpha-composite');
  const video = aodVideo(root, videoOverride);
  if (!video || mediaRunByVideo.get(video) !== runId) {
    return;
  }
  mediaRunByVideo.delete(video);
  disposeTimelineVideoDriver(video);
}

export function renderAodAnimationHold(root: HTMLElement | null): void {
  renderAodTransitionProgress(root, 0);
}

export const aodAnimationScene: SceneModule = {
  id: 'aod-animation',
  Component: AodAnimationScene,
  renderHold: renderAodAnimationHold,
  requiredHandles: ['field', 'cloud', 'sun', 'figure-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
