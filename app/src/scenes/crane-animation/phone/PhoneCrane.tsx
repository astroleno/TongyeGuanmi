import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { AlphaVideoSources } from '../../../media/alpha-video-sources';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import { dispatchPhoneLabContactAutoplay } from '../../../production/phone/phone-lab-contact-timeline';
import { phoneMediaUrlFor } from '../../../production/phone/phone-media';
import type { TargetPresentationRequest } from '../../../story/presentation';
import {
  createPhonePackedAlphaSurface,
  type PhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceMode
} from '../../../production/phone/scenes/phone-packed-alpha-surface';
import { usePhoneCinematicRun } from '../../../production/phone/scenes/usePhoneCinematicRun';
import {
  createPhoneCraneForwardRun,
  createPhoneCranePresentedReverse,
  phoneCraneVideos,
  type PhoneCraneForwardRun,
  type PhoneCranePresentedReverse
} from './PhoneCrane.autoplay';
import {
  PHONE_CRANE_VIDEO_END_SECONDS as CRANE_VIDEO_END_SECONDS,
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  phoneCranePresentationProgress,
  renderPhoneCranePresentation,
  type PhoneCranePlaybackDirection
} from './PhoneCrane.motion';
import './PhoneCrane.css';

const CRANE_FIGURE_MEDIA_KEY = 'crane-figure-motion';
const CRANE_FLOCK_MEDIA_KEY = 'crane-flock-motion';
const CRANE_PAPER_SRC = new URL(
  '../../../../../assets/crane-paper.webp',
  import.meta.url
).href;
const CRANE_CLOUD_BACK_SRC = new URL(
  '../../../../../assets/crane1_cloud2-alpha.webp',
  import.meta.url
).href;
const CRANE_ARCH_SRC = new URL(
  '../../../../../assets/crane1_arch-alpha.webp',
  import.meta.url
).href;
const CRANE_CLOUD_FRONT_SRC = new URL(
  '../../../../../assets/crane1_cloud1-alpha.webp',
  import.meta.url
).href;
const CRANE_CLOUD_FRONT_SECOND_SRC = new URL(
  '../../../../../assets/crane1_cloud-front2-alpha.webp',
  import.meta.url
).href;
const CRANE_FIGURE_VIDEO_SRC = new URL(
  '../../../../../assets/crane-figure-motion.webm',
  import.meta.url
).href;
const CRANE_FIGURE_HEVC_ALPHA_SRC = new URL(
  '../../../../../assets/crane-figure-motion-hevc-alpha.mp4',
  import.meta.url
).href;
const CRANE_FLOCK_VIDEO_SRC = new URL(
  '../../../../../assets/crane-flock-motion.webm',
  import.meta.url
).href;
const CRANE_FLOCK_HEVC_ALPHA_SRC = new URL(
  '../../../../../assets/crane-flock-motion-hevc-alpha.mp4',
  import.meta.url
).href;
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
  const [figureCanvasHost, setFigureCanvasHost] =
    useState<HTMLElement | null>(null);
  const [flockCanvasHost, setFlockCanvasHost] =
    useState<HTMLElement | null>(null);
  const forwardRunRef = useRef<PhoneCraneForwardRun | null>(null);
  const reversePlaybackRef = useRef<PhoneCranePresentedReverse | null>(null);
  const packedSurfacesRef = useRef<readonly [
    PhonePackedAlphaSurface,
    PhonePackedAlphaSurface
  ] | null>(null);
  const beginPreparedReverseRef = useRef<(force?: boolean) => void>(
    () => undefined
  );

  const ensurePackedSurfaces = useCallback((
    mode: PhonePackedAlphaSurfaceMode
  ): readonly [PhonePackedAlphaSurface, PhonePackedAlphaSurface] | null => {
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
    ) return null;
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
          beginPreparedReverseRef.current?.();
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
          beginPreparedReverseRef.current?.();
        }
      });
      packedSurfacesRef.current = [figureSurface, flockSurface];
    }
    for (const surface of packedSurfacesRef.current) surface.activate(mode);
    return packedSurfacesRef.current;
  }, []);

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

  const reverseReady = useCallback(() => {
    const root = rootRef.current;
    return root?.dataset.phoneCraneFigureAlpha === 'verified'
      && root.dataset.phoneCraneFlockAlpha === 'verified'
      && figureCanvasRef.current?.dataset.packedAlphaFrameReady === 'true'
      && flockCanvasRef.current?.dataset.packedAlphaFrameReady === 'true';
  }, []);
  const run = usePhoneCinematicRun({
    scene: 'crane-animation',
    rootRef,
    forwardRef: forwardRunRef,
    reverseRef: reversePlaybackRef,
    reducedMotion,
    terminalProgress: PHONE_CRANE_STABLE_HOLD_PROGRESS,
    reverseTimeoutMs: PHONE_CRANE_REVERSE_READY_TIMEOUT_MS,
    reverseReady,
    activateSurface: ensurePackedSurfaces,
    render
  });
  beginPreparedReverseRef.current = run.beginPreparedReverse;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !figureCanvasRef.current || !flockCanvasRef.current) return;
    render(0);
    const forwardRun = createPhoneCraneForwardRun(
      root,
      render,
      () => {
        // AOD leaves its persistent Canvas on the last decoded frame. Keep
        // the same decoder/WebGL pair alive until the stage is fully hidden;
        // replacing it with a newly sought endpoint can freeze physical iOS.
        render(PHONE_CRANE_STABLE_HOLD_PROGRESS, 1);
        root.dataset.phoneCraneMedia = 'stable-endpoint';
        run.completeRun(1);
      },
      () => {
        root.dataset.phoneCraneMedia = 'retryable-failure';
        run.failRun(1);
      },
      run.publishPlaying
    );
    if (!forwardRun) {
      applyPhoneCraneMediaFallback(root);
      onReady?.();
      return;
    }
    const reversePlayback = createPhoneCranePresentedReverse(
      root,
      render,
      () => run.completeRun(-1),
      () => {
        root.dataset.phoneCraneMedia = 'retryable-failure';
        run.failRun(-1);
      }
    );
    forwardRunRef.current = forwardRun;
    reversePlaybackRef.current = reversePlayback;
    if (import.meta.env.DEV) root.dataset.phoneCraneLifecycle = 'ready';
    const requestedDirection = run.requestedRef.current;
    if (requestedDirection !== null) run.startRun(requestedDirection);
    onReady?.();

    return () => {
      forwardRun.dispose();
      reversePlayback.dispose();
      run.stopRun();
      for (const surface of packedSurfacesRef.current ?? []) surface.dispose();
      packedSurfacesRef.current = null;
      if (forwardRunRef.current === forwardRun) forwardRunRef.current = null;
      if (reversePlaybackRef.current === reversePlayback) reversePlaybackRef.current = null;
      parkPhoneCraneMedia(root);
      if (import.meta.env.DEV) delete root.dataset.phoneCraneLifecycle;
    };
  }, [
    ensurePackedSurfaces,
    figureCanvasHost,
    flockCanvasHost,
    onReady,
    reducedMotion,
    render,
    run
  ]);

  const prepareTargetPresentation = useCallback(async (
    request: TargetPresentationRequest
  ): Promise<void> => {
    const root = rootRef.current;
    if (!root) throw new Error('Crane target root unavailable');
    if (reducedMotion) {
      render(request.progress);
      return;
    }
    const mode: PhonePackedAlphaSurfaceMode =
      request.progress >= 0.999 || request.direction === -1
        ? 'endpoint'
        : 'forward';
    root.dataset.phoneCraneMedia = 'preparing-target';
    for (const video of phoneCraneVideos(root)) {
      video?.removeAttribute('data-phone-crane-media');
    }
    const surfaces = ensurePackedSurfaces(mode);
    if (!surfaces) throw new Error('Crane packed-alpha surfaces unavailable');
    try {
      await Promise.all(
        surfaces.map((surface) => surface.prepare(mode, request.signal))
      );
    } catch (error) {
      root.dataset.phoneCraneMedia = 'retryable-failure';
      throw error;
    }
    if (request.signal.aborted) {
      throw new DOMException('Crane target preparation aborted', 'AbortError');
    }
    render(request.progress, request.direction);
    root.dataset.phoneCraneMedia = 'ready';
  }, [ensurePackedSurfaces, reducedMotion, render]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(progress) {
      run.stopRun();
      render(progress >= 0.999 ? PHONE_CRANE_STABLE_HOLD_PROGRESS : progress);
    },
    enter() {
      rootRef.current?.removeAttribute('aria-hidden');
      run.startRun(1);
    },
    leave() {
      run.stopRun();
      parkPhoneCraneMedia(rootRef.current);
      for (const surface of packedSurfacesRef.current ?? []) surface.release();
    },
    reverse() {
      run.startRun(-1);
    },
    prepareTargetPresentation,
    dispose() {
      run.disposeRun();
      for (const surface of packedSurfacesRef.current ?? []) surface.dispose();
      packedSurfacesRef.current = null;
      parkPhoneCraneMedia(rootRef.current);
    }
  }), [ensurePackedSurfaces, prepareTargetPresentation, render, run]);

  return (
    <>
      <div
        className="phone-crane"
        data-phone-scene="crane-animation"
        data-phone-input-owner="none"
        aria-hidden="true"
      >
        <article
          ref={rootRef}
          className="crane-page r4-crane-animation"
          data-r4-scene="crane-animation"
          data-crane-stage
          aria-label="Crane visual transition scene"
        >
          <section className="crane-scroll" aria-hidden="true">
            <div className="crane-sticky">
              <div
                className="crane-field"
                style={{ backgroundImage: `url(${CRANE_PAPER_SRC})` }}
              >
                <div className="crane-paper" aria-hidden="true" />
                <div
                  className="crane-layer-stack"
                  data-transition-ghost="crane-motion"
                  aria-hidden="true"
                >
                  <img
                    className="crane-layer crane-layer--cloud-back"
                    src={CRANE_CLOUD_BACK_SRC}
                    alt=""
                  />
                  <div className="crane-video-transition crane-video-transition--figure">
                    <video
                      ref={(element) => {
                        const host = element?.parentElement ?? null;
                        setFigureCanvasHost((current) => (
                          current === host ? current : host
                        ));
                      }}
                      className="crane-figure-video"
                      data-crane-figure-video
                      data-media-key={CRANE_FIGURE_MEDIA_KEY}
                      muted
                      preload="auto"
                      playsInline
                    >
                      <AlphaVideoSources
                        webm={CRANE_FIGURE_VIDEO_SRC}
                        hevc={CRANE_FIGURE_HEVC_ALPHA_SRC}
                      />
                    </video>
                  </div>
                  <img
                    className="crane-layer crane-layer--arch"
                    src={CRANE_ARCH_SRC}
                    alt=""
                  />
                  <img
                    className="crane-layer crane-layer--cloud-front"
                    src={CRANE_CLOUD_FRONT_SRC}
                    alt=""
                  />
                  <img
                    className="crane-layer crane-layer--cloud-front-second"
                    src={CRANE_CLOUD_FRONT_SECOND_SRC}
                    alt=""
                  />
                  <div className="crane-video-transition crane-video-transition--front">
                    <video
                      ref={(element) => {
                        const host = element?.parentElement ?? null;
                        setFlockCanvasHost((current) => (
                          current === host ? current : host
                        ));
                      }}
                      className="crane-figure-video crane-figure-video--front"
                      data-crane-figure-front-video
                      data-media-key={CRANE_FLOCK_MEDIA_KEY}
                      muted
                      preload="auto"
                      playsInline
                    >
                      <AlphaVideoSources
                        webm={CRANE_FLOCK_VIDEO_SRC}
                        hevc={CRANE_FLOCK_HEVC_ALPHA_SRC}
                      />
                    </video>
                  </div>
                </div>
                <div className="crane-warmth" aria-hidden="true" />
                <div className="crane-center-wash" aria-hidden="true" />
                <div className="crane-texture" aria-hidden="true" />
              </div>
            </div>
          </section>
        </article>
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
