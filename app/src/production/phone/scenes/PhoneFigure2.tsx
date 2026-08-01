import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import {
  createPackedAlphaVideoCompositor,
  setPackedAlphaVideoSource,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';
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
import { phoneMediaUrlFor } from '../../../media/phone-media';
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
const FIGURE2_PACKED_FRAME_TIMEOUT_MS = 3000;

/** Phone composition for the canonical Figure2 media/camera owner. */
export const PhoneFigure2 = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneFigure2({ onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const compositorRef = useRef<PackedAlphaVideoCompositor | undefined>(undefined);
  const sceneActiveRef = useRef(false);
  const setSceneActive = useCallback((active: boolean) => {
    const root = rootRef.current;
    if (!root) return;
    if (!active) {
      compositorRef.current?.setActive(false);
      parkFigure2Media(root);
    }
    sceneActiveRef.current = active;
    root.dataset.phoneFigure2Active = String(active);
    if (active) {
      compositorRef.current?.setActive(true);
    }
  }, []);
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
      root.dataset.phoneFigure2Ready = 'failed';
      return;
    }
    root.dataset.phoneFigure2Active = 'false';
    const controller = new AbortController();
    let packedFrameTimeout = 0;
    root.style.setProperty(
      '--phone-figure2-poster-image',
      `url(${JSON.stringify(FIGURE2_POSTER_IMAGE)})`
    );
    const poster = new Image();
    poster.decoding = 'async';
    poster.src = FIGURE2_POSTER_IMAGE;
    void poster.decode().then(() => {
      if (!controller.signal.aborted) {
        root.dataset.phoneFigure2PosterReady = 'true';
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        root.dataset.phoneFigure2PosterReady = 'failed';
      }
    });

    const compositor = createPackedAlphaVideoCompositor({
      video,
      canvas,
      onFrame: () => {
        if (video.dataset.packedAlphaSource !== 'rgb-alpha-side-by-side') return;
        if (packedFrameTimeout) window.clearTimeout(packedFrameTimeout);
        video.dataset.phoneFigure2Alpha = 'verified';
        canvas.dataset.phoneFigure2Alpha = 'verified';
        root.dataset.phoneFigure2Alpha = 'verified';
      }
    });
    compositorRef.current = compositor;
    compositor.setActive(sceneActiveRef.current);

    const compositorStatus = canvas.dataset.packedAlphaStatus;
    const packedCompositorAvailable = compositorStatus !== 'webgl-unavailable'
      && compositorStatus !== 'setup-failed';
    if (packedCompositorAvailable) {
      root.dataset.phoneFigure2Alpha = 'probing';
      video.dataset.phoneFigure2Alpha = 'probing';
      setPackedAlphaVideoSource(video, FIGURE2_PACKED_ALPHA_VIDEO);
      packedFrameTimeout = window.setTimeout(() => {
        if (root.dataset.phoneFigure2Alpha === 'verified') return;
        root.dataset.phoneFigure2Alpha = 'poster-fallback';
        video.dataset.phoneFigure2Alpha = 'poster-fallback';
      }, FIGURE2_PACKED_FRAME_TIMEOUT_MS);
    } else {
      root.dataset.phoneFigure2Alpha = 'canonical-fallback';
    }

    /*
     * Scene/transition readiness must never depend on Safari producing a
     * decoded WebGL video frame. The transparent opening poster is the visual
     * fallback; packed video upgrades it asynchronously when decoding works.
     */
    root.dataset.phoneFigure2Ready = 'true';
    onReady?.();
    void ensureFigure2HoldFrame(root, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        root.dataset.phoneFigure2MediaReady = 'true';
        if (!sceneActiveRef.current) {
          parkFigure2Media(root);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          root.dataset.phoneFigure2MediaReady = 'poster-fallback';
        }
      });
    return () => {
      controller.abort();
      if (packedFrameTimeout) window.clearTimeout(packedFrameTimeout);
      compositor.dispose();
      disposeFigure2Media(root);
      if (compositorRef.current === compositor) compositorRef.current = undefined;
      root.style.removeProperty('--phone-figure2-poster-image');
      delete root.dataset.phoneFigure2Alpha;
      delete root.dataset.phoneFigure2Ready;
      delete root.dataset.phoneFigure2MediaReady;
      delete root.dataset.phoneFigure2PosterReady;
      delete root.dataset.phoneFigure2Active;
      delete video.dataset.phoneFigure2Alpha;
      delete canvas.dataset.phoneFigure2Alpha;
    };
  }, [onReady]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(progress) {
      renderFigure2AnimationProgress(rootRef.current, progress, {
        videoMode: 'none'
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
      compositorRef.current?.dispose();
      disposeFigure2Media(rootRef.current);
    }
  }), [setSceneActive]);

  return (
    <Figure2Surface
      scene="figure2-animation"
      hidden={false}
      registerHandle={registerHandle}
    />
  );
});

export default PhoneFigure2;
