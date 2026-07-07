import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';

const CLOUD_IMAGE = new URL('../../../../assets/figure2-cloud-source.png', import.meta.url).href;
const FRONT_WHITE_IMAGE = new URL('../../../../assets/figure2-front-white-source.png', import.meta.url).href;
const FRONT_COLOR_IMAGE = new URL('../../../../assets/figure2-front-color-source.png', import.meta.url).href;
const FAR_ARCH_MASK = new URL('../../../../assets/arch2b-alpha.png', import.meta.url).href;
const MIDDLE_IMAGE = new URL('../../../../assets/figure2-middle-fresco-opaque-alpha.png', import.meta.url).href;
const MIDDLE_MASK_IMAGE = new URL('../../../../assets/figure2-middle-window-mask.png', import.meta.url).href;
const NEAR_ARCH_IMAGE = new URL('../../../../assets/arch2d-alpha.png', import.meta.url).href;
const LEFT_VIDEO = new URL('../../../../assets/figure2a-alpha-auto.webm', import.meta.url).href;
const RIGHT_VIDEO = new URL('../../../../assets/figure2b-alpha-auto.webm', import.meta.url).href;
const LEFT_POSTER = new URL('../../../../assets/figure2a-alpha-reverse-lite-poster.png', import.meta.url).href;
const RIGHT_POSTER = new URL('../../../../assets/figure2b-alpha-reverse-lite-poster.png', import.meta.url).href;

export type Figure2AnimationRenderState = {
  progress: number;
  stageOpacity: number;
  figureOpacity: number;
  cameraScale: number;
};

type Figure2Root = HTMLElement & {
  __r4Figure2Progress?: number;
};

const VIDEO_SEGMENT_SECONDS = 5;
const VIDEO_END_EPSILON = 0.045;

function smoothStep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function syncVideo(video: HTMLVideoElement, progress: number, previousProgress: number): void {
  video.loop = false;
  video.muted = true;
  video.playsInline = true;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : VIDEO_SEGMENT_SECONDS;
  const start = 0.001;
  const end = Math.max(start + 0.2, Math.min(duration - VIDEO_END_EPSILON, start + Math.min(VIDEO_SEGMENT_SECONDS, duration)));

  if (progress <= 0.001) {
    video.pause();
    try {
      video.currentTime = start;
    } catch {
      // Metadata can settle after the first render.
    }
    return;
  }

  if (progress >= 0.998) {
    video.pause();
    try {
      video.currentTime = end;
    } catch {
      // Metadata can settle after the first render.
    }
    return;
  }

  if (progress >= previousProgress) {
    video.playbackRate = Math.max(0.5, Math.min(3.5, (end - start) / 2.4));
    void video.play().catch(() => {
      try {
        video.currentTime = start + (end - start) * progress;
      } catch {
        // Autoplay may be denied in synthetic contexts; seek keeps the frame deterministic.
      }
    });
  } else {
    video.pause();
    try {
      video.currentTime = start + (end - start) * progress;
    } catch {
      // Metadata can settle after the first render.
    }
  }
}

function syncFigureVideos(root: HTMLElement | null, progress: number, previousProgress: number): void {
  if (typeof root?.querySelectorAll !== 'function') {
    return;
  }
  root.querySelectorAll<HTMLVideoElement>('[data-figure2-video]').forEach((video) => syncVideo(video, progress, previousProgress));
}

export function renderFigure2AnimationProgress(root: HTMLElement | null, progress: number): Figure2AnimationRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = smoothStep(clamped);
  const previousProgress = (root as Figure2Root | null)?.__r4Figure2Progress ?? clamped;
  const stageOpacity = 1;
  const figureOpacity = 1;
  const cameraScale = 1.012 + eased * 0.13;
  const cloudScale = 1 + eased * 0.10;
  const cloudY = eased * 3;
  const farArcadeScale = 1 + eased * 0.22;
  const farArcadeY = 10 + eased * 8;
  const middleY = -eased * 34;
  const nearArchScale = 1.025 + eased * 0.10;
  const nearArchBlur = eased * 3.6;
  const figureY = -eased * 12;
  const figureScale = 1 + eased * 0.035;
  root?.style.setProperty('--r4-figure2-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-figure2-stage-opacity', stageOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-figure-opacity', figureOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-camera-scale', cameraScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-cloud-y', `${cloudY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-cloud-scale', cloudScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-far-arcade-y', `${farArcadeY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-far-arcade-scale', farArcadeScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-middle-y', `${middleY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-near-arch-scale', nearArchScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-near-arch-blur', `${nearArchBlur.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-figure-y', `${figureY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-figure-scale', figureScale.toFixed(4));
  root?.setAttribute('data-figure2-progress', clamped.toFixed(4));
  if (root) {
    (root as Figure2Root).__r4Figure2Progress = clamped;
  }
  syncFigureVideos(root, clamped, previousProgress);
  return { progress: clamped, stageOpacity, figureOpacity, cameraScale };
}

function Figure2AnimationScene({ hidden, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const leftVideoRef = useRef<HTMLVideoElement | null>(null);
  const rightVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    renderFigure2AnimationProgress(rootRef.current, hidden ? 0 : 1);
  }, [hidden]);

  useEffect(() => {
    const videos = [leftVideoRef.current, rightVideoRef.current].filter(Boolean) as HTMLVideoElement[];
    for (const video of videos) {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.pause();
    }
  }, [hidden]);

  return (
    <article ref={rootRef} className="r4-figure2" data-r4-scene="figure2-animation">
      <div ref={(element) => registerHandle?.('stage', element)} className="r4-figure2__field">
        <div className="r4-figure2__middle-camera">
          <div className="r4-figure2__window-mask" style={{ WebkitMaskImage: `url(${MIDDLE_MASK_IMAGE})`, maskImage: `url(${MIDDLE_MASK_IMAGE})` }}>
            <img className="r4-figure2__cloud" src={CLOUD_IMAGE} alt="" aria-hidden="true" />
            <div className="r4-figure2__far-arcade" aria-hidden="true">
              <img className="r4-figure2__far-arcade-white" src={FRONT_WHITE_IMAGE} alt="" style={{ WebkitMask: `url(${FAR_ARCH_MASK}) center / contain no-repeat`, mask: `url(${FAR_ARCH_MASK}) center / contain no-repeat` }} />
              <img className="r4-figure2__far-arcade-color" src={FRONT_COLOR_IMAGE} alt="" style={{ WebkitMask: `url(${FAR_ARCH_MASK}) center / contain no-repeat`, mask: `url(${FAR_ARCH_MASK}) center / contain no-repeat` }} />
              <img className="r4-figure2__far-arcade-relief" src={FRONT_WHITE_IMAGE} alt="" style={{ WebkitMask: `url(${FAR_ARCH_MASK}) center / contain no-repeat`, mask: `url(${FAR_ARCH_MASK}) center / contain no-repeat` }} />
            </div>
          </div>
          <img className="r4-figure2__middle" src={MIDDLE_IMAGE} alt="" aria-hidden="true" />
        </div>
        <img className="r4-figure2__near-arch" src={NEAR_ARCH_IMAGE} alt="" aria-hidden="true" />
        <div ref={(element) => registerHandle?.('figures', element)} className="r4-figure2__figures" aria-label="子问老子人物动画">
          <div className="r4-figure2__people-contact-shadow" aria-hidden="true" />
          <figure className="r4-figure2__figure r4-figure2__figure--left">
            <video ref={leftVideoRef} data-figure2-video src={LEFT_VIDEO} poster={LEFT_POSTER} muted playsInline preload="auto" aria-hidden="true" />
            <figcaption>问道者</figcaption>
          </figure>
          <figure className="r4-figure2__figure r4-figure2__figure--right">
            <video ref={rightVideoRef} data-figure2-video src={RIGHT_VIDEO} poster={RIGHT_POSTER} muted playsInline preload="auto" aria-hidden="true" />
            <figcaption>老子</figcaption>
          </figure>
        </div>
      </div>
    </article>
  );
}

export const figure2AnimationScene: SceneModule = {
  id: 'figure2-animation',
  Component: Figure2AnimationScene,
  requiredHandles: ['stage', 'figures'],
  preload: () => ({ milestones: ['targetReady'] })
};
