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
import { FIGURE3_SERVICES_DURATION_MS } from '../../../story/timings';
import type { ScenePresentationAdapterHandle } from '../../../story/presentation';
import {
  FIGURE3_END_SECONDS,
  figure3AnimationScene,
  renderFigure3AnimationProgress
} from '..';
import './PhoneFigure3.css';

const FIGURE3_PHONE_RUN_ID = 'phone-figure3-autoplay';
const FIGURE3_FIRST_FRAME_RUN_ID = 'phone-figure3-first-frame';
const FIGURE3_STABLE_ENDPOINT_RUN_ID = 'phone-figure3-stable-endpoint';
const Figure3Surface = figure3AnimationScene.Component;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type PhoneFigure3Frame = Readonly<{
  progress: number;
  videoOpacity: number;
  videoScale: number;
  backdropOpacity: number;
}>;

export type PhoneFigure3MediaAction =
  | 'release'
  | 'static-fallback'
  | 'prewarm-first-frame'
  | 'play-forward'
  | 'hold-initial'
  | 'hold-terminal';

export type PhoneFigure3ForwardRunState =
  | 'idle'
  | 'preparing'
  | 'starting'
  | 'playing'
  | 'terminal'
  | 'stable-initial'
  | 'stable-terminal';

export type PhoneFigure3ForwardRunAction = 'start' | 'wait' | 'ignore';

type PhoneFigure3Props = Group45PhoneSceneProps & Readonly<{
  /** Figure3's finished frame hands the one-screen phone stage to Services. */
  onComplete?: (scene: 'figure3-animation') => void;
}>;

/** One active forward token makes repeated React reconciliation harmless. */
export function phoneFigure3ForwardRunAction(
  requestForward: boolean,
  forwardRequested: boolean,
  state: PhoneFigure3ForwardRunState
): PhoneFigure3ForwardRunAction {
  if (!requestForward && !forwardRequested) return 'ignore';
  if (
    forwardRequested
    && (state === 'preparing' || state === 'starting' || state === 'playing')
  ) {
    return 'wait';
  }
  return 'start';
}

/** A stale play promise may update neither state nor the current video owner. */
export function phoneFigure3OwnsNativeRun(
  run: number,
  currentForwardRun: number,
  nativePlayRun: number
): boolean {
  return run === currentForwardRun && run === nativePlayRun;
}

/** Phone-specific Figure3 framing; it never scales a desktop scene tree. */
export function phoneFigure3Frame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false
): PhoneFigure3Frame {
  const progress = mediaFailed ? 1 : reducedMotion ? 0 : clamp(rawProgress);
  const visualProgress = .78 * progress + .22 * progress * progress;
  return {
    progress,
    videoOpacity: mediaFailed || reducedMotion ? 0 : 1,
    videoScale: 1.015 + visualProgress * 0.035,
    backdropOpacity: 1 - visualProgress * 0.18
  };
}

/**
 * Figure3's document scroll only decides which stable state is visible. Its
 * forward motion starts at source time zero and then belongs to the native
 * decoder, matching the AOD ownership model.
 */
export function phoneFigure3MediaAction(
  active: boolean,
  prewarm = false,
  reducedMotion = false,
  mediaFailed = false,
  hasForwardRun = false,
  direction: 1 | -1 = 1
): PhoneFigure3MediaAction {
  if (reducedMotion || mediaFailed) return 'static-fallback';
  if (active) return direction === -1 ? 'hold-initial' : 'play-forward';
  if (!prewarm) return 'release';
  return hasForwardRun && direction === 1 ? 'hold-terminal' : 'hold-initial';
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

/**
 * Kept as the scene's public media contract. A caller can inspect the native
 * forward preference, while this adapter deliberately submits only progress
 * zero to it before it calls `video.play()` itself.
 */
export function phoneFigure3MediaInput(
  progress: number,
  direction: 1 | -1,
  reducedMotion = false
): TimelineVideoDriveInput {
  return {
    runId: FIGURE3_PHONE_RUN_ID,
    direction,
    progress: clamp(progress),
    durationFallbackSeconds: 2.6,
    startSeconds: 0,
    endSeconds: FIGURE3_END_SECONDS,
    timelineDurationMs: FIGURE3_SERVICES_DURATION_MS,
    mode: direction === 1 ? 'native-preferred' : 'timeline',
    nativePlaybackDirection: 1,
    reducedMotion,
    allowSeekedFrameFallback: browserPrefersHevcAlpha()
  };
}

/** The autonomous run always starts from the authored first frame. */
export function phoneFigure3AutoplayInput(
  reducedMotion = false
): TimelineVideoDriveInput {
  return {
    ...phoneFigure3MediaInput(0, 1, reducedMotion),
    runId: FIGURE3_PHONE_RUN_ID
  };
}

/** Reverse navigation resolves at a paused, seek-verified endpoint. */
export function phoneFigure3StableEndpointInput(
  endpoint: 0 | 1,
  reducedMotion = false
): TimelineVideoDriveInput {
  return {
    ...phoneFigure3MediaInput(endpoint, -1, reducedMotion),
    runId: endpoint === 0
      ? FIGURE3_FIRST_FRAME_RUN_ID
      : FIGURE3_STABLE_ENDPOINT_RUN_ID,
    mode: 'timeline'
  };
}

function mediaProgress(video: HTMLVideoElement): number {
  return clamp(video.currentTime / Math.max(.001, FIGURE3_END_SECONDS));
}

/**
 * Phone-owned Figure3 media surface. Scroll can enter or reverse the scene,
 * but never seeks an in-flight forward run. A reversed arrival uses the
 * authored first frame as its stable endpoint because this source has no
 * independently encoded reverse plate.
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
    onReady
  },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeRef = useRef(active);
  const prewarmRef = useRef(prewarm);
  const reducedMotionRef = useRef(reducedMotion);
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const activeSessionRef = useRef(false);
  const hasForwardRunRef = useRef(false);
  const forwardRequestedRef = useRef(false);
  const completionReportedRef = useRef(false);
  const completionListenerRef = useRef(onComplete);
  const mediaFailedRef = useRef(false);
  const mediaRetiringRef = useRef(false);
  const mediaGenerationRef = useRef(0);
  const preparationAbortRef = useRef<AbortController | null>(null);
  const preparationRef = useRef<Promise<boolean> | null>(null);
  const preparingEndpointRef = useRef<0 | 1 | null>(null);
  const readyEndpointRef = useRef<0 | 1 | null>(null);
  const forwardRunRef = useRef(0);
  const nativePlayRunRef = useRef(0);
  const forwardStateRef = useRef<PhoneFigure3ForwardRunState>('idle');
  const [mediaMounted, setMediaMounted] = useState((active || prewarm) && !reducedMotion);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  completionListenerRef.current = onComplete;

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'figure3-video') {
      element?.setAttribute('data-phone-figure3-video', '');
      videoRef.current = element as HTMLVideoElement | null;
    }
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
    root.style.setProperty('--phone-figure3-video-opacity', frame.videoOpacity.toFixed(4));
    root.style.setProperty('--phone-figure3-video-scale', frame.videoScale.toFixed(4));
    root.style.setProperty('--phone-figure3-backdrop-opacity', frame.backdropOpacity.toFixed(4));
    root.dataset.phoneFigure3Progress = frame.progress.toFixed(4);
  }, []);

  const invalidatePreparation = useCallback(() => {
    mediaGenerationRef.current += 1;
    preparationAbortRef.current?.abort();
    preparationAbortRef.current = null;
    preparationRef.current = null;
    preparingEndpointRef.current = null;
  }, []);

  /** Invalidate a pending native `play()` without letting it pause a newer run. */
  const cancelForwardRun = useCallback((nextState: 'idle' | 'stable-initial' | 'stable-terminal' = 'idle') => {
    forwardRequestedRef.current = false;
    forwardRunRef.current += 1;
    nativePlayRunRef.current = 0;
    forwardStateRef.current = nextState;
    videoRef.current?.pause();
  }, []);

  const releaseMedia = useCallback(() => {
    mediaRetiringRef.current = true;
    cancelForwardRun();
    invalidatePreparation();
    readyEndpointRef.current = null;
    releasePhoneFigure3Video(videoRef.current);
    setMediaReady(false);
    setMediaMounted(false);
  }, [cancelForwardRun, invalidatePreparation]);

  const failMedia = useCallback(() => {
    if (mediaRetiringRef.current || mediaFailedRef.current) return;
    mediaFailedRef.current = true;
    forwardRequestedRef.current = false;
    setMediaFailed(true);
    setMediaReady(false);
    if (rootRef.current) rootRef.current.dataset.phoneMediaState = 'fallback';
    releaseMedia();
    onMediaError?.('figure3-animation');
  }, [onMediaError, releaseMedia]);

  /** Prepare a visible, paused endpoint before exposing or starting media. */
  const prepareStableFrame = useCallback((endpoint: 0 | 1): Promise<boolean> => {
    if (
      readyEndpointRef.current === endpoint
      && mediaReady
      && videoRef.current
    ) {
      return Promise.resolve(true);
    }
    if (
      preparationRef.current
      && preparingEndpointRef.current === endpoint
    ) {
      return preparationRef.current;
    }
    const video = videoRef.current;
    if (!video || reducedMotionRef.current || mediaFailedRef.current) {
      return Promise.resolve(false);
    }

    invalidatePreparation();
    mediaRetiringRef.current = false;
    const generation = mediaGenerationRef.current;
    const controller = new AbortController();
    preparationAbortRef.current = controller;
    preparingEndpointRef.current = endpoint;
    const root = rootRef.current;
    if (root) root.dataset.phoneFigure3Playback = endpoint === 0
      ? 'preparing-initial'
      : 'preparing-terminal';
    video.pause();
    video.muted = true;
    video.loop = false;
    video.playsInline = true;
    video.preload = 'auto';

    const preparation = prepareTimelineVideoFrame(
      video,
      {
        ...phoneFigure3StableEndpointInput(endpoint, reducedMotionRef.current),
        signal: controller.signal
      }
    ).then((result) => {
      if (
        controller.signal.aborted
        || generation !== mediaGenerationRef.current
        || result?.status !== 'ready'
      ) {
        return false;
      }
      readyEndpointRef.current = endpoint;
      setMediaReady(true);
      renderFrame(endpoint);
      if (!forwardRequestedRef.current) {
        forwardStateRef.current = endpoint === 0 ? 'stable-initial' : 'stable-terminal';
      }
      if (rootRef.current) {
        rootRef.current.dataset.phoneFigure3Playback = endpoint === 0
          ? 'stable-initial'
          : 'stable-terminal';
      }
      return true;
    }).catch(() => {
      if (
        controller.signal.aborted
        || generation !== mediaGenerationRef.current
        || mediaRetiringRef.current
      ) {
        return false;
      }
      failMedia();
      return false;
    }).finally(() => {
      if (preparationRef.current === preparation) {
        preparationRef.current = null;
        preparingEndpointRef.current = null;
        preparationAbortRef.current = null;
      }
    });
    preparationRef.current = preparation;
    return preparation;
  }, [failMedia, invalidatePreparation, mediaReady, renderFrame]);

  /** Start one native forward run only after its first frame is confirmed. */
  const startForwardPlayback = useCallback((requestForward = true) => {
    const runAction = phoneFigure3ForwardRunAction(
      requestForward,
      forwardRequestedRef.current,
      forwardStateRef.current
    );
    if (runAction === 'ignore' || runAction === 'wait') return;
    if (requestForward) {
      forwardRequestedRef.current = true;
      hasForwardRunRef.current = true;
    }
    if (!forwardRequestedRef.current) return;
    if (reducedMotionRef.current || mediaFailedRef.current) return;
    forwardRunRef.current += 1;
    nativePlayRunRef.current = 0;
    completionReportedRef.current = false;
    forwardStateRef.current = 'preparing';
    const video = videoRef.current;
    if (!video) {
      setMediaMounted(true);
      return;
    }
    const request = forwardRunRef.current;
    void prepareStableFrame(0).then((ready) => {
      if (
        !ready
        || request !== forwardRunRef.current
        || !forwardRequestedRef.current
        || !activeRef.current
        || mediaRetiringRef.current
        || mediaFailedRef.current
      ) {
        return;
      }
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      if (
        forwardStateRef.current === 'starting'
        || forwardStateRef.current === 'playing'
      ) {
        return;
      }
      readyEndpointRef.current = null;
      forwardStateRef.current = 'starting';
      nativePlayRunRef.current = request;
      currentVideo.playbackRate = 1;
      if (rootRef.current) rootRef.current.dataset.phoneFigure3Playback = 'starting-forward';
      let playback: Promise<void>;
      try {
        playback = Promise.resolve(currentVideo.play());
      } catch {
        playback = Promise.reject(new Error('Figure3 native playback rejected'));
      }
      void playback.then(() => {
        if (
          !phoneFigure3OwnsNativeRun(
            request,
            forwardRunRef.current,
            nativePlayRunRef.current
          )
          || !forwardRequestedRef.current
          || !activeRef.current
          || mediaRetiringRef.current
        ) {
          // A stale promise must never pause the currently authoritative run.
          return;
        }
        forwardStateRef.current = 'playing';
        if (rootRef.current) rootRef.current.dataset.phoneFigure3Playback = 'playing-forward';
      }).catch(() => {
        if (
          phoneFigure3OwnsNativeRun(
            request,
            forwardRunRef.current,
            nativePlayRunRef.current
          )
          && forwardRequestedRef.current
          && !mediaRetiringRef.current
        ) {
          failMedia();
        }
      });
    });
  }, [failMedia, prepareStableFrame]);

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
      forwardRequestedRef.current = false;
      renderFrame(0);
      releaseMedia();
      return;
    }
    if (action === 'release') {
      releaseMedia();
      return;
    }
    mediaRetiringRef.current = false;
    if (!mediaMounted || !videoRef.current) {
      setMediaMounted(true);
      return;
    }
    if (action === 'play-forward') {
      // A prop/state re-render after a completed run must preserve its
      // terminal frame. Only entry or a new forward trigger asks to replay.
      if (forwardRequestedRef.current) startForwardPlayback(false);
      return;
    }
    cancelForwardRun(action === 'hold-terminal' ? 'stable-terminal' : 'stable-initial');
    void prepareStableFrame(action === 'hold-terminal' ? 1 : 0);
  }, [cancelForwardRun, mediaMounted, prepareStableFrame, releaseMedia, renderFrame, startForwardPlayback]);

  /**
   * Keep scroll diagnostics and direction, but never map its position to an
   * active Figure3 playhead. A direction reversal settles the authored first
   * frame; a new forward pass triggers another autonomous run from zero.
   */
  const update = useCallback((rawProgress: number) => {
    const progress = clamp(rawProgress);
    const previousDirection = directionRef.current;
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    const root = rootRef.current;
    if (root) root.dataset.phoneFigure3ScrollProgress = progress.toFixed(4);

    if (
      activeRef.current
      && !reducedMotionRef.current
      && !mediaFailedRef.current
      && previousDirection !== directionRef.current
    ) {
      if (directionRef.current === -1) {
        cancelForwardRun('stable-initial');
        void prepareStableFrame(0);
      } else {
        startForwardPlayback();
      }
    }
  }, [cancelForwardRun, prepareStableFrame, startForwardPlayback]);

  useEffect(() => {
    if (!mediaMounted) return;
    const video = videoRef.current;
    if (!video) return;
    const handleLoadedMetadata = () => reconcileMedia();
    const handleTimeUpdate = () => {
      if (
        forwardRequestedRef.current
        && phoneFigure3OwnsNativeRun(
          nativePlayRunRef.current,
          forwardRunRef.current,
          nativePlayRunRef.current
        )
      ) {
        renderFrame(mediaProgress(video));
      }
    };
    const handlePlay = () => {
      if (
        !forwardRequestedRef.current
        || !phoneFigure3OwnsNativeRun(
          nativePlayRunRef.current,
          forwardRunRef.current,
          nativePlayRunRef.current
        )
        || (forwardStateRef.current !== 'starting' && forwardStateRef.current !== 'playing')
      ) {
        video.pause();
        return;
      }
      forwardStateRef.current = 'playing';
      if (rootRef.current) {
        rootRef.current.dataset.phoneFigure3Playback = 'playing-forward';
      }
    };
    const handleEnded = () => {
      if (
        !forwardRequestedRef.current
        || !phoneFigure3OwnsNativeRun(
          nativePlayRunRef.current,
          forwardRunRef.current,
          nativePlayRunRef.current
        )
      ) return;
      forwardRequestedRef.current = false;
      nativePlayRunRef.current = 0;
      forwardStateRef.current = 'terminal';
      readyEndpointRef.current = 1;
      renderFrame(1);
      if (rootRef.current) {
        rootRef.current.dataset.phoneFigure3Playback = 'complete-forward';
      }
      if (!completionReportedRef.current) {
        completionReportedRef.current = true;
        completionListenerRef.current?.('figure3-animation');
      }
    };
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', failMedia);
    reconcileMedia();
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', failMedia);
    };
  }, [failMedia, mediaMounted, reconcileMedia, renderFrame]);

  useEffect(() => {
    const wasActive = activeRef.current;
    const directionChanged = directionRef.current !== direction;
    activeRef.current = active;
    directionRef.current = direction;
    prewarmRef.current = prewarm;
    reducedMotionRef.current = reducedMotion;
    if (active) {
      const startingSession = !wasActive || !activeSessionRef.current;
      activeSessionRef.current = true;
      if (direction === -1) {
        forwardRequestedRef.current = false;
      } else if (startingSession || directionChanged) {
        forwardRequestedRef.current = true;
        hasForwardRunRef.current = true;
      }
    } else {
      activeSessionRef.current = false;
      forwardRequestedRef.current = false;
    }
    reconcileMedia();
  }, [active, direction, mediaMounted, prewarm, reconcileMedia, reducedMotion]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => () => releaseMedia(), [releaseMedia]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update,
    enter() {
      activeRef.current = true;
      directionRef.current = 1;
      activeSessionRef.current = true;
      forwardRequestedRef.current = true;
      hasForwardRunRef.current = true;
      reconcileMedia();
    },
    leave() {
      activeRef.current = false;
      activeSessionRef.current = false;
      forwardRequestedRef.current = false;
      reconcileMedia();
    },
    reverse() {
      activeRef.current = false;
      activeSessionRef.current = false;
      directionRef.current = -1;
      cancelForwardRun('stable-initial');
      if (prewarmRef.current && !reducedMotionRef.current && !mediaFailedRef.current) {
        void prepareStableFrame(0);
      } else {
        reconcileMedia();
      }
    },
    dispose() {
      releaseMedia();
      const root = rootRef.current;
      if (!root) return;
      delete root.dataset.phoneFigure3Active;
      delete root.dataset.phoneFigure3Progress;
      delete root.dataset.phoneFigure3ScrollProgress;
      delete root.dataset.phoneFigure3Playback;
      delete root.dataset.phoneMediaState;
      root.style.removeProperty('--phone-figure3-video-opacity');
      root.style.removeProperty('--phone-figure3-video-scale');
      root.style.removeProperty('--phone-figure3-backdrop-opacity');
    }
  }), [cancelForwardRun, prepareStableFrame, reconcileMedia, releaseMedia, update]);

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
        <Figure3Surface
          scene="figure3-animation"
          hidden={false}
          registerHandle={registerHandle}
        />
      )}
    </section>
  );
});

export default PhoneFigure3;
