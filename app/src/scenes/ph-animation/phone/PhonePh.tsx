import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { AlphaVideoSources } from '../../../media/alpha-video-sources';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import type {
  PhoneCinematicSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import type { PhoneExecutionToken } from '../../../production/phone/phone-story/runtime';
import {
  createPhoneNativeAutoplay,
  type PhoneNativeAutoplay
} from '../../../production/phone/phone-native-autoplay';
import { phoneMediaUrlFor } from '../../../production/phone/phone-media';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../../../production/phone/phone-story/runtime';
import type { TargetPresentationRequest } from '../../../story/presentation';
import {
  createPhonePackedAlphaSurface,
  type PhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceMode
} from '../../../production/phone/scenes/phone-packed-alpha-surface';
import {
  noopPhoneCinematicFactReporter,
  usePhoneCinematicRun
} from '../../../production/phone/scenes/usePhoneCinematicRun';
import {
  PHONE_PH_FIGURE_END_SECONDS,
  phonePhRootFor,
  phonePhTimelineProgressForMediaProgress,
  renderPhonePhPresentation,
  type PhonePhPlaybackDirection
} from './PhonePh.motion';
import {
  createPhonePhPresentedReverse,
  type PhonePhPresentedReverse
} from './PhonePh.reverse';
import './PhonePh.css';

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
  const section = phonePhRootFor(root);
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
  const section = phonePhRootFor(root);
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
export const PhonePh = forwardRef<PhoneCinematicSceneAdapterHandle, PhoneSceneAdapterProps>(
  function PhonePh({
    active,
    onReady,
    onCinematicFact,
    reducedMotion
  }, forwardedRef) {
    const rootRef = useRef<HTMLElement | null>(null);
    const layerStackRef = useRef<HTMLDivElement | null>(null);
    const nativeAutoplayRef = useRef<PhoneNativeAutoplay | null>(null);
    const reversePlaybackRef = useRef<PhonePhPresentedReverse | null>(null);
    const packedSurfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
    const presentationBindingRef = useRef<Readonly<{
      token: PresentationToken;
      key: string;
      frameSequence: number;
      report: (frame: PhoneRenderedPresentationFrame) => void;
    }> | null>(null);
    const beginPreparedReverseRef = useRef<(force?: boolean) => void>(
      () => undefined
    );
    const presentedFrameRef = useRef<(presentationKey: string | null) => void>(
      () => undefined
    );
    const reportPresentationFrame = useCallback((presentationKey: string | null) => {
      const binding = presentationBindingRef.current;
      if (!binding || binding.key !== presentationKey) return;
      const next = {
        ...binding,
        frameSequence: binding.frameSequence + 1
      };
      presentationBindingRef.current = next;
      next.report({
        token: next.token,
        frameSequence: next.frameSequence,
        observedAt: typeof performance !== 'undefined'
          && typeof performance.now === 'function'
          ? performance.now()
          : 0
      });
    }, []);

    const ensurePackedSurface = useCallback((
      mode: PhonePackedAlphaSurfaceMode
    ): PhonePackedAlphaSurface | null => {
      const root = rootRef.current;
      const video = root?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
      const container = root?.querySelector<HTMLElement>('.ph-layer-stack');
      if (!root || !video || !container) return null;
      if (!packedSurfaceRef.current) {
        packedSurfaceRef.current = createPhonePackedAlphaSurface([
          root,
          container,
          video,
          PHONE_PH_PACKED_VIDEO,
          PHONE_PH_FIGURE_END_SECONDS,
          'phonePhAlpha',
          'ph-figure',
          'ph-layer ph-layer--figure phone-ph__figure-canvas',
          null,
          (presentationKey) => {
            video.dataset.timelineVideoFrameReady = 'true';
            root.dataset.phonePhMedia = video.paused ? 'ready' : 'playing';
            beginPreparedReverseRef.current?.();
            presentedFrameRef.current?.(presentationKey);
            reportPresentationFrame(presentationKey);
          }
        ]);
      }
      packedSurfaceRef.current(['activate', mode]);
      return packedSurfaceRef.current;
    }, [reportPresentationFrame]);

    const renderPresentation = useCallback((
      rawProgress: number,
      direction: PhonePhPlaybackDirection = 1
    ) => {
      renderPhonePhPresentation(
        rootRef.current,
        rawProgress,
        direction,
        reducedMotion
      );
    }, [reducedMotion]);

    const presentPreparedFrame = useCallback((token: PresentationToken) => {
      // A retained endpoint is not evidence for the newly active media token.
      // Ask its mounted compositor for one real draw after token installation.
      const surface = packedSurfaceRef.current;
      surface?.(['present', phoneRuntimePresentationTokenKey(token)]);
    }, []);

    const reverseReady = useCallback(() => {
      const root = rootRef.current;
      // The packed surface is the sole Canvas owner. Its root status is set
      // by the compositor's real draw callback and cleared on release; the
      // leaf must not rediscover or mutate a Canvas node behind that owner.
      return root?.dataset.phonePhAlpha === 'verified';
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
    const [
      requestedRef,
      beginPreparedReverse,
      completeRun,
      failRun,
      publishPlaying,
      publishPresentedFrame,
      renderProgress,
      startRun,
      stopRun,
      disposeRun
    ] = usePhoneCinematicRun([
      'ph-animation',
      rootRef,
      nativeAutoplayRef,
      reversePlaybackRef,
      reducedMotion,
      1,
      reverseReady,
      ensurePackedSurface,
      renderPresentation,
      presentPreparedFrame,
      beforeForward,
      beforeReverse,
      onCinematicFact ?? noopPhoneCinematicFactReporter
    ]);
    beginPreparedReverseRef.current = beginPreparedReverse;
    presentedFrameRef.current = publishPresentedFrame;

    useEffect(() => {
      const root = rootRef.current;
      const video = root?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
      if (!root || !video) return;

      // Retire the canonical cold-frame driver before native Route-B playback
      // takes ownership. This is the same one-owner boundary used by AOD.
      disposeTimelineVideoDriver(video);
      root.style.setProperty(
        '--phone-ph-island-source',
        `url("${PH_FRONT_SRC}")`
      );
      renderPhonePhPresentation(root, 0);
      const nativeAutoplay = createPhoneNativeAutoplay(video, {
        runIdPrefix: 'phone-ph-figure',
        durationSeconds: PHONE_PH_FIGURE_END_SECONDS,
        onProgress: (progress) => renderProgress(
          phonePhTimelineProgressForMediaProgress(progress),
          1
        ),
        onComplete: () => completeRun(1),
        onFailure: () => {
          root.dataset.phonePhMedia = 'retryable-failure';
          failRun(1);
        },
        onFrameReady: () => {
          root.dataset.phonePhMedia = 'decoding';
          publishPlaying();
        }
      });
      const reversePlayback = createPhonePhPresentedReverse(
        root,
        renderProgress,
        () => completeRun(-1),
        () => {
          root.dataset.phonePhMedia = 'retryable-failure';
          failRun(-1);
        }
      );
      nativeAutoplayRef.current = nativeAutoplay;
      reversePlaybackRef.current = reversePlayback;
      if (import.meta.env.DEV) root.dataset.phonePhLifecycle = 'ready';
      const requestedDirection = requestedRef.current;
      if (requestedDirection !== null) startRun(requestedDirection);
      onReady?.();

      return () => {
        nativeAutoplay.dispose();
        reversePlayback?.dispose();
        stopRun();
        packedSurfaceRef.current?.(['dispose']);
        packedSurfaceRef.current = null;
        if (nativeAutoplayRef.current === nativeAutoplay) nativeAutoplayRef.current = null;
        if (reversePlaybackRef.current === reversePlayback) reversePlaybackRef.current = null;
        parkPhonePhMedia(root);
        delete video.dataset.timelineVideoFrameReady;
        if (import.meta.env.DEV) delete root.dataset.phonePhLifecycle;
        root.style.removeProperty('--phone-ph-island-source');
      };
    }, [
      ensurePackedSurface,
      presentPreparedFrame,
      onReady,
      renderPresentation,
      requestedRef,
      completeRun,
      failRun,
      publishPlaying,
      renderProgress,
      startRun,
      stopRun
    ]);

    useEffect(() => {
      const root = rootRef.current;
      if (root && import.meta.env.DEV) {
        root.dataset.phonePhActive = String(active);
      }
    }, [active]);

    useEffect(() => {
      if (active) return;

      // Keep the adapter mounted for token re-binding, but retire the packed
      // decoder/context once it is no longer the admitted visual owner. The
      // surface retains its Canvas owner and restores that same context on a
      // later reverse admission; recreating a new surface on every round is
      // what made cumulative WebKit context creation exceed the route cap.
      stopRun();
      if (presentationBindingRef.current) {
        packedSurfaceRef.current?.(['release']);
      } else {
        packedSurfaceRef.current?.(['retire']);
      }
      parkPhonePhMedia(rootRef.current);
    }, [active, stopRun]);

    const prepareTargetPresentation = useCallback(async (
      request: TargetPresentationRequest
    ): Promise<void> => {
      const root = rootRef.current;
      if (!root) throw new Error('PH target root unavailable');
      if (reducedMotion) {
        renderPresentation(request.progress);
        return;
      }
      const mode: PhonePackedAlphaSurfaceMode =
        request.progress >= 0.999 || request.direction === -1
          ? 'endpoint'
          : 'forward';
      root.dataset.phonePhMedia = 'preparing-target';
      const video = root.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
      video?.removeAttribute('data-phone-ph-media');
      const surface = ensurePackedSurface(mode);
      if (!surface) throw new Error('PH packed-alpha surface unavailable');
      try {
        await surface([
          'prepare',
          mode,
          request.signal,
          request.directEntry === true,
          phoneRuntimePresentationTokenKey(request.presentationToken as PresentationToken)
        ]);
      } catch (error) {
        root.dataset.phonePhMedia = 'retryable-failure';
        throw error;
      }
      if (request.signal.aborted) {
        throw new DOMException('PH target preparation aborted', 'AbortError');
      }
      renderPresentation(request.progress, request.direction);
      root.dataset.phonePhMedia = 'ready';
    }, [ensurePackedSurface, reducedMotion, renderPresentation]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      effectRoot: () => layerStackRef.current,
      play(direction: 1 | -1, request?: PhoneExecutionToken) {
        rootRef.current?.removeAttribute('aria-hidden');
        startRun(direction, request ?? null);
      },
      presentPresentation(token, report) {
        const key = phoneRuntimePresentationTokenKey(token);
        presentationBindingRef.current = {
          token,
          key,
          frameSequence: 0,
          report
        };
        const surface = packedSurfaceRef.current ?? ensurePackedSurface('forward');
        surface?.(['present', key]);
      },
      disposePresentation(token) {
        const binding = presentationBindingRef.current;
        if (
          binding
          && binding.key === phoneRuntimePresentationTokenKey(token)
        ) presentationBindingRef.current = null;
      },
      prepareTargetPresentation,
      dispose() {
        presentationBindingRef.current = null;
        disposeRun();
        packedSurfaceRef.current?.(['dispose']);
        packedSurfaceRef.current = null;
        parkPhonePhMedia(rootRef.current);
      }
    }), [
      ensurePackedSurface,
      prepareTargetPresentation,
      startRun,
      disposeRun
    ]);

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
                  <div
                    ref={layerStackRef}
                    className="ph-layer-stack"
                    aria-hidden="true"
                  >
                    <img
                      className="ph-layer ph-layer--front"
                      src={PH_FRONT_SRC}
                      alt=""
                    />
                    <video
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
      </>
    );
  }
);

export default PhonePh;
