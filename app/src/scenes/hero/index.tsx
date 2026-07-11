import { useEffect, useRef } from 'react';
import { TextReveal, TextRevealItem } from '../../components/TextReveal';
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
  __r4HeroActive?: boolean;
  __r4HeroBoundaryBound?: boolean;
  __r4HeroPendingTime?: number;
  __r4HeroMetadataBound?: boolean;
};

function heroVideoBounds(video: HTMLVideoElement): { start: number; end: number } {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5.04;
  const start = Math.min(HERO_VIDEO_START_SECONDS, Math.max(0, duration * 0.08));
  const end = Math.min(duration - HERO_VIDEO_END_EPSILON, start + Math.min(HERO_VIDEO_SEGMENT_SECONDS, duration * 0.55));
  return { start, end: Math.max(start, end) };
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
    if (video.__r4HeroActive) {
      void video.play().catch(() => undefined);
    }
  });
}

function configureHeroVideo(video: HTMLVideoElement): void {
  video.muted = true;
  video.loop = false;
  video.autoplay = false;
  video.playsInline = true;
  video.playbackRate = 1;
}

function bindHeroPlaybackBoundary(video: HeroVideoElement): void {
  if (video.__r4HeroBoundaryBound) {
    return;
  }
  video.__r4HeroBoundaryBound = true;
  video.addEventListener('timeupdate', () => {
    const { end } = heroVideoBounds(video);
    if (video.currentTime < end - 0.015) {
      return;
    }
    video.currentTime = end;
    video.pause();
  });
}

export function setHeroPlaybackActive(element: HTMLVideoElement, active: boolean): void {
  const video = element as HeroVideoElement;
  configureHeroVideo(video);
  bindHeroMetadataResync(video);
  bindHeroPlaybackBoundary(video);
  video.__r4HeroActive = active;
  if (!active) {
    video.pause();
    return;
  }

  const { start } = heroVideoBounds(video);
  video.__r4HeroPendingTime = start;
  try {
    video.currentTime = start;
  } catch {
    // loadedmetadata starts native playback once the first seekable range exists.
  }
  void video.play().catch(() => undefined);
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
    setHeroPlaybackActive(video, !hidden);
    return () => setHeroPlaybackActive(video, false);
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
      </div>
      <div ref={(element) => registerHandle?.('copy', element)} className="r4-hero-scene__content">
        <TextReveal
          active={!hidden}
          as="h1"
          className="r4-hero-scene__title"
          aria-label="同野观幂"
          effects={['stagger', 'blur-to-clear', 'rise-up']}
          variant="staggered"
        >
          <span aria-hidden="true">
            <TextRevealItem index={0}>{HERO_COPY[0]}</TextRevealItem>
            <TextRevealItem index={1}>{HERO_COPY[1]}</TextRevealItem>
          </span>
          <span aria-hidden="true">
            <TextRevealItem index={2}>{HERO_COPY[2]}</TextRevealItem>
            <TextRevealItem index={3}>{HERO_COPY[3]}</TextRevealItem>
          </span>
        </TextReveal>
        <TextReveal
          active={!hidden}
          as="p"
          blurPx={6}
          delayMs={420}
          durationMs={2850}
          effects={['stagger', 'blur-to-clear', 'rise-up']}
          scaleX={1}
          staggerMs={0}
          variant="line"
          yPx={14}
        >
          <TextRevealItem>{HERO_COPY[4]}</TextRevealItem>
        </TextReveal>
      </div>
      <div className="r4-hero-scene__vignette" aria-hidden="true" />
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
