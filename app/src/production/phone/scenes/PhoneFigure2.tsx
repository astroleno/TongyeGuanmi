import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import {
  createPhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceMode,
  type PhonePackedAlphaSurface
} from './phone-packed-alpha-surface';
import {
  disposeFigure2Media,
  ensureFigure2HoldFrame,
  figure2AnimationScene,
  parkFigure2Media,
  renderFigure2AnimationProgress
} from '../../../scenes/figure2-animation';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../types';
import { phoneMediaUrlFor } from '../phone-media';
import './PhoneFigure2.css';

const Figure2Surface = figure2AnimationScene.Component;
const FIGURE2_PACKED_ALPHA_VIDEO = phoneMediaUrlFor(
  'figure2-pair-packed',
  'figure2-animation'
);
const FIGURE2_POSTER_IMAGE = phoneMediaUrlFor(
  'figure2-pair-poster',
  'figure2-animation'
);
const FIGURE2_ENDPOINT_SECONDS = 2.6;

/** Phone composition for the canonical Figure2 media/camera owner. */
export const PhoneFigure2 = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneFigure2({ active, onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const packedSurfaceRef = useRef<PhonePackedAlphaSurface | undefined>(undefined);
  const mediaControllerRef = useRef<AbortController | undefined>(undefined);
  const sceneActiveRef = useRef(false);
  const scrollProgressRef = useRef(0);
  const scrollDirectionRef = useRef<1 | -1>(1);
  const releasePackedSurface = useCallback(() => {
    const root = rootRef.current;
    mediaControllerRef.current?.abort();
    mediaControllerRef.current = undefined;
    packedSurfaceRef.current?.(['release']);
    if (root) parkFigure2Media(root);
  }, []);
  const ensurePackedSurface = useCallback((
    mode: PhonePackedAlphaSurfaceMode = 'forward'
  ) => {
    const root = rootRef.current;
    const video = root?.querySelector<HTMLVideoElement>(
      '[data-figure2-combined-video]'
    );
    const canvas = root?.querySelector<HTMLCanvasElement>(
      '[data-figure2-packed-alpha-canvas]'
    );
    const container = video?.parentElement;
    if (!root || !video || !canvas || !container) return undefined;
    const controller = new AbortController();
    mediaControllerRef.current?.abort();
    mediaControllerRef.current = controller;
    const surface = packedSurfaceRef.current ?? createPhonePackedAlphaSurface([
      root,
      container,
      canvas,
      video,
      FIGURE2_PACKED_ALPHA_VIDEO,
      FIGURE2_ENDPOINT_SECONDS,
      'phoneFigure2Alpha',
      'figure2-pair',
      'r4-figure2__packed-alpha-canvas',
      null,
      () => {
        video.dataset.phoneFigure2Alpha = 'verified';
        canvas.dataset.phoneFigure2Alpha = 'verified';
      }
    ]);
    packedSurfaceRef.current = surface;
    surface(['activate', mode]);
    if (root.dataset.phoneFigure2Alpha === 'awaiting-native-playback') {
      root.dataset.phoneFigure2Alpha = 'probing';
      video.dataset.phoneFigure2Alpha = 'probing';
    } else if (root.dataset.phoneFigure2Alpha === 'static-fallback') {
      root.dataset.phoneFigure2Alpha = 'poster-fallback';
      video.dataset.phoneFigure2Alpha = 'poster-fallback';
    }
    void ensureFigure2HoldFrame(root, controller.signal)
      .then(() => {
        if (!controller.signal.aborted && !sceneActiveRef.current) {
          parkFigure2Media(root);
        }
      }).catch(() => undefined);
    return surface;
  }, []);
  const setSceneActive = useCallback((active: boolean) => {
    const root = rootRef.current;
    if (!root || sceneActiveRef.current === active) return;
    sceneActiveRef.current = active;
    if (!active) {
      releasePackedSurface();
    }
  }, [releasePackedSurface]);
  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'stage') {
      rootRef.current = element?.closest<HTMLElement>('[data-r4-scene="figure2-animation"]') ?? null;
    }
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const video = root.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
    const canvas = root.querySelector<HTMLCanvasElement>('[data-figure2-packed-alpha-canvas]');
    if (!video || !canvas) {
      if (import.meta.env.DEV) root.dataset.phoneFigure2Ready = 'failed';
      return;
    }
    root.style.setProperty(
      '--phone-figure2-poster-image',
      `url(${JSON.stringify(FIGURE2_POSTER_IMAGE)})`
    );
    /*
     * Scene/transition readiness must never depend on Safari producing a
     * decoded WebGL video frame. The transparent opening poster is the visual
     * fallback; packed video upgrades it asynchronously when decoding works.
     */
    if (import.meta.env.DEV) root.dataset.phoneFigure2Ready = 'true';
    onReady?.();
    return () => {
      releasePackedSurface();
      packedSurfaceRef.current?.(['dispose']);
      packedSurfaceRef.current = undefined;
      disposeFigure2Media(root);
      root.style.removeProperty('--phone-figure2-poster-image');
      delete root.dataset.phoneFigure2Alpha;
      if (import.meta.env.DEV) delete root.dataset.phoneFigure2Ready;
      delete video.dataset.phoneFigure2Alpha;
      delete canvas.dataset.phoneFigure2Alpha;
    };
  }, [onReady, releasePackedSurface]);

  /*
   * Active is a decoder / packed-alpha resource lease only. The authority
   * projector owns the root role, visibility, z-index, and endpoint coverage.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    setSceneActive(active);
    if (!root) return;
    if (active) root.removeAttribute('aria-hidden');
    else root.setAttribute('aria-hidden', 'true');
  }, [active, setSceneActive]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    async prepareTargetPresentation({ progress, signal }) {
      const mode = progress >= 0.999 ? 'endpoint' : 'forward';
      const surface = ensurePackedSurface(mode);
      if (!surface) {
        throw new Error('Figure2 presentation unavailable');
      }
      await surface(['prepare', mode, signal]);
    },
    update(progress) {
      if (progress > scrollProgressRef.current) {
        scrollDirectionRef.current = 1;
      } else if (progress < scrollProgressRef.current) {
        scrollDirectionRef.current = -1;
      }
      scrollProgressRef.current = progress;
      ensurePackedSurface();
      renderFigure2AnimationProgress(rootRef.current, progress, {
        videoMode: 'seek',
        mediaRun: {
          runId: 'f2',
          direction: scrollDirectionRef.current
        }
      });
    },
    enter() {
      setSceneActive(true);
      rootRef.current?.removeAttribute('aria-hidden');
    },
    leave() {
      setSceneActive(false);
      rootRef.current?.setAttribute('aria-hidden', 'true');
    },
    reverse() {
      setSceneActive(true);
      rootRef.current?.removeAttribute('aria-hidden');
    },
    dispose() {
      releasePackedSurface();
      packedSurfaceRef.current?.(['dispose']);
      packedSurfaceRef.current = undefined;
      disposeFigure2Media(rootRef.current);
    }
  }), [ensurePackedSurface, releasePackedSurface, setSceneActive]);

  return (
    <Figure2Surface
      scene="figure2-animation"
      hidden={false}
      registerHandle={registerHandle}
    />
  );
});

export default PhoneFigure2;
