import { useEffect, useRef } from 'react';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput
} from '../../media/timeline-video-driver';
import { PH_PLAYBACK_MS } from '../../story/timings';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const PH_MEDIA_KEY = 'ph-figure-motion';
export const PH_BG_SRC = new URL('../../../../assets/ph_background.png', import.meta.url).href;
export const PH_FRONT_SRC = new URL('../../../../assets/ph_front-alpha.png', import.meta.url).href;
export const PH_FIGURE_VIDEO_SRC = new URL('../../../../assets/ph-figure-motion.webm', import.meta.url).href;
export const PH_FIGURE_END_SECONDS = 1.5;
export const PH_HOLD_PROGRESS = 0;

export type PhRenderState = {
  progress: number;
  bgY: number;
  frontY: number;
  figureY: number;
};

export type PhMediaRun = {
  runId: string;
  direction: 1 | -1;
  reducedMotion?: boolean;
  signal?: AbortSignal;
};

type PhRenderOptions = {
  mediaRun?: PhMediaRun;
};

function phSection(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ph-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]') ?? null;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
};
export const phPlaybackProgress = (progress: number) => {
  const p = clamp(progress);
  return clamp(0.78 * p + 0.22 * p * p);
};

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
    mode: mediaRun.direction === 1 ? 'native-preferred' : 'timeline',
    nativePlaybackDirection: 1,
    ...(mediaRun.reducedMotion !== undefined ? { reducedMotion: mediaRun.reducedMotion } : {}),
    ...(mediaRun.signal ? { signal: mediaRun.signal } : {})
  };
}

function drivePhPlayback(
  section: HTMLElement | null,
  progress: number,
  mediaProgress: number,
  mediaRun: NonNullable<PhRenderOptions['mediaRun']>
): void {
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  section?.setAttribute('data-ph-playback-direction', String(mediaRun.direction));
  section?.setAttribute('data-ph-playback-run', mediaRun.runId);
  section?.setAttribute('data-ph-raw-progress', progress.toFixed(4));
  section?.setAttribute('data-ph-playback-active', String(progress > 0.001 && progress < 0.999));
  const snapshot = driveTimelineVideo(video, phMediaInput(mediaProgress, mediaRun));
  section?.setAttribute('data-ph-playback-fallback', String(snapshot?.nativeFallback ?? false));
}

export function preparePhAnimationFrame(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: PhMediaRun
): Promise<void> {
  renderPhAnimationProgress(root, rawProgress);
  const section = phSection(root);
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  if (!section || !video) {
    return Promise.reject(new Error('PH media surface is unavailable'));
  }
  return prepareTimelineVideoFrame(
    video,
    phMediaInput(phPlaybackProgress(rawProgress), mediaRun)
  ).then((result) => {
    if (result?.status !== 'ready') {
      throw new Error('PH media frame preparation became stale');
    }
  });
}

export function renderPhAnimationProgress(root: HTMLElement | null | undefined, rawProgress: number, options: PhRenderOptions = {}): PhRenderState {
  const section = phSection(root);
  const raw = clamp(rawProgress);
  const progress = phPlaybackProgress(raw);
  const eased = smoothStep(progress);
  const bgY = eased * -18;
  const frontY = eased * 230;
  const figureY = eased * 135;

  section?.style.setProperty('--ph-progress', progress.toFixed(4));
  section?.style.setProperty('--ph-bg-parallax-y', `${bgY.toFixed(2)}px`);
  section?.style.setProperty('--ph-front-parallax-y', `${frontY.toFixed(2)}px`);
  section?.style.setProperty('--ph-figure-parallax-y', `${figureY.toFixed(2)}px`);
  section?.setAttribute('data-ph-progress', progress.toFixed(4));
  if (options.mediaRun) {
    drivePhPlayback(section, raw, progress, options.mediaRun);
  } else {
    section?.setAttribute('data-ph-playback-active', 'false');
    section?.setAttribute('data-ph-raw-progress', raw.toFixed(4));
  }

  return { progress, bgY, frontY, figureY };
}

export function renderPhHold(root: HTMLElement | null): void {
  renderPhAnimationProgress(root, PH_HOLD_PROGRESS);
}

export function parkPhMedia(root: HTMLElement | null | undefined): void {
  const section = phSection(root);
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  if (!video) {
    return;
  }
  disposeTimelineVideoDriver(video);
  video.pause();
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
      void preparePhAnimationFrame(root, 0, {
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
    <article
      ref={(element) => {
        rootRef.current = element;
        registerHandle?.('field', element);
      }}
      className="ph-page r4-ph-animation"
      data-r4-scene="ph-animation"
      data-ph-stage
      aria-label="Pythagoreans Hymn visual scene"
    >
      <div className="ph-scroll">
        <div className="ph-sticky">
          <div className="ph-field">
            <img className="ph-bg" src={PH_BG_SRC} alt="" aria-hidden="true" />
            <div className="ph-paper" aria-hidden="true" />
            <div className="ph-sun-wash" aria-hidden="true" />
            <div className="ph-layer-stack" aria-hidden="true">
              <img className="ph-layer ph-layer--front" src={PH_FRONT_SRC} alt="" />
              <video
                ref={(element) => {
                  videoRef.current = element;
                  registerHandle?.('figure-video', element);
                }}
                className="ph-layer ph-layer--figure"
                data-ph-alpha-video
                data-media-key={PH_MEDIA_KEY}
                src={PH_FIGURE_VIDEO_SRC}
                muted
                preload="auto"
                playsInline
              />
            </div>
            <div className="ph-edge-light" aria-hidden="true" />
            <div className="ph-texture" aria-hidden="true" />
            <div className="ph-progress" aria-hidden="true"><span /></div>
          </div>
        </div>
      </div>
    </article>
  );
}

export const phAnimationScene: SceneModule = {
  id: 'ph-animation',
  Component: PhAnimationScene,
  renderHold: renderPhHold,
  requiredHandles: ['field', 'figure-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
