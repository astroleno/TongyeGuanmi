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
  createPhoneCraneReverseDissolve,
  phoneCraneVideos,
  type PhoneCraneForwardRun,
  type PhoneCraneReverseDissolve
} from './PhoneCrane.autoplay';
import {
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  phoneCranePresentationProgress,
  renderPhoneCranePresentation,
  type PhoneCranePlaybackDirection
} from './PhoneCrane.motion';
import './PhoneCrane.css';

const PHONE_CRANE_FIGURE_PACKED = phoneMediaUrlFor(
  'crane-figure-packed',
  'crane-animation'
);
const PHONE_CRANE_FLOCK_PACKED = phoneMediaUrlFor(
  'crane-flock-packed',
  'crane-animation'
);
// Retained endpoints are the terminal frames used by the desktop sequence.
// The previous intermediate seeks visibly froze both motion layers.
const PHONE_CRANE_FIGURE_ENDPOINT_SECONDS = CRANE_VIDEO_END_SECONDS;
const PHONE_CRANE_FLOCK_ENDPOINT_SECONDS = CRANE_VIDEO_END_SECONDS;

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
  const reverseDissolveRef = useRef<PhoneCraneReverseDissolve | null>(null);
  const packedSurfacesRef = useRef<readonly [
    PhonePackedAlphaSurface,
    PhonePackedAlphaSurface
  ] | null>(null);
  const cancelPackedReleaseRef = useRef<(() => void) | null>(null);
  const requestedDirectionRef = useRef<PhoneCranePlaybackDirection | null>(null);

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
        }
      });
      const flockSurface = createPhonePackedAlphaSurface({
        root,
        container: flockContainer,
        canvas: flockCanvas,
        video: flock,
        packedSourceUrl: PHONE_CRANE_FLOCK_PACKED,
        endpointSeconds: PHONE_CRANE_FLOCK_ENDPOINT_SECONDS,
        statusDataset: 'phoneCraneFlockAlpha',
        layerName: 'crane-flock',
        canvasClassName: 'crane-figure-video crane-figure-video--front phone-crane__flock-canvas',
        onFrame: () => {
          flock.dataset.timelineVideoFrameReady = 'true';
          root.dataset.phoneCraneMedia = flock.paused ? 'ready' : 'playing';
        }
      });
      packedSurfacesRef.current = [figureSurface, flockSurface];
    }
    for (const surface of packedSurfacesRef.current) surface.activate(mode);
  }, []);

  const render = useCallback((
    rawProgress: number,
    direction: PhoneCranePlaybackDirection = 1
  ) => {
    renderPhoneCranePresentation(
      rootRef.current,
      phoneCranePresentationProgress(rawProgress, reducedMotion),
      direction
    );
  }, [reducedMotion]);

  const completeRun = useCallback((direction: PhoneCranePlaybackDirection) => {
    const root = rootRef.current;
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
  }, []);

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
      reverseDissolveRef.current?.stop();
      ensurePackedSurfaces('forward');
      forwardRunRef.current?.start();
    } else {
      forwardRunRef.current?.stop();
      ensurePackedSurfaces('endpoint');
      reverseDissolveRef.current?.start();
      dispatchPhoneLabContactAutoplay(root, {
        scene: 'crane-animation',
        phase: 'playing',
        direction
      });
    }
  }, [completeRun, ensurePackedSurfaces, reducedMotion, render]);

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
    const reverseDissolve = createPhoneCraneReverseDissolve(
      render,
      () => completeRun(-1)
    );
    forwardRunRef.current = forwardRun;
    reverseDissolveRef.current = reverseDissolve;
    root.dataset.phoneCraneLifecycle = 'ready';
    const requestedDirection = requestedDirectionRef.current;
    if (requestedDirection !== null) startRun(requestedDirection);
    onReady?.();

    return () => {
      forwardRun.dispose();
      reverseDissolve.dispose();
      cancelPackedReleaseRef.current?.();
      cancelPackedReleaseRef.current = null;
      for (const surface of packedSurfacesRef.current ?? []) surface.dispose();
      packedSurfacesRef.current = null;
      if (forwardRunRef.current === forwardRun) forwardRunRef.current = null;
      if (reverseDissolveRef.current === reverseDissolve) reverseDissolveRef.current = null;
      parkPhoneCraneMedia(root);
      delete root.dataset.phoneCraneLifecycle;
      delete root.dataset.phoneCraneAutoplay;
    };
  }, [
    completeRun,
    ensurePackedSurfaces,
    figureCanvasHost,
    flockCanvasHost,
    onReady,
    reducedMotion,
    render,
    startRun
  ]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(progress) {
      requestedDirectionRef.current = null;
      forwardRunRef.current?.stop();
      reverseDissolveRef.current?.stop();
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
      forwardRunRef.current?.stop();
      reverseDissolveRef.current?.stop();
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
      forwardRunRef.current?.dispose();
      reverseDissolveRef.current?.dispose();
      cancelPackedReleaseRef.current?.();
      cancelPackedReleaseRef.current = null;
      for (const surface of packedSurfacesRef.current ?? []) surface.dispose();
      packedSurfacesRef.current = null;
      parkPhoneCraneMedia(rootRef.current);
    }
  }), [ensurePackedSurfaces, render, startRun]);

  const CraneSurface = craneAnimationScene.Component;
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
    </>
  );
});

export default PhoneCrane;
