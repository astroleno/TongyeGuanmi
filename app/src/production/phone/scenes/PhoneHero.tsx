import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { TextReveal, TextRevealItem } from '../../../components/TextReveal';
import {
  HERO_RADIAL_INK_REQUEST,
  renderHeroProgress,
  sampleHeroIntro,
  startHeroIntro
} from '../../../scenes/hero/motion';
import { HOME_COPY } from '../../../story/copy';
import {
  createPhoneHeroRadialInkBridge,
  type PhoneHeroRadialInkBridge
} from '../../../transitions/shared/phone-ink-runtime';
import { useOptionalPhoneStoryRuntimePort } from '../PhoneStoryRuntimeContext';
import {
  createPhonePackedAlphaSurface,
  type PhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceMode
} from './phone-packed-alpha-surface';
import {
  attachPhoneDeviceParallax,
  createPhoneFigurePlayback,
  PHONE_FIGURE_DURATION_SECONDS,
  type PhoneDeviceParallax,
  type PhoneFigurePlayback
} from './PhoneHero.motion';
import { phoneMediaUrlFor } from '../phone-media';
import type {
  PhoneHeroAdapterHandle,
  PhoneHeroAdapterProps
} from '../types';
import type {
  PhoneRenderedPresentationFrame,
  PresentationToken
} from '../phone-story/runtime';
import { phoneRuntimePresentationTokenKey } from '../phone-story/runtime';
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

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range01(value: number, start: number, end: number): number {
  return end <= start ? Number(value >= end) : clamp((value - start) / (end - start));
}

function decodeHeroImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === 'function') {
    return image.decode().catch(() => {
      // Safari can reject decode() after an already usable image; successful
      // dimensions remain a valid static-poster proof in that case.
      if (image.complete && image.naturalWidth > 0) return;
      throw new Error('Hero poster decode failed');
    });
  }
  return image.complete && image.naturalWidth > 0
    ? Promise.resolve()
    : Promise.reject(new Error('Hero image decode is unavailable'));
}

function nextBrowserPresentation(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function visibleInViewport(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(element);
    if (
      style.getPropertyValue('display') === 'none'
      || style.getPropertyValue('visibility') === 'hidden'
      || Number(style.getPropertyValue('opacity')) === 0
    ) {
      return false;
    }
  }
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  // Non-layout test environments have no viewport to intersect; the browser
  // path below always has real dimensions and therefore takes the strict path.
  if (viewportWidth <= 0 || viewportHeight <= 0) return true;
  const rect = element.getBoundingClientRect();
  return rect.width > 0
    && rect.height > 0
    && rect.right > 0
    && rect.bottom > 0
    && rect.left < viewportWidth
    && rect.top < viewportHeight;
}
/** Owns Hero markup/media/local rendering; the fixed-stage parent owns timing. */
export const PhoneHero = forwardRef<PhoneHeroAdapterHandle, PhoneHeroAdapterProps>(
  function PhoneHero(
    { active, reducedMotion, motionDriver, onReady },
    forwardedRef
  ) {
    const runtime = useOptionalPhoneStoryRuntimePort();
    const rootRef = useRef<HTMLElement | null>(null);
    const backMotionRef = useRef<HTMLDivElement | null>(null);
    const backParallaxRef = useRef<HTMLDivElement | null>(null);
    const backImageRef = useRef<HTMLImageElement | null>(null);
    const middleImageRef = useRef<HTMLImageElement | null>(null);
    const introInkCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const middleMotionRef = useRef<HTMLDivElement | null>(null);
    const middleParallaxRef = useRef<HTMLDivElement | null>(null);
    const figureMotionRef = useRef<HTMLDivElement | null>(null);
    const figureParallaxRef = useRef<HTMLDivElement | null>(null);
    const figurePosterRef = useRef<HTMLImageElement | null>(null);
    const figureVideoRef = useRef<HTMLVideoElement | null>(null);
    const figureIntroRef = useRef<HTMLDivElement | null>(null);
    const copyRef = useRef<HTMLDivElement | null>(null);
    const subtitleRef = useRef<HTMLDivElement | null>(null);
    const cueRef = useRef<HTMLSpanElement | null>(null);
    const vignetteRef = useRef<HTMLDivElement | null>(null);
    const playbackRef = useRef<PhoneFigurePlayback | undefined>(undefined);
    const packedSurfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
    const schedulePackedAlphaPostPaintRef = useRef<() => void>(() => undefined);
    const parallaxRef = useRef<PhoneDeviceParallax | undefined>(undefined);
    const introInkRef = useRef<PhoneHeroRadialInkBridge | undefined>(undefined);
    const disposeEntranceRef = useRef<(() => void) | undefined>(undefined);
    const textRevealFrameRef = useRef<number | undefined>(undefined);
    const sceneActiveRef = useRef(false);
    const adapterReadyRef = useRef(false);
    const heroPackedFramePresentedRef = useRef(false);
    // The entrance is a one-shot cold-start handoff, but Hero can be reached
    // again by a reverse route. Keep that semantic fact after the GPU owners
    // are disposed so the stable endpoint can be restored without replaying
    // the entrance or exposing a rectangular fallback.
    const heroEntranceCompletedRef = useRef(false);
    const packedAlphaPostPaintScheduledRef = useRef(false);
    const presentationBindingRef = useRef<Readonly<{
      token: PresentationToken;
      report: (frame: PhoneRenderedPresentationFrame) => void;
      frameSequence: number;
      scheduled: boolean;
    }> | null>(null);
    const lastProgressRef = useRef(Number.NaN);
    const [titleActive, setTitleActive] = useState(reducedMotion);
    const releasePackedSurface = useCallback(() => {
      packedSurfaceRef.current?.(['release']);
      heroPackedFramePresentedRef.current = false;
      packedAlphaPostPaintScheduledRef.current = false;
    }, []);
    const disposePackedSurface = useCallback(() => {
      packedSurfaceRef.current?.(['dispose']);
      packedSurfaceRef.current = null;
      heroPackedFramePresentedRef.current = false;
      packedAlphaPostPaintScheduledRef.current = false;
    }, []);
    const releaseGpuOwners = useCallback(() => {
      releasePackedSurface();
      introInkRef.current?.(['dispose']);
      introInkRef.current = undefined;
    }, [releasePackedSurface]);
    const storyRoot = useCallback(() => (
      rootRef.current?.closest<HTMLElement>('.portrait-scroll-spike') ?? rootRef.current
    ), []);
    // Mounting the full reversible graph for a direct downstream entry must
    // not claim Hero's two WebGL contexts. The adapter is always present for
    // reverse travel, while its GPU owners remain cold until Hero is active.
    const ensureIntroInk = useCallback(() => {
      if (
        reducedMotion
        || heroEntranceCompletedRef.current
        || introInkRef.current
      ) return introInkRef.current;
      const root = rootRef.current;
      const backImage = backImageRef.current;
      const introInkCanvas = introInkCanvasRef.current;
      if (!root || !backImage || !introInkCanvas) return undefined;
      const introInk = createPhoneHeroRadialInkBridge([
        introInkCanvas,
        backImage,
        backImage,
        HERO_RADIAL_INK_REQUEST[0],
        HERO_RADIAL_INK_REQUEST[1],
        HERO_RADIAL_INK_REQUEST[2],
        'portrait-spike:hero-intro',
        root
      ]);
      introInkRef.current = introInk;
      return introInk;
    }, [reducedMotion]);
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
    const ensurePackedSurface = useCallback((
      mode: PhonePackedAlphaSurfaceMode = 'forward'
    ): PhonePackedAlphaSurface | null => {
      const root = rootRef.current;
      const video = figureVideoRef.current;
      const container = figureIntroRef.current;
      if (!root || !video || !container) return null;
      if (!packedSurfaceRef.current) {
        packedSurfaceRef.current = createPhonePackedAlphaSurface([
          root,
          container,
          video,
          HERO_FIGURE_PACKED_ALPHA_VIDEO,
          PHONE_FIGURE_DURATION_SECONDS,
          'phoneHeroAlpha',
          'hero-figure',
          'portrait-scroll-spike__hero-figure',
          null,
          () => {
            video.dataset.portraitFigureAlpha = 'verified';
            root.dataset.phoneHeroMedia = video.paused ? 'ready' : 'playing';
            const parallax = figureParallaxRef.current;
            if (parallax) {
              parallax.dataset.portraitFigureAlpha = 'verified';
              parallax.dataset.portraitFigureFrame = 'ready';
            }
            schedulePackedAlphaPostPaintRef.current();
          }
        ]);
      }
      packedSurfaceRef.current(['activate', mode]);
      return packedSurfaceRef.current;
    }, []);
    const requestPresentedHeroFrame = useCallback(() => {
      const binding = presentationBindingRef.current;
      if (!binding || binding.scheduled || !heroPackedFramePresentedRef.current) return;
      const scheduled = { ...binding, scheduled: true } as const;
      presentationBindingRef.current = scheduled;
      void nextBrowserPresentation().then(() => {
        if (presentationBindingRef.current !== scheduled) return;
        const root = rootRef.current;
        const surface = packedSurfaceRef.current;
        const canvas = surface?.(['canvas']) ?? null;
        // A decoded poster establishes only a local warm-up fact. The token
        // can cross the leaf boundary only after this exact packed-alpha
        // canvas has drawn and survived a browser paint.
        if (
          !root
          || !canvas
          || canvas.dataset.packedAlphaFrameReady !== 'true'
          || !visibleInViewport(root)
          || !visibleInViewport(canvas)
        ) {
          presentationBindingRef.current = { ...scheduled, scheduled: false };
          return;
        }
        const next = {
          ...scheduled,
          frameSequence: scheduled.frameSequence + 1,
          scheduled: false
        } as const;
        presentationBindingRef.current = next;
        next.report({
          token: next.token,
          frameSequence: next.frameSequence,
          origin: 'leaf-post-paint',
          observedAt: typeof performance !== 'undefined'
            && typeof performance.now === 'function'
            ? performance.now()
            : 0
        });
         // Keep the surface-owned compositor through the current machine lease,
        // then retire it once the runner has published the stable snapshot.
        // A fixed two-frame delay is not enough for landing/alignment; polling
        // the read-only authority avoids both stale contexts and candidate
        // starvation on a reverse return.
        const poll = () => {
          if (presentationBindingRef.current !== next) return;
          const snapshot = runtime?.getSnapshot();
          const session = snapshot?.status === 'transaction'
            ? snapshot.session
            : null;
          const stillOwned = Boolean(
            session
            && session.sessionId === next.token.sessionId
            && session.generation === next.token.generation
          );
          if (
            stillOwned
            && typeof window !== 'undefined'
            && typeof window.requestAnimationFrame === 'function'
          ) {
            window.requestAnimationFrame(poll);
            return;
          }
          presentationBindingRef.current = null;
          if (!sceneActiveRef.current) releaseGpuOwners();
        };
        if (runtime) {
          window.requestAnimationFrame(poll);
        }
      });
    }, [releaseGpuOwners, runtime]);
    /**
     * Loader handoff and initial presentation share this one physical fact:
     * the active packed-alpha canvas completed a GL draw, then stayed visible
     * through two browser frames. A decoded poster never reaches either gate.
     */
    const schedulePackedAlphaPostPaint = useCallback(() => {
      if (
        heroPackedFramePresentedRef.current
        || packedAlphaPostPaintScheduledRef.current
      ) return;
      const root = rootRef.current;
      const surface = packedSurfaceRef.current;
      const canvas = surface?.(['canvas']) ?? null;
      if (!root || !canvas || canvas.dataset.packedAlphaFrameReady !== 'true') return;
      packedAlphaPostPaintScheduledRef.current = true;
      void nextBrowserPresentation().then(() => {
        packedAlphaPostPaintScheduledRef.current = false;
        const visibleRoot = rootRef.current;
        const surface = packedSurfaceRef.current;
        const visibleCanvas = surface?.(['canvas']) ?? null;
        const hasPresentationBinding = presentationBindingRef.current !== null;
        if (
          !adapterReadyRef.current
          || (!sceneActiveRef.current && !hasPresentationBinding)
          || heroPackedFramePresentedRef.current
          || !visibleRoot
          || !visibleCanvas
          || visibleCanvas.dataset.packedAlphaFrameReady !== 'true'
          || !visibleInViewport(visibleRoot)
          || !visibleInViewport(visibleCanvas)
        ) {
          if (visibleRoot && adapterReadyRef.current) {
            visibleRoot.dataset.phoneHeroFirstFrame = 'packed-alpha-not-presented';
          }
          return;
        }
        heroPackedFramePresentedRef.current = true;
        visibleRoot.dataset.phoneHeroFirstFrame = 'packed-alpha-post-paint';
        requestPresentedHeroFrame();
        if (sceneActiveRef.current) onReady?.();
      });
    }, [onReady, requestPresentedHeroFrame]);
    schedulePackedAlphaPostPaintRef.current = schedulePackedAlphaPostPaint;
    const renderEntrance = useCallback((rawProgress: number) => {
      const root = rootRef.current;
      const cue = cueRef.current;
      if (!root || !cue) return;
      const sample = sampleHeroIntro(rawProgress);
      const owner = storyRoot();
      renderHeroProgress(root, sample.progress);
      ensureIntroInk()?.(['render', sample.progress]);
      if (sample.complete) {
        heroEntranceCompletedRef.current = true;
      }
      if (owner) {
        owner.dataset.portraitHeroEntrance = sample.complete ? 'complete' : 'playing';
        if (sample.complete) {
          owner.dataset.portraitHeroTextEntrance = 'complete';
        }
      }
      root.dataset.portraitHeroTitleActive = String(sample.titleActive);
      motionDriver.set(cue, { opacity: sample.titleActive ? 1 : 0 });
      if (sample.titleActive) {
        setTitleActive(true);
      }
    }, [ensureIntroInk, motionDriver, storyRoot]);
    /** Prime entrance state while the Loader remains the top visual plane. */
    const primeEntrance = useCallback(() => {
      const root = rootRef.current;
      const cue = cueRef.current;
      if (!root || !cue) return;
      renderHeroProgress(root, 0);
      const owner = storyRoot();
      if (owner) {
        owner.dataset.portraitHeroEntrance = 'primed';
        owner.dataset.portraitHeroTextEntrance = 'idle';
      }
      root.dataset.portraitHeroTitleActive = 'false';
      motionDriver.set(cue, { opacity: 0 });
      setTitleActive(false);
    }, [motionDriver, storyRoot]);
    const completeEntrance = useCallback(() => {
      if (!sceneActiveRef.current) return false;
      cancelEntrance();
      heroEntranceCompletedRef.current = true;
      renderEntrance(1);
      return true;
    }, [cancelEntrance, renderEntrance]);
    const startEntrance = useCallback(() => {
      if (!sceneActiveRef.current && !presentationBindingRef.current) return;
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
          heroEntranceCompletedRef.current = true;
          owner.dataset.portraitHeroEntrance = 'complete';
        }
      });
    }, [cancelEntrance, completeEntrance, reducedMotion, renderEntrance, storyRoot]);

    useLayoutEffect(() => {
      const root = rootRef.current;
      const backParallax = backParallaxRef.current;
      const middleParallax = middleParallaxRef.current;
      const figureParallax = figureParallaxRef.current;
      const backImage = backImageRef.current;
      const middleImage = middleImageRef.current;
    const figurePoster = figurePosterRef.current;
    const figureVideo = figureVideoRef.current;
      if (
        !root
        || !backParallax
        || !middleParallax
        || !figureParallax
        || !backImage
        || !middleImage
        || !figurePoster
        || !figureVideo
      ) {
        return;
      }
      adapterReadyRef.current = true;
      primeEntrance();
      root.dataset.phoneHeroFirstFrame = 'decoding';
      let cancelled = false;
      void Promise.all([
        decodeHeroImage(backImage),
        decodeHeroImage(middleImage),
        decodeHeroImage(figurePoster)
      ]).then(() => {
        if (cancelled) return;
        // The poster is a retained visual fallback only. It must not replace
        // the compositor's token-bound draw as the Loader handoff authority.
        if (!heroPackedFramePresentedRef.current) {
          root.dataset.phoneHeroFirstFrame = 'poster-decoded';
        }
      }).catch(() => {
        if (!cancelled) root.dataset.phoneHeroFirstFrame = 'failed';
      });
      if (reducedMotion) {
        // Reduced motion has no radial intro execution. Its static Hero
        // endpoint is still an explicit post-paint presentation, so opt the
        // DOM texture in deliberately instead of relying on the hidden cold
        // startup fallback used by animated intro runs.
        root.style.setProperty('--r4-hero-back-ink-opacity', '1');
        renderHeroProgress(root, 1);
      } else {
        root.style.removeProperty('--r4-hero-back-ink-opacity');
      }
      const owner = storyRoot() ?? root;
      const playback = createPhoneFigurePlayback(
        figureVideo,
        HERO_FIGURE_PACKED_ALPHA_VIDEO
      );
      const parallax = reducedMotion
        ? undefined
        : attachPhoneDeviceParallax({
          root: owner,
          motionDriver,
          targets: [
            { element: backParallax, x: 7, y: 5 },
            { element: middleParallax, x: 14, y: 10 },
            { element: figureParallax, x: 22, y: 16 }
          ]
        });
      playbackRef.current = playback;
      parallaxRef.current = parallax;

      return () => {
        cancelled = true;
        adapterReadyRef.current = false;
        heroEntranceCompletedRef.current = false;
        heroPackedFramePresentedRef.current = false;
        packedAlphaPostPaintScheduledRef.current = false;
        presentationBindingRef.current = null;
        cancelEntrance();
        sceneActiveRef.current = false;
        parallax?.dispose();
        playback.dispose();
        releaseGpuOwners();
        if (parallaxRef.current === parallax) parallaxRef.current = undefined;
        if (playbackRef.current === playback) playbackRef.current = undefined;
      };
    }, [
      cancelEntrance,
      motionDriver,
      primeEntrance,
      reducedMotion,
      releaseGpuOwners,
      storyRoot
    ]);

    useLayoutEffect(() => {
      sceneActiveRef.current = active;
      rootRef.current?.setAttribute('data-phone-scene-active', String(active));
      if (active) {
        // `radialInkIntro.dispose()` clears the handoff property when Hero is
        // retired. A reverse route can reactivate the already-completed Hero
        // without replaying the one-shot entrance, so restore the authored
        // stable endpoint in the same activation commit rather than waiting
        // for a later scroll sample to call update().
        if (heroEntranceCompletedRef.current) {
          rootRef.current?.style.setProperty('--r4-hero-back-ink-opacity', '1');
        }
        ensurePackedSurface('forward');
        if (!reducedMotion && !heroEntranceCompletedRef.current) {
          void packedSurfaceRef.current?.(['prepare', 'forward', null, true, null])
            .catch(() => undefined);
        }
      } else {
        // A reduced/direct target can be admitted before the projector marks
        // it as the active front surface. Keep that exact presentation lease
        // alive until its raw frame is accepted; otherwise the next React
         // commit retires the freshly restored surface mid-admission.
        if (presentationBindingRef.current) {
          ensurePackedSurface('forward');
        } else {
          cancelEntrance();
          // Keep the full-motion surface-owned Canvas for the later reverse
          // leg, but retire its context so a downstream media group cannot
          // inherit a dormant WebGL owner. Reduced motion has no playback
          // lease to restore, so it uses a fresh static surface instead of
          // asking Safari to restore a deliberately lost context.
          if (reducedMotion) disposePackedSurface();
          else packedSurfaceRef.current?.(['retire']);
          introInkRef.current?.(['dispose']);
          introInkRef.current = undefined;
        }
      }
      playbackRef.current?.setActive(active && !reducedMotion);
    }, [
      active,
      cancelEntrance,
      ensurePackedSurface,
      ensureIntroInk,
      reducedMotion,
      releaseGpuOwners,
      disposePackedSurface
    ]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      update(rawProgress) {
        if (sceneActiveRef.current && heroEntranceCompletedRef.current) {
          rootRef.current?.style.setProperty('--r4-hero-back-ink-opacity', '1');
        }
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
        motionDriver.set(back, { scale: 1.08, yPercent: 0 });
        motionDriver.set(middle, { scale: 1 + progress * 0.18, yPercent: progress * 12 });
        motionDriver.set(figure, {
          scale: 1 + progress * 0.11,
          yPercent: -15 * range01(progress, 0.12, 1)
        });
        const copyProgress = range01(progress, 0.18, 1);
        motionDriver.set(copy, { y: -58 * copyProgress, opacity: 1 - copyProgress });
        motionDriver.set(subtitle, { y: -38 * copyProgress, opacity: 1 - copyProgress });
        motionDriver.set(cue, { y: -18 * progress, opacity: 1 - progress });
        motionDriver.set(vignette, { opacity: 1 - progress * 0.54 });
        playbackRef.current?.scrub(progress);
      },
      presentPresentation(token, report) {
        presentationBindingRef.current = {
          token,
          report,
          frameSequence: 0,
          scheduled: false
        };
        const surface = ensurePackedSurface('forward');
        surface?.(['present', phoneRuntimePresentationTokenKey(token)]);
        requestPresentedHeroFrame();
      },
      disposePresentation(token) {
        const binding = presentationBindingRef.current;
        if (
          binding
          && binding.token.authorityId === token.authorityId
          && binding.token.sessionId === token.sessionId
          && binding.token.generation === token.generation
          && binding.token.leg === token.leg
          && binding.token.revision === token.revision
          && binding.token.subject === token.subject
          && binding.token.kind === token.kind
        ) presentationBindingRef.current = null;
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
        releaseGpuOwners();
        playbackRef.current?.setActive(false);
      }
    }), [
      cancelEntrance,
      completeEntrance,
      ensurePackedSurface,
      motionDriver,
      reducedMotion,
      releaseGpuOwners,
      disposePackedSurface,
      requestPresentedHeroFrame,
      startEntrance
    ]);

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
              <img
                ref={middleImageRef}
                className="portrait-scroll-spike__hero-middle"
                src={HERO_MIDDLE_IMAGE}
                alt=""
              />
            </div>
          </div>
        </div>
        <div ref={figureMotionRef} className="portrait-scroll-spike__hero-figure-motion" aria-hidden="true">
          <div ref={figureParallaxRef} className="portrait-scroll-spike__hero-figure-parallax">
          <div
            ref={figureIntroRef}
            className="portrait-scroll-spike__hero-figure-intro"
          >
              <img
                ref={figurePosterRef}
                className="portrait-scroll-spike__hero-figure-poster"
                data-portrait-figure-poster
                src={HERO_FIGURE_POSTER}
                decoding="async"
                alt=""
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
