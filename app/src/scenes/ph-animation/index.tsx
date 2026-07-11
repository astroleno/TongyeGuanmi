import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const PH_MEDIA_KEY = 'ph_figure-alpha-scrub';
export const PH_BG_SRC = new URL('../../../../assets/ph_background.png', import.meta.url).href;
export const PH_FRONT_SRC = new URL('../../../../assets/ph_front-alpha.png', import.meta.url).href;
export const PH_FIGURE_VIDEO_SRC = new URL('../../../../assets/ph_figure-alpha-scrub.webm', import.meta.url).href;
export const PH_HOLD_PROGRESS = 0;
export const PH_PLAYBACK_MS = 1520;

export type PhRenderState = {
  progress: number;
  bgY: number;
  frontY: number;
  figureY: number;
};

type PhRenderOptions = {
  playback?: boolean;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
};
export const phPlaybackProgress = (progress: number) => {
  const p = clamp(progress);
  return clamp(0.78 * p + 0.22 * p * p);
};

function seekVideo(video: HTMLVideoElement | null | undefined, progress: number): void {
  if (!video) {
    return;
  }
  video.loop = false;
  video.pause();
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 76 / 30;
  const targetTime = Math.max(0, Math.min(duration - 0.02, progress * duration));
  if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.016) {
    video.currentTime = targetTime;
  }
}

function finishVideo(video: HTMLVideoElement | null | undefined, progress: number): void {
  if (!video) {
    return;
  }
  video.loop = false;
  video.pause();
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 76 / 30;
  video.currentTime = Math.max(0, Math.min(duration - 0.02, progress * duration));
}

function drivePhPlayback(section: HTMLElement | null, progress: number, mediaProgress: number): void {
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  const previous = Number.parseFloat(section?.dataset.phRawProgress ?? `${progress}`);
  const direction = progress >= previous ? 1 : -1;
  section?.setAttribute('data-ph-playback-direction', String(direction));
  section?.setAttribute('data-ph-raw-progress', progress.toFixed(4));
  section?.setAttribute('data-ph-playback-active', String(progress > 0.001 && progress < 0.999));
  if (progress <= 0.001) {
    finishVideo(video, 0);
    return;
  }
  if (progress >= 0.999) {
    finishVideo(video, 1);
    return;
  }
  seekVideo(video, mediaProgress);
}

export function renderPhAnimationProgress(root: HTMLElement | null | undefined, rawProgress: number, options: PhRenderOptions = {}): PhRenderState {
  const section = root?.matches('[data-r4-scene="ph-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]') ?? null;
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
  if (options.playback) {
    drivePhPlayback(section, raw, progress);
  } else {
    section?.setAttribute('data-ph-playback-active', 'false');
    seekVideo(section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]'), progress);
    section?.setAttribute('data-ph-raw-progress', raw.toFixed(4));
  }

  return { progress, bgY, frontY, figureY };
}

function PhAnimationScene({ role, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (role === 'current' && rootRef.current) {
      renderPhAnimationProgress(rootRef.current, PH_HOLD_PROGRESS);
    }
  }, [role]);

  return (
    <article
      ref={(element) => {
        rootRef.current = element;
        registerHandle?.('field', element);
        if (element && !initializedRef.current) {
          renderPhAnimationProgress(element, PH_HOLD_PROGRESS);
          initializedRef.current = true;
        }
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
                ref={(element) => registerHandle?.('figure-video', element)}
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
  requiredHandles: ['field', 'figure-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
