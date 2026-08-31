import { useEffect, useRef } from 'react';
import {
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput,
  type TimelineVideoFrameResult
} from '../../media/strict-timeline-video-driver';
import { progressForFrameIndex } from '../../media/frame-timebase';
import { videoFrameMapFor } from '../../media/video-frame-maps';
import { PH_PLAYBACK_MS } from '../../story/timings';
import type {
  SceneComponentProps,
  SceneModule,
  SegmentProgressReceipt,
  SegmentProgressRequest
} from '../../story/types';
import {
  PH_FIGURE_END_SECONDS,
  PH_MEDIA_KEY,
  PhAnimationSceneMarkup
} from './scene';
import {
  phPlaybackProgress,
  renderPhHold
} from './visual';

export {
  PH_BG_SRC,
  PH_FIGURE_END_SECONDS,
  PH_FIGURE_HEVC_ALPHA_SRC,
  PH_FIGURE_VIDEO_SRC,
  PH_FRONT_SRC,
  PH_HOLD_PROGRESS,
  PH_MEDIA_KEY
} from './scene';
export {
  phPlaybackProgress,
  renderPhAnimationProgress,
  renderPhHold,
  type PhRenderOptions
} from './visual';
export type { PhRenderState } from './visual';

export type PhMediaRun = {
  runId: string;
  direction: 1 | -1;
  sequence?: number;
  reducedMotion?: boolean;
  signal?: AbortSignal;
};

function phSection(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ph-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]') ?? null;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function phMediaInput(
  mediaProgress: number,
  mediaRun: PhMediaRun
): TimelineVideoDriveInput {
  return {
    runId: mediaRun.runId,
    direction: mediaRun.direction,
    progress: mediaProgress,
    durationFallbackSeconds: 1.533,
    startSeconds: 0,
    endSeconds: PH_FIGURE_END_SECONDS,
    timelineDurationMs: PH_PLAYBACK_MS,
    mode: 'timeline',
    frameMap: videoFrameMapFor(PH_MEDIA_KEY),
    allowPlaybackNudge: false,
    ...(mediaRun.sequence !== undefined ? { sequence: mediaRun.sequence } : {}),
    ...(mediaRun.reducedMotion !== undefined ? { reducedMotion: mediaRun.reducedMotion } : {}),
    ...(mediaRun.signal ? { signal: mediaRun.signal } : {})
  };
}

function writePhPlaybackRequest(
  section: HTMLElement | null,
  progress: number,
  mediaRun: PhMediaRun
): void {
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  section?.setAttribute('data-ph-playback-direction', String(mediaRun.direction));
  section?.setAttribute('data-ph-playback-run', mediaRun.runId);
  section?.setAttribute('data-ph-raw-progress', progress.toFixed(4));
  section?.setAttribute('data-ph-playback-active', String(progress > 0.001 && progress < 0.999));
  if (video) {
    section?.setAttribute('data-ph-playback-fallback', video.dataset.timelineVideoFallback ?? 'false');
  }
}

export function phRawProgressForFrame(frameIndex: number): number {
  const frameMap = videoFrameMapFor(PH_MEDIA_KEY);
  const mediaProgress = progressForFrameIndex(frameMap, frameIndex);
  // phPlaybackProgress(p) = .78p + .22p². Invert the authored easing so the
  // visual timeline commits at the master progress represented by the proof.
  return clamp(
    (-0.78 + Math.sqrt(0.78 * 0.78 + 0.88 * mediaProgress)) / 0.44
  );
}

export function phSegmentProgressReceipt(
  request: SegmentProgressRequest,
  frame: TimelineVideoFrameResult
): SegmentProgressReceipt {
  return {
    status: frame.status === 'ready' ? 'presented' : 'stale',
    runId: request.runId,
    sequence: request.sequence,
    desiredProgress: request.desiredProgress,
    presentedProgress: frame.status === 'ready'
      ? phRawProgressForFrame(frame.presentedFrameIndex)
      : request.desiredProgress,
    evidence: frame.evidence === 'video-frame-callback'
      ? 'video-frame-callback'
      : 'runtime'
  };
}

export function requestPhAnimationFrame(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: PhMediaRun
): Promise<TimelineVideoFrameResult> {
  const section = phSection(root);
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  if (!section || !video) {
    return Promise.reject(new Error('PH media surface is unavailable'));
  }
  writePhPlaybackRequest(section, rawProgress, mediaRun);
  const input = phMediaInput(phPlaybackProgress(rawProgress), mediaRun);
  return prepareTimelineVideoFrame(video, input).then((result) => {
    if (!result) {
      throw new Error('PH media frame preparation returned no result');
    }
    if (result.status === 'ready') {
      section.dataset.phDesiredFrame = String(result.targetFrameIndex);
      section.dataset.phPresentedFrame = String(result.presentedFrameIndex);
      section.dataset.phPlaybackFallback = video.dataset.timelineVideoFallback ?? 'false';
    }
    return result;
  });
}

export function preparePhAnimationFrame(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: PhMediaRun
): Promise<void> {
  return requestPhAnimationFrame(root, rawProgress, mediaRun).then((result) => {
    if (result.status !== 'ready') {
      throw new Error('PH media frame preparation became stale');
    }
  });
}

export function parkPhMedia(root: HTMLElement | null | undefined): void {
  const section = phSection(root);
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  if (!video || !section) {
    return;
  }
  disposeTimelineVideoDriver(video);
  video.pause();
  delete section.dataset.phDesiredFrame;
  delete section.dataset.phPresentedFrame;
  delete section.dataset.phPlaybackFallback;
}

function PhAnimationScene({ registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.pause();
    }
    const controller = root && video ? new AbortController() : null;
    if (root && video && controller) {
      void requestPhAnimationFrame(root, 0, {
        runId: 'ph-prewarm',
        direction: 1,
        signal: controller.signal
      }).catch(() => undefined);
    }
    return () => {
      controller?.abort();
      if (video) {
        disposeTimelineVideoDriver(video);
        video.pause();
      }
      if (root) {
        delete root.dataset.phPlaybackRun;
      }
    };
  }, []);

  return (
    <PhAnimationSceneMarkup
      scene="ph-animation"
      hidden={false}
      {...(registerHandle ? { registerHandle } : {})}
      onRoot={(element) => {
        rootRef.current = element;
      }}
      onVideo={(element) => {
        videoRef.current = element;
      }}
    />
  );
}

export const phAnimationScene: SceneModule = {
  id: 'ph-animation',
  Component: PhAnimationScene,
  renderHold: renderPhHold,
  requiredHandles: ['field', 'figure-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
