import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { TextReveal, TextRevealItem } from '../../../components/TextReveal';
import {
  createPackedAlphaVideoCompositor,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import {
  HERO_RADIAL_INK_FIELD,
  renderHeroProgress,
  sampleHeroIntro,
  startHeroIntro
} from '../motion';
import { HOME_COPY } from '../../../story/copy';
import { assertPhoneMediaOwner } from '../../../story/media';
import {
  createRadialInkIntroController,
  type RadialInkIntroController
} from '../../../transitions/shared/radialInkIntro';
import {
  createPhoneFigurePlayback,
  type PhoneFigurePlayback
} from './PhoneHero.motion';
import './PhoneHero.css';

assertPhoneMediaOwner('hero-back', 'hero');
assertPhoneMediaOwner('hero-middle', 'hero');
assertPhoneMediaOwner('hero-figure-poster', 'hero');
assertPhoneMediaOwner('hero-figure-packed', 'hero');

const HERO_BACK_IMAGE = new URL('../../../../../assets/hero-back.webp', import.meta.url).href;
const HERO_MIDDLE_IMAGE = new URL('../../../../../assets/hero-middle.webp', import.meta.url).href;
const HERO_FIGURE_POSTER = new URL('../../../../../assets/hero-figure-poster.webp', import.meta.url).href;
const HERO_FIGURE_PACKED_ALPHA_VIDEO = new URL(
  '../../../../../assets/figure1-rgb-alpha.mp4', import.meta.url
).href;
const HERO_SUBTITLE = HOME_COPY[4]!;
const subtitleBreak = HERO_SUBTITLE.indexOf('，') + 1;
const HERO_SUBTITLE_LINES = subtitleBreak > 0
  ? [HERO_SUBTITLE.slice(0, subtitleBreak), HERO_SUBTITLE.slice(subtitleBreak)]
  : [HERO_SUBTITLE];

type PhoneHeroMigrationControl = Readonly<{
  enter(): void;
  leave(): void;
  startEntrance(): void;
  completeEntrance(): void;
  cancelEntrance(): void;
  unlockFromGesture(): void;
}>;

/** Temporary Task 7 bridge key. Task 11 removes this with the old formal shell. */
export const PHONE_HERO_MIGRATION_CONTROL: unique symbol = Symbol(
  'phone-hero-migration-control'
);

export type PhoneHeroMigrationCommands = PhoneLeafCommandHandle & Readonly<{
  [PHONE_HERO_MIGRATION_CONTROL]: PhoneHeroMigrationControl;
}>;

type HeroElements = Readonly<{
  back: HTMLDivElement | null;
  middle: HTMLDivElement | null;
  figure: HTMLDivElement | null;
  copy: HTMLDivElement | null;
  subtitle: HTMLDivElement | null;
  cue: HTMLSpanElement | null;
  vignette: HTMLDivElement | null;
}>;

type HeroEntranceState = 'idle' | 'running' | 'completed';

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range01(value: number, start: number, end: number): number {
  return end <= start ? Number(value >= end) : clamp((value - start) / (end - start));
}

function transform(element: HTMLElement | null, value: string): void {
  if (element) element.style.transform = value;
}

function renderHeroStage(elements: HeroElements, rawProgress: number): number {
  const progress = clamp(rawProgress);
  const copyProgress = range01(progress, 0.18, 1);
  transform(elements.back, 'translate3d(0, 0%, 0) scale(1.08)');
  transform(elements.middle,
    `translate3d(0, ${(progress * 12).toFixed(4)}%, 0) scale(${(1 + progress * 0.18).toFixed(4)})`);
  transform(elements.figure,
    `translate3d(0, ${(-15 * range01(progress, 0.12, 1)).toFixed(4)}%, 0) scale(${(1 + progress * 0.11).toFixed(4)})`);
  transform(elements.copy, `translate3d(0, ${(-58 * copyProgress).toFixed(4)}px, 0)`);
  if (elements.copy) elements.copy.style.opacity = (1 - copyProgress).toFixed(4);
  transform(elements.subtitle, `translate3d(0, ${(-38 * copyProgress).toFixed(4)}px, 0)`);
  if (elements.subtitle) elements.subtitle.style.opacity = (1 - copyProgress).toFixed(4);
  transform(elements.cue, `translate3d(0, ${(-18 * progress).toFixed(4)}px, 0)`);
  if (elements.cue) elements.cue.style.opacity = (1 - progress).toFixed(4);
  if (elements.vignette) elements.vignette.style.opacity = (1 - progress * 0.54).toFixed(4);
  return progress;
}

function waitForDecodedImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return Promise.resolve();
  }
  if (typeof image.decode === 'function') return image.decode();
  return new Promise((resolve, reject) => {
    const loaded = () => finish(resolve);
    const failed = () => finish(() => reject(new Error('Hero image decode failed')));
    const finish = (complete: () => void) => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      complete();
    };
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
  });
}

const HERO_ZERO_STYLE = {
  '--r4-hero-progress': '0.0000',
  '--r4-hero-middle-intro': '0.0000',
  '--r4-hero-figure-intro': '0.0000',
  '--r4-hero-pattern-middle-progress': '0.0000',
  '--r4-hero-pattern-figure-progress': '0.0000'
} as CSSProperties;

export type PhoneHeroProps = Readonly<{ reports: PhoneLeafReportPort }>;

/** One genuine Hero leaf shared by the clean runtime and the temporary old-formal bridge. */
export function PhoneHero({ reports }: PhoneHeroProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const backMotionRef = useRef<HTMLDivElement | null>(null);
  const backParallaxRef = useRef<HTMLDivElement | null>(null);
  const backImageRef = useRef<HTMLImageElement | null>(null);
  const introInkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const middleMotionRef = useRef<HTMLDivElement | null>(null);
  const middleParallaxRef = useRef<HTMLDivElement | null>(null);
  const middleImageRef = useRef<HTMLImageElement | null>(null);
  const figureMotionRef = useRef<HTMLDivElement | null>(null);
  const figureParallaxRef = useRef<HTMLDivElement | null>(null);
  const figurePosterRef = useRef<HTMLImageElement | null>(null);
  const figureVideoRef = useRef<HTMLVideoElement | null>(null);
  const figureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const subtitleRef = useRef<HTMLDivElement | null>(null);
  const cueRef = useRef<HTMLSpanElement | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const playbackRef = useRef<PhoneFigurePlayback | null>(null);
  const compositorRef = useRef<PackedAlphaVideoCompositor | null>(null);
  const introInkRef = useRef<RadialInkIntroController | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const generationRef = useRef(0);
  const frameGenerationRef = useRef(0);
  const reportedFrameTokenRef = useRef<string | null>(null);
  const imagesReadyRef = useRef(false);
  const mountedRef = useRef(false);
  const activeRef = useRef(false);
  const mediaRunTokenRef = useRef<string | null>(null);
  const renderedRef = useRef(false);
  const entranceStateRef = useRef<HeroEntranceState>('idle');
  const stableReverseArrivalRef = useRef(false);
  const lastProgressRef = useRef(Number.NaN);
  const disposeEntranceRef = useRef<(() => void) | null>(null);
  const [titleActive, setTitleActive] = useState(false);

  const reportCurrentFrame = useCallback(() => {
    const binding = bindingRef.current;
    if (!binding || !imagesReadyRef.current
      || frameGenerationRef.current !== generationRef.current
      || reportedFrameTokenRef.current === binding.frameToken) return;
    reportedFrameTokenRef.current = binding.frameToken;
    binding.reports.reportFrame('hero-figure-canvas', {
      kind: 'frame', token: binding.frameToken, presented: true,
      frameId: `hero-packed:${generationRef.current}`,
      detail: { imagesDecoded: true, compositorDrawn: true }
    });
  }, []);

  const cancelEntrance = useCallback(() => {
    disposeEntranceRef.current?.();
    disposeEntranceRef.current = null;
  }, []);

  const renderEntrance = useCallback((rawProgress: number) => {
    const root = rootRef.current;
    if (!root) return;
    const sample = sampleHeroIntro(rawProgress);
    const owner = root.closest<HTMLElement>('.portrait-scroll-spike, .phone-story') ?? root;
    renderHeroProgress(root, sample.progress);
    introInkRef.current?.render(sample.progress);
    root.dataset.portraitHeroTitleActive = String(sample.titleActive);
    owner.dataset.portraitHeroEntrance = sample.complete ? 'complete' : 'playing';
    owner.dataset.portraitHeroTextEntrance = sample.complete
      ? 'complete' : sample.titleActive ? 'playing' : 'queued';
    if (sample.titleActive) setTitleActive(true);
  }, []);

  const enterStableHero = useCallback(() => {
    activeRef.current = true; compositorRef.current?.setActive(true); playbackRef.current?.setActive(true);
  }, []);

  const completeEntrance = useCallback(() => {
    cancelEntrance();
    renderEntrance(1);
    entranceStateRef.current = 'completed';
    enterStableHero();
  }, [cancelEntrance, enterStableHero, renderEntrance]);

  const startEntrance = useCallback(() => {
    cancelEntrance();
    entranceStateRef.current = 'running';
    setTitleActive(false);
    renderEntrance(0);
    disposeEntranceRef.current = startHeroIntro({
      render: (sample) => renderEntrance(sample.progress),
      onComplete: () => {
        disposeEntranceRef.current = null;
        entranceStateRef.current = 'completed';
        enterStableHero();
      }
    });
  }, [cancelEntrance, enterStableHero, renderEntrance]);

  const renewCompositor = useCallback(() => {
    const video = figureVideoRef.current;
    const canvas = figureCanvasRef.current;
    if (!mountedRef.current || !video || !canvas) return;
    compositorRef.current?.dispose('reactivatable');
    const generation = ++generationRef.current;
    frameGenerationRef.current = 0;
    reportedFrameTokenRef.current = null;
    const compositor = createPackedAlphaVideoCompositor({
      video,
      canvas,
      onFrame: () => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        frameGenerationRef.current = generation;
        figureParallaxRef.current?.setAttribute('data-portrait-figure-alpha', 'verified');
        figureParallaxRef.current?.setAttribute('data-portrait-figure-frame', 'ready');
        reportCurrentFrame();
      }
    });
    compositorRef.current = compositor;
    compositor.setActive(activeRef.current);
    if (['webgl-unavailable', 'setup-failed'].includes(canvas.dataset.packedAlphaStatus ?? '')) {
      bindingRef.current?.reports.reportFailure({
        code: 'hero-compositor-unavailable',
        message: 'Hero packed-alpha compositor could not be created',
        recoverable: true
      });
    }
  }, [reportCurrentFrame]);

  const commands = useMemo(() => {
    const commandHandle: PhoneHeroMigrationCommands = {
      rebind(binding) {
        bindingRef.current = binding;
        mediaRunTokenRef.current = null;
        if (!(binding.segmentId === 'hero-pattern' && binding.direction === 'reverse')) {
          stableReverseArrivalRef.current = false;
        }
        reportedFrameTokenRef.current = null;
        renewCompositor();
        reportCurrentFrame();
      },
      activate(command): PhoneActivationInvocation {
        const expected = ['hero-figure-video'];
        if (command.surfaceIds.length !== 1 || command.surfaceIds[0] !== expected[0]) {
          return { invocationId: command.invocationId, surfaceIds: command.surfaceIds,
            invoked: false, settlements: [] };
        }
        activeRef.current = true;
        compositorRef.current?.setActive(true);
        playbackRef.current?.setActive(false);
        const video = figureVideoRef.current;
        if (!video) return { invocationId: command.invocationId, surfaceIds: expected,
          invoked: false, settlements: [] };
        const runToken = command.runToken ?? command.invocationId;
        mediaRunTokenRef.current = runToken;
        const settled = playbackRef.current?.primeFromGesture((error: unknown) => {
          const current = bindingRef.current;
          if (!current || !mountedRef.current || mediaRunTokenRef.current !== runToken) return;
          current.reports.reportFailure({
            code: 'hero-activation-playback-rejected',
            message: error instanceof Error ? error.message : String(error),
            recoverable: true,
            detail: { runToken }
          });
        }) ?? Promise.resolve();
        return {
          invocationId: command.invocationId,
          surfaceIds: expected,
          invoked: true,
          settlements: [{ surfaceId: expected[0]!, status: 'pending', settled }]
        };
      },
      setMediaPhase(command) {
        const binding = bindingRef.current;
        const video = figureVideoRef.current;
        if (!binding || !video || !mountedRef.current) return;
        if (mediaRunTokenRef.current !== null
          && mediaRunTokenRef.current !== command.runToken) return;
        if (stableReverseArrivalRef.current
          && (command.phase === 'primed' || command.phase === 'held')) return;
        mediaRunTokenRef.current = command.runToken;
        if (command.phase === 'primed') {
          playbackRef.current?.setActive(false);
          video.pause();
          return;
        }
        if (command.phase === 'held') {
          playbackRef.current?.setActive(false);
          video.pause();
          return;
        }
        activeRef.current = true;
        compositorRef.current?.setActive(true);
        playbackRef.current?.setActive(true);
        playbackRef.current?.unlockFromGesture();
      },
      render(progress) {
        const clamped = renderHeroStage({
          back: backMotionRef.current, middle: middleMotionRef.current,
          figure: figureMotionRef.current, copy: copyRef.current,
          subtitle: subtitleRef.current, cue: cueRef.current,
          vignette: vignetteRef.current
        }, progress);
        if (clamped > 0.0001) renderedRef.current = true;
        if (Math.abs(clamped - lastProgressRef.current) >= 0.003) {
          lastProgressRef.current = clamped;
          playbackRef.current?.scrub(clamped);
        }
      },
      settle(endpoint) {
        if (endpoint === 0) {
          commandHandle.render(0);
          const reverseHeroPatternArrival = bindingRef.current?.segmentId === 'hero-pattern'
            && bindingRef.current.direction === 'reverse';
          if (reverseHeroPatternArrival) stableReverseArrivalRef.current = true;
          if (entranceStateRef.current === 'running'
            || (entranceStateRef.current === 'idle' && reverseHeroPatternArrival)) {
            completeEntrance();
          }
          if (entranceStateRef.current === 'completed') enterStableHero();
          else playbackRef.current?.settle();
          return;
        }
        playbackRef.current?.setActive(true);
        if (!renderedRef.current) startEntrance();
        else {
          commandHandle.render(0);
          completeEntrance();
        }
        playbackRef.current?.settle();
      },
      pause() {
        activeRef.current = false;
        mediaRunTokenRef.current = null;
        stableReverseArrivalRef.current = false;
        cancelEntrance();
        playbackRef.current?.setActive(false);
        compositorRef.current?.setActive(false);
        figureParallaxRef.current?.removeAttribute('data-portrait-figure-alpha');
        figureParallaxRef.current?.removeAttribute('data-portrait-figure-frame');
      },
      dispose() {
        activeRef.current = false;
        mediaRunTokenRef.current = null;
        stableReverseArrivalRef.current = false;
        cancelEntrance();
        playbackRef.current?.dispose();
        playbackRef.current = null;
        compositorRef.current?.dispose('terminal');
        compositorRef.current = null;
        introInkRef.current?.dispose();
        introInkRef.current = null;
      },
      [PHONE_HERO_MIGRATION_CONTROL]: {
        enter() {
          enterStableHero();
        },
        leave() {
          commandHandle.pause('outside-closure');
        },
        startEntrance,
        completeEntrance,
        cancelEntrance,
        unlockFromGesture() {
          playbackRef.current?.unlockFromGesture();
        }
      }
    };
    return Object.freeze(commandHandle);
  }, [cancelEntrance, completeEntrance, enterStableHero, renewCompositor,
    reportCurrentFrame, startEntrance]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const back = backImageRef.current;
    const middle = middleImageRef.current;
    const poster = figurePosterRef.current;
    const video = figureVideoRef.current;
    const canvas = figureCanvasRef.current;
    const introCanvas = introInkCanvasRef.current;
    if (!root || !back || !middle || !poster || !video || !canvas || !introCanvas) return;
    mountedRef.current = true;
    entranceStateRef.current = 'idle';
    stableReverseArrivalRef.current = false;
    imagesReadyRef.current = false;
    renderedRef.current = false;
    lastProgressRef.current = Number.NaN;
    renderHeroProgress(root, 0);
    playbackRef.current = createPhoneFigurePlayback(video, HERO_FIGURE_PACKED_ALPHA_VIDEO);
    introInkRef.current = createRadialInkIntroController({
      canvas: introCanvas,
      revealSurface: back,
      targetImage: back,
      field: HERO_RADIAL_INK_FIELD,
      generation: 'phone-story:hero-intro',
      viewport: () => ({
        width: root.clientWidth || window.innerWidth,
        height: root.clientHeight || window.innerHeight
      })
    });
    introInkRef.current.prewarm();
    reports.registerMount({
      root,
      surfaces: [
        { id: 'hero-back-image', element: back, kind: 'image' },
        { id: 'hero-middle-image', element: middle, kind: 'image' },
        { id: 'hero-figure-poster', element: poster, kind: 'image' },
        { id: 'hero-figure-video', element: video, kind: 'video' },
        { id: 'hero-figure-canvas', element: canvas, kind: 'canvas-webgl' },
        { id: 'hero-intro-ink', element: introCanvas, kind: 'canvas-2d' }
      ],
      commands
    });
    let current = true;
    void Promise.all([back, middle, poster].map(waitForDecodedImage)).then(() => {
      if (!current || !mountedRef.current) return;
      imagesReadyRef.current = true;
      root.dataset.phoneHeroImages = 'decoded';
      reportCurrentFrame();
    }, (error: unknown) => {
      if (!current || !mountedRef.current) return;
      bindingRef.current?.reports.reportFailure({
        code: 'hero-image-decode-rejected',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true
      });
    });
    return () => {
      current = false;
      mountedRef.current = false;
      activeRef.current = false;
      mediaRunTokenRef.current = null;
      stableReverseArrivalRef.current = false;
      entranceStateRef.current = 'idle';
      cancelEntrance();
      playbackRef.current?.dispose();
      playbackRef.current = null;
      compositorRef.current?.dispose('reactivatable');
      compositorRef.current = null;
      introInkRef.current?.dispose();
      introInkRef.current = null;
      bindingRef.current = null;
      delete root.dataset.phoneHeroImages;
    };
  }, [cancelEntrance, commands, reportCurrentFrame, reports]);

  return (
    <section
      ref={rootRef}
      className="portrait-scroll-spike__scene portrait-scroll-spike__scene--hero"
      aria-labelledby="portrait-spike-home"
      style={HERO_ZERO_STYLE}
    >
      <div ref={backMotionRef} className="portrait-scroll-spike__hero-back-motion" aria-hidden="true">
        <div ref={backParallaxRef} className="portrait-scroll-spike__hero-back-parallax">
          <div className="portrait-scroll-spike__hero-back-intro">
            <img ref={backImageRef} className="portrait-scroll-spike__hero-back" src={HERO_BACK_IMAGE} alt="" />
            <canvas ref={introInkCanvasRef} className="portrait-scroll-spike__hero-intro-ink" data-portrait-hero-intro-ink aria-hidden="true" />
          </div>
        </div>
      </div>
      <div ref={middleMotionRef} className="portrait-scroll-spike__hero-middle-motion" aria-hidden="true">
        <div ref={middleParallaxRef} className="portrait-scroll-spike__hero-middle-parallax">
          <div className="portrait-scroll-spike__hero-middle-intro">
            <img ref={middleImageRef} className="portrait-scroll-spike__hero-middle" src={HERO_MIDDLE_IMAGE} alt="" />
          </div>
        </div>
      </div>
      <div ref={figureMotionRef} className="portrait-scroll-spike__hero-figure-motion" aria-hidden="true">
        <div ref={figureParallaxRef} className="portrait-scroll-spike__hero-figure-parallax">
          <div className="portrait-scroll-spike__hero-figure-intro">
            <img ref={figurePosterRef} className="portrait-scroll-spike__hero-figure-poster" data-portrait-figure-poster src={HERO_FIGURE_POSTER} alt="" />
            <canvas ref={figureCanvasRef} className="portrait-scroll-spike__hero-figure" data-portrait-figure-canvas aria-hidden="true" />
            <video ref={figureVideoRef} className="portrait-scroll-spike__hero-figure-source" data-portrait-figure-video muted playsInline preload="auto" />
          </div>
        </div>
      </div>
      <div ref={vignetteRef} className="portrait-scroll-spike__hero-vignette" aria-hidden="true" />
      <div ref={copyRef} className="portrait-scroll-spike__hero-copy">
        <TextReveal active={titleActive} as="h1" id="portrait-spike-home" aria-label="同野观幂" effects={['stagger', 'blur-to-clear', 'rise-up']} variant="staggered">
          {HOME_COPY.slice(0, 4).map((character, index) => (
            <TextRevealItem key={character} index={index} aria-hidden="true">{character}</TextRevealItem>
          ))}
        </TextReveal>
      </div>
      <div ref={subtitleRef} className="portrait-scroll-spike__hero-subtitle">
        <TextReveal active={titleActive} as="p" blurPx={6} delayMs={420} durationMs={2850} effects={['stagger', 'blur-to-clear', 'rise-up']} scaleX={1} staggerMs={0} variant="line" yPx={14}>
          <TextRevealItem aria-label={HERO_SUBTITLE}>
            {HERO_SUBTITLE_LINES.map((line) => <span key={line}>{line}</span>)}
          </TextRevealItem>
        </TextReveal>
      </div>
      <button className="portrait-scroll-spike__gyro-permission" data-portrait-gyro-permission type="button">轻触开启体感与全屏</button>
      <span ref={cueRef} className="portrait-scroll-spike__scroll-cue" aria-hidden="true">向上滑动</span>
    </section>
  );
}

export default PhoneHero;
export const phoneSceneId = 'hero' as const;
