import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { gsap } from 'gsap';
import { TextReveal, TextRevealItem } from '../../../components/TextReveal';
import {
  createPackedAlphaVideoCompositor,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';
import {
  HERO_RADIAL_INK_FIELD,
  renderHeroProgress,
  sampleHeroIntro,
  startHeroIntro
} from '../../../scenes/hero/motion';
import { HOME_COPY } from '../../../story/copy';
import {
  createRadialInkIntroController,
  type RadialInkIntroController
} from '../../../transitions/shared/radialInkIntro';
import {
  attachPhoneDeviceParallax,
  createPhoneFigurePlayback,
  type PhoneDeviceParallax,
  type PhoneFigurePlayback
} from './PhoneHero.motion';
import { phoneMediaUrlFor } from '../phone-media';
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

export type PhoneHeroAdapterHandle = PhoneSceneAdapterHandle & {
  startEntrance(): void;
  completeEntrance(): void;
  cancelEntrance(): void;
  unlockFromGesture(): void;
};
function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range01(value: number, start: number, end: number): number {
  return end <= start ? Number(value >= end) : clamp((value - start) / (end - start));
}
/** Owns Hero markup/media/local rendering; the fixed-stage parent owns timing. */
export const PhoneHero = forwardRef<PhoneHeroAdapterHandle, PhoneSceneAdapterProps>(
  function PhoneHero({ active, reducedMotion, onReady }, forwardedRef) {
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
    const textRevealFrameRef = useRef<number | undefined>(undefined);
    const sceneActiveRef = useRef(false);
    const adapterReadyRef = useRef(false);
    const lastProgressRef = useRef(Number.NaN);
    const [titleActive, setTitleActive] = useState(reducedMotion);
    const storyRoot = useCallback(() => (
      rootRef.current?.closest<HTMLElement>('.portrait-scroll-spike') ?? rootRef.current
    ), []);
    const cancelTextRevealFrame = useCallback(() => {
      if (textRevealFrameRef.current === undefined) return;
      window.cancelAnimationFrame(textRevealFrameRef.current);
      textRevealFrameRef.current = undefined;
    }, []);
    const cancelEntrance = useCallback(() => {
      cancelTextRevealFrame();
      disposeEntranceRef.current?.();
      disposeEntranceRef.current = undefined;
    }, [cancelTextRevealFrame]);
    const renderEntrance = useCallback((rawProgress: number) => {
      const root = rootRef.current;
      const cue = cueRef.current;
      if (!root || !cue) return;
      const sample = sampleHeroIntro(rawProgress);
      const owner = storyRoot();
      renderHeroProgress(root, sample.progress);
      introInkRef.current?.render(sample.progress);
      if (owner) {
        owner.dataset.portraitHeroEntrance = sample.complete ? 'complete' : 'playing';
        if (sample.complete) {
          owner.dataset.portraitHeroTextEntrance = 'complete';
        }
      }
      root.dataset.portraitHeroTitleActive = String(sample.titleActive);
      gsap.set(cue, { opacity: sample.titleActive ? 1 : 0 });
      if (sample.titleActive) {
        setTitleActive(true);
      }
    }, [storyRoot]);
    const completeEntrance = useCallback(() => {
      cancelEntrance();
      renderEntrance(1);
    }, [cancelEntrance, renderEntrance]);
    const startEntrance = useCallback(() => {
      if (reducedMotion) {
        completeEntrance();
        return;
      }
      const owner = storyRoot();
      if (!owner || !rootRef.current) return;
      cancelEntrance();
      setTitleActive(false);
      owner.dataset.portraitHeroTextEntrance = 'queued';
      textRevealFrameRef.current = window.requestAnimationFrame(() => {
        textRevealFrameRef.current = undefined;
        if (!adapterReadyRef.current) return;
        owner.dataset.portraitHeroTextEntrance = 'playing';
        setTitleActive(true);
      });
      owner.dataset.portraitHeroEntrance = 'playing';
      renderEntrance(0);
      disposeEntranceRef.current = startHeroIntro({
        render: (sample) => renderEntrance(sample.progress),
        onTitleActive: () => setTitleActive(true),
        onComplete: () => {
          disposeEntranceRef.current = undefined;
          owner.dataset.portraitHeroEntrance = 'complete';
        }
      });
    }, [cancelEntrance, completeEntrance, reducedMotion, renderEntrance, storyRoot]);

    useLayoutEffect(() => {
      const root = rootRef.current;
      const backImage = backImageRef.current;
      const introInkCanvas = introInkCanvasRef.current;
      const backParallax = backParallaxRef.current;
      const middleParallax = middleParallaxRef.current;
      const figureParallax = figureParallaxRef.current;
      const figureVideo = figureVideoRef.current;
      const figureCanvas = figureCanvasRef.current;
      if (
        !root
        || !backImage
        || !introInkCanvas
        || !backParallax
        || !middleParallax
        || !figureParallax
        || !figureVideo
        || !figureCanvas
      ) {
        return;
      }
      adapterReadyRef.current = true;
      if (reducedMotion) {
        onReady?.();
        return () => {
          adapterReadyRef.current = false;
          cancelEntrance();
        };
      }

      const owner = storyRoot() ?? root;
      const compositor = createPackedAlphaVideoCompositor({
        video: figureVideo,
        canvas: figureCanvas,
        onFrame: () => {
          figureVideo.dataset.portraitFigureAlpha = 'verified';
          figureParallax.dataset.portraitFigureAlpha = 'verified';
          figureParallax.dataset.portraitFigureFrame = 'ready';
        }
      });
      const playback = createPhoneFigurePlayback(
        figureVideo,
        HERO_FIGURE_PACKED_ALPHA_VIDEO
      );
      const parallax = attachPhoneDeviceParallax({
        root: owner,
        targets: [
          { element: backParallax, x: 7, y: 5 },
          { element: middleParallax, x: 14, y: 10 },
          { element: figureParallax, x: 22, y: 16 }
        ]
      });
      const introInk = createRadialInkIntroController({
        canvas: introInkCanvas,
        revealSurface: backImage,
        targetImage: backImage,
        field: HERO_RADIAL_INK_FIELD,
        generation: 'portrait-spike:hero-intro',
        viewport: () => ({
          width: root.clientWidth || window.innerWidth,
          height: root.clientHeight || window.innerHeight
        })
      });

      compositorRef.current = compositor;
      playbackRef.current = playback;
      parallaxRef.current = parallax;
      introInkRef.current = introInk;
      introInk.prewarm();
      onReady?.();

      return () => {
        adapterReadyRef.current = false;
        cancelEntrance();
        sceneActiveRef.current = false;
        parallax.dispose();
        playback.dispose();
        compositor.dispose();
        introInk.dispose();
        if (parallaxRef.current === parallax) parallaxRef.current = undefined;
        if (playbackRef.current === playback) playbackRef.current = undefined;
        if (compositorRef.current === compositor) compositorRef.current = undefined;
        if (introInkRef.current === introInk) introInkRef.current = undefined;
      };
    }, [cancelEntrance, onReady, reducedMotion, storyRoot]);

    useLayoutEffect(() => {
      sceneActiveRef.current = active;
      playbackRef.current?.setActive(active && !reducedMotion);
    }, [active, reducedMotion]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      update(rawProgress) {
        const progress = clamp(rawProgress);
        if (Math.abs(progress - lastProgressRef.current) < 0.003) return;
        lastProgressRef.current = progress;
        const back = backMotionRef.current;
        const middle = middleMotionRef.current;
        const figure = figureMotionRef.current;
        const copy = copyRef.current;
        const subtitle = subtitleRef.current;
        const cue = cueRef.current;
        const vignette = vignetteRef.current;
        if (!back || !middle || !figure || !copy || !subtitle || !cue || !vignette) return;
        gsap.set(back, { scale: 1.08, yPercent: 0 });
        gsap.set(middle, { scale: 1 + progress * 0.18, yPercent: progress * 12 });
        gsap.set(figure, {
          scale: 1 + progress * 0.11,
          yPercent: -15 * range01(progress, 0.12, 1)
        });
        const copyProgress = range01(progress, 0.18, 1);
        gsap.set(copy, { y: -58 * copyProgress, opacity: 1 - copyProgress });
        gsap.set(subtitle, { y: -38 * copyProgress, opacity: 1 - copyProgress });
        gsap.set(cue, { y: -18 * progress, opacity: 1 - progress });
        gsap.set(vignette, { opacity: 1 - progress * 0.54 });
        playbackRef.current?.scrub(progress);
      },
      enter() {
        sceneActiveRef.current = true;
        playbackRef.current?.setActive(!reducedMotion);
      },
      leave() {
        sceneActiveRef.current = false;
        playbackRef.current?.setActive(false);
      },
      reverse() {
        sceneActiveRef.current = true;
        playbackRef.current?.setActive(!reducedMotion);
      },
      startEntrance,
      completeEntrance,
      cancelEntrance,
      unlockFromGesture() {
        if (sceneActiveRef.current) {
          playbackRef.current?.unlockFromGesture();
        }
        parallaxRef.current?.requestPermission();
      },
      dispose() {
        cancelEntrance();
        sceneActiveRef.current = false;
        playbackRef.current?.setActive(false);
      }
    }), [cancelEntrance, completeEntrance, reducedMotion, startEntrance]);

    return (
      <section
        ref={rootRef}
        className="portrait-scroll-spike__scene portrait-scroll-spike__scene--hero"
        aria-labelledby="portrait-spike-home"
      >
        <div ref={backMotionRef} className="portrait-scroll-spike__hero-back-motion" aria-hidden="true">
          <div ref={backParallaxRef} className="portrait-scroll-spike__hero-back-parallax">
            <div className="portrait-scroll-spike__hero-back-intro">
              <img
                ref={backImageRef}
                className="portrait-scroll-spike__hero-back"
                src={HERO_BACK_IMAGE}
                alt=""
              />
              <canvas
                ref={introInkCanvasRef}
                className="portrait-scroll-spike__hero-intro-ink"
                data-portrait-hero-intro-ink
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
        <div ref={middleMotionRef} className="portrait-scroll-spike__hero-middle-motion" aria-hidden="true">
          <div ref={middleParallaxRef} className="portrait-scroll-spike__hero-middle-parallax">
            <div className="portrait-scroll-spike__hero-middle-intro">
              <img className="portrait-scroll-spike__hero-middle" src={HERO_MIDDLE_IMAGE} alt="" />
            </div>
          </div>
        </div>
        <div ref={figureMotionRef} className="portrait-scroll-spike__hero-figure-motion" aria-hidden="true">
          <div ref={figureParallaxRef} className="portrait-scroll-spike__hero-figure-parallax">
            <div className="portrait-scroll-spike__hero-figure-intro">
              <img
                className="portrait-scroll-spike__hero-figure-poster"
                data-portrait-figure-poster
                src={HERO_FIGURE_POSTER}
                alt=""
              />
              <canvas
                ref={figureCanvasRef}
                className="portrait-scroll-spike__hero-figure"
                data-portrait-figure-canvas
                aria-hidden="true"
              />
              <video
                ref={figureVideoRef}
                className="portrait-scroll-spike__hero-figure-source"
                data-portrait-figure-video
                muted
                playsInline
                preload="auto"
              />
            </div>
          </div>
        </div>
        <div ref={vignetteRef} className="portrait-scroll-spike__hero-vignette" aria-hidden="true" />
        <div ref={copyRef} className="portrait-scroll-spike__hero-copy">
          <TextReveal
            active={titleActive && active}
            as="h1"
            id="portrait-spike-home"
            aria-label="同野观幂"
            effects={['stagger', 'blur-to-clear', 'rise-up']}
            variant="staggered"
          >
            {HOME_COPY.slice(0, 4).map((character, index) => (
              <TextRevealItem key={character} index={index} aria-hidden="true">
                {character}
              </TextRevealItem>
            ))}
          </TextReveal>
        </div>
        <div ref={subtitleRef} className="portrait-scroll-spike__hero-subtitle">
          <TextReveal
            active={titleActive && active}
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
            <TextRevealItem aria-label={HERO_SUBTITLE}>
              {HERO_SUBTITLE_LINES.map((line) => <span key={line}>{line}</span>)}
            </TextRevealItem>
          </TextReveal>
        </div>
        <button
          className="portrait-scroll-spike__gyro-permission"
          data-portrait-gyro-permission
          type="button"
        >轻触开启体感与全屏</button>
        <span ref={cueRef} className="portrait-scroll-spike__scroll-cue" aria-hidden="true">向上滑动</span>
      </section>
    );
  }
);

export default PhoneHero;
