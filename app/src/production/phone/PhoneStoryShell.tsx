import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  AOD_FIGURE_END_SECONDS,
  AOD_PHONE_TIMELINE_ALPHA_END,
  aodAnimationScene,
  renderAodTransitionProgress
} from '../../scenes/aod-animation';
import {
  createPackedAlphaVideoCompositor,
  type PackedAlphaVideoCompositor
} from '../../media/packed-alpha-video';
import {
  PATTERN_BACKGROUND_IMAGE,
  PatternBloomRenderer
} from '../../scenes/pattern/patternBloomRenderer';
import { initStarFieldReveal, type StarFieldCamera } from '../../scenes/star-map/starFieldReveal';
import { clearBoundaryGeometry } from '../../transitions/shared/inkOwnership';
import { BELIEF_COPY, METHOD_COPY } from '../../story/copy';
import type { FrontHalfCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import {
  createPhoneInkTransition,
  type PhoneInkTransition
} from './phone-ink';
import {
  createPhoneAodAutoplay,
  phoneAodBackdropPresentation,
  phoneAodMethodProgress,
  phoneAodPresentation,
  type PhoneAodAutoplay,
  type PhoneAodPlaybackDirection
} from './aod-autoplay';
import {
  attachPhoneLoaderVisibilityLifecycle,
  phoneLoaderCompletedInDocument
} from './phone-loader-lifecycle';
import { phoneMediaUrlFor } from './phone-media';
import { phoneHeroMotionDriver } from './phone-gsap-driver';
import { createPhoneScrollSnapLock } from './phone-scroll-snap-lock';
import {
  phoneAodCheckpointForMethodProgress,
  phoneAodCompletionCheckpoint,
  phoneStageFrame
} from './phone-stage-timeline';
import { usePhoneInitialAdapter } from './usePhoneInitialAdapter';
import type { PhoneHeroAdapterHandle } from './types';
import './PhoneStoryShell.css';
import { StoryLoader } from '../StoryLoader';
import { StoryNav } from '../StoryNav';
import { hashForScene } from '../navigation';

gsap.registerPlugin(ScrollTrigger, useGSAP);
const AOD_FIGURE_PACKED_ALPHA_VIDEO = phoneMediaUrlFor('aod-figure-packed-forward', 'aod-animation');
const AOD_FIGURE_PACKED_ALPHA_REVERSE_VIDEO = phoneMediaUrlFor('aod-figure-packed-reverse', 'aod-animation');
const STAR_MAP_IMAGE = phoneMediaUrlFor('star-map-source', 'star-map');
const STAR_MAP_FRAME_INTERVAL_MS = 1000 / 12;
const PORTRAIT_PATTERN_CENTER = Object.freeze({ x: 0.5, y: 0.28 });
const PORTRAIT_HERO_FIGURE_CENTER = Object.freeze({ x: 0.5, y: 0.44 });
const PORTRAIT_STAR_CAMERA: StarFieldCamera = Object.freeze({
  // The authored map is landscape. On portrait we rotate the source itself,
  // not its CSS box, then paint the Perlin layer through this same matrix.
  rotationDegrees: -90,
  zoom: 1
});
/*
 * Every handoff is a strict two-surface cut: A completes its own motion, the
 * authored field transfers A -> B, then B exclusively owns its internal
 * motion. No source motion and target motion share a scroll interval.
 */
const HERO_MOTION_END = 0.16;
const HERO_PATTERN_END = 0.25;
const PATTERN_MOTION_START = 0.29;
const PATTERN_MOTION_END = 0.47;
const PATTERN_STAR_START = 0.52;
const PATTERN_STAR_END = 0.61;
const STAR_AOD_START = 0.71;
const STAR_AOD_END = 0.80;
const AOD_AUTOPLAY_START = 0.985;
const STAGE_SCROLL_VIEWPORTS = 4.8;

const PORTRAIT_SURFACE_DARK = '#07110e';
const PORTRAIT_SURFACE_PATTERN = '#d9c08f';
const PORTRAIT_SURFACE_STAR = '#06100d';
const PORTRAIT_SURFACE_PAPER = '#ede4d2';

const PATTERN_COPY = BELIEF_COPY.slice(0, 3);
const STAR_MAP_COPY = BELIEF_COPY[3]!;
const METHOD_TOP_COPY = METHOD_COPY.slice(0, 8);
const METHOD_STEPS_COPY = METHOD_COPY.slice(8, 23);
const PortraitAodScene = aodAnimationScene.Component;

const METHOD_STEPS = Array.from({ length: 5 }, (_, index) => {
  const offset = index * 3;
  return {
    index: METHOD_STEPS_COPY[offset]!,
    title: METHOD_STEPS_COPY[offset + 1]!,
    body: METHOD_STEPS_COPY[offset + 2]!
  };
});

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type PortraitStageScene = 'hero' | 'pattern' | 'star' | 'aod';
type PortraitAodRunState = 'idle' | 'forward' | 'complete' | 'reverse';

type PortraitStarPainter = Readonly<{
  setVisible(visible: boolean): void;
  setTransitionProgress(progress: number): void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range01(value: number, start: number, end: number): number {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }
  return clamp((value - start) / (end - start));
}

function requestPortraitFullscreen(root: HTMLElement): void {
  const target = root as FullscreenElement;
  const request = target.requestFullscreen?.bind(target) ?? target.webkitRequestFullscreen?.bind(target);
  if (!request) {
    root.dataset.portraitFullscreen = 'unavailable';
    return;
  }
  root.dataset.portraitFullscreen = 'requesting';
  void Promise.resolve(request()).then(
    () => {
      root.dataset.portraitFullscreen = 'active';
    },
    () => {
      root.dataset.portraitFullscreen = 'unavailable';
    }
  );
}

/**
 * The spike is an explicit physical-device validation route. It must not turn
 * requested motion off silently, otherwise an iPhone failure is impossible to
 * distinguish from a reduced-motion response. Use `?portrait-spike-motion=reduce`
 * to exercise the low-motion presentation deliberately.
 */
function portraitSpikeMotionEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return new URLSearchParams(window.location.search).get('portrait-spike-motion') !== 'reduce';
}

/**
 * Route B has one scroll owner: the document. A viewport-fixed stage stays
 * visually stationary while ScrollTrigger only maps rail position to local progress.
 * The sole input lock is the authored AOD snap while its time-owned media runs.
 */
export type PhoneStoryShellProps = Readonly<{
  /** Retained while versioned routes remain physical-device comparison entries. */
  validationMode?: 'v16' | 'v17' | 'v18' | 'v19';
}>;

/**
 * The proven Route B vertical slice is now the production phone shell. Its
 * complete Loader → Hero → Pattern → Star Map → AOD → Method chain remains
 * intact while later modules migrate against this executable baseline.
 */
export function PhoneStoryShell(props: PhoneStoryShellProps = {}) {
  const motionEnabled = portraitSpikeMotionEnabled();
  const aodAlphaEndProgress = AOD_PHONE_TIMELINE_ALPHA_END;
  const [loaderHidden, setLoaderHidden] = useState(phoneLoaderCompletedInDocument);
  const initialAdapter = usePhoneInitialAdapter(loaderHidden, setLoaderHidden);
  const { Hero, ready: heroReady, failed: heroFailed, staticFallback, markReady: markHeroReady, finishLoader } = initialAdapter;
  const [navigationScene, setNavigationScene] = useState<SceneId>('hero');
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const checkpointRef = useRef<FrontHalfCheckpointId>(
    loaderHidden ? 'hero-entered' : 'loader'
  );
  const checkpointTraceRef = useRef<FrontHalfCheckpointId[]>([
    checkpointRef.current
  ]);
  const stageRailRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const heroAdapterRef = useRef<PhoneHeroAdapterHandle | null>(null);
  const patternSceneRef = useRef<HTMLElement | null>(null);
  const starSceneRef = useRef<HTMLElement | null>(null);
  const aodSceneRef = useRef<HTMLDivElement | null>(null);
  const heroInkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const patternRendererRef = useRef<PatternBloomRenderer | null>(null);
  const patternActiveRef = useRef(false);
  const patternProgressRef = useRef({ collapse: 0, rotation: 0 });
  const patternCopyRef = useRef<HTMLDivElement | null>(null);
  const patternWashRef = useRef<HTMLDivElement | null>(null);
  const patternInkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const starMotionRef = useRef<HTMLDivElement | null>(null);
  const starCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const starPainterRef = useRef<PortraitStarPainter | null>(null);
  const starVisibleRef = useRef(false);
  const starProgressRef = useRef(0);
  const starWashRef = useRef<HTMLDivElement | null>(null);
  const starCopyRef = useRef<HTMLDivElement | null>(null);
  const starInkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const readingIntroRef = useRef<HTMLDivElement | null>(null);
  const readingStepsRef = useRef<HTMLOListElement | null>(null);

  const publishCheckpoint = useCallback((checkpoint: FrontHalfCheckpointId) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    if (checkpointRef.current !== checkpoint) {
      checkpointRef.current = checkpoint;
      checkpointTraceRef.current = [
        ...checkpointTraceRef.current.slice(-63),
        checkpoint
      ];
    }
    const trace = checkpointTraceRef.current.join('>');
    root.dataset.portraitCheckpoint = checkpoint;
    root.dataset.portraitCheckpointTrace = trace;
    document.documentElement.dataset.portraitCheckpoint = checkpoint;
  }, []);

  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    const root = rootRef.current;
    documentElement.dataset.portraitSpike = 'b';
    documentElement.dataset.portraitSpikeMotion = motionEnabled ? 'force' : 'reduce';
    delete documentElement.dataset.storyHydrated;
    document.getElementById('story-loader-static')?.remove();
    delete documentElement.dataset.portraitLoaderResume;
    if (!root) {
      return () => {
        delete documentElement.dataset.portraitSpike;
        delete documentElement.dataset.portraitSpikeMotion;
      };
    }

    let viewportTimer: number | undefined;
    let lastViewport = '';
    let lastViewportWidth = 0;
    let forceNextViewportSync = false;
    const readViewport = () => {
      const viewport = window.visualViewport;
      return {
        height: Math.max(1, Math.round(viewport?.height || window.innerHeight || 1)),
        width: Math.max(1, Math.round(viewport?.width || window.innerWidth || 1))
      };
    };
    const syncViewport = (forceHeight = false) => {
      const { height, width } = readViewport();
      const nextViewport = `${width}x${height}`;
      if (nextViewport === lastViewport) {
        delete root.dataset.portraitTransientViewport;
        return;
      }
      const widthChanged = lastViewportWidth === 0 || Math.abs(width - lastViewportWidth) > 1;
      if (
        !forceHeight
        && !widthChanged
      ) {
        // Safari's toolbar travel is asynchronous. Never resize a visual
        // layer from these transient height samples: doing so makes the
        // authored feather race the browser-owned solid surface.
        root.dataset.portraitTransientViewport = nextViewport;
        return;
      }
      lastViewport = nextViewport;
      lastViewportWidth = width;
      delete root.dataset.portraitTransientViewport;
      root.style.setProperty('--portrait-live-height', `${height}px`);
      root.style.setProperty('--portrait-live-width', `${width}px`);
      root.style.setProperty('--portrait-stage-coverage-height', `${height}px`);
      root.dataset.portraitStageCoverage = `${height}px`;
      root.style.setProperty(
        '--portrait-stage-scroll-distance',
        `${Math.round(height * STAGE_SCROLL_VIEWPORTS)}px`
      );
      root.dataset.portraitLiveViewport = nextViewport;
      ScrollTrigger.refresh();
    };
    const scheduleViewportSync = () => {
      if (viewportTimer) {
        window.clearTimeout(viewportTimer);
      }
      viewportTimer = window.setTimeout(() => {
        const forceHeight = forceNextViewportSync;
        forceNextViewportSync = false;
        syncViewport(forceHeight);
      }, 180);
    };
    const scheduleForcedViewportSync = () => {
      forceNextViewportSync = true;
      scheduleViewportSync();
    };

    syncViewport(true);
    window.visualViewport?.addEventListener('resize', scheduleViewportSync);
    window.addEventListener('resize', scheduleViewportSync);
    window.addEventListener('orientationchange', scheduleForcedViewportSync);
    document.addEventListener('fullscreenchange', scheduleForcedViewportSync);

    return () => {
      if (viewportTimer) {
        window.clearTimeout(viewportTimer);
      }
      window.visualViewport?.removeEventListener('resize', scheduleViewportSync);
      window.removeEventListener('resize', scheduleViewportSync);
      window.removeEventListener('orientationchange', scheduleForcedViewportSync);
      document.removeEventListener('fullscreenchange', scheduleForcedViewportSync);
      root.style.removeProperty('--portrait-live-height');
      root.style.removeProperty('--portrait-live-width');
      root.style.removeProperty('--portrait-stage-scroll-distance');
      root.style.removeProperty('--portrait-stage-coverage-height');
      delete root.dataset.portraitLiveViewport;
      delete root.dataset.portraitStageCoverage;
      delete root.dataset.portraitTransientViewport;
      delete root.dataset.portraitCheckpoint;
      delete root.dataset.portraitCheckpointTrace;
      delete documentElement.dataset.portraitSpike;
      delete documentElement.dataset.portraitSpikeMotion;
      delete documentElement.dataset.portraitCheckpoint;
    };
  }, [motionEnabled]);

  useEffect(() => attachPhoneLoaderVisibilityLifecycle(), []);

  useEffect(() => {
    const documentElement = document.documentElement;
    documentElement.dataset.portraitSpikeLoader = loaderHidden ? 'ready' : 'active';
    publishCheckpoint(loaderHidden ? 'hero-entered' : 'loader');
    if (!loaderHidden) {
      window.scrollTo(0, 0);
      return () => {
        delete documentElement.dataset.portraitSpikeLoader;
      };
    }
    const refreshFrame = window.requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      window.cancelAnimationFrame(refreshFrame);
      delete documentElement.dataset.portraitSpikeLoader;
    };
  }, [loaderHidden, publishCheckpoint]);

  const navigationVisible = loaderHidden
    && navigationScene !== 'hero'
    && navigationScene !== 'pattern';

  useEffect(() => {
    if (!navigationVisible) {
      setNavigationMenuOpen(false);
    }
  }, [navigationVisible]);

  const navigatePortraitStory = useCallback((scene: SceneId) => {
    setNavigationMenuOpen(false);
    if (scene === 'hero') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      return;
    }
    if (scene === 'method-top' || scene === 'method-bottom') {
      document.getElementById('method')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.location.assign(`/${hashForScene(scene)}`);
  }, []);

  useEffect(() => {
    const canvas = patternCanvasRef.current;
    if (!canvas) {
      return;
    }

    let disposed = false;
    const renderer = new PatternBloomRenderer(canvas, {
      // Portrait has an independent camera, while the canonical renderer keeps
      // owning petal geometry and the upper-focal collapse point.
      centerForViewport: () => PORTRAIT_PATTERN_CENTER
    });
    patternRendererRef.current = renderer;
    canvas.dataset.portraitPatternRenderer = 'loading';
    canvas.dataset.portraitPatternCenter = '50%,28%';

    void renderer.start()
      .then(async () => {
        if (disposed) {
          return;
        }
        const frame = patternProgressRef.current;
        renderer.setFrameProgress(frame.collapse, frame.rotation);
        renderer.setRenderActive(
          patternActiveRef.current && motionEnabled,
          patternActiveRef.current && motionEnabled
        );
        await renderer.prepareStaticFrame();
        if (!disposed) {
          canvas.dataset.portraitPatternRenderer = 'ready';
        }
      })
      .catch(() => {
        if (!disposed) {
          canvas.dataset.portraitPatternRenderer = 'failed';
        }
      });

    return () => {
      disposed = true;
      renderer.destroy();
      if (patternRendererRef.current === renderer) {
        patternRendererRef.current = null;
      }
      delete canvas.dataset.portraitPatternRenderer;
      delete canvas.dataset.portraitPatternCenter;
    };
  }, [motionEnabled]);

  useEffect(() => {
    const canvas = starCanvasRef.current;
    if (!canvas) {
      return;
    }

    let disposed = false;
    let readyFrame = 0;
    let liveFrame = 0;
    let revision = 0;
    let motionActive = false;
    let transitionProgress = starProgressRef.current;
    let firstFramePainted = false;
    let lastPaintedAt = -Infinity;
    const reveal = initStarFieldReveal({
      canvas,
      sourceUrl: STAR_MAP_IMAGE,
      autoplay: false,
      viewport: () => {
        const outputScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        return {
          // The source and Perlin share one high-density output. A CSS-pixel
          // canvas made the whole 1672px map look defocused on Retina iPhones.
          width: (canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth)
            * outputScale,
          height: (canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight)
            * outputScale
        };
      },
      config: {
        revealDurationMs: 2800,
        loopTransitionMs: 1200,
        noiseMaskWidth: 420,
        highlight: {
          threshold: 120,
          gamma: 3.05,
          softness: 23
        },
        glow: {
          // The rotated source is fitted at roughly half the desktop CSS
          // scale on Retina portrait screens. Compensate the blur radii so
          // the visible Gaussian bloom matches the desktop composition.
          wideBlur: 120,
          mediumBlur: 44,
          coreBlur: 10,
          screenBlur: 3,
          wideAlpha: 1.08,
          mediumAlpha: 0.92,
          coreAlpha: 0.62,
          screenAlpha: 0.52
        },
        noise: {
          profile: 'desktop-r5',
          seed: 42.7,
          scale: 3.8,
          warpScale: 2.1,
          warpAmount: 0.42,
          phaseSpeed: 0.46,
          driftX: 0.06,
          driftY: 0.34,
          warpSpeedX: 0.09,
          warpSpeedY: 0.08,
          octaves: 4,
          lacunarity: 2.07,
          gain: 0.51,
          ridgeMix: 0.17,
          thresholdLow: 0.45,
          thresholdHigh: 0.55
        }
      }
    });

    const paintBackground = (now = performance.now(), force = false) => {
      if (disposed || !reveal.ready || (!force && now - lastPaintedAt < STAR_MAP_FRAME_INTERVAL_MS)) {
        return false;
      }
      const timeSeconds = now / 1000;
      const pulse = motionEnabled
        ? Math.sin(timeSeconds * 0.34) * 0.08 + Math.sin(timeSeconds * 0.17) * 0.05
        : 0;
      reveal.renderBackground({
        timeSeconds,
        strength: motionEnabled ? 1.05 + pulse : 0.72,
        // Match the horizontal production composite: the source map remains
        // untouched while Perlin only gates the extracted highlight layer.
        noiseFloor: motionEnabled ? 0.028 : 0.02,
        camera: PORTRAIT_STAR_CAMERA,
        drawSource: true
      });
      firstFramePainted = true;
      lastPaintedAt = now;
      revision += 1;
      canvas.dataset.portraitStarPerlin = 'ready';
      canvas.dataset.portraitStarCamera = 'rotate(-90deg) cover';
      canvas.dataset.portraitStarPerlinRevision = String(revision);
      return true;
    };

    const renderLiveBackground = (now: number) => {
      liveFrame = 0;
      if (!motionActive || !motionEnabled) {
        return;
      }
      paintBackground(now);
      liveFrame = window.requestAnimationFrame(renderLiveBackground);
    };

    const scheduleLiveBackground = () => {
      if (!motionActive || !motionEnabled || liveFrame || !firstFramePainted) {
        return;
      }
      liveFrame = window.requestAnimationFrame(renderLiveBackground);
    };

    const markReady = () => {
      readyFrame = 0;
      if (disposed || firstFramePainted) {
        return;
      }
      if (!reveal.ready) {
        readyFrame = window.requestAnimationFrame(markReady);
        return;
      }
      paintBackground(performance.now(), true);
      scheduleLiveBackground();
    };

    const painter: PortraitStarPainter = {
      setVisible(nextVisible) {
        motionActive = nextVisible && motionEnabled;
        canvas.dataset.portraitStarPerlinActive = String(motionActive);
        if (!motionActive) {
          window.cancelAnimationFrame(liveFrame);
          liveFrame = 0;
          return;
        }
        scheduleLiveBackground();
      },
      setTransitionProgress(nextProgress) {
        transitionProgress = clamp(nextProgress);
        canvas.dataset.portraitStarPerlinProgress = transitionProgress.toFixed(4);
        // Scroll records scene presentation state. Painting remains exclusively
        // owned by this paced rAF loop, never by ScrollTrigger's update burst.
        scheduleLiveBackground();
      }
    };

    starPainterRef.current = painter;
    painter.setTransitionProgress(starProgressRef.current);
    painter.setVisible(starVisibleRef.current);
    readyFrame = window.requestAnimationFrame(markReady);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(readyFrame);
      window.cancelAnimationFrame(liveFrame);
      reveal.dispose();
      if (starPainterRef.current === painter) {
        starPainterRef.current = null;
      }
      delete canvas.dataset.portraitStarPerlin;
      delete canvas.dataset.portraitStarCamera;
      delete canvas.dataset.portraitStarPerlinActive;
      delete canvas.dataset.portraitStarPerlinRevision;
      delete canvas.dataset.portraitStarPerlinProgress;
    };
  }, [motionEnabled]);

  useGSAP(() => {
    if (!loaderHidden || !heroReady) {
      return;
    }
    const root = rootRef.current;
    const stageRail = stageRailRef.current;
    const stage = stageRef.current;
    const heroAdapter = heroAdapterRef.current;
    const heroScene = heroAdapter?.root();
    const patternScene = patternSceneRef.current;
    const starScene = starSceneRef.current;
    const aodScene = aodSceneRef.current;
    const heroInkCanvas = heroInkCanvasRef.current;
    const patternCopy = patternCopyRef.current;
    const patternWash = patternWashRef.current;
    const patternInkCanvas = patternInkCanvasRef.current;
    const starMotion = starMotionRef.current;
    const starWash = starWashRef.current;
    const starCopy = starCopyRef.current;
    const starInkCanvas = starInkCanvasRef.current;
    const readingIntro = readingIntroRef.current;
    const readingSteps = readingStepsRef.current;
    const aodTransition = aodScene?.querySelector<HTMLElement>('[data-aod-transition]');
    const aodFigureVideo = aodScene?.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
    const aodFigureCanvas = aodScene?.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');

    if (!root || !stageRail || !stage || !heroAdapter || !heroScene
      || !patternScene || !starScene || !aodScene
      || !heroInkCanvas || !patternCopy || !patternWash || !patternInkCanvas
      || !starMotion || !starWash || !starCopy || !starInkCanvas || !readingIntro || !readingSteps
      || !aodTransition || !aodFigureVideo || !aodFigureCanvas) {
      return;
    }

    let active = true;
    let aodCompositor: PackedAlphaVideoCompositor | undefined;
    let aodAutoplay: PhoneAodAutoplay | undefined;
    let heroInk: PhoneInkTransition | undefined;
    let patternInk: PhoneInkTransition | undefined;
    let starInk: PhoneInkTransition | undefined;
    let lastPatternProgress = Number.NaN;
    let lastStarProgress = Number.NaN;
    let lastAodProgress = Number.NaN;
    let currentOwnership = '';
    let heroActive = false;
    let patternActive = false;
    let starActive = false;
    let aodRunState: PortraitAodRunState = 'idle';
    let aodProgress = 0;
    let lastStageProgress = Number.NaN;
    let stageScrollStart = 0;
    let stageScrollEnd = 1;
    let reverseGesturePointerId: number | null = null;
    let reverseGestureStartY = 0;
    let reverseWarmupStarted = false;
    const aodScrollSnap = createPhoneScrollSnapLock({
      root,
      getScrollY: () => window.scrollY,
      scrollTo: (y) => window.scrollTo({ top: y, left: 0, behavior: 'auto' })
    });
    const documentElement = document.documentElement;
    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousDocumentSurface = documentElement.style.getPropertyValue('--portrait-document-surface');
    const previousDocumentEdgeScene = documentElement.dataset.portraitEdgeScene;
    const previousThemeColor = themeColorMeta?.content;
    let currentDocumentSurface = '';
    let currentNavigationScene: SceneId = 'hero';
    root.dataset.portraitSpikeMotionState = motionEnabled ? 'running' : 'reduced';
    root.dataset.portraitStagePin = 'native-fixed-composite';
    root.dataset.portraitStageActive = 'true';
    root.dataset.portraitAodRun = aodRunState;
    root.dataset.portraitAodMethodVisible = 'false';
    ScrollTrigger.config({ ignoreMobileResize: true });

    const setDocumentSurface = (surface: string) => {
      if (currentDocumentSurface === surface) {
        return;
      }
      currentDocumentSurface = surface;
      documentElement.style.setProperty('--portrait-document-surface', surface);
      root.style.setProperty('--portrait-edge-surface', surface);
      root.dataset.portraitEdgeSurface = surface;
      const edgeScene = surface === PORTRAIT_SURFACE_PATTERN
        ? 'pattern'
        : surface === PORTRAIT_SURFACE_STAR
          ? 'star'
          : surface === PORTRAIT_SURFACE_PAPER
            ? 'aod'
            : 'hero';
      root.dataset.portraitEdgeScene = edgeScene;
      documentElement.dataset.portraitEdgeScene = edgeScene;
      if (themeColorMeta) {
        themeColorMeta.content = surface;
      }
    };

    const setCurrentNavigationScene = (scene: SceneId) => {
      if (currentNavigationScene === scene) {
        return;
      }
      currentNavigationScene = scene;
      setNavigationScene(scene);
    };

    const setStageActive = (stageActive: boolean) => {
      if (
        !stageActive
        && (aodRunState === 'forward' || aodRunState === 'reverse')
      ) {
        // iOS momentum can briefly cross the rail boundary before the AOD
        // scroll lock corrects it. Keep Method in its fixed bridge state so
        // the document-flow copy can never flash or travel through the AOD.
        root.dataset.portraitStageActive = 'true';
        root.dataset.portraitStageBoundary = 'held-by-aod';
        return;
      }
      delete root.dataset.portraitStageBoundary;
      root.dataset.portraitStageActive = String(stageActive);
      if (!stageActive) {
        setCurrentNavigationScene('method-top');
      }
    };

    const scenes: Record<PortraitStageScene, HTMLElement> = {
      hero: heroScene,
      pattern: patternScene,
      star: starScene,
      aod: aodScene
    };
    const sceneEntries = Object.entries(scenes) as [PortraitStageScene, HTMLElement][];

    const setSceneVisibility = (scene: PortraitStageScene, visible: boolean, zIndex: number) => {
      const element = scenes[scene];
      clearBoundaryGeometry(element);
      element.style.visibility = visible ? 'visible' : 'hidden';
      element.style.zIndex = String(zIndex);
      element.setAttribute('aria-hidden', visible ? 'false' : 'true');
    };

    const setOwnership = (
      key: string,
      visible: readonly PortraitStageScene[],
      stack: readonly PortraitStageScene[]
    ) => {
      const ownershipChanged = currentOwnership !== key;
      currentOwnership = key;
      const visibleSet = new Set(visible);
      for (const [scene] of sceneEntries) {
        const stackIndex = stack.indexOf(scene);
        setSceneVisibility(
          scene,
          visibleSet.has(scene),
          stackIndex >= 0 ? stack.length + 1 - stackIndex : 0
        );
      }
      if (ownershipChanged) {
        root.dataset.portraitStageOwner = key;
      }
    };

    const setAodHoldOwnership = (progress: number, phase: string) => {
      const alphaTransparent = progress < aodAlphaEndProgress;
      aodScene.dataset.portraitAodAlpha = alphaTransparent ? 'transparent' : 'opaque';
      // Alpha belongs to the AOD figure only. Its transparent pixels reveal
      // AOD's own paper/cloud/sun stack, never the outgoing Star scene.
      setOwnership(`hold-aod-${phase}-${alphaTransparent ? 'alpha' : 'opaque'}`, ['aod'], ['aod']);
    };

    const setHeroFigureActive = (nextActive: boolean) => {
      if (heroActive === nextActive) {
        return;
      }
      heroActive = nextActive;
      if (nextActive) {
        heroAdapter.enter?.();
      } else {
        heroAdapter.leave?.();
      }
    };

    const setPatternActive = (nextActive: boolean) => {
      if (patternActive === nextActive) {
        return;
      }
      patternActive = nextActive;
      patternActiveRef.current = nextActive;
      patternRendererRef.current?.setRenderActive(nextActive, nextActive);
    };

    const setStarVisible = (nextVisible: boolean) => {
      if (starActive === nextVisible) {
        return;
      }
      starActive = nextVisible;
      starVisibleRef.current = nextVisible;
      starPainterRef.current?.setVisible(nextVisible);
    };

    const renderPatternFrame = (rawProgress: number) => {
      const progress = clamp(rawProgress);
      if (Math.abs(progress - lastPatternProgress) < 0.004) {
        return;
      }
      lastPatternProgress = progress;
      patternProgressRef.current = { collapse: progress, rotation: progress };
      patternRendererRef.current?.setFrameProgress(progress, progress);
      const copyProgress = range01(progress, 0, 0.78);
      const washOpacity = 0.54 + progress * 0.4;
      gsap.set(patternWash, { opacity: washOpacity });
      gsap.set(patternCopy, { y: 44 * (1 - copyProgress), opacity: copyProgress });
    };

    const renderStarFrame = (rawProgress: number) => {
      const progress = clamp(rawProgress);
      if (Math.abs(progress - lastStarProgress) < 0.004) {
        return;
      }
      lastStarProgress = progress;
      starProgressRef.current = progress;
      starPainterRef.current?.setTransitionProgress(progress);
      gsap.set(starMotion, { scale: 1, yPercent: 0 });
      gsap.set(starWash, { opacity: progress });
      gsap.set(starCopy, { y: 18 * (1 - progress), opacity: progress });
    };

    const renderMethodBridge = (rawProgress: number) => {
      const progress = clamp(rawProgress);
      const ease = progress * progress * (3 - 2 * progress);
      const visible = progress > 0.001;
      root.dataset.portraitAodMethodVisible = String(visible);
      root.dataset.portraitMethodEntrance = progress.toFixed(4);
      gsap.set(readingIntro, {
        autoAlpha: ease,
        y: 30 * (1 - ease),
        filter: `blur(${((1 - ease) * 8).toFixed(2)}px)`
      });
      readingIntro.style.display = visible ? 'flex' : 'none';
    };

    const renderAodFrame = (rawProgress: number) => {
      const progress = clamp(rawProgress);
      aodProgress = progress;
      const methodProgress = phoneAodMethodProgress(progress);
      renderMethodBridge(methodProgress);
      if (aodRunState === 'forward' || aodRunState === 'reverse') {
        publishCheckpoint(phoneAodCheckpointForMethodProgress(methodProgress));
      }
      const alphaTransparent = progress < aodAlphaEndProgress;
      aodScene.dataset.portraitAodAlpha = alphaTransparent ? 'transparent' : 'opaque';
      if (
        aodRunState !== 'idle'
        || (Number.isFinite(lastStageProgress) && lastStageProgress >= STAR_AOD_END)
      ) {
        setDocumentSurface(PORTRAIT_SURFACE_PAPER);
        setAodHoldOwnership(progress, aodRunState);
      }
      if (Math.abs(progress - lastAodProgress) < 0.004) {
        return;
      }
      lastAodProgress = progress;
      renderAodTransitionProgress(aodScene, progress, aodAlphaEndProgress);
      const presentation = phoneAodPresentation(progress);
      const backdropPresentation = phoneAodBackdropPresentation(progress);
      aodTransition.style.setProperty(
        '--aod-transition-sun-y',
        `${backdropPresentation.sunYVh.toFixed(2)}dvh`
      );
      aodTransition.style.setProperty(
        '--aod-transition-cloud-y',
        `${backdropPresentation.cloudYVh.toFixed(2)}dvh`
      );
      aodTransition.dataset.portraitAodBackdropProgress = progress.toFixed(4);
      const canonicalMistOpacity = Number.parseFloat(
        aodTransition.style.getPropertyValue('--aod-transition-bottom-mist-opacity')
      ) || 0;
      aodTransition.style.setProperty(
        '--portrait-aod-figure-cover-scale',
        presentation.figureScale.toFixed(4)
      );
      aodTransition.style.setProperty(
        '--portrait-aod-figure-shift-y',
        `${presentation.figureShiftYVh.toFixed(2)}dvh`
      );
      aodTransition.style.setProperty(
        '--aod-transition-bottom-mist-opacity',
        Math.max(canonicalMistOpacity, presentation.bottomMistOpacity).toFixed(4)
      );
      aodTransition.setAttribute('data-aod-exit-active', 'true');
    };

    const beginAodForward = () => {
      if (aodRunState !== 'idle') {
        return;
      }
      // Hide the flow-owned Method synchronously, before momentum is snapped.
      // The authored entrance may start again only after AOD reaches 80%.
      renderMethodBridge(0);
      aodRunState = 'forward';
      root.dataset.portraitAodRun = aodRunState;
      publishCheckpoint('aod-autoplay');
      setStageActive(true);
      const anchorY = stageScrollStart
        + (stageScrollEnd - stageScrollStart) * AOD_AUTOPLAY_START;
      aodScrollSnap.lock(anchorY);
      aodAutoplay?.start(1);
    };

    const beginAodReverse = (anchorY = window.scrollY) => {
      if (aodRunState !== 'complete') {
        return;
      }
      aodRunState = 'reverse';
      root.dataset.portraitAodRun = aodRunState;
      publishCheckpoint(phoneAodCheckpointForMethodProgress(
        phoneAodMethodProgress(aodProgress)
      ));
      // A touch reversal can arrive while Method still owns the document
      // surface. Re-enable the fixed stage before snapping to its last pixel,
      // then keep that exact boundary locked until the reverse asset ends.
      setStageActive(true);
      aodScrollSnap.lock(anchorY);
      aodAutoplay?.start(-1);
    };

    const completeAodRun = (direction: PhoneAodPlaybackDirection) => {
      aodRunState = direction === 1 ? 'complete' : 'idle';
      root.dataset.portraitAodRun = aodRunState;
      publishCheckpoint(phoneAodCompletionCheckpoint(direction));
      aodScrollSnap.release();
      if (direction === 1 && !reverseWarmupStarted) {
        reverseWarmupStarted = true;
        void fetch(AOD_FIGURE_PACKED_ALPHA_REVERSE_VIDEO, {
          cache: 'force-cache'
        }).catch(() => undefined);
      }
    };

    const retryHeroFigureFromGesture = () => {
      heroAdapter.unlockFromGesture();
      if (aodRunState === 'forward' || aodRunState === 'reverse') {
        aodAutoplay?.start(aodRunState === 'forward' ? 1 : -1);
      }
    };
    const pointerTargetIsPermissionButton = (event: Event) => (
      event.target instanceof Element
      && Boolean(event.target.closest('[data-portrait-gyro-permission]'))
    );
    const pointerTargetIsInteractive = (event: Event) => (
      event.target instanceof Element
      && Boolean(event.target.closest('a, button, input, select, textarea, [role="button"]'))
    );
    const onHeroPointerDown = (event: PointerEvent) => {
      if (!pointerTargetIsPermissionButton(event)) {
        retryHeroFigureFromGesture();
      }
      if (
        event.pointerType === 'touch'
        && aodRunState === 'complete'
        && !pointerTargetIsInteractive(event)
        && Math.abs(window.scrollY - stageScrollEnd) <= 32
      ) {
        reverseGesturePointerId = event.pointerId;
        reverseGestureStartY = event.clientY;
      } else {
        reverseGesturePointerId = null;
      }
    };
    const onHeroPointerMove = (event: PointerEvent) => {
      if (
        reverseGesturePointerId !== event.pointerId
        || event.clientY - reverseGestureStartY < 10
      ) {
        return;
      }
      reverseGesturePointerId = null;
      beginAodReverse(Math.max(stageScrollStart, stageScrollEnd - 1));
    };
    const clearReverseGesture = (event: PointerEvent) => {
      if (reverseGesturePointerId === event.pointerId) {
        reverseGesturePointerId = null;
      }
    };
    const onHeroClick = (event: Event) => {
      retryHeroFigureFromGesture();
      if (pointerTargetIsPermissionButton(event)) {
        requestPortraitFullscreen(root);
      }
    };
    root.addEventListener('pointerdown', onHeroPointerDown, { passive: true });
    root.addEventListener('pointermove', onHeroPointerMove, { passive: true });
    root.addEventListener('pointerup', clearReverseGesture, { passive: true });
    root.addEventListener('pointercancel', clearReverseGesture, { passive: true });
    root.addEventListener('click', onHeroClick);

    if (motionEnabled) {
      aodCompositor = createPackedAlphaVideoCompositor({
        video: aodFigureVideo,
        canvas: aodFigureCanvas
      });
      aodAutoplay = createPhoneAodAutoplay(aodFigureVideo, {
        durationSeconds: AOD_FIGURE_END_SECONDS,
        alphaEndProgress: aodAlphaEndProgress,
        forwardSourceUrl: AOD_FIGURE_PACKED_ALPHA_VIDEO,
        reverseSourceUrl: AOD_FIGURE_PACKED_ALPHA_REVERSE_VIDEO,
        onProgress: renderAodFrame,
        onComplete: completeAodRun
      });
      aodAutoplay.reset();
      heroInk = createPhoneInkTransition({
        host: stage,
        canvas: heroInkCanvas,
        id: 'portrait-hero-pattern-ink',
        from: heroScene,
        to: patternScene,
        field: {
          kind: 'radial',
          origin: PORTRAIT_HERO_FIGURE_CENTER,
          seed: 'portrait-hero-pattern-r5'
        },
        grade: 'dark'
      });
      patternInk = createPhoneInkTransition({
        host: stage,
        canvas: patternInkCanvas,
        id: 'portrait-pattern-star-ink',
        from: patternScene,
        to: starScene,
        field: {
          kind: 'radial',
          origin: PORTRAIT_PATTERN_CENTER,
          seed: 'portrait-pattern-star-r5'
        },
        grade: 'dark'
      });
      starInk = createPhoneInkTransition({
        host: stage,
        canvas: starInkCanvas,
        id: 'portrait-star-aod-ink',
        from: starScene,
        to: aodScene,
        field: {
          kind: 'horizontal',
          direction: 'bottom-to-top',
          seed: 'portrait-star-aod-r5'
        },
        grade: 'edge-bright'
      });
    }

    const renderStage = (rawProgress: number, triggerDirection = 0) => {
      const progress = clamp(rawProgress);
      const previousStageProgress = lastStageProgress;
      const movingBackward = triggerDirection < 0
        || (Number.isFinite(previousStageProgress) && progress < previousStageProgress);
      const movingForward = triggerDirection > 0
        || (Number.isFinite(previousStageProgress) && progress > previousStageProgress);
      lastStageProgress = progress;
      if (
        progress > 0.003
        && root.dataset.portraitHeroEntrance !== 'complete'
      ) {
        heroAdapter.completeEntrance();
      }
      const heroProgress = range01(progress, 0, HERO_MOTION_END);
      const heroPatternProgress = range01(progress, HERO_MOTION_END, HERO_PATTERN_END);
      const patternProgress = range01(progress, PATTERN_MOTION_START, PATTERN_MOTION_END);
      const patternStarProgress = range01(progress, PATTERN_STAR_START, PATTERN_STAR_END);
      const starAodProgress = range01(progress, STAR_AOD_START, STAR_AOD_END);
      const starPresentationProgress = progress >= PATTERN_STAR_START ? 1 : 0;
      setCurrentNavigationScene(
        progress < HERO_PATTERN_END
          ? 'hero'
          : progress < PATTERN_STAR_END
            ? 'pattern'
            : progress < STAR_AOD_END
              ? 'star-map'
              : 'aod-animation'
      );

      if (
        motionEnabled
        && movingBackward
        && aodRunState === 'complete'
      ) {
        beginAodReverse();
      } else if (
        motionEnabled
        && movingForward
        && aodRunState === 'idle'
        && progress >= AOD_AUTOPLAY_START
      ) {
        beginAodForward();
      }
      if (
        motionEnabled
        && movingBackward
        && aodRunState === 'idle'
        && previousStageProgress >= STAR_AOD_END
        && progress < STAR_AOD_END
      ) {
        aodAutoplay?.reset();
      }

      root.dataset.portraitStageProgress = progress.toFixed(4);
      if (aodRunState === 'idle') {
        publishCheckpoint(phoneStageFrame(progress, !motionEnabled).checkpoint);
      }
      if (progress < HERO_PATTERN_END) {
        setDocumentSurface(PORTRAIT_SURFACE_DARK);
      } else if (progress < PATTERN_STAR_END) {
        setDocumentSurface(PORTRAIT_SURFACE_PATTERN);
      } else if (progress < STAR_AOD_END) {
        setDocumentSurface(PORTRAIT_SURFACE_STAR);
      } else {
        setDocumentSurface(PORTRAIT_SURFACE_PAPER);
      }
      setHeroFigureActive(motionEnabled && progress < HERO_PATTERN_END);
      setPatternActive(
        motionEnabled
        && progress >= HERO_MOTION_END - 0.015
        && progress < PATTERN_STAR_END + 0.015
      );
      setStarVisible(
        motionEnabled
        && progress >= PATTERN_STAR_START - 0.015
        && progress < STAR_AOD_END + 0.015
      );
      heroAdapter.update(heroProgress);
      renderPatternFrame(patternProgress);
      renderStarFrame(starPresentationProgress);

      if (!motionEnabled) {
        if (progress < HERO_PATTERN_END) {
          setOwnership('hold-hero', ['hero'], ['hero']);
        } else if (progress < PATTERN_STAR_END) {
          setOwnership('hold-pattern', ['pattern'], ['pattern']);
        } else if (progress < STAR_AOD_END) {
          setOwnership('hold-star', ['star'], ['star']);
        } else {
          setOwnership('hold-aod', ['aod'], ['aod']);
          renderAodFrame(1);
        }
        return;
      }

      if (aodRunState === 'forward' || aodRunState === 'reverse') {
        heroInk?.render(1);
        patternInk?.render(1);
        starInk?.render(1);
        setAodHoldOwnership(aodProgress, aodRunState);
        return;
      }

      if (progress < HERO_MOTION_END) {
        heroInk?.render(0);
        patternInk?.render(0);
        starInk?.render(0);
        setOwnership('hold-hero', ['hero'], ['hero']);
      } else if (progress < HERO_PATTERN_END) {
        patternInk?.render(0);
        starInk?.render(0);
        setOwnership('handoff-hero-pattern', ['hero', 'pattern'], ['pattern', 'hero']);
        heroInk?.render(heroPatternProgress);
      } else if (progress < PATTERN_STAR_START) {
        heroInk?.render(1);
        patternInk?.render(0);
        starInk?.render(0);
        setOwnership('hold-pattern', ['pattern'], ['pattern']);
      } else if (progress < PATTERN_STAR_END) {
        heroInk?.render(1);
        starInk?.render(0);
        setOwnership('handoff-pattern-star', ['pattern', 'star'], ['star', 'pattern']);
        patternInk?.render(patternStarProgress);
      } else if (progress < STAR_AOD_START) {
        heroInk?.render(1);
        patternInk?.render(1);
        starInk?.render(0);
        setOwnership('hold-star', ['star'], ['star']);
      } else if (progress < STAR_AOD_END) {
        heroInk?.render(1);
        patternInk?.render(1);
        setOwnership('handoff-star-aod', ['star', 'aod'], ['star', 'aod']);
        starInk?.render(starAodProgress);
      } else if (progress < AOD_AUTOPLAY_START) {
        heroInk?.render(1);
        patternInk?.render(1);
        starInk?.render(1);
        setAodHoldOwnership(aodProgress, 'ready');
      } else {
        heroInk?.render(1);
        patternInk?.render(1);
        starInk?.render(1);
        setAodHoldOwnership(aodProgress, aodRunState);
      }
    };

    const refresh = () => {
      if (active) {
        ScrollTrigger.refresh();
      }
    };
    const refreshFrame = window.requestAnimationFrame(refresh);
    void document.fonts?.ready.then(refresh).catch(() => undefined);
    window.addEventListener('load', refresh, { once: true });

    const updateStageFromTrigger = (self: ScrollTrigger) => {
      stageScrollStart = self.start;
      stageScrollEnd = self.end;
      renderStage(self.progress, self.direction);
    };
    const stageTrigger = ScrollTrigger.create({
      id: 'portrait-spike-stage',
      trigger: stageRail,
      start: 'top top',
      // The rail includes one stage-height of sticky containment, then gives
      // that height back with a negative flow margin. Progress therefore keeps
      // its original document distance even when the browser toolbar grows or
      // shrinks the presentation plane.
      end: () => `+=${Math.max(1, stageRail.offsetHeight - stage.offsetHeight)}`,
      invalidateOnRefresh: true,
      onUpdate: updateStageFromTrigger,
      onRefresh: (self) => {
        updateStageFromTrigger(self);
        setStageActive(self.progress < 1);
      },
      onEnter: () => setStageActive(true),
      onEnterBack: () => setStageActive(true),
      onLeave: () => setStageActive(false)
    });

    const steps = Array.from(readingSteps.querySelectorAll<HTMLElement>('li'));
    gsap.fromTo(steps, { y: 34, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: 0.5,
      ease: 'power2.out',
      stagger: 0.11,
      scrollTrigger: {
        id: 'portrait-spike-reading-steps',
        trigger: readingSteps,
        start: 'top 84%',
        toggleActions: 'play none none reverse',
        invalidateOnRefresh: true
      }
    });

    renderStage(stageTrigger.progress);
    if (
      motionEnabled
      && stageTrigger.progress <= 0.003
    ) {
      heroAdapter.startEntrance();
    } else {
      heroAdapter.completeEntrance();
    }

    return () => {
      active = false;
      heroAdapter.cancelEntrance();
      window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener('load', refresh);
      root.removeEventListener('pointerdown', onHeroPointerDown);
      root.removeEventListener('pointermove', onHeroPointerMove);
      root.removeEventListener('pointerup', clearReverseGesture);
      root.removeEventListener('pointercancel', clearReverseGesture);
      root.removeEventListener('click', onHeroClick);
      stageTrigger.kill();
      setHeroFigureActive(false);
      setPatternActive(false);
      setStarVisible(false);
      aodRunState = 'idle';
      aodScrollSnap.dispose();
      aodAutoplay?.dispose();
      aodCompositor?.dispose();
      heroInk?.dispose();
      patternInk?.dispose();
      starInk?.dispose();
      delete root.dataset.portraitSpikeMotionState;
      delete root.dataset.portraitStagePin;
      delete root.dataset.portraitStageActive;
      delete root.dataset.portraitStageOwner;
      delete root.dataset.portraitStageProgress;
      delete root.dataset.portraitMethodEntrance;
      delete root.dataset.portraitAodRun;
      delete root.dataset.portraitAodMethodVisible;
      delete root.dataset.portraitStageBoundary;
      delete root.dataset.portraitHeroEntrance;
      delete root.dataset.portraitHeroTextEntrance;
      delete root.dataset.portraitEdgeSurface;
      delete root.dataset.portraitEdgeScene;
      delete aodScene.dataset.portraitAodAlpha;
      delete aodTransition.dataset.portraitAodBackdropProgress;
      root.style.removeProperty('--portrait-edge-surface');
      if (previousDocumentSurface) {
        documentElement.style.setProperty('--portrait-document-surface', previousDocumentSurface);
      } else {
        documentElement.style.removeProperty('--portrait-document-surface');
      }
      if (previousDocumentEdgeScene) {
        documentElement.dataset.portraitEdgeScene = previousDocumentEdgeScene;
      } else {
        delete documentElement.dataset.portraitEdgeScene;
      }
      if (themeColorMeta && previousThemeColor) {
        themeColorMeta.content = previousThemeColor;
      }
      ScrollTrigger.config({ ignoreMobileResize: false });
    };
  }, {
    scope: rootRef,
    dependencies: [aodAlphaEndProgress, heroReady, loaderHidden, motionEnabled, publishCheckpoint],
    revertOnUpdate: true
  });

  return (
    <main
      ref={rootRef}
      className="portrait-scroll-spike"
      data-portrait-spike-route="b"
      data-portrait-spike-media="figure1-packed-alpha-pattern-bloom-star-perlin-aod-packed-alpha-autoplay"
      data-portrait-spike-animation="gsap-scrolltrigger-native-fixed-stage"
      data-portrait-spike-motion={motionEnabled ? 'force' : 'reduce'}
      data-portrait-loader-ready={String(loaderHidden)}
      data-phone-validation-mode={props.validationMode}
      data-phone-aod-alpha-end={aodAlphaEndProgress.toFixed(2)}
      data-portrait-checkpoint={checkpointRef.current}
      data-portrait-checkpoint-trace={checkpointTraceRef.current.join('>')}
      hidden={staticFallback}
    >
      {!loaderHidden && (
        <StoryLoader
          mode={motionEnabled ? 'cold-hero' : 'reduced'}
          ready={heroReady}
          failed={heroFailed}
          onHidden={finishLoader}
        />
      )}
      <section ref={stageRailRef} className="portrait-scroll-spike__stage-rail">
        <section ref={stageRef} className="portrait-scroll-spike__stage" aria-label="同野观幂移动端视觉叙事">
        {Hero && <Hero ref={heroAdapterRef} active={loaderHidden} reducedMotion={!motionEnabled} motionDriver={phoneHeroMotionDriver} onReady={markHeroReady} />}

        <section ref={patternSceneRef} className="portrait-scroll-spike__scene portrait-scroll-spike__scene--pattern" aria-labelledby="portrait-spike-pattern-title">
          <div className="portrait-scroll-spike__pattern-motion" aria-hidden="true">
            <img className="portrait-scroll-spike__pattern-image" src={PATTERN_BACKGROUND_IMAGE} alt="" />
          </div>
          <canvas
            ref={patternCanvasRef}
            className="portrait-scroll-spike__pattern-bloom"
            data-portrait-pattern-bloom
            aria-hidden="true"
          />
          <div ref={patternWashRef} className="portrait-scroll-spike__pattern-wash" aria-hidden="true" />
          <div
            className="portrait-scroll-spike__toolbar-edge portrait-scroll-spike__toolbar-edge--pattern"
            aria-hidden="true"
          />
          <div ref={patternCopyRef} className="portrait-scroll-spike__pattern-copy">
            <p>{PATTERN_COPY[0]}</p>
            <h2 id="portrait-spike-pattern-title">{PATTERN_COPY[1]}</h2>
            <p>{PATTERN_COPY[2]}</p>
          </div>
        </section>

        <section ref={starSceneRef} className="portrait-scroll-spike__scene portrait-scroll-spike__scene--star" aria-labelledby="portrait-spike-star-title">
          <div ref={starMotionRef} className="portrait-scroll-spike__star-motion" aria-hidden="true">
            <canvas
              ref={starCanvasRef}
              className="portrait-scroll-spike__star-perlin"
              data-portrait-star-perlin
              aria-hidden="true"
            />
          </div>
          <div ref={starWashRef} className="portrait-scroll-spike__star-wash" aria-hidden="true" />
          <div ref={starCopyRef} className="portrait-scroll-spike__star-copy">
            <h2 id="portrait-spike-star-title">让 AI 成为真利器</h2>
            <p>{STAR_MAP_COPY}</p>
          </div>
        </section>

        <div ref={aodSceneRef} className="portrait-scroll-spike__scene portrait-scroll-spike__scene--aod" aria-hidden="true">
          <PortraitAodScene scene="aod-animation" hidden={false} />
          <div
            className="portrait-scroll-spike__toolbar-edge portrait-scroll-spike__toolbar-edge--aod"
            aria-hidden="true"
          />
        </div>

        <canvas ref={heroInkCanvasRef} className="portrait-scroll-spike__ink" data-portrait-ink="hero-pattern" aria-hidden="true" />
        <canvas ref={patternInkCanvasRef} className="portrait-scroll-spike__ink" data-portrait-ink="pattern-star" aria-hidden="true" />
        <canvas ref={starInkCanvasRef} className="portrait-scroll-spike__ink" data-portrait-ink="star-aod" aria-hidden="true" />
        </section>
      </section>

      <section id="method" className="portrait-scroll-spike__reading" aria-label="同野观幂 AI 落地五步">
        <div ref={readingIntroRef} className="portrait-scroll-spike__reading-intro portrait-scroll-spike__method-bridge">
          <div className="portrait-scroll-spike__method-bridge-content">
            <span>{METHOD_TOP_COPY[0]}</span>
            <h2 id="portrait-spike-method-title">
              <span>{METHOD_TOP_COPY[1]}</span>
              <span>{METHOD_TOP_COPY[2]}</span>
            </h2>
            <p>{METHOD_TOP_COPY[3]}</p>
          </div>
        </div>
        <ol ref={readingStepsRef} className="portrait-scroll-spike__steps" aria-label="同野观幂 AI 落地五步">
          {METHOD_STEPS.map((step) => (
            <li key={step.index}>
              <span>{step.index}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <StoryNav
        currentScene={navigationScene}
        visible={navigationVisible}
        menuOpen={navigationMenuOpen}
        onToggleMenu={() => setNavigationMenuOpen((open) => !open)}
        onNavigate={navigatePortraitStory}
      />
    </main>
  );
}
