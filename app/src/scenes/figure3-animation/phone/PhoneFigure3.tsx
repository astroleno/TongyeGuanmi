import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { browserPrefersHevcAlpha } from '../../../media/alpha-video-sources';
import {
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput
} from '../../../media/timeline-video-driver';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import {
  createGroup45NativeAutoplay,
  type Group45NativeAutoplay,
  type Group45NativeAutoplayDirection,
  type Group45NativeAutoplayStatus
} from '../../../production/phone/adapter-groups/group4-5-native-autoplay';
import type { ScenePresentationAdapterHandle } from '../../../story/presentation';
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
import {
  createPhoneFigure3ReversePlayback,
  type PhoneFigure3ReversePlayback
} from './reverse-playback';
import './PhoneFigure3.css';

const Figure3Surface = figure3AnimationScene.Component;

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

type PhoneFigure3Props = Group45PhoneSceneProps & Readonly<{
  onComplete?: (scene: 'figure3-animation', direction: 1 | -1) => void;
}>;

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
    // Match the canonical desktop paper treatment while retaining the
    // approved left-edge portrait crop for the authored figure.
    backdropOpacity: 1 - backdropSettle * .46,
    backdropScale: 1.06 + backdropSettle * .08
  };
}

/** Scroll chooses an endpoint or starts one decoder-owned forward run. */
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

/** Release the video element before its scene retires from the phone rail. */
export function releasePhoneFigure3Video(video: HTMLVideoElement | null): void {
  if (!video) return;
  disposeTimelineVideoDriver(video);
  video.pause();
  video.removeAttribute('src');
  for (const source of video.querySelectorAll('source')) {
    source.removeAttribute('src');
  }
  try {
    video.load();
  } catch {
    // Detached/mock media elements can reject a post-dispose load.
  }
}

function playbackLabel(
  status: Group45NativeAutoplayStatus,
  direction: Group45NativeAutoplayDirection
): string {
  if (status === 'idle') return 'stable-initial';
  if (status === 'complete') return direction === 1
    ? 'complete-forward'
    : 'complete-reverse';
  if (status === 'starting') return direction === 1
    ? 'starting-forward'
    : 'starting-reverse';
  if (status === 'playing') return direction === 1
    ? 'playing-forward'
    : 'playing-reverse';
  return status;
}

export type PhoneFigure3Endpoint = 0 | 1;

export function phoneFigure3RunStartEndpoint(
  direction: Group45NativeAutoplayDirection
): PhoneFigure3Endpoint {
  return direction === 1 ? 0 : 1;
}

export function phoneFigure3CanStartPreparedRun(
  direction: Group45NativeAutoplayDirection,
  readyEndpoint: PhoneFigure3Endpoint | null
): boolean {
  return readyEndpoint === phoneFigure3RunStartEndpoint(direction);
}

const PHONE_FIGURE3_ENDPOINT_TOLERANCE_SECONDS = .05;
export const PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS = 240;

/**
 * A paused WebKit HEVC frame is usable once the one visible canvas has drawn
 * it. requestVideoFrameCallback may remain pending even after that physical
 * draw, so endpoint ownership follows decoded playhead evidence as well as the
 * shared timeline driver's promise.
 */
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
    && Math.abs(currentTime - targetTime)
      <= PHONE_FIGURE3_ENDPOINT_TOLERANCE_SECONDS;
}

function endpointLabel(endpoint: PhoneFigure3Endpoint): 'initial' | 'terminal' {
  return endpoint === 0 ? 'initial' : 'terminal';
}

function figure3TimelineMediaInput(
  runId: string,
  direction: Group45NativeAutoplayDirection,
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
    allowSeekedFrameFallback: browserPrefersHevcAlpha()
  };
}

/**
 * Figure3 follows the accepted AOD ownership model from 4c659e3: the shell
 * starts and pins one run, then the native decoder owns forward time from
 * source zero. Because Figure3 has no approved reverse asset, reverse uses the
 * canonical timeline driver but advances only after each requested frame has
 * been physically presented and painted into the one visible canvas.
 */
export const PhoneFigure3 = forwardRef<
  ScenePresentationAdapterHandle,
  PhoneFigure3Props
>(function PhoneFigure3(
  {
    active,
    direction = 1,
    prewarm = false,
    reducedMotion,
    onComplete,
    onMediaError,
    onProgress,
    onReady
  },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackRef = useRef<Group45NativeAutoplay | null>(null);
  const reversePlaybackRef = useRef<PhoneFigure3ReversePlayback | null>(null);
  const paperCompositorRef = useRef<PhoneFigure3PaperCompositor | null>(null);
  const activeRef = useRef(active);
  const directionRef = useRef<1 | -1>(direction);
  const prewarmRef = useRef(prewarm);
  const reducedMotionRef = useRef(reducedMotion);
  const mediaMountedRef = useRef((active || prewarm) && !reducedMotion);
  const mediaFailedRef = useRef(false);
  const mediaRetiringRef = useRef(false);
  const hasForwardRunRef = useRef(false);
  const pendingRunDirectionRef = useRef<1 | -1 | null>(
    active && !reducedMotion ? direction : null
  );
  const requestedEndpointRef = useRef<PhoneFigure3Endpoint | null>(null);
  const readyEndpointRef = useRef<PhoneFigure3Endpoint | null>(null);
  const endpointPreparationRef = useRef<Readonly<{
    endpoint: PhoneFigure3Endpoint;
    direction: 1 | -1;
    generation: number;
    runId: string;
    onPresented: (() => void) | undefined;
  }> | null>(null);
  const endpointGenerationRef = useRef(0);
  const endpointRunSequenceRef = useRef(0);
  const endpointFallbackTimerRef = useRef(0);
  const completionReportedRef = useRef(false);
  const propsReconciledRef = useRef(false);
  const runGenerationRef = useRef(0);
  const reverseRunIdRef = useRef('phone-figure3-reverse-0');
  const completionListenerRef = useRef(onComplete);
  const completeRunRef = useRef<(direction: 1 | -1) => void>(() => undefined);
  const mediaErrorListenerRef = useRef(onMediaError);
  const progressListenerRef = useRef(onProgress);
  const [mediaMounted, setMediaMounted] = useState(mediaMountedRef.current);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  completionListenerRef.current = onComplete;
  mediaErrorListenerRef.current = onMediaError;
  progressListenerRef.current = onProgress;

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name !== 'figure3-video') return;
    element?.setAttribute('data-phone-figure3-video', '');
    videoRef.current = element as HTMLVideoElement | null;
  }, []);

  const renderFrame = useCallback((rawProgress: number) => {
    const root = rootRef.current;
    const frame = phoneFigure3Frame(
      rawProgress,
      reducedMotionRef.current,
      mediaFailedRef.current
    );
    if (!root) return;
    renderFigure3AnimationProgress(root, frame.progress);
    const surface = root.querySelector<HTMLElement>('[data-r4-scene="figure3-animation"]');
    surface?.style.setProperty('--figure3-video-opacity', frame.videoOpacity.toFixed(4));
    surface?.style.setProperty('--figure3-video-scale', frame.videoScale.toFixed(4));
    surface?.style.setProperty('--figure3-backdrop-opacity', frame.backdropOpacity.toFixed(4));
    surface?.style.setProperty('--figure3-backdrop-scale', frame.backdropScale.toFixed(4));
    root.style.setProperty('--phone-figure3-video-opacity', frame.videoOpacity.toFixed(4));
    root.style.setProperty('--phone-figure3-video-scale', frame.videoScale.toFixed(4));
    root.style.setProperty('--phone-figure3-backdrop-opacity', frame.backdropOpacity.toFixed(4));
    root.style.setProperty('--phone-figure3-backdrop-scale', frame.backdropScale.toFixed(4));
    root.dataset.phoneFigure3Progress = frame.progress.toFixed(4);
  }, []);

  const mountMedia = useCallback(() => {
    if (mediaMountedRef.current) return;
    mediaMountedRef.current = true;
    mediaRetiringRef.current = false;
    setMediaMounted(true);
  }, []);

  const clearEndpointPresentation = useCallback(() => {
    readyEndpointRef.current = null;
    const root = rootRef.current;
    if (root) {
      delete root.dataset.phoneFigure3EndpointReady;
      delete root.dataset.phoneFigure3EndpointState;
    }
  }, []);

  const releaseMedia = useCallback(() => {
    runGenerationRef.current += 1;
    endpointGenerationRef.current += 1;
    mediaRetiringRef.current = true;
    pendingRunDirectionRef.current = null;
    requestedEndpointRef.current = null;
    endpointPreparationRef.current = null;
    if (endpointFallbackTimerRef.current) {
      window.clearTimeout(endpointFallbackTimerRef.current);
      endpointFallbackTimerRef.current = 0;
    }
    clearEndpointPresentation();
    paperCompositorRef.current?.dispose();
    paperCompositorRef.current = null;
    releasePhoneFigure3PaperCanvas(canvasRef.current);
    reversePlaybackRef.current?.dispose();
    reversePlaybackRef.current = null;
    playbackRef.current?.dispose();
    playbackRef.current = null;
    releasePhoneFigure3Video(videoRef.current);
    const root = rootRef.current;
    if (root) delete root.dataset.phoneFigure3PaperCompositor;
    mediaMountedRef.current = false;
    setMediaReady(false);
    setMediaMounted(false);
  }, [clearEndpointPresentation]);

  const failMedia = useCallback(() => {
    if (mediaRetiringRef.current || mediaFailedRef.current) return;
    mediaFailedRef.current = true;
    setMediaFailed(true);
    renderFrame(1);
    releaseMedia();
    const root = rootRef.current;
    root?.setAttribute('data-phone-figure3-fallback-endpoint', 'terminal');
    root?.setAttribute('data-phone-media-state', 'fallback');
    mediaErrorListenerRef.current?.('figure3-animation');
  }, [releaseMedia, renderFrame]);

  const startPreparedRun = useCallback(() => {
    const runDirection = pendingRunDirectionRef.current;
    const playback = playbackRef.current;
    if (
      runDirection === null
      || !activeRef.current
      || !playback
      || !phoneFigure3CanStartPreparedRun(
        runDirection,
        readyEndpointRef.current
      )
    ) return;
    pendingRunDirectionRef.current = null;
    requestedEndpointRef.current = null;
    endpointPreparationRef.current = null;
    clearEndpointPresentation();
    completionReportedRef.current = false;
    if (runDirection === 1) {
      // A completed reverse leaves a shared seek driver on this element.
      // Retire it before native forward playback takes sole ownership again.
      if (videoRef.current) disposeTimelineVideoDriver(videoRef.current);
      hasForwardRunRef.current = true;
      reversePlaybackRef.current?.stop();
      playback.start(1);
      return;
    }
    reversePlaybackRef.current?.start();
  }, [clearEndpointPresentation]);

  const finishEndpointPresentation = useCallback((
    generation: number,
    endpoint: PhoneFigure3Endpoint,
    runId: string,
    compositor?: PhoneFigure3PaperCompositor,
    frameAlreadyPainted = false
  ): boolean => {
    let preparation = endpointPreparationRef.current;
    const video = videoRef.current;
    if (
      mediaRetiringRef.current
      || preparation?.generation !== generation
      || preparation.endpoint !== endpoint
      || preparation.runId !== runId
      || (compositor && (
        !video
        || !phoneFigure3EndpointIsPresented(
          endpoint,
          video.currentTime,
          video.readyState,
          video.seeking
        )
      ))
    ) return false;

    if (compositor && !frameAlreadyPainted) {
      if (!compositor.paint()) return false;
      // paint() publishes presented-frame evidence synchronously. Its callback
      // may have completed this same preparation, so never commit it twice.
      preparation = endpointPreparationRef.current;
      if (
        preparation?.generation !== generation
        || preparation.endpoint !== endpoint
        || preparation.runId !== runId
      ) return true;
    }

    if (endpointFallbackTimerRef.current) {
      window.clearTimeout(endpointFallbackTimerRef.current);
      endpointFallbackTimerRef.current = 0;
    }
    const onPresented = preparation.onPresented;
    readyEndpointRef.current = endpoint;
    endpointPreparationRef.current = null;
    const label = endpointLabel(endpoint);
    rootRef.current?.setAttribute('data-phone-figure3-endpoint-ready', label);
    rootRef.current?.setAttribute(
      'data-phone-figure3-endpoint-state',
      `${compositor ? 'ready' : 'fallback'}-${label}`
    );
    onPresented?.();
    startPreparedRun();
    return true;
  }, [startPreparedRun]);

  const prepareEndpoint = useCallback((
    endpoint: PhoneFigure3Endpoint,
    preparationDirection: 1 | -1,
    preferredRunId?: string,
    onPresented?: () => void
  ) => {
    requestedEndpointRef.current = endpoint;
    const playback = playbackRef.current;
    const video = videoRef.current;
    const compositor = paperCompositorRef.current;
    if (!playback || !video || !compositor) return;
    if (readyEndpointRef.current === endpoint) {
      onPresented?.();
      startPreparedRun();
      return;
    }
    const inFlight = endpointPreparationRef.current;
    if (
      inFlight?.endpoint === endpoint
      && inFlight.direction === preparationDirection
    ) {
      if (onPresented && inFlight.onPresented !== onPresented) {
        endpointPreparationRef.current = { ...inFlight, onPresented };
      }
      finishEndpointPresentation(
        inFlight.generation,
        inFlight.endpoint,
        inFlight.runId,
        compositor
      );
      return;
    }

    const generation = ++endpointGenerationRef.current;
    if (endpointFallbackTimerRef.current) {
      window.clearTimeout(endpointFallbackTimerRef.current);
      endpointFallbackTimerRef.current = 0;
    }
    const runId = preferredRunId ?? (
      preparationDirection === -1
        ? `phone-figure3-reverse-${++endpointRunSequenceRef.current}`
        : `phone-figure3-initial-${++endpointRunSequenceRef.current}`
    );
    if (preparationDirection === -1) reverseRunIdRef.current = runId;
    endpointPreparationRef.current = {
      endpoint,
      direction: preparationDirection,
      generation,
      runId,
      onPresented
    };
    clearEndpointPresentation();
    const root = rootRef.current;
    if (root) {
      const label = endpointLabel(endpoint);
      root.dataset.phoneFigure3EndpointState = `preparing-${label}`;
      root.dataset.phoneFigure3FallbackEndpoint = label;
    }
    playback.reset(endpoint);
    renderFrame(endpoint);
    if (finishEndpointPresentation(
      generation,
      endpoint,
      runId,
      compositor
    )) return;

    endpointFallbackTimerRef.current = window.setTimeout(() => {
      endpointFallbackTimerRef.current = 0;
      finishEndpointPresentation(
        generation,
        endpoint,
        runId
      );
    }, PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS);

    void prepareTimelineVideoFrame(
      video,
      figure3TimelineMediaInput(runId, preparationDirection, endpoint)
    ).then((result) => {
      const preparation = endpointPreparationRef.current;
      if (
        result?.status !== 'ready'
        || preparation?.generation !== generation
        || preparation.endpoint !== endpoint
        || preparation.runId !== runId
      ) return;
      finishEndpointPresentation(
        generation,
        endpoint,
        runId,
        compositor
      );
    }).catch((error) => {
      // A rejected frame callback is not a failed HEVC decode. The canvas
      // compositor can still prove the endpoint through loadeddata/seeked;
      // genuine media errors are owned by the media element and shell timeout.
      finishEndpointPresentation(
        generation,
        endpoint,
        runId,
        compositor
      );
      void error;
    });
  }, [
    clearEndpointPresentation,
    finishEndpointPresentation,
    renderFrame,
    startPreparedRun
  ]);

  const completeRun = useCallback((playbackDirection: 1 | -1) => {
    const completionGeneration = runGenerationRef.current;
    hasForwardRunRef.current = playbackDirection === 1;
    pendingRunDirectionRef.current = null;
    const endpoint = playbackDirection === 1 ? 1 : 0;
    renderFrame(endpoint);
    const reportCompletion = () => {
      if (
        mediaRetiringRef.current
        || completionGeneration !== runGenerationRef.current
        || completionReportedRef.current
      ) return;
      completionReportedRef.current = true;
      completionListenerRef.current?.('figure3-animation', playbackDirection);
    };
    // A logical clock endpoint is not a presented Safari frame. Prefer its
    // canvas frame, then use the exact endpoint poster before handoff can stall.
    prepareEndpoint(
      endpoint,
      -1,
      playbackDirection === -1 ? reverseRunIdRef.current : undefined,
      reportCompletion
    );
  }, [prepareEndpoint, renderFrame]);
  completeRunRef.current = completeRun;

  const startRun = useCallback((runDirection: 1 | -1) => {
    if (reducedMotionRef.current || mediaFailedRef.current) return;
    const playback = playbackRef.current;
    const reversePlayback = reversePlaybackRef.current;
    if (
      runDirection === -1
      && activeRef.current
      && directionRef.current === -1
      && reversePlayback?.active
    ) {
      reversePlayback.retry();
      return;
    }
    if (
      activeRef.current
      && directionRef.current === runDirection
      && playback?.active
    ) {
      playback.retry();
      return;
    }
    const endpoint = phoneFigure3RunStartEndpoint(runDirection);
    const alreadyPending = pendingRunDirectionRef.current === runDirection
      && requestedEndpointRef.current === endpoint
      && (
        endpointPreparationRef.current?.endpoint === endpoint
        || readyEndpointRef.current === endpoint
      );
    if (!alreadyPending) {
      runGenerationRef.current += 1;
      completionReportedRef.current = false;
    }
    activeRef.current = true;
    directionRef.current = runDirection;
    pendingRunDirectionRef.current = runDirection;
    mountMedia();
    prepareEndpoint(
      endpoint,
      runDirection === -1 ? -1 : 1,
      runDirection === -1 ? reverseRunIdRef.current : undefined
    );
  }, [mountMedia, prepareEndpoint]);

  const reconcileMedia = useCallback(() => {
    const root = rootRef.current;
    if (root) root.dataset.phoneFigure3Active = String(activeRef.current);
    const action = phoneFigure3MediaAction(
      activeRef.current,
      prewarmRef.current,
      reducedMotionRef.current,
      mediaFailedRef.current,
      hasForwardRunRef.current,
      directionRef.current
    );
    if (action === 'static-fallback') {
      pendingRunDirectionRef.current = null;
      root?.setAttribute(
        'data-phone-figure3-fallback-endpoint',
        mediaFailedRef.current ? 'terminal' : 'initial'
      );
      renderFrame(mediaFailedRef.current ? 1 : 0);
      releaseMedia();
      return;
    }
    if (action === 'release') {
      releaseMedia();
      return;
    }
    mediaRetiringRef.current = false;
    mountMedia();
    const playback = playbackRef.current;
    if (!playback) return;
    if (action === 'play-forward' || action === 'play-reverse') {
      if (pendingRunDirectionRef.current !== null) {
        startRun(pendingRunDirectionRef.current);
      }
      return;
    }
    pendingRunDirectionRef.current = null;
    const endpoint = action === 'hold-terminal' ? 1 : 0;
    prepareEndpoint(endpoint, endpoint === 1 ? -1 : 1);
  }, [mountMedia, prepareEndpoint, releaseMedia, renderFrame, startRun]);

  useEffect(() => {
    if (!mediaMounted) return;
    const root = rootRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!root || !video || !canvas) return;
    root.dataset.phoneFigure3PaperCompositor = 'preparing';
    const compositor = createPhoneFigure3PaperCompositor({
      video,
      canvas,
      onFrame: () => {
        if (!mediaRetiringRef.current) {
          root.dataset.phoneFigure3PaperCompositor = 'ready';
        }
      },
      onPresentedFrame: () => {
        const preparation = endpointPreparationRef.current;
        const activeCompositor = paperCompositorRef.current;
        if (!preparation || !activeCompositor) return;
        finishEndpointPresentation(
          preparation.generation,
          preparation.endpoint,
          preparation.runId,
          activeCompositor,
          true
        );
      }
    });
    paperCompositorRef.current = compositor;
    return () => {
      compositor.dispose();
      if (paperCompositorRef.current === compositor) {
        paperCompositorRef.current = null;
      }
      delete root.dataset.phoneFigure3PaperCompositor;
    };
  }, [finishEndpointPresentation, mediaMounted]);

  useEffect(() => {
    if (!mediaMounted) return;
    const video = videoRef.current;
    if (!video) return;
    mediaRetiringRef.current = false;
    disposeTimelineVideoDriver(video);
    const playback = createGroup45NativeAutoplay(video, {
      durationSeconds: FIGURE3_END_SECONDS,
      onProgress: (progress, playbackDirection) => {
        renderFrame(progress);
        progressListenerRef.current?.(
          'figure3-animation',
          progress,
          playbackDirection
        );
      },
      onReady: () => setMediaReady(true),
      onStatus: (status, playbackDirection) => {
        if (rootRef.current) {
          rootRef.current.dataset.phoneFigure3Playback = playbackLabel(
            status,
            playbackDirection
          );
        }
      },
      onComplete: (playbackDirection) => completeRunRef.current(playbackDirection),
      onError: failMedia
    });
    const compositor = paperCompositorRef.current;
    if (!compositor) {
      playback.dispose();
      failMedia();
      return;
    }
    const reversePlayback = createPhoneFigure3ReversePlayback({
      durationMs: FIGURE3_END_SECONDS * 1000,
      prepare: async (progress) => {
        const result = await prepareTimelineVideoFrame(
          video,
          figure3TimelineMediaInput(
            reverseRunIdRef.current,
            -1,
            progress
          )
        );
        return result?.status === 'ready' && compositor.paint();
      },
      render: (progress) => {
        renderFrame(progress);
        progressListenerRef.current?.('figure3-animation', progress, -1);
      },
      onStatus: (status) => {
        if (rootRef.current) {
          rootRef.current.dataset.phoneFigure3Playback = status === 'complete'
            ? 'complete-reverse'
            : status === 'idle'
              ? 'stable-initial'
              : status === 'error'
                ? 'error'
                : status === 'suspended'
                  ? 'suspended'
                  : `${status}-reverse`;
        }
      },
      onComplete: () => completeRunRef.current(-1),
      onError: failMedia
    });
    playbackRef.current = playback;
    reversePlaybackRef.current = reversePlayback;
    video.preload = 'auto';
    if (video.readyState === 0) {
      try {
        video.load();
      } catch {
        // Safari may already be starting the selected source asynchronously.
      }
    }
    playback.reset(0);
    reconcileMedia();
    return () => {
      reversePlayback.dispose();
      if (reversePlaybackRef.current === reversePlayback) {
        reversePlaybackRef.current = null;
      }
      playback.dispose();
      if (playbackRef.current === playback) playbackRef.current = null;
    };
  }, [failMedia, mediaMounted, prepareEndpoint, reconcileMedia, renderFrame]);

  useEffect(() => {
    const wasActive = activeRef.current;
    const previousDirection = directionRef.current;
    const firstReconcile = !propsReconciledRef.current;
    propsReconciledRef.current = true;
    activeRef.current = active;
    directionRef.current = direction;
    prewarmRef.current = prewarm;
    reducedMotionRef.current = reducedMotion;
    if (active && (firstReconcile || !wasActive || previousDirection !== direction)) {
      startRun(direction);
      return;
    }
    if (!active) {
      pendingRunDirectionRef.current = null;
    }
    reconcileMedia();
  }, [active, direction, prewarm, reconcileMedia, reducedMotion, startRun]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => () => releaseMedia(), [releaseMedia]);

  const update = useCallback((rawProgress: number) => {
    rootRef.current?.setAttribute(
      'data-phone-figure3-scroll-progress',
      clamp(rawProgress).toFixed(4)
    );
  }, []);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update,
    enter() {
      activeRef.current = true;
      directionRef.current = 1;
      startRun(1);
    },
    leave() {
      activeRef.current = false;
      pendingRunDirectionRef.current = null;
      reconcileMedia();
    },
    reverse() {
      activeRef.current = true;
      directionRef.current = -1;
      startRun(-1);
    },
    dispose() {
      releaseMedia();
      const root = rootRef.current;
      if (!root) return;
      delete root.dataset.phoneFigure3Active;
      delete root.dataset.phoneFigure3Progress;
      delete root.dataset.phoneFigure3ScrollProgress;
      delete root.dataset.phoneFigure3Playback;
      delete root.dataset.phoneFigure3EndpointReady;
      delete root.dataset.phoneFigure3EndpointState;
      delete root.dataset.phoneFigure3FallbackEndpoint;
      delete root.dataset.phoneMediaState;
      root.style.removeProperty('--phone-figure3-video-opacity');
      root.style.removeProperty('--phone-figure3-video-scale');
      root.style.removeProperty('--phone-figure3-backdrop-opacity');
      root.style.removeProperty('--phone-figure3-backdrop-scale');
      delete root.dataset.phoneFigure3PaperCompositor;
    }
  }), [reconcileMedia, releaseMedia, renderFrame, startRun, update]);

  const mediaState = mediaFailed
    ? 'fallback'
    : reducedMotion
      ? 'reduced'
      : mediaReady
        ? 'ready'
        : 'preparing';

  return (
    <section
      ref={rootRef}
      className="phone-figure3"
      data-phone-scene="figure3-animation"
      data-phone-media-owner="figure3-motion"
      data-phone-media-state={mediaState}
      aria-hidden="true"
    >
      <div className="phone-figure3__fallback" data-phone-media-fallback="figure3" />
      {mediaMounted && (
        <>
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
        </>
      )}
    </section>
  );
});

export default PhoneFigure3;
