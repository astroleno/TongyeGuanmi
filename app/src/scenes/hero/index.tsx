import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';

const HERO_BACK_IMAGE = new URL('../../../../assets/back1.png', import.meta.url).href;
const HERO_MIDDLE_IMAGE = new URL('../../../../assets/middle1.png', import.meta.url).href;
const HERO_MIDDLE_DEPTH_IMAGE = new URL('../../../../assets/middle1_depth.png', import.meta.url).href;
const HERO_FIGURE_VIDEO = new URL('../../../../assets/figure1.webm', import.meta.url).href;
const HERO_FIGURE_POSTER = new URL('../../../../assets/figure-poster.jpg', import.meta.url).href;
const HERO_VIDEO_SEGMENT_SECONDS = 2;
const HERO_VIDEO_START_SECONDS = 0.34;
const HERO_VIDEO_END_EPSILON = 0.08;

export const HERO_COPY = [
  '同',
  '野',
  '观',
  '幂',
  '你的同行不是更聪明，只是更早把 AI 用进了生意里。'
] as const;

export type HeroRenderState = {
  progress: number;
  backOpacity: number;
  middleOpacity: number;
  figureOpacity: number;
  contentOpacity: number;
  exitLift: number;
};

type HeroVideoElement = HTMLVideoElement & {
  __r4HeroPendingTime?: number;
  __r4HeroMetadataBound?: boolean;
};

function heroVideoIn(root: HTMLElement | null): HTMLVideoElement | null {
  if (typeof root?.querySelector !== 'function') {
    return null;
  }
  return root?.querySelector<HTMLVideoElement>('[data-hero-figure-video]') ?? null;
}

function bindHeroMetadataResync(video: HeroVideoElement): void {
  if (video.__r4HeroMetadataBound) {
    return;
  }
  video.__r4HeroMetadataBound = true;
  video.addEventListener('loadedmetadata', () => {
    const pending = video.__r4HeroPendingTime;
    if (pending === undefined) {
      return;
    }
    try {
      video.currentTime = pending;
    } catch {
      // Browsers can reject a seek until the first seekable range is ready.
    }
  });
}

function configureHeroVideo(video: HTMLVideoElement): void {
  video.muted = true;
  video.loop = false;
  video.autoplay = false;
  video.playsInline = true;
  video.pause();
}

function seekHeroVideo(video: HeroVideoElement, progress: number): void {
  configureHeroVideo(video);
  bindHeroMetadataResync(video);
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5.04;
  const start = Math.min(HERO_VIDEO_START_SECONDS, Math.max(0, duration * 0.08));
  const end = Math.min(duration - HERO_VIDEO_END_EPSILON, start + Math.min(HERO_VIDEO_SEGMENT_SECONDS, duration * 0.55));
  const targetTime = start + (Math.max(start, end) - start) * Math.min(1, Math.max(0, progress));
  video.__r4HeroPendingTime = targetTime;
  try {
    if (Math.abs(video.currentTime - targetTime) > 0.055) {
      video.currentTime = targetTime;
    }
  } catch {
    // loadedmetadata rebuilds the scrubbed frame once duration is available.
  }
}

export function renderHeroProgress(root: HTMLElement | null, progress: number): HeroRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = clamped * clamped * (3 - 2 * clamped);
  const backOpacity = 0.08 + eased * 0.78;
  const middleOpacity = eased;
  const figureOpacity = eased;
  const contentOpacity = Math.min(1, Math.max(0, (clamped - 0.42) / 0.58));
  const exitLift = (1 - eased) * 42;

  root?.style.setProperty('--r4-hero-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-hero-back-opacity', backOpacity.toFixed(4));
  root?.style.setProperty('--r4-hero-middle-opacity', middleOpacity.toFixed(4));
  root?.style.setProperty('--r4-hero-figure-opacity', figureOpacity.toFixed(4));
  root?.style.setProperty('--r4-hero-content-opacity', contentOpacity.toFixed(4));
  root?.style.setProperty('--r4-hero-exit-lift', `${exitLift.toFixed(2)}px`);
  root?.setAttribute('data-hero-progress', clamped.toFixed(4));
  const video = heroVideoIn(root);
  if (video) {
    seekHeroVideo(video as HeroVideoElement, 1 - clamped);
  }

  return { progress: clamped, backOpacity, middleOpacity, figureOpacity, contentOpacity, exitLift };
}

function HeroScene({ hidden, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    renderHeroProgress(rootRef.current, hidden ? 0 : 1);
  }, [hidden]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    configureHeroVideo(video);
    renderHeroProgress(rootRef.current, hidden ? 0 : 1);
  }, [hidden]);

  return (
    <article ref={rootRef} className="r4-hero-scene" data-r4-scene="hero">
      <div ref={(element) => registerHandle?.('stage', element)} className="r4-hero-scene__stage">
        <img className="r4-hero-scene__back" src={HERO_BACK_IMAGE} alt="" aria-hidden="true" />
        <img className="r4-hero-scene__middle" src={HERO_MIDDLE_IMAGE} alt="" aria-hidden="true" />
        <img
          className="r4-hero-scene__middle r4-hero-scene__middle--depth"
          src={HERO_MIDDLE_IMAGE}
          alt=""
          aria-hidden="true"
          style={{ WebkitMaskImage: `url(${HERO_MIDDLE_DEPTH_IMAGE})`, maskImage: `url(${HERO_MIDDLE_DEPTH_IMAGE})` }}
        />
        <video
          ref={(element) => {
            videoRef.current = element;
            registerHandle?.('figure', element);
          }}
          className="r4-hero-scene__figure"
          data-hero-figure-video
          src={HERO_FIGURE_VIDEO}
          poster={HERO_FIGURE_POSTER}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div ref={(element) => registerHandle?.('copy', element)} className="r4-hero-scene__content">
          <h1 className="r4-hero-scene__title" aria-label="同野观幂">
            <span aria-hidden="true">
              <span>{HERO_COPY[0]}</span>
              <span>{HERO_COPY[1]}</span>
            </span>
            <span aria-hidden="true">
              <span>{HERO_COPY[2]}</span>
              <span>{HERO_COPY[3]}</span>
            </span>
          </h1>
          <p>{HERO_COPY[4]}</p>
        </div>
      </div>
    </article>
  );
}

export const heroScene: SceneModule = {
  id: 'hero',
  Component: HeroScene,
  requiredHandles: ['stage', 'figure', 'copy'],
  staticFallback: {
    sectionIds: ['home'],
    text: HERO_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
