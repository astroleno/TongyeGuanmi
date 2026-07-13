import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TextReveal, TextRevealItem } from '../../components/TextReveal';
import type {
  HeroIntroMode,
  SceneComponentProps,
  SceneModule,
  StageLayerRole
} from '../../story/types';
import { createInkFieldFrame } from '../../transitions/shared/inkField';
import {
  createInkFieldRenderer,
  type InkFieldRenderer
} from '../../transitions/shared/sceneInk';
import { attachHeroParallax, sampleHeroIntro, startHeroIntro, type HeroIntroSample } from './motion';

const HERO_BACK_IMAGE = new URL('../../../../assets/back1.png', import.meta.url).href;
const HERO_MIDDLE_IMAGE = new URL('../../../../assets/middle1.png', import.meta.url).href;
const HERO_MIDDLE_DEPTH_IMAGE = new URL('../../../../assets/middle1_depth.png', import.meta.url).href;
const HERO_FIGURE_VIDEO = new URL('../../../../assets/figure1.webm', import.meta.url).href;
const HERO_FIGURE_POSTER = new URL('../../../../assets/figure-poster.jpg', import.meta.url).href;
const HERO_VIDEO_SEGMENT_SECONDS = 2;
const HERO_VIDEO_START_SECONDS = 0.34;
const HERO_VIDEO_END_EPSILON = 0.08;
const HERO_INTRO_INK_SPEC = {
  kind: 'radial' as const,
  origin: { x: 0.5, y: 0.5 },
  seed: 'hero-intro'
};

export const HERO_COPY = [
  '同',
  '野',
  '观',
  '幂',
  '你的同行不是更聪明，只是更早把 AI 用进了生意里。'
] as const;

export type HeroRenderState = {
  progress: number;
};

type HeroVideoElement = HTMLVideoElement & {
  __r4HeroEndpointHeld?: boolean;
  __r4HeroPendingTime?: number;
  __r4HeroMetadataBound?: boolean;
};

export type HeroVideoPlaybackState = 'inactive' | 'start' | 'terminal';

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
    video.pause();
  });
}

function configureHeroVideo(video: HTMLVideoElement): void {
  video.muted = true;
  video.loop = false;
  video.autoplay = false;
  video.playsInline = true;
  video.playbackRate = 1;
}

function seekHeroVideo(video: HeroVideoElement, time: number): void {
  video.__r4HeroPendingTime = time;
  try {
    video.currentTime = time;
  } catch {
    // loadedmetadata applies the pending time once the first seekable range exists.
  }
}

export function setHeroVideoPlaybackState(
  element: HTMLVideoElement,
  state: HeroVideoPlaybackState
): void {
  const video = element as HeroVideoElement;
  configureHeroVideo(video);
  bindHeroMetadataResync(video);
  video.pause();
  const { start, end } = heroVideoBounds(video);

  if (state === 'start') {
    video.__r4HeroEndpointHeld = false;
    seekHeroVideo(video, start);
    return;
  }
  if (state === 'terminal') {
    video.__r4HeroEndpointHeld = true;
    seekHeroVideo(video, end);
  }
}

export function heroVideoPlaybackStateForPresentation(options: Readonly<{
  hidden: boolean;
  role: StageLayerRole | undefined;
  introMode: HeroIntroMode;
  endpointHeld: boolean;
}>): HeroVideoPlaybackState {
  if (options.role === 'prev') {
    return 'terminal';
  }
  if (options.hidden || (options.role !== undefined && options.role !== 'current')) {
    return 'inactive';
  }
  if (options.introMode === 'waiting' || options.introMode === 'running') {
    return 'start';
  }
  if (options.introMode === 'complete') {
    return options.endpointHeld ? 'terminal' : 'start';
  }
  return 'terminal';
}

function range01(value: number, start: number, end: number): number {
  return Math.min(1, Math.max(0, (value - start) / (end - start)));
}

export function renderHeroProgress(root: HTMLElement | null, progress: number): HeroRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const smoothStep = (value: number) => value * value * (3 - 2 * value);
  const middleIntro = smoothStep(range01(clamped, 0, 0.92));
  const figureIntro = smoothStep(range01(clamped, 0.02, 0.96));

  root?.style.setProperty('--r4-hero-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-hero-middle-intro', middleIntro.toFixed(4));
  root?.style.setProperty('--r4-hero-figure-intro', figureIntro.toFixed(4));
  root?.setAttribute('data-hero-progress', clamped.toFixed(4));
  return { progress: clamped };
}

export function renderHeroHold(root: HTMLElement | null): void {
  renderHeroProgress(root, 1);
}

function HeroScene({ hidden, role, presentation, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const backRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const introInkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const introInkRendererRef = useRef<InkFieldRenderer | null>(null);
  const introProgressRef = useRef(1);
  const introMode = presentation?.heroIntroMode ?? 'endpoint';
  const reducedMotion = presentation?.reducedMotion ?? false;
  const [titleActive, setTitleActive] = useState(
    introMode === 'complete' || introMode === 'endpoint'
  );

  const renderIntroSample = useCallback((sample: HeroIntroSample) => {
    const root = rootRef.current;
    introProgressRef.current = sample.progress;
    renderHeroProgress(root, sample.progress);
    const canvas = introInkCanvasRef.current;
    const back = backRef.current;
    if (root && canvas && back) {
      const frame = createInkFieldFrame(HERO_INTRO_INK_SPEC, sample.progress, {
        width: root.clientWidth || window.innerWidth,
        height: root.clientHeight || window.innerHeight
      });
      introInkRendererRef.current?.render(frame);
      if (frame.ownership.revealClip && sample.progress < 0.999) {
        back.style.clipPath = frame.ownership.revealClip;
        back.style.setProperty('-webkit-clip-path', frame.ownership.revealClip);
      } else {
        back.style.removeProperty('clip-path');
        back.style.removeProperty('-webkit-clip-path');
      }
      canvas.dataset.heroIntroInkActive = String(sample.progress > 0.002 && sample.progress < 0.999);
    }
    root?.setAttribute('data-hero-intro-state', sample.complete ? 'complete' : 'running');
    root?.setAttribute('data-hero-title-active', String(sample.titleActive));
  }, []);

  const registerRoot = useCallback((element: HTMLElement | null) => {
    rootRef.current = element;
    if (!element || role !== 'current') {
      return;
    }
    const pending = introMode === 'waiting' || introMode === 'running';
    const sample = sampleHeroIntro(pending ? 0 : 1);
    renderIntroSample(sample);
    element.setAttribute('data-hero-intro-state', introMode);
  }, [introMode, renderIntroSample, role]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = introInkCanvasRef.current;
    const back = backRef.current;
    if (!root || !canvas || !back || reducedMotion) {
      return;
    }
    const renderer = createInkFieldRenderer(canvas, {
      grade: 'dark',
      generation: 'hero-intro',
      removeCanvasOnDestroy: false
    });
    introInkRendererRef.current = renderer;
    renderIntroSample(sampleHeroIntro(introProgressRef.current));
    return () => {
      introInkRendererRef.current = null;
      renderer?.destroy();
      back.style.removeProperty('clip-path');
      back.style.removeProperty('-webkit-clip-path');
    };
  }, [reducedMotion, renderIntroSample]);

  useEffect(() => {
    if (role !== 'current') {
      return;
    }
    if (introMode === 'waiting') {
      setTitleActive(false);
      renderIntroSample(sampleHeroIntro(0));
      rootRef.current?.setAttribute('data-hero-intro-state', 'waiting');
      return;
    }
    if (introMode === 'running') {
      setTitleActive(false);
      return startHeroIntro({
        reducedMotion,
        render: renderIntroSample,
        onTitleActive: () => setTitleActive(true),
        ...(presentation?.onHeroIntroComplete
          ? { onComplete: presentation.onHeroIntroComplete }
          : {})
      });
    }
    setTitleActive(true);
    renderIntroSample(sampleHeroIntro(1));
    rootRef.current?.setAttribute('data-hero-intro-state', introMode);
  }, [introMode, presentation?.onHeroIntroComplete, reducedMotion, renderIntroSample, role]);

  useEffect(() => {
    const root = rootRef.current;
    const introSettled = introMode === 'complete' || introMode === 'endpoint';
    if (!root || role !== 'current' || hidden || !introSettled || reducedMotion) {
      return;
    }
    return attachHeroParallax(root);
  }, [hidden, introMode, reducedMotion, role]);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const playbackState = heroVideoPlaybackStateForPresentation({
      hidden,
      role,
      introMode,
      endpointHeld: Boolean((video as HeroVideoElement).__r4HeroEndpointHeld)
    });
    setHeroVideoPlaybackState(video, playbackState);
  }, [hidden, introMode, role]);

  useEffect(() => () => {
    if (videoRef.current) {
      setHeroVideoPlaybackState(videoRef.current, 'inactive');
    }
  }, []);

  return (
    <article ref={registerRoot} className="r4-hero-scene" data-r4-scene="hero">
      <div ref={(element) => registerHandle?.('stage', element)} className="r4-hero-scene__stage">
        <img ref={backRef} className="r4-hero-scene__back" src={HERO_BACK_IMAGE} alt="" aria-hidden="true" />
        <canvas
          ref={(element) => {
            introInkCanvasRef.current = element;
            registerHandle?.('intro-ink', element);
          }}
          className="r4-hero-scene__intro-ink"
          data-hero-intro-ink-canvas
          aria-hidden="true"
        />
        <img className="r4-hero-scene__middle" src={HERO_MIDDLE_IMAGE} alt="" aria-hidden="true" />
        <img
          className="r4-hero-scene__middle r4-hero-scene__middle--depth"
          src={HERO_MIDDLE_IMAGE}
          alt=""
          aria-hidden="true"
          style={{ WebkitMaskImage: `url(${HERO_MIDDLE_DEPTH_IMAGE})`, maskImage: `url(${HERO_MIDDLE_DEPTH_IMAGE})` }}
        />
        <div ref={(element) => registerHandle?.('copy', element)} className="r4-hero-scene__content">
          <TextReveal
            active={titleActive && !hidden}
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
            active={titleActive && !hidden}
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
      <div className="r4-hero-scene__vignette" aria-hidden="true" />
    </article>
  );
}

export const heroScene: SceneModule = {
  id: 'hero',
  Component: HeroScene,
  renderHold: renderHeroHold,
  requiredHandles: ['stage', 'intro-ink', 'figure', 'copy'],
  staticFallback: {
    sectionIds: ['home'],
    text: HERO_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
