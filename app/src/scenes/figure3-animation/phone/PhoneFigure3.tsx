import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  frameIndexForMediaTime,
  frameIndexForProgress
} from '../../../media/frame-timebase';
import { phoneMediaUrlFor } from '../../../media/phone-media';
import { primePhoneNativeVideo } from '../../../media/phone-native-video-prime';
import {
  createPhoneFrameLockPresenter,
  releasePhoneVideoSources,
  restorePhoneVideoSources,
  type PhoneFrameLockPresenter
} from '../../../media/phone-frame-lock-presenter';
import {
  clampProgress,
  disposeStrictTimelineVideoDriver
} from '../../../media/strict-timeline-video-driver';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import {
  FIGURE3_END_SECONDS,
  FIGURE3_FRAME_MAP,
  figure3AnimationScene,
  figure3MediaProgressForRawProgress,
  renderFigure3AnimationProgress
} from '..';
import {
  createPhoneFigure3PaperCompositor,
  releasePhoneFigure3PaperCanvas,
  type PhoneFigure3PaperCompositor
} from './paper-compositor';
import type {
  PhoneMediaFrameRequest
} from '../../../production/phone-story/protocol';
import './PhoneFigure3.css';

const Figure3Surface = figure3AnimationScene.Component;
const FIGURE3_SCENE_ID = 'figure3-animation' as const;
const FIGURE3_VIDEO_SURFACE_ID = 'figure3-video' as const;
const FIGURE3_PAPER_SURFACE_ID = 'figure3-paper-canvas' as const;
const FIGURE3_COMPOSITE_SURFACE_ID = 'figure3-initial-composite' as const;
const FIGURE3_TERMINAL_FRAME = 'video-terminal-frame' as const;
const FIGURE3_SERVICES_SEGMENT = 'figure3-services' as const;
const FIGURE3_BRAND_SEGMENT = 'brand-figure3' as const;
const FIGURE3_POSTER_FALLBACK = 'poster-fallback' as const;
const FIGURE3_VIDEO_FRAME_ZERO = 'video-frame-zero' as const;
const FIGURE3_CANVAS_EVIDENCE = 'scene-canvas-draw' as const;
const FIGURE3_PREPARATION_FAILURE = 'figure3-frame-preparation-failed' as const;
const FIGURE3_INITIAL_POSTER = phoneMediaUrlFor(
  'figure3-initial-poster', FIGURE3_SCENE_ID
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
  | typeof FIGURE3_TERMINAL_FRAME;

function isFigure3Prewarm(binding: PhoneLeafGenerationBinding): boolean {
  return binding.frameToken.startsWith('prewarm:');
}

function smoothStep(value: number): number {
  const progress = clampProgress(value);
  return progress * progress * (3 - 2 * progress);
}

function range01(value: number, start: number, end: number): number {
  return clampProgress((value - start) / Math.max(.0001, end - start));
}

function figure3MediaProgressForPhoneRequest(
  progress: number,
  binding: PhoneLeafGenerationBinding
): number {
  const local = binding.segmentId === FIGURE3_SERVICES_SEGMENT
    && binding.leg === (binding.direction === 'forward' ? 'source' : 'target')
    ? smoothStep(progress / .96) : clampProgress(progress);
  return figure3MediaProgressForRawProgress(local);
}

/** Phone-specific Figure3 framing; it never scales a desktop scene tree. */
export function phoneFigure3Frame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false
): PhoneFigure3Frame {
  const progress = mediaFailed ? 1 : reducedMotion ? 0 : clampProgress(rawProgress);
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
  disposeStrictTimelineVideoDriver(video);
  releasePhoneVideoSources(video);
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
// Give an activated decoder a real turn to deliver frame zero. The poster is
// still a bounded emergency winner, but 240ms made ordinary WebKit cold seeks
// win the race before the video frame had a chance to be painted.
export const PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS = 1500;

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
  const expectedFrame = endpoint === 1 ? FIGURE3_FRAME_MAP.endFrame : FIGURE3_FRAME_MAP.startFrame;
  return canvas.dataset.phoneFigure3PaperFrame === 'ready'
    && canvas.dataset.phoneFigure3PaperEndpoint === (endpoint === 1 ? 'terminal' : 'initial')
    && Number(canvas.dataset.phoneFigure3PaperFrameIndex) === expectedFrame
    && video.readyState >= 2
    && !video.seeking
    && Number.isFinite(video.currentTime)
    && frameIndexForMediaTime(FIGURE3_FRAME_MAP, video.currentTime) === expectedFrame;
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
  const mediaRunTokenRef = useRef<string | null>(null);
  const posterReadyRef = useRef(false);
  const initialSurfaceRef = useRef<PhoneFigure3InitialSurface>('preparing');
  const reportedCompositeTokenRef = useRef<string | null>(null);
  const fallbackDeadlineRef = useRef<number | null>(null);
  const fallbackPendingRef = useRef(false);
  const effectGenerationRef = useRef(0);
  const releasedVideoRef = useRef<HTMLVideoElement | null>(null);
  const disposedRef = useRef(false);
  const presenterRef = useRef<PhoneFrameLockPresenter | null>(null);
  const initialProofWaitersRef = useRef(new Map<string, {
    resolve(): void;
    reject(error: unknown): void;
  }>());

  const resolveInitialProof = useCallback((frameToken: string) => {
    const waiter = initialProofWaitersRef.current.get(frameToken);
    if (!waiter) return;
    initialProofWaitersRef.current.delete(frameToken);
    waiter.resolve();
  }, []);

  const rejectInitialProofs = useCallback((error: unknown) => {
    for (const waiter of initialProofWaitersRef.current.values()) waiter.reject(error);
    initialProofWaitersRef.current.clear();
  }, []);

  const waitForInitialProof = useCallback((binding: PhoneLeafGenerationBinding) => {
    if (reportedCompositeTokenRef.current === binding.frameToken) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      initialProofWaitersRef.current.set(binding.frameToken, { resolve, reject });
    });
  }, []);

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
    reportedCompositeTokenRef.current = binding.frameToken; rootRef.current?.setAttribute(
      'data-phone-figure3-proof-lineage', `${activationGenerationRef.current}|${binding.frameToken}`);
    binding.reports.reportPrepared(FIGURE3_COMPOSITE_SURFACE_ID, {
      kind: 'image-decoded',
      token: `figure3:initial-composite:${winner}:${binding.frameToken}`,
      ready: true,
      detail: {
        winner, endpoint: winner === FIGURE3_TERMINAL_FRAME ? 1 : 0,
        videoFrameZero: winner === FIGURE3_VIDEO_FRAME_ZERO,
        posterFallback: winner === FIGURE3_POSTER_FALLBACK
      }
    });
    resolveInitialProof(binding.frameToken);
  }, [resolveInitialProof]);

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
    // A decoded poster is a bounded containment path for devices that cannot
    // prime or paint the first video frame. It closes this initial composite,
    // while a late current-generation video frame may still upgrade it.
    mediaPresentationEnabledRef.current = !isFigure3Prewarm(binding);
    initialSurfaceRef.current = FIGURE3_POSTER_FALLBACK;
    root.dataset.phoneFigure3InitialSurface = FIGURE3_POSTER_FALLBACK;
    root.dataset.phoneFigure3InitialFallbackReason = reason;
    root.dataset.phoneMediaState = 'fallback';
    delete root.dataset.phoneFigure3MediaActive;
    reportPreparedComposite(binding, FIGURE3_POSTER_FALLBACK);
  }, [clearFallbackDeadline, reportPreparedComposite]);

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
    binding: PhoneLeafGenerationBinding,
    presentedFrameIndex: number
  ): boolean => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || disposedRef.current || binding !== bindingRef.current
      || !mediaPresentationEnabledRef.current) return false;
    canvas.dataset.phoneFigure3PaperEndpoint = endpoint === 1 ? 'terminal' : 'initial';
    canvas.dataset.phoneFigure3PaperFrameIndex = String(presentedFrameIndex);
    root.dataset.phoneFigure3MediaActive = 'true';
    root.dataset.phoneFigure3PaperCompositor = 'ready';
    root.dataset.phoneMediaState = 'ready';
    if (endpoint === 0) {
      clearFallbackDeadline();
      fallbackPendingRef.current = false;
      initialSurfaceRef.current = FIGURE3_VIDEO_FRAME_ZERO;
      root.dataset.phoneFigure3InitialSurface = FIGURE3_VIDEO_FRAME_ZERO;
      delete root.dataset.phoneFigure3InitialFallbackReason;
    }
    reportPreparedComposite(binding,
      endpoint === 0 ? FIGURE3_VIDEO_FRAME_ZERO : FIGURE3_TERMINAL_FRAME);
    return true;
  }, [clearFallbackDeadline, reportPreparedComposite]);

  const reportRetainedEndpointFrame = useCallback((
    endpoint: PhoneFigure3Endpoint,
    progress: number,
    binding: PhoneLeafGenerationBinding
  ) => {
    const frameIndex = endpoint === 0 ? FIGURE3_FRAME_MAP.startFrame : FIGURE3_FRAME_MAP.endFrame;
    if (!commitPresentedFrame(endpoint, binding, frameIndex)) return;
    binding.reports.reportFrame(FIGURE3_PAPER_SURFACE_ID, {
      kind: 'frame', token: binding.frameToken, presented: true,
      frameId: `figure3-paper:${binding.frameToken}:${++frameSequenceRef.current}`,
      detail: {
        compositorDrawn: true,
        generation: activationGenerationRef.current,
        desiredFrameIndex: frameIndex,
        presentedFrameIndex: frameIndex,
        progress,
        evidence: FIGURE3_CANVAS_EVIDENCE
      }
    });
  }, [commitPresentedFrame]);

  const render = useCallback((rawProgress: number) => {
    const progress = clampProgress(rawProgress);
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    const frame = phoneFigure3Frame(progress);
    renderFigure3AnimationProgress(sceneRef.current, progress);
    const root = rootRef.current;
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
    }
  }, []);

  const presentFrame = useCallback((request: PhoneMediaFrameRequest) => {
    mediaPresentationEnabledRef.current = true;
    const presenter = presenterRef.current ??= createPhoneFrameLockPresenter(
      FIGURE3_FRAME_MAP, FIGURE3_CANVAS_EVIDENCE, () => bindingRef.current,
      () => videoRef.current, () => canvasRef.current,
      FIGURE3_PAPER_SURFACE_ID, 'phoneFigure3PaperFrameIndex',
      { mapDesiredProgress: figure3MediaProgressForPhoneRequest,
        paint: () => compositorRef.current?.paint() ?? false }
    );
    return presenter.present(request);
  }, []);

  const prepareCurrentFrame = useCallback(async (
    generation: number,
    binding: PhoneLeafGenerationBinding,
    direction: 1 | -1
  ) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !compositorRef.current) {
      throw new Error('Figure3 persistent compositor unavailable');
    }
    if (disposedRef.current || generation !== activationGenerationRef.current
      || binding !== bindingRef.current) return false;
    const progress = progressRef.current;
    const endpoint = progress <= .001 ? 0 : progress >= .999 ? 1 : null;
    const sequence = ++frameSequenceRef.current;
    const receipt = await presentFrame({
      frameToken: binding.frameToken,
      transactionId: binding.transactionId ?? binding.frameToken,
      direction,
      sequence,
      desiredProgress: progress,
      signal: new AbortController().signal
    });
    if (disposedRef.current || generation !== activationGenerationRef.current
      || binding !== bindingRef.current || receipt.status !== 'presented'
      || receipt.frameToken !== binding.frameToken || receipt.sequence !== sequence
      || receipt.evidence !== FIGURE3_CANVAS_EVIDENCE) return false;
    const desiredFrameIndex = frameIndexForProgress(
      FIGURE3_FRAME_MAP,
      figure3MediaProgressForPhoneRequest(progress, binding)
    );
    const presentedFrameIndex = Number(canvas.dataset.phoneFigure3PaperFrameIndex);
    if (presentedFrameIndex !== desiredFrameIndex) return false;
    if (endpoint !== null) commitPresentedFrame(endpoint, binding, presentedFrameIndex);
    return true;
  }, [commitPresentedFrame, presentFrame]);

  const prepareInitialComposite = useCallback((
    binding: PhoneLeafGenerationBinding,
    startVideo = true, reusePosterProof = true
  ): number | null => {
    const root = rootRef.current;
    if (!root || disposedRef.current || binding !== bindingRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const prewarm = isFigure3Prewarm(binding);
    const endpoint = progressRef.current <= .001 ? 0
      : progressRef.current >= .999 ? 1 : null;
    // A stage/generation rebind must not throw away a proof that is already
    // present on the retained physical decoder. This is the common handoff
    // path at presenting-target → stable, where resetting here would make
    // the committed leaf look preparing again and eventually select poster.
    if (endpoint === 0 && !prewarm
      && initialSurfaceRef.current === FIGURE3_VIDEO_FRAME_ZERO
      && video && canvas && phoneFigure3HasReusableEndpointFrame(video, canvas, 0)) {
      clearFallbackDeadline();
      mediaPresentationEnabledRef.current = true;
      compositorRef.current?.paint();
      reportRetainedEndpointFrame(0, 0, binding);
      return activationGenerationRef.current;
    }
    if (endpoint === 0 && initialSurfaceRef.current === FIGURE3_POSTER_FALLBACK && reusePosterProof) {
      clearFallbackDeadline();
      mediaPresentationEnabledRef.current = !prewarm;
      root.dataset.phoneMediaState = 'fallback';
      reportPreparedComposite(binding, FIGURE3_POSTER_FALLBACK);
      return activationGenerationRef.current;
    }
    clearFallbackDeadline();
    rejectInitialProofs(new Error('Figure3 initial composite was superseded'));
    fallbackPendingRef.current = false;
    reportedCompositeTokenRef.current = null;
    delete root.dataset.phoneFigure3ProofLineage;
    initialSurfaceRef.current = 'preparing';
    mediaPresentationEnabledRef.current = !prewarm;
    root.dataset.phoneFigure3InitialSurface = 'preparing';
    root.dataset.phoneMediaState = 'preparing';
    delete root.dataset.phoneFigure3MediaActive;
    delete root.dataset.phoneFigure3InitialFallbackReason;
    const generation = ++activationGenerationRef.current;
    fallbackDeadlineRef.current = window.setTimeout(() => {
      if (generation !== activationGenerationRef.current || binding !== bindingRef.current) return;
      exposePosterFallback(binding, 'deadline');
    }, PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS);
    if (!startVideo) return generation;
    const direction = binding.direction === 'reverse' ? -1 : 1;
    void Promise.resolve().then(() => {
      if (generation !== activationGenerationRef.current || binding !== bindingRef.current) {
        return false;
      }
      return prepareCurrentFrame(generation, binding, direction);
    }).then((prepared) => {
      if (!prepared && generation === activationGenerationRef.current) {
        exposePosterFallback(binding, 'decode-failed');
      }
    }).catch((error: unknown) => {
      if (generation !== activationGenerationRef.current || binding !== bindingRef.current) return;
      root.dataset.phoneFigure3InitialFailure = error instanceof Error
        ? error.message : String(error);
      exposePosterFallback(binding, 'decode-failed');
    });
    return generation;
  }, [clearFallbackDeadline, exposePosterFallback, prepareCurrentFrame,
    rejectInitialProofs, reportRetainedEndpointFrame]);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      rejectInitialProofs(new Error('Figure3 initial composite binding was replaced'));
      bindingRef.current = binding;
      const prewarm = isFigure3Prewarm(binding);
      mediaRunTokenRef.current = null;
      presenterRef.current?.reset();
      reportedCompositeTokenRef.current = null;
      const currentEndpoint = progressRef.current <= .001 ? 0
        : progressRef.current >= .999 ? 1 : null;
      const wasPaused = pausedRef.current;
      pausedRef.current = false;
      const reboundVideo = videoRef.current;
      if (reboundVideo) restorePhoneVideoSources(reboundVideo);
      const endpoint = currentEndpoint ?? settledEndpointRef.current;
      if (wasPaused && currentEndpoint === null) render(endpoint);
      if (endpoint === 0) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!prewarm
          && initialSurfaceRef.current === FIGURE3_VIDEO_FRAME_ZERO && video && canvas
          && phoneFigure3HasReusableEndpointFrame(video, canvas, 0)) {
          mediaPresentationEnabledRef.current = true;
          compositorRef.current?.paint();
          reportRetainedEndpointFrame(0, 0, binding);
          return;
        }
        if (initialSurfaceRef.current === FIGURE3_POSTER_FALLBACK && mediaRunTokenRef.current === null) {
          mediaPresentationEnabledRef.current = !prewarm;
          rootRef.current?.setAttribute('data-phone-media-state', 'fallback');
          if (binding.segmentId !== FIGURE3_BRAND_SEGMENT) reportPreparedComposite(binding, FIGURE3_POSTER_FALLBACK);
          return;
        }
        // Brand → Figure3 has a real target activation credit. Do not start
        // an unactivated decode during receiver rebind; activate() owns the
        // prime and the frame-zero proof for that transaction.
        // Hidden prewarm has no activation credit. Preserve a retained
        // frame-zero proof; a cold prewarm may establish only its static
        // fallback. Formal activation remains the sole frame-request owner.
        if (prewarm && initialSurfaceRef.current === FIGURE3_VIDEO_FRAME_ZERO) return;
        if (binding.segmentId === FIGURE3_BRAND_SEGMENT || prewarm) {
          prepareInitialComposite(binding,
            !prewarm && (initialSurfaceRef.current === FIGURE3_VIDEO_FRAME_ZERO
              || mediaRunTokenRef.current !== null), false);
        } else {
          prepareInitialComposite(binding);
        }
        return;
      }
      mediaPresentationEnabledRef.current = true;
      compositorRef.current?.paint();
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && phoneFigure3HasReusableEndpointFrame(
        video, canvas, endpoint
      )) {
        reportRetainedEndpointFrame(endpoint, endpoint, binding);
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
            reportFailure(FIGURE3_PREPARATION_FAILURE, error);
          }
        });
      }
    },
    activate(command): PhoneActivationInvocation {
      const expected = [FIGURE3_VIDEO_SURFACE_ID];
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
      restorePhoneVideoSources(video);
      const direction = command.direction === 'reverse' ? -1 : 1;
      mediaRunTokenRef.current = command.runToken ?? command.invocationId;
      directionRef.current = direction;
      presenterRef.current?.reset();
      mediaPresentationEnabledRef.current = true;
      const generation = prepareInitialComposite(binding, false, false);
      const proof = waitForInitialProof(binding);
      const settled = (async () => {
        if (generation === null) {
          throw new Error('Figure3 activation could not start its initial composite');
        }
        const current = () => !disposedRef.current
          && generation === activationGenerationRef.current
          && binding === bindingRef.current;
        // Prime is an activation-credit attempt, not a proof. Keep it inside
        // the same winner race as the decoded frame so a pending native play
        // promise cannot strand the poster fallback forever.
        let prime: Promise<void>;
        try {
          // Keep the play→pause credit on the physical activation stack.
          prime = primePhoneNativeVideo(video, {
            isCurrent: current,
            phase: () => 'primed',
            onRejected: (error: unknown) => {
              if (!current()) return;
              const root = rootRef.current;
              if (root) root.dataset.phoneFigure3InitialPrimeFailure = error instanceof Error
                ? error.message : String(error);
            }
          });
        } catch (error) {
          prime = Promise.reject(error);
        }
        const preparation = prime.then(() => prepareCurrentFrame(generation, binding, direction)).then(
          (prepared) => ({ kind: 'video' as const, prepared }),
          (error: unknown) => {
            if (!current()) return { kind: 'stale' as const };
            const root = rootRef.current;
            if (root) root.dataset.phoneFigure3InitialFailure = error instanceof Error
              ? error.message : String(error);
            exposePosterFallback(binding, 'decode-failed');
            return { kind: 'fallback' as const };
          }
        );
        const winner = await Promise.race([
          proof.then(() => 'proof' as const),
          preparation
        ]);
        if (winner === 'proof') return;
        if (winner.kind === 'stale') {
          throw new Error('Figure3 activation was superseded before frame preparation');
        }
        if (winner.kind === 'fallback') {
          await proof;
          return;
        }
        if (!winner.prepared) {
          if (generation !== activationGenerationRef.current
            || binding !== bindingRef.current || disposedRef.current) {
            throw new Error('Figure3 activation was superseded before frame preparation');
          }
          exposePosterFallback(binding, 'decode-failed');
          await proof;
          return;
        }
        video.pause();
        await proof;
      })();
      const tracedSettled = settled.catch((error: unknown) => {
        rootRef.current?.setAttribute('data-phone-figure3-activation-settlement',
          error instanceof Error ? error.message : String(error));
        throw error;
      });
      return {
        invocationId: command.invocationId,
        surfaceIds: expected,
        invoked: true,
        settlements: [{ surfaceId: expected[0]!, status: 'pending', settled: tracedSettled }]
      };
    },
    presentFrame,
    setMediaPhase(command) {
      const binding = bindingRef.current;
      const video = videoRef.current;
      if (!binding || !video || disposedRef.current) return;
      if (mediaRunTokenRef.current !== null
        && mediaRunTokenRef.current !== command.runToken) return;
      mediaRunTokenRef.current = command.runToken;
      directionRef.current = command.direction === 'reverse' ? -1 : 1;
      if (command.phase === 'primed') {
        video.pause();
        return;
      }
      if (command.phase === 'held') {
        video.pause();
        return;
      }
      mediaPresentationEnabledRef.current = true;
      // A frame-lock direction remains paused after activation. Subsequent
      // progress is requested through presentFrame(), never through native
      // playback or a second timeline clock.
      video.pause();
    },
    render,
    settle(endpoint) {
      settledEndpointRef.current = endpoint;
      directionRef.current = endpoint === 0 ? 1 : -1;
      presenterRef.current?.reset();
      render(endpoint);
      const binding = bindingRef.current;
      if (!binding || disposedRef.current) return;
      const prewarm = isFigure3Prewarm(binding);
      const root = rootRef.current;
      if (endpoint === 0) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        video?.pause();
        if (!prewarm
          && initialSurfaceRef.current === FIGURE3_VIDEO_FRAME_ZERO) {
          mediaPresentationEnabledRef.current = true;
          if (video && canvas && phoneFigure3HasReusableEndpointFrame(video, canvas, 0)) {
            compositorRef.current?.paint();
            reportRetainedEndpointFrame(0, 0, binding);
          } else {
            if (root) root.dataset.phoneMediaState = 'preparing';
            const generation = ++activationGenerationRef.current;
            void prepareCurrentFrame(generation, binding, directionRef.current)
              .catch((error) => reportFailure(FIGURE3_PREPARATION_FAILURE, error));
          }
        } else prepareInitialComposite(binding, !prewarm);
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
        reportRetainedEndpointFrame(endpoint, endpoint, binding);
        return;
      }
      const generation = ++activationGenerationRef.current;
      void prepareCurrentFrame(generation, binding, directionRef.current)
        .catch((error) => reportFailure(FIGURE3_PREPARATION_FAILURE, error));
    },
    pause() {
      pausedRef.current = true;
      mediaPresentationEnabledRef.current = false;
      activationGenerationRef.current += 1;
      presenterRef.current?.reset();
      mediaRunTokenRef.current = null;
      clearFallbackDeadline();
      const video = videoRef.current;
      if (video) {
        video.pause();
      }
    },
    dispose() {
      if (disposedRef.current) return;
      rejectInitialProofs(new Error('Figure3 activation was disposed before frame preparation'));
      disposedRef.current = true;
      pausedRef.current = false;
      mediaPresentationEnabledRef.current = false;
      activationGenerationRef.current += 1;
      presenterRef.current?.reset();
      mediaRunTokenRef.current = null;
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
    prepareInitialComposite, rejectInitialProofs, render, reportFailure,
    reportPreparedComposite, reportRetainedEndpointFrame, presentFrame,
    waitForInitialProof]);

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'field') sceneRef.current = element;
    if (name === FIGURE3_VIDEO_SURFACE_ID) videoRef.current = element as HTMLVideoElement | null;
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
      canvas
    });
    compositorRef.current = compositor;
    render(0);
    reports.registerMount({
      root: mountRoot,
      surfaces: [
        { id: FIGURE3_VIDEO_SURFACE_ID, element: video, kind: 'video' },
        { id: FIGURE3_PAPER_SURFACE_ID, element: canvas, kind: 'canvas-2d' },
        { id: 'figure3-initial-poster', element: poster, kind: 'image' },
        { id: FIGURE3_COMPOSITE_SURFACE_ID, element: initialComposite, kind: 'dom' }
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
      disposeStrictTimelineVideoDriver(video);
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
  }, [clearFallbackDeadline, commands, exposePosterFallback, rejectInitialProofs,
    render, reportFailure, reports]);

  return (
    <div ref={mountRootRef} className="phone-figure3__mount">
      <section
        ref={rootRef}
        className="phone-figure3"
        data-phone-scene={FIGURE3_SCENE_ID}
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
            scene={FIGURE3_SCENE_ID}
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
export const phoneSceneId = FIGURE3_SCENE_ID;
