import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { TextReveal, TextRevealItem } from '../../../components/TextReveal';
import {
  createPackedAlphaVideoCompositor,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';
import {
  HERO_RADIAL_INK_FIELD,
  renderHeroProgress,
  startHeroIntro
} from '../../../scenes/hero/motion';
import { HOME_COPY } from '../../../story/copy';
import {
  createRadialInkIntroController,
  type RadialInkIntroController
} from '../../../transitions/shared/radialInkIntro';
import { phoneMediaUrlFor } from '../phone-media';
import {
  attachPhoneDeviceParallax,
  createPhoneFigurePlayback,
  type PhoneDeviceParallax,
  type PhoneFigurePlayback
} from '../hero-motion';
import type { PhoneSceneAdapterHandle, PhoneSceneAdapterProps } from '../types';
import './PhoneHero.css';

const HERO_BACK_IMAGE = phoneMediaUrlFor('hero-back', 'hero');
const HERO_MIDDLE_IMAGE = phoneMediaUrlFor('hero-middle', 'hero');
const HERO_FIGURE_POSTER = phoneMediaUrlFor('hero-figure-poster', 'hero');
const HERO_FIGURE_PACKED_ALPHA_VIDEO = phoneMediaUrlFor('hero-figure-packed', 'hero');

const HERO_SUBTITLE = HOME_COPY[4]!;
const subtitleBreak = HERO_SUBTITLE.indexOf('，') + 1;
const HERO_SUBTITLE_LINES = subtitleBreak > 0
  ? [HERO_SUBTITLE.slice(0, subtitleBreak), HERO_SUBTITLE.slice(subtitleBreak)]
  : [HERO_SUBTITLE];

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export type PhoneHeroAdapterHandle = PhoneSceneAdapterHandle & {
  startEntrance(): void;
  completeEntrance(): void;
  unlockFromGesture(): void;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range01(value: number, start: number, end: number): number {
  return end <= start ? Number(value >= end) : clamp((value - start) / (end - start));
}

export const PhoneHero = forwardRef<PhoneHeroAdapterHandle, PhoneSceneAdapterProps>(function PhoneHero(
  { active, reducedMotion, onReady },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const backMotionRef = useRef<HTMLDivElement | null>(null);
  const backParallaxRef = useRef<HTMLDivElement | null>(null);
  const backImageRef = useRef<HTMLImageElement | null>(null);
  const introInkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const middleMotionRef = useRef<HTMLDivElement | null>(null);
  const middleParallaxRef = useRef<HTMLDivElement | null>(null);
  const figureMotionRef = useRef<HTMLDivElement | null>(null);
  const figureParallaxRef = useRef<HTMLDivElement | null>(null);
  const figureVideoRef = useRef<HTMLVideoElement | null>(null);
  const figureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const subtitleRef = useRef<HTMLDivElement | null>(null);
  const cueRef = useRef<HTMLSpanElement | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const playbackRef = useRef<PhoneFigurePlayback | undefined>(undefined);
  const compositorRef = useRef<PackedAlphaVideoCompositor | undefined>(undefined);
  const parallaxRef = useRef<PhoneDeviceParallax | undefined>(undefined);
  const introInkRef = useRef<RadialInkIntroController | undefined>(undefined);
  const disposeEntranceRef = useRef<(() => void) | undefined>(undefined);
  const activeRef = useRef(active);
  const [titleActive, setTitleActive] = useState(reducedMotion);

  useEffect(() => {
    activeRef.current = active;
    playbackRef.current?.setActive(active && !reducedMotion);
  }, [active, reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    const back = backImageRef.current;
    const canvas = introInkCanvasRef.current;
    if (!root || !back || !canvas || reducedMotion) return;
    const controller = createRadialInkIntroController({
      canvas,
      revealSurface: back,
      targetImage: back,
      field: HERO_RADIAL_INK_FIELD,
      generation: 'phone-story:hero-intro',
      viewport: () => ({
        width: root.clientWidth || window.innerWidth,
        height: root.clientHeight || window.innerHeight
      })
    });
    introInkRef.current = controller;
    controller.prewarm();
    controller.render(0);
    return () => {
      controller.dispose();
      if (introInkRef.current === controller) introInkRef.current = undefined;
    };
  }, [reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    const video = figureVideoRef.current;
    const canvas = figureCanvasRef.current;
    const backParallax = backParallaxRef.current;
    const middleParallax = middleParallaxRef.current;
    const figureParallax = figureParallaxRef.current;
    if (!root || !video || !canvas || !backParallax || !middleParallax || !figureParallax) {
      return;
    }

    const compositor = createPackedAlphaVideoCompositor({
      video,
      canvas,
      onFrame: () => {
        figureParallax.dataset.phoneFigureAlpha = 'verified';
        figureParallax.dataset.phoneFigureFrame = 'ready';
      }
    });
    const playback = createPhoneFigurePlayback(video, HERO_FIGURE_PACKED_ALPHA_VIDEO);
    const parallax = attachPhoneDeviceParallax({
      root,
      targets: [
        { element: backParallax, x: 7, y: 5 },
        { element: middleParallax, x: 14, y: 10 },
        { element: figureParallax, x: 22, y: 16 }
      ]
    });
    compositorRef.current = compositor;
    playbackRef.current = playback;
    parallaxRef.current = parallax;
    playback.setActive(activeRef.current && !reducedMotion);
    onReady?.();

    return () => {
      disposeEntranceRef.current?.();
      disposeEntranceRef.current = undefined;
      parallax.dispose();
      playback.dispose();
      compositor.dispose();
      if (parallaxRef.current === parallax) parallaxRef.current = undefined;
      if (playbackRef.current === playback) playbackRef.current = undefined;
      if (compositorRef.current === compositor) compositorRef.current = undefined;
    };
  }, [onReady, reducedMotion]);

  useImperativeHandle(forwardedRef, () => {
    const completeEntrance = () => {
      disposeEntranceRef.current?.();
      disposeEntranceRef.current = undefined;
      const root = rootRef.current;
      if (!root) return;
      renderHeroProgress(root, 1);
      introInkRef.current?.render(1);
      root.dataset.phoneHeroEntrance = 'complete';
      root.dataset.phoneHeroTitleActive = 'true';
      setTitleActive(true);
    };
    return {
      root: () => rootRef.current,
      update(rawProgress) {
        const progress = clamp(rawProgress);
        const back = backMotionRef.current;
        const middle = middleMotionRef.current;
        const figure = figureMotionRef.current;
        const copy = copyRef.current;
        const subtitle = subtitleRef.current;
        const cue = cueRef.current;
        const vignette = vignetteRef.current;
        if (!back || !middle || !figure || !copy || !subtitle || !cue || !vignette) return;
        back.style.transform = 'scale(1.08)';
        middle.style.transform = `scale(${(1 + progress * 0.18).toFixed(4)}) translate3d(0, ${(progress * 12).toFixed(2)}%, 0)`;
        figure.style.transform = `scale(${(1 + progress * 0.11).toFixed(4)}) translate3d(0, ${(-15 * range01(progress, 0.12, 1)).toFixed(2)}%, 0)`;
        const copyProgress = range01(progress, 0.18, 1);
        copy.style.transform = `translate3d(0, ${(-58 * copyProgress).toFixed(2)}px, 0)`;
        copy.style.opacity = String(1 - copyProgress);
        subtitle.style.transform = `translate3d(0, ${(-38 * copyProgress).toFixed(2)}px, 0)`;
        subtitle.style.opacity = String(1 - copyProgress);
        cue.style.transform = `translate3d(0, ${(-18 * progress).toFixed(2)}px, 0)`;
        cue.style.opacity = String(1 - progress);
        vignette.style.opacity = String(1 - progress * 0.54);
        playbackRef.current?.scrub(progress);
      },
      enter() {
        playbackRef.current?.setActive(!reducedMotion);
      },
      leave() {
        playbackRef.current?.setActive(false);
      },
      reverse() {
        playbackRef.current?.setActive(!reducedMotion);
      },
      startEntrance() {
        if (reducedMotion || disposeEntranceRef.current) {
          completeEntrance();
          return;
        }
        const root = rootRef.current;
        if (!root) return;
        setTitleActive(false);
        root.dataset.phoneHeroEntrance = 'playing';
        renderHeroProgress(root, 0);
        introInkRef.current?.render(0);
        disposeEntranceRef.current = startHeroIntro({
          render: (sample) => {
            renderHeroProgress(root, sample.progress);
            introInkRef.current?.render(sample.progress);
            root.dataset.phoneHeroEntrance = sample.complete ? 'complete' : 'playing';
            root.dataset.phoneHeroTitleActive = String(sample.titleActive);
            if (sample.titleActive) setTitleActive(true);
          },
          onTitleActive: () => setTitleActive(true),
          onComplete: () => {
            disposeEntranceRef.current = undefined;
            root.dataset.phoneHeroEntrance = 'complete';
          }
        });
      },
      completeEntrance,
      unlockFromGesture() {
        playbackRef.current?.unlockFromGesture();
        parallaxRef.current?.requestPermission();
      },
      dispose() {
        disposeEntranceRef.current?.();
        disposeEntranceRef.current = undefined;
      }
    };
  }, [reducedMotion]);

  const requestImmersivePermission = () => {
    const root = rootRef.current as FullscreenElement | null;
    if (!root) return;
    parallaxRef.current?.requestPermission();
    const request = typeof root.requestFullscreen === 'function'
      ? root.requestFullscreen.bind(root)
      : root.webkitRequestFullscreen?.bind(root);
    if (!request) {
      root.dataset.phoneFullscreen = 'unavailable';
      return;
    }
    root.dataset.phoneFullscreen = 'requesting';
    void Promise.resolve(request()).then(
      () => { root.dataset.phoneFullscreen = 'active'; },
      () => { root.dataset.phoneFullscreen = 'unavailable'; }
    );
  };

  return (
    <section ref={rootRef} className="phone-scene phone-scene--hero" aria-labelledby="phone-home">
      <div ref={backMotionRef} className="phone-hero__back-motion" aria-hidden="true">
        <div ref={backParallaxRef} className="phone-hero__back-parallax">
          <img ref={backImageRef} className="phone-hero__back" src={HERO_BACK_IMAGE} alt="" />
          <canvas ref={introInkCanvasRef} className="phone-hero__intro-ink" data-phone-hero-intro-ink-canvas aria-hidden="true" />
        </div>
      </div>
      <div ref={middleMotionRef} className="phone-hero__middle-motion" aria-hidden="true">
        <div ref={middleParallaxRef} className="phone-hero__middle-parallax">
          <img className="phone-hero__middle" src={HERO_MIDDLE_IMAGE} alt="" />
        </div>
      </div>
      <div ref={figureMotionRef} className="phone-hero__figure-motion" aria-hidden="true">
        <div ref={figureParallaxRef} className="phone-hero__figure-parallax">
          <img className="phone-hero__figure-poster" src={HERO_FIGURE_POSTER} alt="" />
          <canvas ref={figureCanvasRef} className="phone-hero__figure" data-phone-figure-canvas aria-hidden="true" />
          <video ref={figureVideoRef} className="phone-hero__figure-source" muted playsInline preload="auto" />
        </div>
      </div>
      <div ref={vignetteRef} className="phone-hero__vignette" aria-hidden="true" />
      <div ref={copyRef} className="phone-hero__copy">
        <TextReveal active={titleActive} as="h1" id="phone-home" aria-label="同野观幂" effects={['stagger', 'blur-to-clear', 'rise-up']} variant="staggered">
          {HOME_COPY.slice(0, 4).map((character, index) => (
            <TextRevealItem key={`${character}-${index}`} index={index} aria-hidden="true">{character}</TextRevealItem>
          ))}
        </TextReveal>
      </div>
      <div ref={subtitleRef} className="phone-hero__subtitle">
        <TextReveal active={titleActive} as="p" blurPx={6} delayMs={420} durationMs={2850} effects={['stagger', 'blur-to-clear', 'rise-up']} scaleX={1} staggerMs={0} variant="line" yPx={14}>
          <TextRevealItem aria-label={HERO_SUBTITLE}>
            {HERO_SUBTITLE_LINES.map((line) => <span key={line}>{line}</span>)}
          </TextRevealItem>
        </TextReveal>
      </div>
      <button className="phone-hero__gyro-permission" type="button" onClick={requestImmersivePermission}>轻触开启体感与全屏</button>
      <span ref={cueRef} className="phone-hero__scroll-cue" aria-hidden="true">向上滑动</span>
    </section>
  );
});

export default PhoneHero;
