import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import {
  parkPhMedia,
  PH_FRONT_SRC,
  PH_FIGURE_END_SECONDS,
  phAnimationScene
} from '..';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import {
  createPhoneNativeAutoplay,
  type PhoneNativeAutoplay
} from '../../../production/phone/phone-native-autoplay';
import { dispatchPhoneLabContactAutoplay } from '../../../production/phone/phone-lab-contact-timeline';
import { phoneMediaUrlFor } from '../../../media/phone-media';
import {
  createPhonePackedAlphaSurface,
  releasePhonePackedAlphaWhenHidden,
  type PhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceMode
} from '../../../media/phone-packed-alpha-surface';
import {
  phonePhTimelineProgressForMediaProgress,
  renderPhonePhPresentation,
  type PhonePhPlaybackDirection
} from './PhonePh.motion';
import {
  createPhonePhPresentedReverse,
  type PhonePhPresentedReverse
} from './PhonePh.reverse';
import './PhonePh.css';

const PHONE_PH_REVERSE_READY_TIMEOUT_MS = 650;
const PHONE_PH_PACKED_VIDEO = phoneMediaUrlFor('ph-figure-packed', 'ph-animation');

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ph-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]') ?? null;
}

export {
  phonePhForegroundParallaxY,
  phonePhPresentationProgress,
  phonePhTimelineProgressForMediaProgress,
  renderPhonePhPresentation
} from './PhonePh.motion';

/** Figure2-style stable surface: media failure cannot remove the PH camera. */
export function applyPhonePhMediaFallback(
  root: HTMLElement | null | undefined
): void {
  const section = rootFor(root);
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  if (video) {
    disposeTimelineVideoDriver(video);
    video.pause();
  }
  section?.setAttribute('data-phone-ph-media', 'fallback');
  video?.setAttribute('data-phone-ph-media', 'fallback');
  renderPhonePhPresentation(section, 0);
}

export function parkPhonePhMedia(root: HTMLElement | null | undefined): void {
  const section = rootFor(root);
  parkPhMedia(section);
  if (section?.dataset.phonePhMedia !== 'fallback') {
    section?.setAttribute('data-phone-ph-media', 'parked');
  }
}

/**
 * Figure2 supplies the stable phone composition; AOD supplies time ownership.
 * The canonical PH video remains the only media element and native currentTime
 * drives every forward presentation sample after the scroll snap begins.
 */
export const PhonePh = forwardRef<PhoneSceneAdapterHandle, PhoneSceneAdapterProps>(
  function PhonePh({ active, onReady, reducedMotion }, forwardedRef) {
    const rootRef = useRef<HTMLElement | null>(null);
    const figureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [figureCanvasHost, setFigureCanvasHost] = useState<HTMLElement | null>(null);
    const nativeAutoplayRef = useRef<PhoneNativeAutoplay | null>(null);
    const reversePlaybackRef = useRef<PhonePhPresentedReverse | null>(null);
    const packedSurfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
    const cancelPackedReleaseRef = useRef<(() => void) | null>(null);
    const requestedDirectionRef = useRef<PhonePhPlaybackDirection | null>(null);
    const reverseStartTimerRef = useRef(0);
    const reverseStartedRef = useRef(false);

    const clearReverseStartTimer = useCallback(() => {
      if (!reverseStartTimerRef.current) return;
      window.clearTimeout(reverseStartTimerRef.current);
      reverseStartTimerRef.current = 0;
    }, []);

    const beginPreparedReverse = useCallback(() => {
      const root = rootRef.current;
      if (
        !root
        || requestedDirectionRef.current !== -1
        || reverseStartedRef.current
      ) return;
      clearReverseStartTimer();
      reverseStartedRef.current = true;
      root.dataset.phonePhAutoplay = 'playing-reverse';
      reversePlaybackRef.current?.start();
      dispatchPhoneLabContactAutoplay(root, {
        scene: 'ph-animation',
        phase: 'playing',
        direction: -1
      });
    }, [clearReverseStartTimer]);

    const ensurePackedSurface = useCallback((mode: PhonePackedAlphaSurfaceMode) => {
      const root = rootRef.current;
      const video = root?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
      const container = root?.querySelector<HTMLElement>('.ph-layer-stack');
      const canvas = figureCanvasRef.current;
      if (!root || !video || !container || !canvas) return;
      cancelPackedReleaseRef.current?.();
      cancelPackedReleaseRef.current = null;
      if (!packedSurfaceRef.current) {
        packedSurfaceRef.current = createPhonePackedAlphaSurface({
          root,
          container,
          canvas,
          video,
          packedSourceUrl: PHONE_PH_PACKED_VIDEO,
          endpointSeconds: PH_FIGURE_END_SECONDS,
          statusDataset: 'phonePhAlpha',
          layerName: 'ph-figure',
          canvasClassName: 'ph-layer ph-layer--figure phone-ph__figure-canvas',
          onFrame: () => {
            video.dataset.timelineVideoFrameReady = 'true';
            root.dataset.phonePhMedia = video.paused ? 'ready' : 'playing';
            beginPreparedReverse();
          }
        });
      }
      packedSurfaceRef.current.activate(mode);
    }, [beginPreparedReverse]);

    const render = useCallback((
      rawProgress: number,
      direction: PhonePhPlaybackDirection = 1
    ) => {
      const state = renderPhonePhPresentation(
        rootRef.current,
        rawProgress,
        direction,
        reducedMotion
      );
      if (rootRef.current) {
        dispatchPhoneLabContactAutoplay(rootRef.current, {
          scene: 'ph-animation',
          phase: 'progress',
          direction,
          progress: state.progress
        });
      }
    }, [reducedMotion]);

    const completeRun = useCallback((direction: PhonePhPlaybackDirection) => {
      const root = rootRef.current;
      clearReverseStartTimer();
      reverseStartedRef.current = false;
      requestedDirectionRef.current = null;
      root?.setAttribute(
        'data-phone-ph-autoplay',
        direction === 1 ? 'complete-forward' : 'complete-reverse'
      );
      root?.setAttribute(
        'data-phone-ph-state',
        direction === 1 ? 'endpoint' : 'opening'
      );
      if (root) {
        dispatchPhoneLabContactAutoplay(root, {
          scene: 'ph-animation',
          phase: 'complete',
          direction
        });
      }
    }, [clearReverseStartTimer]);

    const startRun = useCallback((direction: PhonePhPlaybackDirection) => {
      const root = rootRef.current;
      if (!root) return;
      requestedDirectionRef.current = direction;
      root.setAttribute(
        'data-phone-ph-autoplay',
        direction === 1 ? 'starting-forward' : 'starting-reverse'
      );
      dispatchPhoneLabContactAutoplay(root, {
        scene: 'ph-animation',
        phase: 'start',
        direction
      });
      if (reducedMotion) {
        render(direction === 1 ? 1 : 0, direction);
        completeRun(direction);
        return;
      }
      if (direction === 1) {
        clearReverseStartTimer();
        reverseStartedRef.current = false;
        reversePlaybackRef.current?.stop();
        ensurePackedSurface('forward');
        const video = root.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
        if (video) disposeTimelineVideoDriver(video);
        root.style.setProperty('--ph-video-opacity', '1');
        nativeAutoplayRef.current?.start();
      } else {
        nativeAutoplayRef.current?.stop();
        root.querySelector<HTMLVideoElement>('[data-ph-alpha-video]')?.pause();
        clearReverseStartTimer();
        reverseStartedRef.current = false;
        root.dataset.phonePhAutoplay = 'preparing-reverse';
        ensurePackedSurface('endpoint');
        if (reverseStartedRef.current) return;
        const canvas = figureCanvasRef.current;
        if (
          root.dataset.phonePhAlpha === 'verified'
          && canvas?.dataset.packedAlphaFrameReady === 'true'
        ) {
          beginPreparedReverse();
        } else {
          reverseStartTimerRef.current = window.setTimeout(
            beginPreparedReverse,
            PHONE_PH_REVERSE_READY_TIMEOUT_MS
          );
        }
      }
    }, [
      beginPreparedReverse,
      clearReverseStartTimer,
      completeRun,
      ensurePackedSurface,
      reducedMotion,
      render
    ]);

    useEffect(() => {
      const root = rootRef.current;
      const video = root?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
      if (!root || !video || !figureCanvasRef.current) return;

      // Retire the canonical cold-frame driver before native Route-B playback
      // takes ownership. This is the same one-owner boundary used by AOD.
      disposeTimelineVideoDriver(video);
      root.style.setProperty(
        '--phone-ph-island-source',
        `url("${PH_FRONT_SRC}")`
      );
      renderPhonePhPresentation(root, 0);
      ensurePackedSurface(reducedMotion ? 'endpoint' : 'forward');
      const nativeAutoplay = createPhoneNativeAutoplay(video, {
        runIdPrefix: 'phone-ph-figure',
        durationSeconds: PH_FIGURE_END_SECONDS,
        onProgress: (progress) => render(
          phonePhTimelineProgressForMediaProgress(progress),
          1
        ),
        onComplete: () => completeRun(1),
        onFailure: () => {
          applyPhonePhMediaFallback(root);
          completeRun(1);
        },
        onFrameReady: () => {
          root.dataset.phonePhMedia = 'decoding';
          dispatchPhoneLabContactAutoplay(root, {
            scene: 'ph-animation',
            phase: 'playing',
            direction: 1
          });
        }
      });
      const reversePlayback = createPhonePhPresentedReverse(
        root,
        render,
        () => completeRun(-1),
        () => {
          applyPhonePhMediaFallback(root);
          completeRun(-1);
        }
      );
      nativeAutoplayRef.current = nativeAutoplay;
      reversePlaybackRef.current = reversePlayback;
      root.dataset.phonePhLifecycle = 'ready';
      const requestedDirection = requestedDirectionRef.current;
      if (requestedDirection !== null) startRun(requestedDirection);
      onReady?.();

      return () => {
        nativeAutoplay.dispose();
        reversePlayback?.dispose();
        clearReverseStartTimer();
        reverseStartedRef.current = false;
        cancelPackedReleaseRef.current?.();
        cancelPackedReleaseRef.current = null;
        packedSurfaceRef.current?.dispose();
        packedSurfaceRef.current = null;
        if (nativeAutoplayRef.current === nativeAutoplay) nativeAutoplayRef.current = null;
        if (reversePlaybackRef.current === reversePlayback) reversePlaybackRef.current = null;
        parkPhonePhMedia(root);
        delete video.dataset.timelineVideoFrameReady;
        delete root.dataset.phonePhLifecycle;
        delete root.dataset.phonePhAutoplay;
        root.style.removeProperty('--phone-ph-island-source');
      };
    }, [
      clearReverseStartTimer,
      completeRun,
      ensurePackedSurface,
      figureCanvasHost,
      onReady,
      render,
      startRun
    ]);

    useEffect(() => {
      const root = rootRef.current;
      if (root) root.dataset.phonePhActive = String(active);
    }, [active]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      update(progress) {
        requestedDirectionRef.current = null;
        clearReverseStartTimer();
        reverseStartedRef.current = false;
        nativeAutoplayRef.current?.stop();
        reversePlaybackRef.current?.stop();
        ensurePackedSurface(progress >= 0.999 ? 'endpoint' : 'forward');
        render(progress);
      },
      enter() {
        rootRef.current?.removeAttribute('aria-hidden');
        rootRef.current?.setAttribute('data-phone-ph-state', 'entered');
        startRun(1);
      },
      leave() {
        requestedDirectionRef.current = null;
        clearReverseStartTimer();
        reverseStartedRef.current = false;
        nativeAutoplayRef.current?.stop();
        reversePlaybackRef.current?.stop();
        parkPhonePhMedia(rootRef.current);
        rootRef.current?.setAttribute('data-phone-ph-state', 'parked');
        const root = rootRef.current;
        if (root) {
          cancelPackedReleaseRef.current?.();
          cancelPackedReleaseRef.current = releasePhonePackedAlphaWhenHidden(
            root,
            () => packedSurfaceRef.current?.release()
          );
        }
      },
      reverse() {
        rootRef.current?.setAttribute('data-phone-ph-state', 'reversing');
        startRun(-1);
      },
      dispose() {
        requestedDirectionRef.current = null;
        clearReverseStartTimer();
        reverseStartedRef.current = false;
        nativeAutoplayRef.current?.dispose();
        reversePlaybackRef.current?.dispose();
        cancelPackedReleaseRef.current?.();
        cancelPackedReleaseRef.current = null;
        packedSurfaceRef.current?.dispose();
        packedSurfaceRef.current = null;
        parkPhonePhMedia(rootRef.current);
      }
    }), [clearReverseStartTimer, ensurePackedSurface, render, startRun]);

    const PhSurface = phAnimationScene.Component;
    const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
      if (name === 'field') rootRef.current = element;
      if (name !== 'figure-video' || !element) return;
      const host = element.parentElement;
      setFigureCanvasHost((current) => current === host ? current : host);
    }, []);

    return (
      <>
        <div
          className="phone-ph"
          data-phone-scene="ph-animation"
          data-phone-input-owner="none"
          aria-hidden="true"
        >
          <PhSurface
            scene={phAnimationScene.id}
            hidden={false}
            registerHandle={registerHandle}
          />
        </div>
        {figureCanvasHost ? createPortal(
          <canvas
            ref={figureCanvasRef}
            className="ph-layer ph-layer--figure phone-ph__figure-canvas"
            data-phone-packed-alpha-canvas="ph-figure"
            aria-hidden="true"
          />,
          figureCanvasHost
        ) : null}
      </>
    );
  }
);

export default PhonePh;
