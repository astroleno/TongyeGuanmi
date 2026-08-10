import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { browserPrefersHevcAlpha } from '../../../media/alpha-video-sources';
import { phoneMediaUrlFor } from '../../../media/phone-media';
import {
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput
} from '../../../media/timeline-video-driver';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import {
  FIGURE3_END_SECONDS,
  figure3AnimationScene,
  renderFigure3AnimationProgress
} from '..';
import {
  createPhoneFigure3PaperCompositor,
  releasePhoneFigure3PaperCanvas,
  type PhoneFigure3PaperCompositor
} from './paper-compositor';
import './PhoneFigure3.css';

const Figure3Surface = figure3AnimationScene.Component;
const FIGURE3_INITIAL_POSTER = phoneMediaUrlFor(
  'figure3-initial-poster', 'figure3-animation'
);

function waitForDecodedImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return Promise.resolve();
  }
  if (typeof image.decode === 'function') return image.decode();
  return new Promise((resolve, reject) => {
    const clear = () => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
    const loaded = () => { clear(); resolve(); };
    const failed = () => { clear(); reject(new Error('Figure3 initial poster decode failed')); };
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
  });
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type PhoneFigure3Frame = Readonly<{
  progress: number;
  videoOpacity: number;
  videoScale: number;
  backdropOpacity: number;
  backdropScale: number;
}>;

export type PhoneFigure3MediaAction =
  | 'release'
  | 'static-fallback'
  | 'play-forward'
  | 'play-reverse'
  | 'hold-initial'
  | 'hold-terminal';

export type PhoneFigure3Props = Readonly<{ reports: PhoneLeafReportPort }>;
type PhoneFigure3InitialSurface = 'preparing' | 'video-frame-zero' | 'poster-fallback';
type PhoneFigure3PreparedComposite = Exclude<PhoneFigure3InitialSurface, 'preparing'>
  | 'video-terminal-frame';

function smoothStep(value: number): number {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

function range01(value: number, start: number, end: number): number {
  return clamp((value - start) / Math.max(.0001, end - start));
}

/** Phone-specific Figure3 framing; it never scales a desktop scene tree. */
export function phoneFigure3Frame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false
): PhoneFigure3Frame {
  const progress = mediaFailed ? 1 : reducedMotion ? 0 : clamp(rawProgress);
  const visualProgress = .78 * progress + .22 * progress * progress;
  const backdropSettle = smoothStep(range01(visualProgress, .06, .84));
  return {
    progress,
    videoOpacity: mediaFailed || reducedMotion ? 0 : 1,
    videoScale: 1.015 + visualProgress * .035,
    backdropOpacity: 1 - backdropSettle * .46,
    backdropScale: 1.06 + backdropSettle * .08
  };
}

/** Legacy decision helper retained as a pure endpoint contract. */
export function phoneFigure3MediaAction(
  active: boolean,
  prewarm = false,
  reducedMotion = false,
  mediaFailed = false,
  hasForwardRun = false,
  direction: 1 | -1 = 1
): PhoneFigure3MediaAction {
  if (reducedMotion || mediaFailed) return 'static-fallback';
  if (active) return direction === -1 ? 'play-reverse' : 'play-forward';
  if (!prewarm) return 'release';
  return hasForwardRun ? 'hold-terminal' : 'hold-initial';
}

/** Hard retirement only: pause/rebind never tears down this persistent source. */
export function releasePhoneFigure3Video(video: HTMLVideoElement | null): void {
  if (!video) return;
  disposeTimelineVideoDriver(video);
  video.pause();
  video.removeAttribute('src');
  for (const source of video.querySelectorAll('source')) source.removeAttribute('src');
  try {
    video.load();
  } catch {
    // Detached/mock media elements can reject a post-dispose load.
  }
}

export type PhoneFigure3Endpoint = 0 | 1;

export function phoneFigure3RunStartEndpoint(direction: 1 | -1): PhoneFigure3Endpoint {
  return direction === 1 ? 0 : 1;
}

export function phoneFigure3CanStartPreparedRun(
  direction: 1 | -1,
  readyEndpoint: PhoneFigure3Endpoint | null
): boolean {
  return readyEndpoint === phoneFigure3RunStartEndpoint(direction);
}

const PHONE_FIGURE3_ENDPOINT_TOLERANCE_SECONDS = .05;
export const PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS = 240;

export function phoneFigure3EndpointIsPresented(
  endpoint: PhoneFigure3Endpoint,
  currentTime: number,
  readyState: number,
  seeking: boolean
): boolean {
  const targetTime = endpoint === 0 ? 0 : FIGURE3_END_SECONDS;
  return Number.isFinite(currentTime)
    && readyState >= 2
    && !seeking
    && Math.abs(currentTime - targetTime) <= PHONE_FIGURE3_ENDPOINT_TOLERANCE_SECONDS;
}

export function phoneFigure3HasReusableEndpointFrame(
  video: Pick<HTMLVideoElement, 'currentTime' | 'readyState' | 'seeking'>,
  canvas: Pick<HTMLCanvasElement, 'dataset'>,
  endpoint: PhoneFigure3Endpoint
): boolean {
  return canvas.dataset.phoneFigure3PaperFrame === 'ready'
    && canvas.dataset.phoneFigure3PaperEndpoint === (endpoint === 1 ? 'terminal' : 'initial')
    && phoneFigure3EndpointIsPresented(
      endpoint, video.currentTime, video.readyState, video.seeking
    );
}

function figure3TimelineMediaInput(
  runId: string,
  direction: 1 | -1,
  progress: number
): TimelineVideoDriveInput {
  return {
    runId,
    direction,
    progress: clamp(progress),
    durationFallbackSeconds: 2.6,
    startSeconds: 0,
    endSeconds: FIGURE3_END_SECONDS,
    timelineDurationMs: FIGURE3_END_SECONDS * 1000,
    mode: 'timeline',
    nativePlaybackDirection: 1,
    allowSeekedFrameFallback: browserPrefersHevcAlpha(),
    allowPlaybackNudge: false
  };
}

/**
 * Genuine clean Figure3 leaf. Runtime owns the canonical clock and invokes
 * render(progress); this leaf owns exactly one decoder and one persistent
 * paper Canvas until its closure is terminally retired.
 */
export function PhoneFigure3({ reports }: PhoneFigure3Props) {
  const mountRootRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posterRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialCompositeRef = useRef<HTMLDivElement | null>(null);
  const compositorRef = useRef<PhoneFigure3PaperCompositor | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const settledEndpointRef = useRef<PhoneFigure3Endpoint>(0);
  const activationGenerationRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const pausedRef = useRef(false);
  const mediaPresentationEnabledRef = useRef(false);
  const mediaClockActiveRef = useRef(false);
  const mediaRunTokenRef = useRef<string | null>(null);
  const posterReadyRef = useRef(false);
  const initialSurfaceRef = useRef<PhoneFigure3InitialSurface>('preparing');
  const reportedCompositeTokenRef = useRef<string | null>(null);
  const fallbackDeadlineRef = useRef<number | null>(null);
  const fallbackPendingRef = useRef(false);
  const effectGenerationRef = useRef(0);
  const releasedVideoRef = useRef<HTMLVideoElement | null>(null);
  const disposedRef = useRef(false);

  const clearFallbackDeadline = useCallback(() => {
    if (fallbackDeadlineRef.current === null) return;
    window.clearTimeout(fallbackDeadlineRef.current);
    fallbackDeadlineRef.current = null;
  }, []);

  const reportPreparedComposite = useCallback((
    binding: PhoneLeafGenerationBinding,
    winner: PhoneFigure3PreparedComposite
  ) => {
    if (binding !== bindingRef.current || disposedRef.current
      || reportedCompositeTokenRef.current === binding.frameToken) return;
    reportedCompositeTokenRef.current = binding.frameToken;
    binding.reports.reportPrepared('figure3-initial-composite', {
      kind: 'image-decoded',
      token: `figure3:initial-composite:${winner}:${binding.frameToken}`,
      ready: true,
      detail: {
        winner, endpoint: winner === 'video-terminal-frame' ? 1 : 0,
        videoFrameZero: winner === 'video-frame-zero',
        posterFallback: winner === 'poster-fallback'
      }
    });
  }, []);

  const exposePosterFallback = useCallback((
    binding: PhoneLeafGenerationBinding,
    reason: 'deadline' | 'decode-failed'
  ) => {
    const root = rootRef.current;
    if (!root || binding !== bindingRef.current || disposedRef.current
      || initialSurfaceRef.current !== 'preparing') return;
    if (!posterReadyRef.current) {
      fallbackPendingRef.current = true;
      return;
    }
    clearFallbackDeadline();
    fallbackPendingRef.current = false;
    // The poster is a loading cover only. It never closes the prepared-proof
    // contract and remains eligible for a late video frame upgrade.
    mediaPresentationEnabledRef.current = true;
    initialSurfaceRef.current = 'preparing';
    root.dataset.phoneFigure3InitialSurface = 'poster-fallback';
    root.dataset.phoneFigure3InitialFallbackReason = reason;
    root.dataset.phoneMediaState = 'fallback';
    delete root.dataset.phoneFigure3MediaActive;
  }, [clearFallbackDeadline]);

  const reportFailure = useCallback((code: string, error: unknown) => {
    const binding = bindingRef.current;
    if (!binding || disposedRef.current) return;
    binding.reports.reportFailure({
      code,
      message: error instanceof Error ? error.message : String(error),
      recoverable: true
    });
  }, []);

  const commitPresentedFrame = useCallback((
    endpoint: PhoneFigure3Endpoint,
    progress: number,
    binding: PhoneLeafGenerationBinding
  ) => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || disposedRef.current || binding !== bindingRef.current
      || !mediaPresentationEnabledRef.current) return;
    if (endpoint === 0 && initialSurfaceRef.current === 'poster-fallback') return;
    canvas.dataset.phoneFigure3PaperEndpoint = endpoint === 1 ? 'terminal' : 'initial';
    root.dataset.phoneFigure3MediaActive = 'true';
    root.dataset.phoneFigure3PaperCompositor = 'ready';
    root.dataset.phoneMediaState = 'ready';
    if (endpoint === 0) {
      clearFallbackDeadline();
      fallbackPendingRef.current = false;
      initialSurfaceRef.current = 'video-frame-zero';
      root.dataset.phoneFigure3InitialSurface = 'video-frame-zero';
      delete root.dataset.phoneFigure3InitialFallbackReason;
    }
    reportPreparedComposite(binding,
      endpoint === 0 ? 'video-frame-zero' : 'video-terminal-frame');
    binding.reports.reportFrame('figure3-paper-canvas', {
      kind: 'frame',
      token: binding.frameToken,
      presented: true,
      frameId: `figure3-paper:${binding.frameToken}:${++frameSequenceRef.current}`,
      detail: { compositorDrawn: true, progress }
    });
  }, [clearFallbackDeadline, reportPreparedComposite]);

  const reportPresentedFrame = useCallback(() => {
    const video = videoRef.current;
    const binding = bindingRef.current;
    if (!video || !binding || disposedRef.current) return;
    const progress = progressRef.current;
    const endpoint = progress <= .001 ? 0 : progress >= .999 ? 1 : null;
    if (endpoint === null || !phoneFigure3EndpointIsPresented(
      endpoint, video.currentTime, video.readyState, video.seeking
    )) return;
    commitPresentedFrame(endpoint, progress, binding);
  }, [commitPresentedFrame]);

  const currentRunId = useCallback((direction = directionRef.current) => {
    return mediaRunTokenRef.current
      ?? `${bindingRef.current?.frameToken ?? 'phone-story:unbound'}:figure3:${direction}`;
  }, []);

  const render = useCallback((rawProgress: number) => {
    const progress = clamp(rawProgress);
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    const frame = phoneFigure3Frame(progress);
    const root = rootRef.current;
    const mediaRun = mediaClockActiveRef.current
      && bindingRef.current?.segmentId === 'figure3-services'
      ? { runId: currentRunId(), direction: directionRef.current } : undefined;
    renderFigure3AnimationProgress(sceneRef.current, progress, mediaRun ? { mediaRun } : undefined);
    if (!root) return;
    root.style.setProperty('--phone-figure3-video-opacity', frame.videoOpacity.toFixed(4));
    root.style.setProperty('--phone-figure3-video-scale', frame.videoScale.toFixed(4));
    root.style.setProperty('--phone-figure3-backdrop-opacity', frame.backdropOpacity.toFixed(4));
    root.style.setProperty('--phone-figure3-backdrop-scale', frame.backdropScale.toFixed(4));
    root.dataset.phoneFigure3Progress = frame.progress.toFixed(4);
    root.dataset.phoneFigure3FallbackEndpoint = progress >= .999 ? 'terminal' : 'initial';
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.dataset.phoneFigure3PaperScale = frame.videoScale.toFixed(4);
      if (mediaRun) compositorRef.current?.paint();
    }
  }, [currentRunId]);

  const prepareCurrentFrame = useCallback(async (
    generation: number,
    binding: PhoneLeafGenerationBinding,
    direction: 1 | -1
  ) => {
    const video = videoRef.current;
    const compositor = compositorRef.current;
    if (!video || !compositor) throw new Error('Figure3 persistent compositor unavailable');
    const progress = progressRef.current;
    const endpoint = progress <= .001 ? 0 : progress >= .999 ? 1 : null;
    const result = await prepareTimelineVideoFrame(video, figure3TimelineMediaInput(
      currentRunId(direction),
      direction,
      progress
    ));
    if (disposedRef.current || generation !== activationGenerationRef.current
      || binding !== bindingRef.current || result?.status !== 'ready') return false;
    if (endpoint === null) return false;
    const proofSequence = frameSequenceRef.current;
    if (!compositor.paint()) {
      throw new Error('Figure3 decoded frame was not painted');
    }
    if (frameSequenceRef.current === proofSequence) {
      commitPresentedFrame(endpoint, progress, binding);
    }
    return true;
  }, [commitPresentedFrame, currentRunId]);

  const prepareInitialComposite = useCallback((binding: PhoneLeafGenerationBinding) => {
    const root = rootRef.current;
    if (!root || disposedRef.current || binding !== bindingRef.current) return;
    clearFallbackDeadline();
    fallbackPendingRef.current = false;
    reportedCompositeTokenRef.current = null;
    initialSurfaceRef.current = 'preparing';
    mediaPresentationEnabledRef.current = true;
    root.dataset.phoneFigure3InitialSurface = 'preparing';
    root.dataset.phoneMediaState = 'preparing';
    delete root.dataset.phoneFigure3MediaActive;
    delete root.dataset.phoneFigure3InitialFallbackReason;
    const generation = ++activationGenerationRef.current;
    void Promise.resolve().then(() => {
      if (generation !== activationGenerationRef.current || binding !== bindingRef.current) {
        return false;
      }
      return prepareCurrentFrame(generation, binding, 1);
    }).then((prepared) => {
      if (!prepared && generation === activationGenerationRef.current) {
        exposePosterFallback(binding, 'decode-failed');
      }
    }).catch((error: unknown) => {
      if (generation !== activationGenerationRef.current || binding !== bindingRef.current) return;
      root.dataset.phoneFigure3InitialFailure = error instanceof Error
        ? error.message : String(error);
      reportFailure('figure3-initial-frame-preparation-failed', error);
    });
  }, [clearFallbackDeadline, exposePosterFallback, prepareCurrentFrame, reportFailure]);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      mediaRunTokenRef.current = null;
      frameSequenceRef.current = 0;
      reportedCompositeTokenRef.current = null;
      const currentEndpoint = progressRef.current <= .001 ? 0
        : progressRef.current >= .999 ? 1 : null;
      const wasPaused = pausedRef.current;
      pausedRef.current = false;
      const endpoint = currentEndpoint ?? settledEndpointRef.current;
      if (wasPaused && currentEndpoint === null) render(endpoint);
      if (endpoint === 0) {
        mediaClockActiveRef.current = false;
        prepareInitialComposite(binding);
        return;
      }
      mediaPresentationEnabledRef.current = true;
      compositorRef.current?.paint();
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && phoneFigure3HasReusableEndpointFrame(
        video, canvas, endpoint
      )) {
        reportPresentedFrame();
      } else if (wasPaused) {
        const generation = ++activationGenerationRef.current;
        // Runtime rebinds the retained topology and invokes activation in the
        // same physical-gesture stack. Defer recovery preparation by one
        // microtask so that activation can become the sole causal frame owner;
        // standalone lifecycle rebinds still prepare on that next microtask.
        void Promise.resolve().then(() => {
          if (disposedRef.current || generation !== activationGenerationRef.current
            || binding !== bindingRef.current) return;
          return prepareCurrentFrame(generation, binding, directionRef.current);
        }).catch((error) => {
          if (!disposedRef.current && generation === activationGenerationRef.current
            && binding === bindingRef.current) {
            reportFailure('figure3-frame-preparation-failed', error);
          }
        });
      }
    },
    activate(command): PhoneActivationInvocation {
      const expected = ['figure3-video'];
      const video = videoRef.current;
      const binding = bindingRef.current;
      if (!video || !binding || command.surfaceIds.length !== 1
        || command.surfaceIds[0] !== expected[0] || disposedRef.current) {
        return {
          invocationId: command.invocationId,
          surfaceIds: command.surfaceIds,
          invoked: false,
          settlements: []
        };
      }
      const generation = ++activationGenerationRef.current;
      const direction = command.direction === 'reverse' ? -1 : 1;
      mediaRunTokenRef.current = command.runToken ?? command.invocationId;
      directionRef.current = direction;
      mediaClockActiveRef.current = false;
      mediaPresentationEnabledRef.current = true;
      const settled = prepareCurrentFrame(generation, binding, direction).then((prepared) => {
        if (!prepared) throw new Error('Figure3 activation was superseded before frame preparation');
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
      if (!binding || !video || disposedRef.current) return;
      if (mediaRunTokenRef.current !== null
        && mediaRunTokenRef.current !== command.runToken) return;
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
        return;
      }
      mediaClockActiveRef.current = true;
      mediaPresentationEnabledRef.current = true;
      render(progressRef.current);
    },
    render,
    settle(endpoint) {
      settledEndpointRef.current = endpoint;
      directionRef.current = endpoint === 0 ? 1 : -1;
      mediaClockActiveRef.current = false;
      render(endpoint);
      const binding = bindingRef.current;
      if (!binding || disposedRef.current) return;
      const root = rootRef.current;
      if (endpoint === 0) {
        const video = videoRef.current;
        video?.pause();
        if (initialSurfaceRef.current === 'video-frame-zero') {
          mediaPresentationEnabledRef.current = true;
          if (video && phoneFigure3EndpointIsPresented(
            0, video.currentTime, video.readyState, video.seeking
          )) {
            compositorRef.current?.paint();
            commitPresentedFrame(0, 0, binding);
          } else {
            if (root) root.dataset.phoneMediaState = 'preparing';
            const generation = ++activationGenerationRef.current;
            void prepareCurrentFrame(generation, binding, directionRef.current)
              .catch((error) => reportFailure('figure3-frame-preparation-failed', error));
          }
        } else prepareInitialComposite(binding);
        return;
      }
      mediaPresentationEnabledRef.current = true;
      if (root) root.dataset.phoneMediaState = 'preparing';
      const video = videoRef.current;
      const canvas = canvasRef.current;
      compositorRef.current?.paint();
      if (video && canvas && phoneFigure3HasReusableEndpointFrame(
        video, canvas, endpoint
      )) {
        reportPresentedFrame();
        return;
      }
      const generation = ++activationGenerationRef.current;
      void prepareCurrentFrame(generation, binding, directionRef.current)
        .catch((error) => reportFailure('figure3-frame-preparation-failed', error));
    },
    pause() {
      pausedRef.current = true;
      mediaClockActiveRef.current = false;
      mediaPresentationEnabledRef.current = false;
      activationGenerationRef.current += 1;
      clearFallbackDeadline();
      const video = videoRef.current;
      if (video) {
        video.pause();
        disposeTimelineVideoDriver(video);
      }
    },
    dispose() {
      if (disposedRef.current) return;
      disposedRef.current = true;
      pausedRef.current = false;
      mediaClockActiveRef.current = false;
      mediaPresentationEnabledRef.current = false;
      activationGenerationRef.current += 1;
      clearFallbackDeadline();
      compositorRef.current?.dispose();
      compositorRef.current = null;
      const video = videoRef.current;
      releasePhoneFigure3Video(video);
      releasedVideoRef.current = video;
      releasePhoneFigure3PaperCanvas(canvasRef.current);
      bindingRef.current = null;
    }
  }), [clearFallbackDeadline, commitPresentedFrame, prepareCurrentFrame,
    prepareInitialComposite, render, reportFailure, reportPreparedComposite,
    reportPresentedFrame]);

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'field') sceneRef.current = element;
    if (name === 'figure3-video') videoRef.current = element as HTMLVideoElement | null;
  }, []);

  useLayoutEffect(() => {
    const mountRoot = mountRootRef.current;
    const root = rootRef.current;
    const scene = sceneRef.current;
    const video = videoRef.current;
    const poster = posterRef.current;
    const canvas = canvasRef.current;
    const initialComposite = initialCompositeRef.current;
    if (!mountRoot || !root || !scene || !video || !poster || !canvas
      || !initialComposite) return;
    const effectGeneration = ++effectGenerationRef.current;
    releasedVideoRef.current = null;
    disposedRef.current = false;
    pausedRef.current = false;
    mediaPresentationEnabledRef.current = false;
    initialSurfaceRef.current = 'preparing';
    fallbackPendingRef.current = false;
    root.dataset.phoneFigure3PaperCompositor = 'preparing';
    root.dataset.phoneFigure3InitialSurface = 'preparing';
    root.dataset.phoneMediaState = 'preparing';
    delete root.dataset.phoneFigure3MediaActive;
    posterReadyRef.current = false;
    reportedCompositeTokenRef.current = null;
    const compositor = createPhoneFigure3PaperCompositor({
      video,
      canvas,
      onPresentedFrame: reportPresentedFrame
    });
    compositorRef.current = compositor;
    render(0);
    reports.registerMount({
      root: mountRoot,
      surfaces: [
        { id: 'figure3-video', element: video, kind: 'video' },
        { id: 'figure3-paper-canvas', element: canvas, kind: 'canvas-2d' },
        { id: 'figure3-initial-poster', element: poster, kind: 'image' },
        { id: 'figure3-initial-composite', element: initialComposite, kind: 'dom' }
      ],
      commands
    });
    let current = true;
    void waitForDecodedImage(poster).then(() => {
      if (!current || disposedRef.current || posterRef.current !== poster) return;
      poster.dataset.phoneFigure3PaperFrame = 'ready';
      poster.dataset.phoneFigure3PaperEndpoint = 'initial';
      posterReadyRef.current = true;
      if (fallbackPendingRef.current && bindingRef.current) {
        exposePosterFallback(bindingRef.current, 'deadline');
      }
    }, (error: unknown) => {
      if (!current || disposedRef.current || posterRef.current !== poster) return;
      reportFailure('figure3-initial-poster-decode-rejected', error);
    });
    return () => {
      current = false;
      disposedRef.current = true;
      mediaPresentationEnabledRef.current = false;
      activationGenerationRef.current += 1;
      clearFallbackDeadline();
      compositor.dispose();
      if (compositorRef.current === compositor) compositorRef.current = null;
      video.pause();
      disposeTimelineVideoDriver(video);
      queueMicrotask(() => {
        if (effectGenerationRef.current !== effectGeneration
          || releasedVideoRef.current === video) return;
        releasePhoneFigure3Video(video);
        releasedVideoRef.current = video;
      });
      posterReadyRef.current = false;
      reportedCompositeTokenRef.current = null;
      fallbackPendingRef.current = false;
      bindingRef.current = null;
    };
  }, [clearFallbackDeadline, commands, exposePosterFallback, render,
    reportFailure, reportPresentedFrame, reports]);

  return (
    <div ref={mountRootRef} className="phone-figure3__mount">
      <section
        ref={rootRef}
        className="phone-figure3"
        data-phone-scene="figure3-animation"
        data-phone-media-owner="figure3-motion"
        data-phone-media-state="static"
        aria-hidden="true"
      >
        <div ref={initialCompositeRef} className="phone-figure3__initial-composite"
          data-phone-figure3-initial-composite>
          <div className="phone-figure3__fallback" data-phone-media-fallback="figure3" />
          <img
            ref={posterRef}
            className="phone-figure3__poster"
            data-phone-figure3-paper-poster
            src={FIGURE3_INITIAL_POSTER}
            alt=""
            aria-hidden="true"
          />
          <Figure3Surface
            scene="figure3-animation"
            hidden={false}
            registerHandle={registerHandle}
          />
          <canvas
            ref={canvasRef}
            className="phone-figure3__paper-canvas"
            data-phone-figure3-paper-canvas
            aria-hidden="true"
          />
        </div>
      </section>
    </div>
  );
}

export default PhoneFigure3;
export const phoneSceneId = 'figure3-animation' as const;
