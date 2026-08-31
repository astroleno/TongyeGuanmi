import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { AlphaVideoSources } from '../../../media/alpha-video-sources';
import { primePhoneNativeVideo } from '../../../media/phone-native-video-prime';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS,
  type TimelineVideoDriveInput
} from '../../../media/timeline-video-driver';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { TTG_PLAYBACK_MS } from '../../../story/timings';
import {
  TTG_BG_SRC,
  TTG_FIGURE_END_SECONDS,
  TTG_FIGURE_HEVC_ALPHA_SRC,
  TTG_FIGURE_VIDEO_SRC,
  TTG_FRONT_SRC,
  TTG_MEDIA_KEY,
  TTG_MIDDLE_SRC
} from '../scene';
import { renderTtgAnimationProgress } from '../visual';
import './PhoneTtg.css';

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function stableProgress(value: number): number {
  const progress = clamp(value);
  return progress < .002 ? 0 : progress > .998 ? 1 : progress;
}

function acceleratedProgress(value: number): number {
  const progress = stableProgress(value);
  return clamp(.78 * progress + .22 * progress * progress);
}

function viewportHeight(): number {
  return typeof window === 'undefined' ? 800 : Math.max(1, window.innerHeight);
}

export type PhoneTtgFrame = Readonly<{
  progress: number;
  visualProgress: number;
  backgroundY: number;
  backgroundScale: number;
  middleY: number;
  middleScale: number;
  foregroundY: number;
  figureY: number;
  figureScale: number;
  figureOpacity: number;
}>;

export type PhoneTtgMediaAction =
  | 'release'
  | 'static-fallback'
  | 'play-forward'
  | 'play-reverse'
  | 'hold-initial'
  | 'hold-terminal';

export type PhoneTtgEndpoint = 0 | 1;

/** Desktop-authored TTG motion sampled inside the portrait crop. */
export function phoneTtgFrame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false,
  height = viewportHeight()
): PhoneTtgFrame {
  const progress = mediaFailed ? 1 : reducedMotion ? 0 : stableProgress(rawProgress);
  const visualProgress = acceleratedProgress(progress);
  return {
    progress,
    visualProgress,
    backgroundY: visualProgress === 0 ? 0 : -visualProgress * height * .143,
    backgroundScale: 1 + visualProgress * .018,
    middleY: visualProgress * height * .235,
    middleScale: 1 + visualProgress * .012,
    foregroundY: height * .292 + visualProgress * height * .131,
    figureY: -height * .085 + visualProgress * height * .165,
    figureScale: .8,
    figureOpacity: mediaFailed || reducedMotion ? 0 : 1
  };
}

/** Legacy decision helper retained as a pure endpoint contract. */
export function phoneTtgMediaAction(
  active: boolean,
  prewarm = false,
  reducedMotion = false,
  mediaFailed = false,
  hasForwardRun = false,
  direction: 1 | -1 = 1
): PhoneTtgMediaAction {
  if (reducedMotion || mediaFailed) return 'static-fallback';
  if (active) return direction === -1 ? 'play-reverse' : 'play-forward';
  if (!prewarm) return 'release';
  return hasForwardRun ? 'hold-terminal' : 'hold-initial';
}

/** Hard retirement only: pause/rebind leaves the persistent decoder reusable. */
export function releasePhoneTtgVideo(video: HTMLVideoElement | null): void {
  if (!video) return;
  disposeTimelineVideoDriver(video);
  video.pause();
  delete video.dataset.phoneTtgEndpointReady;
  delete video.dataset.phoneGroup45FrameReady;
  video.removeAttribute('src');
  for (const source of video.querySelectorAll('source')) source.removeAttribute('src');
  try {
    video.load();
  } catch {
    // Detached/mock media elements can reject a post-dispose load.
  }
}

const PHONE_TTG_INITIAL_TOLERANCE_SECONDS = .04;
const PHONE_TTG_TERMINAL_TOLERANCE_SECONDS = .08;

export function phoneTtgEndpointIsPresented(
  video: Pick<HTMLVideoElement, 'currentTime' | 'duration' | 'readyState' | 'seeking'>,
  endpoint: PhoneTtgEndpoint,
  acceptCausalFrame = false
): boolean {
  const terminal = Number.isFinite(video.duration) && video.duration > 0
    ? Math.min(TTG_FIGURE_END_SECONDS, video.duration)
    : TTG_FIGURE_END_SECONDS;
  const target = endpoint === 1 ? terminal : 0;
  const tolerance = endpoint === 1
    ? PHONE_TTG_TERMINAL_TOLERANCE_SECONDS
    : acceptCausalFrame
      ? TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS
      : PHONE_TTG_INITIAL_TOLERANCE_SECONDS;
  return video.readyState >= 2 && (acceptCausalFrame || !video.seeking)
    && Math.abs(video.currentTime - target) <= tolerance;
}

type PhoneTtgEndpointVideo = Pick<
  HTMLVideoElement,
  'currentTime' | 'duration' | 'readyState' | 'seeking' | 'dataset'
>;

export function phoneTtgHasReusableEndpointFrame(
  video: PhoneTtgEndpointVideo,
  endpoint: PhoneTtgEndpoint
): boolean {
  const endpointLabel = endpoint === 1 ? 'terminal' : 'initial';
  return video.dataset.phoneTtgEndpointReady === endpointLabel
    && video.dataset.phoneGroup45FrameReady === 'true'
    && phoneTtgEndpointIsPresented(video, endpoint);
}

export function phoneTtgHasReusableTerminalFrame(
  video: PhoneTtgEndpointVideo
): boolean {
  return phoneTtgHasReusableEndpointFrame(video, 1);
}

function ttgTimelineMediaInput(
  runId: string,
  direction: 1 | -1,
  progress: number
): TimelineVideoDriveInput {
  return {
    runId,
    direction,
    progress: stableProgress(progress),
    durationFallbackSeconds: 2.5,
    startSeconds: 0,
    endSeconds: TTG_FIGURE_END_SECONDS,
    timelineDurationMs: TTG_PLAYBACK_MS,
    mode: 'timeline',
    nativePlaybackDirection: 1,
    // The fallback is causal: it still requires the target currentTime,
    // decoded data, a settled seek, and the current driver generation.
    allowSeekedFrameFallback: true,
    allowPlaybackNudge: false
  };
}

/**
 * Genuine clean TTG leaf. Runtime owns progress; this leaf owns one decoder,
 * maps runtime progress to the authored playhead, and reports only a decoded
 * endpoint that the current generation physically presented.
 */
export function PhoneTtg({ reports }: Readonly<{ reports: PhoneLeafReportPort }>) {
  const mountRootRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const settledEndpointRef = useRef<PhoneTtgEndpoint>(0);
  const preparationGenerationRef = useRef(0);
  const mediaClockActiveRef = useRef(false);
  const mediaRunTokenRef = useRef<string | null>(null);
  const frameSequenceRef = useRef(0);
  const pausedRef = useRef(false);
  const disposedRef = useRef(false);

  const currentRunId = useCallback((direction = directionRef.current) => (
    mediaRunTokenRef.current
      ?? `${bindingRef.current?.frameToken ?? 'phone-story:unbound'}:ttg:${direction}`
  ), []);

  const reportEndpointFrame = useCallback((
    endpoint: PhoneTtgEndpoint,
    binding: PhoneLeafGenerationBinding
  ) => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video || disposedRef.current || binding !== bindingRef.current) return;
    root.dataset.phoneMediaState = 'ready';
    binding.reports.reportPrepared('ttg-figure-video', {
      kind: 'video-decoded',
      token: binding.frameToken,
      ready: true,
      detail: {
        decodedFrame: true,
        endpoint,
        frameId: `ttg-frame:${binding.frameToken}:${++frameSequenceRef.current}`
      }
    });
  }, []);

  const render = useCallback((rawProgress: number) => {
    const progress = stableProgress(rawProgress);
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    const frame = phoneTtgFrame(progress);
    renderTtgAnimationProgress(sceneRef.current, progress);
    const video = videoRef.current;
    if (video && mediaClockActiveRef.current) driveTimelineVideo(video, ttgTimelineMediaInput(
      currentRunId(), directionRef.current, progress
    ));
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty('--phone-ttg-background-y', `${frame.backgroundY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-background-scale', frame.backgroundScale.toFixed(4));
    root.style.setProperty('--phone-ttg-middle-y', `${frame.middleY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-middle-scale', frame.middleScale.toFixed(4));
    root.style.setProperty('--phone-ttg-foreground-y', `${frame.foregroundY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-figure-y', `${frame.figureY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-figure-scale', frame.figureScale.toFixed(4));
    root.style.setProperty('--phone-ttg-figure-opacity', frame.figureOpacity.toFixed(4));
    root.dataset.phoneTtgProgress = frame.progress.toFixed(4);
    root.dataset.phoneTtgVisualProgress = frame.visualProgress.toFixed(4);
  }, [currentRunId]);

  const prepareCurrentFrame = useCallback(async (
    generation: number,
    binding: PhoneLeafGenerationBinding,
    direction: 1 | -1
  ) => {
    const video = videoRef.current;
    if (!video) throw new Error('TTG decoder unavailable');
    const progress = progressRef.current;
    const endpoint = progress <= .001 ? 0 : progress >= .999 ? 1 : null;
    const result = await prepareTimelineVideoFrame(video, ttgTimelineMediaInput(
      currentRunId(direction), direction, progress
    ));
    if (disposedRef.current || generation !== preparationGenerationRef.current
      || binding !== bindingRef.current || result?.status !== 'ready') return false;
    if (endpoint === null) return false;
    video.dataset.phoneGroup45FrameReady = 'true';
    video.dataset.phoneTtgEndpointReady = endpoint === 1 ? 'terminal' : 'initial';
    reportEndpointFrame(endpoint, binding);
    return true;
  }, [currentRunId, reportEndpointFrame]);

  const reportFailure = useCallback((error: unknown) => {
    const binding = bindingRef.current;
    if (!binding || disposedRef.current) return;
    binding.reports.reportFailure({
      code: 'ttg-frame-preparation-failed',
      message: error instanceof Error ? error.message : String(error),
      recoverable: true
    });
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      frameSequenceRef.current = 0;
      const currentEndpoint = progressRef.current <= .001 ? 0
        : progressRef.current >= .999 ? 1 : null;
      const wasPaused = pausedRef.current;
      pausedRef.current = false;
      mediaClockActiveRef.current = false;
      const endpoint = currentEndpoint ?? settledEndpointRef.current;
      if (wasPaused && currentEndpoint === null) render(endpoint);
      const video = videoRef.current;
      if (video && phoneTtgHasReusableEndpointFrame(video, endpoint)) {
        reportEndpointFrame(endpoint, binding);
      } else if (wasPaused) {
        const generation = ++preparationGenerationRef.current;
        // Runtime rebinds retained topology and invokes activation in the same
        // physical-gesture stack. Defer recovery by one microtask so activation
        // becomes the sole causal frame owner; a standalone rebind still
        // prepares on that next microtask.
        void Promise.resolve().then(() => {
          if (disposedRef.current || generation !== preparationGenerationRef.current
            || binding !== bindingRef.current) return;
          return prepareCurrentFrame(generation, binding, directionRef.current);
        }).catch((error) => {
          if (!disposedRef.current && generation === preparationGenerationRef.current
            && binding === bindingRef.current) {
            reportFailure(error);
          }
        });
      }
    },
    activate(command): PhoneActivationInvocation {
      const expected = ['ttg-figure-video'];
      const video = videoRef.current;
      const binding = bindingRef.current;
      if (!video || !binding || disposedRef.current || command.surfaceIds.length !== 1
        || command.surfaceIds[0] !== expected[0]) {
        return { invocationId: command.invocationId, surfaceIds: command.surfaceIds,
          invoked: false, settlements: [] };
      }
      const direction = command.direction === 'reverse' ? -1 : 1;
      directionRef.current = direction;
      const runToken = command.runToken ?? command.invocationId; mediaRunTokenRef.current = runToken;
      mediaClockActiveRef.current = false;
      const endpoint = progressRef.current <= .001 ? 0
        : progressRef.current >= .999 ? 1 : settledEndpointRef.current;
      if (phoneTtgHasReusableEndpointFrame(video, endpoint)) {
        pausedRef.current = false;
        reportEndpointFrame(endpoint, binding);
        return {
          invocationId: command.invocationId,
          surfaceIds: expected,
          invoked: true,
          settlements: [{ surfaceId: expected[0]!, status: 'fulfilled' }]
        };
      }
      const generation = ++preparationGenerationRef.current;
      const settled = primePhoneNativeVideo(video, {
        isCurrent: () => !disposedRef.current
          && generation === preparationGenerationRef.current
          && bindingRef.current === binding
          && mediaRunTokenRef.current === runToken,
        phase: () => mediaClockActiveRef.current ? 'playing' : 'primed',
        onRejected: (error: unknown) => {
          if (disposedRef.current || bindingRef.current !== binding
            || mediaRunTokenRef.current !== runToken) return;
          reportFailure(error);
        }
      }).then(() => prepareCurrentFrame(generation, binding, direction)).then((prepared) => {
        if (!prepared) throw new Error('TTG activation was superseded before frame preparation');
        video.pause();
      });
      return {
        invocationId: command.invocationId,
        surfaceIds: expected,
        invoked: true,
        settlements: [{ surfaceId: expected[0]!, status: 'pending', settled }]
      };
    },
    setMediaPhase(command) {
      const binding = bindingRef.current;
      const video = videoRef.current;
      if (!binding || !video || disposedRef.current
        || (mediaRunTokenRef.current !== null
          && mediaRunTokenRef.current !== command.runToken)) return;
      mediaRunTokenRef.current = command.runToken;
      directionRef.current = command.direction === 'reverse' ? -1 : 1;
      if (command.phase === 'primed') {
        mediaClockActiveRef.current = false;
        video.pause();
        return;
      }
      if (command.phase === 'held') {
        mediaClockActiveRef.current = false;
        video.pause();
        disposeTimelineVideoDriver(video);
        return;
      }
      mediaClockActiveRef.current = true;
      render(progressRef.current);
    },
    render,
    settle(endpoint) {
      settledEndpointRef.current = endpoint;
      directionRef.current = endpoint === 0 ? -1 : 1;
      render(endpoint);
      mediaClockActiveRef.current = false;
      const binding = bindingRef.current;
      if (!binding || disposedRef.current) return;
      const generation = ++preparationGenerationRef.current;
      void prepareCurrentFrame(generation, binding, directionRef.current).catch(reportFailure);
    },
    pause() {
      pausedRef.current = true;
      preparationGenerationRef.current += 1;
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      disposeTimelineVideoDriver(video);
    },
    dispose() {
      if (disposedRef.current) return;
      disposedRef.current = true;
      pausedRef.current = false;
      preparationGenerationRef.current += 1;
      releasePhoneTtgVideo(videoRef.current);
      bindingRef.current = null;
    }
  }), [prepareCurrentFrame, render, reportEndpointFrame, reportFailure]);

  useLayoutEffect(() => {
    const mountRoot = mountRootRef.current;
    const root = rootRef.current;
    const video = videoRef.current;
    if (!mountRoot || !root || !video) return;
    disposedRef.current = false;
    pausedRef.current = false;
    video.muted = true;
    video.loop = false;
    video.playsInline = true;
    root.dataset.phoneMediaState = 'preparing';
    const showStaticFallback = () => {
      root.dataset.phoneMediaState = 'fallback';
      root.style.setProperty('--phone-ttg-figure-opacity', '0');
    };
    video.addEventListener('error', showStaticFallback);
    render(0);
    reports.registerMount({
      root: mountRoot,
      surfaces: [{ id: 'ttg-figure-video', element: video, kind: 'video' }],
      commands
    });
    return () => {
      disposedRef.current = true;
      pausedRef.current = false;
      preparationGenerationRef.current += 1;
      video.removeEventListener('error', showStaticFallback);
      releasePhoneTtgVideo(video);
      bindingRef.current = null;
      sceneRef.current = null;
    };
  }, [commands, render, reports]);

  return (
    <div ref={mountRootRef} className="phone-ttg__mount">
      <section
        ref={rootRef}
        className="phone-ttg"
        data-phone-scene="ttg-animation"
        data-phone-media-owner="ttg-figure-motion"
        data-phone-media-state="preparing"
        aria-hidden="true"
      >
        <div className="phone-ttg__fallback" data-phone-media-fallback="ttg" />
        <article
          ref={sceneRef}
          className="ttg-page r4-ttg-animation"
          data-r4-scene="ttg-animation"
          data-ttg-transition
          data-ttg-stage
          aria-label="Talk to the God visual scene"
        >
          <div className="ttg-scroll">
            <div className="ttg-sticky">
              <div className="ttg-field">
                <div className="ttg-layer-stack" aria-hidden="true">
                  <img className="ttg-layer ttg-layer--bg" src={TTG_BG_SRC} alt="" />
                  <img className="ttg-layer ttg-layer--middle" src={TTG_MIDDLE_SRC} alt="" />
                  <img className="ttg-layer ttg-layer--front" src={TTG_FRONT_SRC} alt="" />
                  <video
                    ref={videoRef}
                    className="ttg-layer ttg-layer--figure"
                    data-ttg-figure-video
                    data-media-key={TTG_MEDIA_KEY}
                    width="720"
                    height="1280"
                    muted
                    preload="auto"
                    playsInline
                  >
                    <AlphaVideoSources
                      webm={TTG_FIGURE_VIDEO_SRC}
                      hevc={TTG_FIGURE_HEVC_ALPHA_SRC}
                    />
                  </video>
                </div>
                <div className="ttg-progress" aria-hidden="true"><span /></div>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

export default PhoneTtg;
export const phoneSceneId = 'ttg-animation' as const;
