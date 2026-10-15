import { useLayoutEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import { registerScrollMediaCompositor } from '../../media/scroll-media-sampling';
import { ScrollCanvas } from '../../media/ScrollCanvas';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput
} from '../../media/timeline-video-driver';
import { AlphaVideoSources, browserPrefersHevcAlpha } from '../../media/alpha-video-sources';
import { mapAodTimelineToMediaProgress, renderAodTransitionProgress } from './progress';

export {
  AOD_PHONE_TIMELINE_ALPHA_START,
  AOD_PHONE_TIMELINE_ALPHA_END,
  AOD_TIMELINE_ALPHA_END,
  mapAodTimelineToMediaProgress,
  renderAodTransitionProgress
} from './progress';

export const AOD_CLOUD_SRC = new URL('../../../../assets/aod_cloud-alpha.webp', import.meta.url).href;
export const AOD_SUN_SRC = new URL('../../../../assets/aod_sun-alpha.webp', import.meta.url).href;
export const AOD_FIGURE_VIDEO_SRC = new URL('../../../../assets/aod-figure-motion.webm', import.meta.url).href;
export const AOD_FIGURE_HEVC_ALPHA_SRC = new URL('../../../../assets/aod-figure-motion-hevc-alpha.mp4', import.meta.url).href;
export const AOD_MEDIA_KEY = 'aod-figure-motion';
export const AOD_FIGURE_END_SECONDS = 2.567;

export type AodMediaRun = Readonly<{
  runId: string;
  direction: 1 | -1;
  reducedMotion?: boolean;
  signal?: AbortSignal | undefined;
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
    frameRate: 30,
    startSeconds: 0,
    endSeconds: AOD_FIGURE_END_SECONDS,
    timelineDurationMs: mediaRun.timelineDurationMs ?? 2600,
    mode,
    reducedMotion: Boolean(mediaRun.reducedMotion),
    allowSeekedFrameFallback: browserPrefersHevcAlpha(),
    ...(mediaRun.signal ? { signal: mediaRun.signal } : {})
  };
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
    const frame = await prepareTimelineVideoFrame(video, aodMediaInput(progress, mediaRun, 'timeline'));
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
  const video = aodVideo(root, mediaRun.video);
  if (!video) {
    return;
  }
  mediaRunByVideo.set(video, mediaRun.runId);
  driveTimelineVideo(video, aodMediaInput(progress, mediaRun));
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

export function AodAnimationScene({ registerHandle, packedAlpha = false }: SceneComponentProps & { packedAlpha?: boolean }) {
  const rootRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (packedAlpha || !root?.closest('[data-scroll-platform]')) return;
    const video = root.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
    const canvas = root.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');
    const context = canvas?.getContext('2d');
    if (!video || !canvas || !context) return;
    // Chromium can keep an old native video-layer texture after a hidden seek,
    // even though drawImage reads the exact decoded target. Use the existing
    // full-resolution canvas only in the atomic scroll presentation phase.
    const unregister = registerScrollMediaCompositor(video, () => {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      }
      try {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(video, 0, 0);
      } catch { return false; }
      canvas.style.opacity = '1';
      canvas.style.filter = 'saturate(.95) contrast(1.02)';
      video.style.opacity = '0';
      canvas.dataset.scrollVideoMediaTime = String(video.currentTime);
      return true;
    });
    return () => {
      unregister();
      canvas.width = canvas.height = 1;
      canvas.style.removeProperty('opacity'); canvas.style.removeProperty('filter');
      video.style.removeProperty('opacity'); delete canvas.dataset.scrollVideoMediaTime;
    };
  }, [packedAlpha]);
  return (
    <article
      ref={rootRef}
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

            <video crossOrigin="anonymous"
              ref={(element) => registerHandle?.('figure-video', element)}
              className="aod-transition__figure-video"
              data-aod-figure-video
              data-media-key={AOD_MEDIA_KEY}
              muted
              preload={packedAlpha ? 'none' : 'auto'}
              playsInline
            >
              {!packedAlpha && <AlphaVideoSources
                webm={AOD_FIGURE_VIDEO_SRC}
                hevc={AOD_FIGURE_HEVC_ALPHA_SRC}
              />}
            </video>
            <ScrollCanvas purpose="packed-alpha"
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
