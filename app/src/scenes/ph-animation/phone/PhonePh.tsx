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

export function parkPhonePhMedia(
  root: HTMLElement | null | undefined,
  options: Readonly<{ disposeDriver?: boolean }> = {}
): void {
  const section = phonePhRootFor(root);
  const video = section?.querySelector<HTMLVideoElement>(
    '[data-ph-alpha-video]'
  );
  if (video && options.disposeDriver !== false) {
    disposeTimelineVideoDriver(video);
  }
  video?.pause();
  if (section?.dataset.phonePhMedia !== 'fallback') {
    section?.setAttribute('data-phone-ph-media', 'parked');
  }
}

export function phonePhPresentedFrameMatchesToken(
  presentedFrame: string | null,
  token: PresentationToken | null
): boolean {
  return token !== null
    && presentedFrame === phoneRuntimePresentationTokenKey(token);
}

/**
 * Figure2 supplies the stable phone composition; AOD supplies time ownership.
 * The canonical PH video remains the only media element and native currentTime
 * drives every forward presentation sample after the scroll snap begins.
 */
export const PhonePh = forwardRef<PhoneCinematicSceneAdapterHandle, PhoneSceneAdapterProps>(
  function PhonePh({
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
    const expectedReverseFrameRef = useRef<string | null>(null);
    const presentedReverseFrameRef = useRef<string | null>(null);
    const presentedReverseMediaTimeRef = useRef<number | null>(null);
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
          (presentationKey, mediaTime) => {
            video.dataset.timelineVideoFrameReady = 'true';
            root.dataset.phonePhMedia = video.paused ? 'ready' : 'playing';
            if (presentationKey === expectedReverseFrameRef.current) {
              presentedReverseFrameRef.current = presentationKey;
              presentedReverseMediaTimeRef.current = mediaTime;
            }
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
      const key = phoneRuntimePresentationTokenKey(token);
      expectedReverseFrameRef.current = key;
      if (presentedReverseFrameRef.current !== key) {
        presentedReverseFrameRef.current = null;
        presentedReverseMediaTimeRef.current = null;
        surface?.(['present', key]);
      }
    }, []);

    const reverseReady = useCallback((token: PresentationToken | null) => {
      return expectedReverseFrameRef.current !== null
        && phonePhPresentedFrameMatchesToken(
          presentedReverseFrameRef.current,
          token
        );
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

    type LifecycleTuple = readonly [
      typeof completeRun,
      typeof failRun,
      typeof onReady,
      typeof publishPlaying,
      typeof renderProgress,
      typeof startRun,
      typeof stopRun
    ];
    const lifecycleRef = useRef<LifecycleTuple>([
      completeRun,
      failRun,
      onReady,
      publishPlaying,
      renderProgress,
      startRun,
      stopRun
    ] as LifecycleTuple);
    lifecycleRef.current = [
      completeRun,
      failRun,
      onReady,
      publishPlaying,
      renderProgress,
      startRun,
      stopRun
    ] as LifecycleTuple;

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
         onProgress: (progress) => lifecycleRef.current[4](
           phonePhTimelineProgressForMediaProgress(progress),
           1
         ),
         onComplete: () => lifecycleRef.current[0](1),
         onFailure: () => {
           root.dataset.phonePhMedia = 'retryable-failure';
           lifecycleRef.current[1](1);
         },
         onFrameReady: () => {
           root.dataset.phonePhMedia = 'decoding';
           lifecycleRef.current[3]();
         }
       });
       const reversePlayback = createPhonePhPresentedReverse(
         root,
         (progress, direction) => lifecycleRef.current[4](progress, direction),
         () => {
           lifecycleRef.current[0](-1);
         },
         () => {
           root.dataset.phonePhMedia = 'retryable-failure';
           lifecycleRef.current[1](-1);
         },
        (mediaTime) => packedSurfaceRef.current?.(['frame', mediaTime]) === true,
        () => presentedReverseMediaTimeRef.current
      );
       nativeAutoplayRef.current = nativeAutoplay;
       reversePlaybackRef.current = reversePlayback;
       const requestedDirection = requestedRef.current;
       if (requestedDirection !== null) lifecycleRef.current[5](requestedDirection);
       lifecycleRef.current[2]?.();

      return () => {
        expectedReverseFrameRef.current = null;
        presentedReverseFrameRef.current = null;
        presentedReverseMediaTimeRef.current = null;
        nativeAutoplay.dispose();
        reversePlayback?.dispose();
        lifecycleRef.current[6]();
        packedSurfaceRef.current?.(['dispose']);
        packedSurfaceRef.current = null;
        if (nativeAutoplayRef.current === nativeAutoplay) nativeAutoplayRef.current = null;
        if (reversePlaybackRef.current === reversePlayback) reversePlaybackRef.current = null;
        // A dependency refresh can run this cleanup while the same DOM root
        // is immediately being rebound to a new immutable execution. Keep
        // the shared timeline driver alive in that case; the next lifecycle
        // setup retires the old driver before installing its native owner.
        parkPhonePhMedia(root, { disposeDriver: !root.isConnected });
        delete video.dataset.timelineVideoFrameReady;
        root.style.removeProperty('--phone-ph-island-source');
      };
    }, []);

    // `active` is a render projection, not a lifecycle fact. During a lazy
    // composite handoff it can briefly fall behind the machine-owned source
    // role while reverse preparation is already decoding the next exact
    // frame. Retiring the decoder from that transient boolean removes its
    // source and turns the still-valid token into a stale frame. The runner
    // owns stop/retire at the transaction boundary; this leaf keeps its one
    // packed surface alive until explicit dispose/unmount.

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
      const presentationKey = phoneRuntimePresentationTokenKey(request.presentationToken as PresentationToken);
      if (mode === 'endpoint') {
        // Arm the reverse identity before endpoint preparation. If the exact
        // rVFC-backed draw arrives during preparation, it is the same frame
        // that startRun(-1) will consume; do not force a second fallback draw
        // merely because the reverse player has not started yet.
        expectedReverseFrameRef.current = presentationKey;
        presentedReverseFrameRef.current = null;
      }
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
          presentationKey
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
        expectedReverseFrameRef.current = null;
        presentedReverseFrameRef.current = null;
        presentedReverseMediaTimeRef.current = null;
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
