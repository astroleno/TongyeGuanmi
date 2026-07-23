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
import { CRANE_VIDEO_END_SECONDS, craneAnimationScene } from '..';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import { dispatchPhoneLabContactAutoplay } from '../../../production/phone/phone-lab-contact-timeline';
import { phoneMediaUrlFor } from '../../../production/phone/phone-media';
import {
  createPhonePackedAlphaSurface,
  releasePhonePackedAlphaWhenHidden,
  type PhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceMode
} from '../../../production/phone/scenes/phone-packed-alpha-surface';
import {
  createPhoneCraneForwardRun,
  createPhoneCranePresentedReverse,
  phoneCraneVideos,
  type PhoneCraneForwardRun,
  type PhoneCranePresentedReverse
} from './PhoneCrane.autoplay';
import {
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  phoneCranePresentationProgress,
  renderPhoneCranePresentation,
  type PhoneCranePlaybackDirection
} from './PhoneCrane.motion';
import {
  PHONE_CRANE_TUNING_EVENT,
  PhoneCraneTuningBar
} from './PhoneCraneTuningBar';
import './PhoneCrane.css';

const PHONE_CRANE_FIGURE_PACKED = phoneMediaUrlFor(
  'crane-figure-packed',
  'crane-animation'
);
const PHONE_CRANE_FLOCK_PACKED = phoneMediaUrlFor(
  'crane-flock-packed',
  'crane-animation'
);
export const PHONE_CRANE_FLOCK_HQ_CANDIDATE_PATH =
  '/qa-media/crane-flock-motion-rgb-alpha-hq-candidate.mp4';

export function phoneCraneFlockPackedUrlFor(
  search: string,
  development: boolean
): string {
  return development && new URLSearchParams(search).get('v') === '36'
    ? PHONE_CRANE_FLOCK_HQ_CANDIDATE_PATH
    : PHONE_CRANE_FLOCK_PACKED;
}
// Retained endpoints are the terminal frames used by the desktop sequence.
// The previous intermediate seeks visibly froze both motion layers.
const PHONE_CRANE_FIGURE_ENDPOINT_SECONDS = CRANE_VIDEO_END_SECONDS;
const PHONE_CRANE_FLOCK_ENDPOINT_SECONDS = CRANE_VIDEO_END_SECONDS;
const PHONE_CRANE_REVERSE_READY_TIMEOUT_MS = 700;

export {
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  phoneCranePresentationProgress,
  renderPhoneCranePresentation
} from './PhoneCrane.motion';

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="crane-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="crane-animation"]') ?? null;
}

export function parkPhoneCraneMedia(root: HTMLElement | null | undefined): void {
  const section = rootFor(root);
  for (const video of phoneCraneVideos(section)) {
    if (!video) continue;
    disposeTimelineVideoDriver(video);
    video.pause();
  }
  if (section?.dataset.phoneCraneMedia !== 'fallback') {
    section?.setAttribute('data-phone-crane-media', 'parked');
  }
}

export function applyPhoneCraneMediaFallback(
  root: HTMLElement | null | undefined
): void {
  const section = rootFor(root);
  renderPhoneCranePresentation(section, 0);
  for (const video of phoneCraneVideos(section)) {
    if (!video) continue;
    disposeTimelineVideoDriver(video);
    video.pause();
    video.setAttribute('data-phone-crane-media', 'fallback');
  }
  section?.setAttribute('data-phone-crane-media', 'fallback');
}

/** Crane reuses AOD's native-clock/snap policy with two staggered owners. */
export const PhoneCrane = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneCrane({ onReady, reducedMotion }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const figureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const flockCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [figureCanvasHost, setFigureCanvasHost] = useState<HTMLElement | null>(null);
  const [flockCanvasHost, setFlockCanvasHost] = useState<HTMLElement | null>(null);
  const forwardRunRef = useRef<PhoneCraneForwardRun | null>(null);
  const reversePlaybackRef = useRef<PhoneCranePresentedReverse | null>(null);
  const packedSurfacesRef = useRef<readonly [
    PhonePackedAlphaSurface,
    PhonePackedAlphaSurface
  ] | null>(null);
  const cancelPackedReleaseRef = useRef<(() => void) | null>(null);
  const requestedDirectionRef = useRef<PhoneCranePlaybackDirection | null>(null);
  const reverseStartTimerRef = useRef(0);
  const reverseStartedRef = useRef(false);

  const clearReverseStartTimer = useCallback(() => {
    if (!reverseStartTimerRef.current) return;
    window.clearTimeout(reverseStartTimerRef.current);
    reverseStartTimerRef.current = 0;
  }, []);

  const beginPreparedReverse = useCallback((force = false) => {
    const root = rootRef.current;
    if (
      !root
      || requestedDirectionRef.current !== -1
      || reverseStartedRef.current
    ) return;
    const reverseSurfacesReady = (
      root.dataset.phoneCraneFigureAlpha === 'verified'
      && root.dataset.phoneCraneFlockAlpha === 'verified'
      && figureCanvasRef.current?.dataset.packedAlphaFrameReady === 'true'
      && flockCanvasRef.current?.dataset.packedAlphaFrameReady === 'true'
    );
    if (!force && !reverseSurfacesReady) return;
    clearReverseStartTimer();
    reverseStartedRef.current = true;
    root.dataset.phoneCraneAutoplay = 'playing-reverse';
    reversePlaybackRef.current?.start();
    dispatchPhoneLabContactAutoplay(root, {
      scene: 'crane-animation',
      phase: 'playing',
      direction: -1
    });
  }, [clearReverseStartTimer]);

  const ensurePackedSurfaces = useCallback((mode: PhonePackedAlphaSurfaceMode) => {
    const root = rootRef.current;
    const [figure, flock] = phoneCraneVideos(root);
    const figureContainer = figure?.parentElement;
    const flockContainer = flock?.parentElement;
    const figureCanvas = figureCanvasRef.current;
    const flockCanvas = flockCanvasRef.current;
    if (
      !root
      || !figure
      || !flock
      || !figureContainer
      || !flockContainer
      || !figureCanvas
      || !flockCanvas
    ) return;
    const flockPackedSource = phoneCraneFlockPackedUrlFor(
      typeof window === 'undefined' ? '' : window.location.search,
      import.meta.env.DEV
    );
    root.dataset.phoneCraneFlockPackedSource =
      flockPackedSource === PHONE_CRANE_FLOCK_HQ_CANDIDATE_PATH
        ? 'hq-candidate-1280x720'
        : 'baseline-704x396';
    cancelPackedReleaseRef.current?.();
    cancelPackedReleaseRef.current = null;
    if (!packedSurfacesRef.current) {
      const figureSurface = createPhonePackedAlphaSurface({
        root,
        container: figureContainer,
        canvas: figureCanvas,
        video: figure,
        packedSourceUrl: PHONE_CRANE_FIGURE_PACKED,
        endpointSeconds: PHONE_CRANE_FIGURE_ENDPOINT_SECONDS,
        statusDataset: 'phoneCraneFigureAlpha',
        layerName: 'crane-figure',
        canvasClassName: 'crane-figure-video phone-crane__figure-canvas',
        onFrame: () => {
          figure.dataset.timelineVideoFrameReady = 'true';
          root.dataset.phoneCraneMedia = figure.paused ? 'ready' : 'playing';
          beginPreparedReverse();
        }
      });
      const flockSurface = createPhonePackedAlphaSurface({
        root,
        container: flockContainer,
        canvas: flockCanvas,
        video: flock,
        packedSourceUrl: flockPackedSource,
        endpointSeconds: PHONE_CRANE_FLOCK_ENDPOINT_SECONDS,
        statusDataset: 'phoneCraneFlockAlpha',
        layerName: 'crane-flock',
        canvasClassName: 'crane-figure-video crane-figure-video--front phone-crane__flock-canvas',
        onFrame: () => {
          flock.dataset.timelineVideoFrameReady = 'true';
          root.dataset.phoneCraneMedia = flock.paused ? 'ready' : 'playing';
          beginPreparedReverse();
        }
      });
      packedSurfacesRef.current = [figureSurface, flockSurface];
    }
    for (const surface of packedSurfacesRef.current) surface.activate(mode);
  }, [beginPreparedReverse]);

  const render = useCallback((
    rawProgress: number,
    direction: PhoneCranePlaybackDirection = 1
  ) => {
    const progress = phoneCranePresentationProgress(rawProgress, reducedMotion);
    renderPhoneCranePresentation(
      rootRef.current,
      progress,
      direction
    );
    dispatchPhoneLabContactAutoplay(rootRef.current, {
      scene: 'crane-animation',
      phase: 'progress',
      direction,
      progress
    });
  }, [reducedMotion]);

  const completeRun = useCallback((direction: PhoneCranePlaybackDirection) => {
    const root = rootRef.current;
    clearReverseStartTimer();
    reverseStartedRef.current = false;
    requestedDirectionRef.current = null;
    root?.setAttribute(
      'data-phone-crane-autoplay',
      direction === 1 ? 'complete-forward' : 'complete-reverse'
    );
    root?.setAttribute(
      'data-phone-crane-state',
      direction === 1 ? 'endpoint' : 'opening'
    );
    if (root) {
      dispatchPhoneLabContactAutoplay(root, {
        scene: 'crane-animation',
        phase: 'complete',
        direction
      });
    }
  }, [clearReverseStartTimer]);

  const startRun = useCallback((direction: PhoneCranePlaybackDirection) => {
    const root = rootRef.current;
    if (!root) return;
    requestedDirectionRef.current = direction;
    root.setAttribute(
      'data-phone-crane-autoplay',
      direction === 1 ? 'starting-forward' : 'starting-reverse'
    );
    dispatchPhoneLabContactAutoplay(root, {
      scene: 'crane-animation',
      phase: 'start',
      direction
    });
    if (reducedMotion) {
      render(
        direction === 1 ? PHONE_CRANE_STABLE_HOLD_PROGRESS : 0,
        direction
      );
      completeRun(direction);
      return;
    }
    if (direction === 1) {
      clearReverseStartTimer();
      reverseStartedRef.current = false;
      reversePlaybackRef.current?.stop();
      ensurePackedSurfaces('forward');
      forwardRunRef.current?.start();
    } else {
      forwardRunRef.current?.stop();
      clearReverseStartTimer();
      reverseStartedRef.current = false;
      root.dataset.phoneCraneAutoplay = 'preparing-reverse';
      ensurePackedSurfaces('endpoint');
      if (reverseStartedRef.current) return;
      const [figureCanvas, flockCanvas] = [
        figureCanvasRef.current,
        flockCanvasRef.current
      ];
      if (
        root.dataset.phoneCraneFigureAlpha === 'verified'
        && root.dataset.phoneCraneFlockAlpha === 'verified'
        && figureCanvas?.dataset.packedAlphaFrameReady === 'true'
        && flockCanvas?.dataset.packedAlphaFrameReady === 'true'
      ) {
        beginPreparedReverse();
      } else {
        reverseStartTimerRef.current = window.setTimeout(
          () => beginPreparedReverse(true),
          PHONE_CRANE_REVERSE_READY_TIMEOUT_MS
        );
      }
    }
  }, [
    beginPreparedReverse,
    clearReverseStartTimer,
    completeRun,
    ensurePackedSurfaces,
    reducedMotion,
    render
  ]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !figureCanvasRef.current || !flockCanvasRef.current) return;
    render(0);
    ensurePackedSurfaces(reducedMotion ? 'endpoint' : 'forward');
    const forwardRun = createPhoneCraneForwardRun(
      root,
      render,
      () => {
        // AOD leaves its persistent Canvas on the last decoded frame. Keep
        // the same decoder/WebGL pair alive until the stage is fully hidden;
        // replacing it with a newly sought endpoint can freeze physical iOS.
        render(PHONE_CRANE_STABLE_HOLD_PROGRESS, 1);
        root.dataset.phoneCraneMedia = 'stable-endpoint';
        completeRun(1);
      },
      () => {
        applyPhoneCraneMediaFallback(root);
        completeRun(1);
      },
      () => {
        dispatchPhoneLabContactAutoplay(root, {
          scene: 'crane-animation',
          phase: 'playing',
          direction: 1
        });
      }
    );
    if (!forwardRun) {
      applyPhoneCraneMediaFallback(root);
      onReady?.();
      return;
    }
    const reversePlayback = createPhoneCranePresentedReverse(
      root,
      render,
      () => completeRun(-1),
      () => {
        applyPhoneCraneMediaFallback(root);
        completeRun(-1);
      }
    );
    forwardRunRef.current = forwardRun;
    reversePlaybackRef.current = reversePlayback;
    root.dataset.phoneCraneLifecycle = 'ready';
    const requestedDirection = requestedDirectionRef.current;
    if (requestedDirection !== null) startRun(requestedDirection);
    onReady?.();

    return () => {
      forwardRun.dispose();
      reversePlayback.dispose();
      clearReverseStartTimer();
      reverseStartedRef.current = false;
      cancelPackedReleaseRef.current?.();
      cancelPackedReleaseRef.current = null;
      for (const surface of packedSurfacesRef.current ?? []) surface.dispose();
      packedSurfacesRef.current = null;
      if (forwardRunRef.current === forwardRun) forwardRunRef.current = null;
      if (reversePlaybackRef.current === reversePlayback) reversePlaybackRef.current = null;
      parkPhoneCraneMedia(root);
      delete root.dataset.phoneCraneLifecycle;
      delete root.dataset.phoneCraneAutoplay;
      delete root.dataset.phoneCraneFlockPackedSource;
    };
  }, [
    completeRun,
    clearReverseStartTimer,
    ensurePackedSurfaces,
    figureCanvasHost,
    flockCanvasHost,
    onReady,
    reducedMotion,
    render,
    startRun
  ]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const renderTunedOpeningCamera = () => {
      const progress = Number(root.dataset.phoneCraneProgress);
      renderPhoneCranePresentation(
        root,
        Number.isFinite(progress) ? progress : 0,
        root.dataset.cranePlaybackDirection === '-1' ? -1 : 1
      );
    };
    root.addEventListener(PHONE_CRANE_TUNING_EVENT, renderTunedOpeningCamera);
    return () => {
      root.removeEventListener(
        PHONE_CRANE_TUNING_EVENT,
        renderTunedOpeningCamera
      );
    };
  }, [figureCanvasHost, flockCanvasHost]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(progress) {
      requestedDirectionRef.current = null;
      clearReverseStartTimer();
      reverseStartedRef.current = false;
      forwardRunRef.current?.stop();
      reversePlaybackRef.current?.stop();
      if (progress >= 0.999) {
        ensurePackedSurfaces('endpoint');
        render(PHONE_CRANE_STABLE_HOLD_PROGRESS);
      } else {
        ensurePackedSurfaces('forward');
        render(progress);
      }
    },
    enter() {
      rootRef.current?.removeAttribute('aria-hidden');
      rootRef.current?.setAttribute('data-phone-crane-state', 'entered');
      startRun(1);
    },
    leave() {
      requestedDirectionRef.current = null;
      clearReverseStartTimer();
      reverseStartedRef.current = false;
      forwardRunRef.current?.stop();
      reversePlaybackRef.current?.stop();
      parkPhoneCraneMedia(rootRef.current);
      rootRef.current?.setAttribute('data-phone-crane-state', 'parked');
      const root = rootRef.current;
      if (root) {
        cancelPackedReleaseRef.current?.();
        cancelPackedReleaseRef.current = releasePhonePackedAlphaWhenHidden(
          root,
          () => {
            for (const surface of packedSurfacesRef.current ?? []) surface.release();
          }
        );
      }
    },
    reverse() {
      rootRef.current?.setAttribute('data-phone-crane-state', 'reversing');
      startRun(-1);
    },
    dispose() {
      requestedDirectionRef.current = null;
      clearReverseStartTimer();
      reverseStartedRef.current = false;
      forwardRunRef.current?.dispose();
      reversePlaybackRef.current?.dispose();
      cancelPackedReleaseRef.current?.();
      cancelPackedReleaseRef.current = null;
      for (const surface of packedSurfacesRef.current ?? []) surface.dispose();
      packedSurfacesRef.current = null;
      parkPhoneCraneMedia(rootRef.current);
    }
  }), [clearReverseStartTimer, ensurePackedSurfaces, render, startRun]);

  const CraneSurface = craneAnimationScene.Component;
  const showAcceptanceTuning =
    typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('v') === '36';
  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'stage') rootRef.current = element;
    if (!element) return;
    if (name === 'figure-video') {
      const host = element.parentElement;
      setFigureCanvasHost((current) => current === host ? current : host);
    }
    if (name === 'flock-video') {
      const host = element.parentElement;
      setFlockCanvasHost((current) => current === host ? current : host);
    }
  }, []);
  return (
    <>
      <div
        className="phone-crane"
        data-phone-scene="crane-animation"
        data-phone-input-owner="none"
        aria-hidden="true"
      >
        <CraneSurface
          scene={craneAnimationScene.id}
          hidden={false}
          registerHandle={registerHandle}
        />
      </div>
      {figureCanvasHost ? createPortal(
        <canvas
          ref={figureCanvasRef}
          className="crane-figure-video phone-crane__figure-canvas"
          data-phone-packed-alpha-canvas="crane-figure"
          aria-hidden="true"
        />,
        figureCanvasHost
      ) : null}
      {flockCanvasHost ? createPortal(
        <canvas
          ref={flockCanvasRef}
          className="crane-figure-video crane-figure-video--front phone-crane__flock-canvas"
          data-phone-packed-alpha-canvas="crane-flock"
          aria-hidden="true"
        />,
        flockCanvasHost
      ) : null}
      {showAcceptanceTuning ? createPortal(
        <PhoneCraneTuningBar />,
        document.body
      ) : null}
    </>
  );
});

export default PhoneCrane;
