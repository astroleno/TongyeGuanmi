import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';

const HERO_BACK_IMAGE = new URL('../../../../assets/back1.png', import.meta.url).href;
const HERO_MIDDLE_IMAGE = new URL('../../../../assets/middle1.png', import.meta.url).href;
const HERO_MIDDLE_DEPTH_IMAGE = new URL('../../../../assets/middle1_depth.png', import.meta.url).href;
const HERO_FIGURE_VIDEO = new URL('../../../../assets/figure1.webm', import.meta.url).href;
const HERO_FIGURE_POSTER = new URL('../../../../assets/figure-poster.jpg', import.meta.url).href;

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
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    if (hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
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
