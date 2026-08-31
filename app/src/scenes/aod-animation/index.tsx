import type { SceneComponentProps, SceneModule } from '../../story/types';
import {
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput,
  type TimelineVideoFrameResult
} from '../../media/timeline-video-driver';
import { AlphaVideoSources } from '../../media/alpha-video-sources';
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

export {
  AOD_PHONE_TIMELINE_ALPHA_START,
  AOD_PHONE_TIMELINE_ALPHA_END,
  AOD_TIMELINE_ALPHA_END,
  mapAodMediaToTimelineProgress,
  mapAodTimelineToMediaProgress,
  renderAodTransitionProgress
} from './progress';

export const AOD_CLOUD_SRC = new URL('../../../../assets/aod_cloud-alpha.webp', import.meta.url).href;
export const AOD_SUN_SRC = new URL('../../../../assets/aod_sun-alpha.webp', import.meta.url).href;
export const AOD_FIGURE_VIDEO_SRC = new URL('../../../../assets/aod-figure-motion.webm', import.meta.url).href;
export const AOD_FIGURE_HEVC_ALPHA_SRC = new URL('../../../../assets/aod-figure-motion-hevc-alpha.mp4', import.meta.url).href;
export const AOD_MEDIA_KEY = 'aod-figure-motion';
export const AOD_FIGURE_END_SECONDS = 2.567;
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

function AodAnimationScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      className="aod-transition r3-aod-animation"
      data-r3-scene="aod-animation"
      data-aod-transition
      data-aod-duration="2"
      data-aod-scroll-vh="20"
      data-aod-video-duration="2.6"
      data-aod-fullscreen-start="0"
      data-aod-fullscreen-end="0.85"
      data-aod-backdrop-exit-start="0.18"
      data-aod-backdrop-exit-end="1.55"
      data-aod-figure-start-scale="1"
      data-aod-figure-start-y-vh="10.5"
      data-phone-landing="aod-semantic-edge"
      aria-label="The Ancient of Days visual scene"
    >
      <div className="aod-transition__sticky">
        <div ref={(element) => registerHandle?.('field', element)} className="aod-transition__field">
          <div className="aod-transition__reveal-surface" data-aod-reveal-surface data-transition-clip>
            <div className="aod-transition__layer-stack" data-transition-ghost="aod-field" aria-hidden="true">
              <img
                ref={(element) => registerHandle?.('cloud', element)}
                className="aod-transition__layer aod-transition__layer--cloud"
                data-aod-cloud-layer
                src={AOD_CLOUD_SRC}
                alt=""
              />
              <img
                ref={(element) => registerHandle?.('sun', element)}
                className="aod-transition__layer aod-transition__layer--sun"
                data-aod-sun-layer
                src={AOD_SUN_SRC}
                alt=""
              />
            </div>

            <video
              ref={(element) => registerHandle?.('figure-video', element)}
              className="aod-transition__figure-video"
              data-aod-figure-video
              data-media-key={AOD_MEDIA_KEY}
              muted
              preload="auto"
              playsInline
            >
              <AlphaVideoSources
                webm={AOD_FIGURE_VIDEO_SRC}
                hevc={AOD_FIGURE_HEVC_ALPHA_SRC}
              />
            </video>
            <canvas
              className="aod-transition__figure-canvas"
              data-aod-figure-canvas
              aria-hidden="true"
            />
            <div className="aod-transition__paper-solid" aria-hidden="true" />
            <div className="aod-transition__progress" aria-hidden="true"><span /></div>
          </div>
          <canvas className="aod-transition__ink" data-aod-ink-canvas aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}

export const aodAnimationScene: SceneModule = {
  id: 'aod-animation',
  Component: AodAnimationScene,
  renderHold: renderAodAnimationHold,
  requiredHandles: ['field', 'cloud', 'sun', 'figure-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
