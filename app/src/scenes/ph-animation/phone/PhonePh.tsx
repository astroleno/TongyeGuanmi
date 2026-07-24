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
import {
  createPhoneNativeAutoplay,
  type PhoneNativeAutoplay
} from '../../../production/phone/phone-native-autoplay';
import { dispatchPhoneLabContactAutoplay } from '../../../production/phone/phone-lab-contact-timeline';
import { phoneMediaUrlFor } from '../../../production/phone/phone-media';
import {
  createPhonePackedAlphaSurface,
  releasePhonePackedAlphaWhenHidden,
  type PhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceMode
} from '../../../production/phone/scenes/phone-packed-alpha-surface';
import { usePhoneCinematicRun } from '../../../production/phone/scenes/usePhoneCinematicRun';
import {
  PHONE_PH_FIGURE_END_SECONDS,
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
const PH_MEDIA_KEY = 'ph-figure-motion';
const PH_BG_SRC = new URL(
  '../../../../../assets/ph_background.webp',
  import.meta.url
).href;
const PH_FRONT_SRC = new URL(
  '../../../../../assets/ph_front-alpha.webp',
  import.meta.url
).href;
const PH_FIGURE_VIDEO_SRC = new URL(
  '../../../../../assets/ph-figure-motion.webm',
  import.meta.url
).href;
const PH_FIGURE_HEVC_ALPHA_SRC = new URL(
  '../../../../../assets/ph-figure-motion-hevc-alpha.mp4',
  import.meta.url
).href;
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
  const video = section?.querySelector<HTMLVideoElement>(
    '[data-ph-alpha-video]'
  );
  if (video) {
    disposeTimelineVideoDriver(video);
    video.pause();
  }
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
    const [figureCanvasHost, setFigureCanvasHost] =
      useState<HTMLElement | null>(null);
    const nativeAutoplayRef = useRef<PhoneNativeAutoplay | null>(null);
    const reversePlaybackRef = useRef<PhonePhPresentedReverse | null>(null);
    const packedSurfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
    const cancelPackedReleaseRef = useRef<(() => void) | null>(null);
    const beginPreparedReverseRef = useRef<(force?: boolean) => void>(
      () => undefined
    );

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
          endpointSeconds: PHONE_PH_FIGURE_END_SECONDS,
          statusDataset: 'phonePhAlpha',
          layerName: 'ph-figure',
          canvasClassName: 'ph-layer ph-layer--figure phone-ph__figure-canvas',
          onFrame: () => {
            video.dataset.timelineVideoFrameReady = 'true';
            root.dataset.phonePhMedia = video.paused ? 'ready' : 'playing';
            beginPreparedReverseRef.current?.();
          }
        });
      }
      packedSurfaceRef.current.activate(mode);
    }, []);

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

    const reverseReady = useCallback(() => {
      const root = rootRef.current;
      return root?.dataset.phonePhAlpha === 'verified'
        && figureCanvasRef.current?.dataset.packedAlphaFrameReady === 'true';
    }, []);
    const beforeForward = useCallback(() => {
      const root = rootRef.current;
      const video = root?.querySelector<HTMLVideoElement>(
        '[data-ph-alpha-video]'
      );
      if (video) disposeTimelineVideoDriver(video);
      root?.style.setProperty('--ph-video-opacity', '1');
    }, []);
    const beforeReverse = useCallback(() => {
      const root = rootRef.current;
      root?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]')?.pause();
    }, []);
    const run = usePhoneCinematicRun({
      scene: 'ph-animation',
      stateKey: 'ph',
      rootRef,
      forwardRef: nativeAutoplayRef,
      reverseRef: reversePlaybackRef,
      reducedMotion,
      terminalProgress: 1,
      reverseTimeoutMs: PHONE_PH_REVERSE_READY_TIMEOUT_MS,
      reverseReady,
      activateSurface: ensurePackedSurface,
      render,
      beforeForward,
      beforeReverse
    });
    beginPreparedReverseRef.current = run.beginPreparedReverse;

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
        durationSeconds: PHONE_PH_FIGURE_END_SECONDS,
        onProgress: (progress) => render(
          phonePhTimelineProgressForMediaProgress(progress),
          1
        ),
        onComplete: () => run.completeRun(1),
        onFailure: () => {
          applyPhonePhMediaFallback(root);
          run.completeRun(1);
        },
        onFrameReady: () => {
          root.dataset.phonePhMedia = 'decoding';
          run.publishPlaying();
        }
      });
      const reversePlayback = createPhonePhPresentedReverse(
        root,
        render,
        () => run.completeRun(-1),
        () => {
          applyPhonePhMediaFallback(root);
          run.completeRun(-1);
        }
      );
      nativeAutoplayRef.current = nativeAutoplay;
      reversePlaybackRef.current = reversePlayback;
      root.dataset.phonePhLifecycle = 'ready';
      const requestedDirection = run.requestedRef.current;
      if (requestedDirection !== null) run.startRun(requestedDirection);
      onReady?.();

      return () => {
        nativeAutoplay.dispose();
        reversePlayback?.dispose();
        run.stopRun();
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
      ensurePackedSurface,
      figureCanvasHost,
      onReady,
      render,
      run
    ]);

    useEffect(() => {
      const root = rootRef.current;
      if (root) root.dataset.phonePhActive = String(active);
    }, [active]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      update(progress) {
        run.stopRun();
        ensurePackedSurface(progress >= 0.999 ? 'endpoint' : 'forward');
        render(progress);
      },
      enter() {
        rootRef.current?.removeAttribute('aria-hidden');
        rootRef.current?.setAttribute('data-phone-ph-state', 'entered');
        run.startRun(1);
      },
      leave() {
        run.stopRun();
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
        run.startRun(-1);
      },
      dispose() {
        run.disposeRun();
        cancelPackedReleaseRef.current?.();
        cancelPackedReleaseRef.current = null;
        packedSurfaceRef.current?.dispose();
        packedSurfaceRef.current = null;
        parkPhonePhMedia(rootRef.current);
      }
    }), [ensurePackedSurface, render, run]);

    return (
      <>
        <div
          className="phone-ph"
          data-phone-scene="ph-animation"
          data-phone-input-owner="none"
          aria-hidden="true"
        >
          <article
            ref={rootRef}
            className="ph-page r4-ph-animation"
            data-r4-scene="ph-animation"
            data-ph-stage
            aria-label="Pythagoreans Hymn visual scene"
          >
            <div className="ph-scroll">
              <div className="ph-sticky">
                <div className="ph-field">
                  <img className="ph-bg" src={PH_BG_SRC} alt="" aria-hidden="true" />
                  <div className="ph-paper" aria-hidden="true" />
                  <div className="ph-sun-wash" aria-hidden="true" />
                  <div className="ph-layer-stack" aria-hidden="true">
                    <img
                      className="ph-layer ph-layer--front"
                      src={PH_FRONT_SRC}
                      alt=""
                    />
                    <video
                      ref={(element) => {
                        const host = element?.parentElement ?? null;
                        setFigureCanvasHost((current) => (
                          current === host ? current : host
                        ));
                      }}
                      className="ph-layer ph-layer--figure"
                      data-ph-alpha-video
                      data-media-key={PH_MEDIA_KEY}
                      muted
                      preload="auto"
                      playsInline
                    >
                      <AlphaVideoSources
                        webm={PH_FIGURE_VIDEO_SRC}
                        hevc={PH_FIGURE_HEVC_ALPHA_SRC}
                      />
                    </video>
                  </div>
                  <div className="ph-edge-light" aria-hidden="true" />
                  <div className="ph-texture" aria-hidden="true" />
                  <div className="ph-progress" aria-hidden="true"><span /></div>
                </div>
              </div>
            </div>
          </article>
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
