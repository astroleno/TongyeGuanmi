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
import { TTG_PLAYBACK_MS } from '../../../story/timings';
import type { ScenePresentationAdapterHandle } from '../../../story/presentation';
import {
  TTG_FIGURE_END_SECONDS,
  disposeTtgMedia,
  renderTtgAnimationProgress,
  ttgAnimationScene
} from '..';
import './PhoneTtg.css';

const TTG_PHONE_RUN_ID = 'phone-ttg-autoplay';
const TTG_PHONE_FIRST_FRAME_RUN_ID = 'phone-ttg-first-frame';
const TTG_PHONE_STABLE_ENDPOINT_RUN_ID = 'phone-ttg-stable-endpoint';
const TtgSurface = ttgAnimationScene.Component;

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
  | 'prewarm-first-frame'
  | 'play-forward'
  | 'hold-initial'
  | 'hold-terminal';

export type PhoneTtgForwardRunState =
  | 'idle'
  | 'preparing'
  | 'starting'
  | 'playing'
  | 'terminal'
  | 'stable-initial'
  | 'stable-terminal';

export type PhoneTtgForwardRunAction = 'start' | 'wait' | 'ignore';

type PhoneTtgProps = Group45PhoneSceneProps & Readonly<{
  /** TTG exposes completion without forcing the scope to leave its end frame. */
  onComplete?: (scene: 'ttg-animation') => void;
}>;

/** One active forward token makes repeated React reconciliation harmless. */
export function phoneTtgForwardRunAction(
  requestForward: boolean,
  forwardRequested: boolean,
  state: PhoneTtgForwardRunState
): PhoneTtgForwardRunAction {
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
export function phoneTtgOwnsNativeRun(
  run: number,
  currentForwardRun: number,
  nativePlayRun: number
): boolean {
  return run === currentForwardRun && run === nativePlayRun;
}

/**
 * Reuses TTG's accepted depth ratios but expresses them through a dedicated
 * phone camera. The visual tree is never scaled from the desktop scene.
 */
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

/**
 * TTG uses one autonomous native forward run after entry. Scroll only chooses
 * entry, a reverse arrival at frame zero, or the terminal hold; it never
 * scrubs the live playhead.
 */
export function phoneTtgMediaAction(
  active: boolean,
  prewarm = false,
  reducedMotion = false,
  mediaFailed = false,
  hasForwardRun = false,
  direction: 1 | -1 = 1
): PhoneTtgMediaAction {
  if (reducedMotion || mediaFailed) return 'static-fallback';
  if (active) return direction === -1 ? 'hold-initial' : 'play-forward';
  if (!prewarm) return 'release';
  return hasForwardRun && direction === 1 ? 'hold-terminal' : 'hold-initial';
}

/** Native forward is allowed; the reverse path only seeks an endpoint. */
export function phoneTtgMediaInput(
  rawProgress: number,
  direction: 1 | -1,
  reducedMotion = false
): TimelineVideoDriveInput {
  return {
    runId: TTG_PHONE_RUN_ID,
    direction,
    progress: stableProgress(rawProgress),
    durationFallbackSeconds: 2.5,
    startSeconds: 0,
    endSeconds: TTG_FIGURE_END_SECONDS,
    timelineDurationMs: TTG_PLAYBACK_MS,
    mode: direction === 1 ? 'native-preferred' : 'timeline',
    nativePlaybackDirection: 1,
    reducedMotion,
    allowSeekedFrameFallback: browserPrefersHevcAlpha()
  };
}

/** The forward trigger never inherits a near-end scroll position. */
export function phoneTtgAutoplayInput(
  reducedMotion = false
): TimelineVideoDriveInput {
  return {
    ...phoneTtgMediaInput(0, 1, reducedMotion),
    runId: TTG_PHONE_RUN_ID
  };
}

/** Reverse navigation uses a stable seek-verified endpoint, not reverse play. */
export function phoneTtgStableEndpointInput(
  endpoint: 0 | 1,
  reducedMotion = false
): TimelineVideoDriveInput {
  return {
    ...phoneTtgMediaInput(endpoint, -1, reducedMotion),
    runId: endpoint === 0
      ? TTG_PHONE_FIRST_FRAME_RUN_ID
      : TTG_PHONE_STABLE_ENDPOINT_RUN_ID,
    mode: 'timeline'
  };
}

/** Release the sole video owner and its driver before the scene retires. */
export function releasePhoneTtgVideo(video: HTMLVideoElement | null): void {
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

function mediaProgress(video: HTMLVideoElement): number {
  return stableProgress(video.currentTime / Math.max(.001, TTG_FIGURE_END_SECONDS));
}

/** One native owner plus static layers; no document-progress video seeking. */
export const PhoneTtg = forwardRef<
  ScenePresentationAdapterHandle,
  PhoneTtgProps
>(function PhoneTtg(
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
  const canonicalMediaRetiredRef = useRef(false);
  const forwardStateRef = useRef<PhoneTtgForwardRunState>('idle');
  const [mediaMounted, setMediaMounted] = useState((active || prewarm) && !reducedMotion);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  completionListenerRef.current = onComplete;

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'figure-video') {
      element?.setAttribute('data-phone-ttg-video', '');
      videoRef.current = element as HTMLVideoElement | null;
    }
  }, []);

  const renderFrame = useCallback((rawProgress: number) => {
    const root = rootRef.current;
    const frame = phoneTtgFrame(
      rawProgress,
      reducedMotionRef.current,
      mediaFailedRef.current
    );
    if (!root) return;
    renderTtgAnimationProgress(root, frame.progress);
    const surface = root.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    surface?.style.setProperty('--ttg-figure-video-opacity', frame.figureOpacity.toFixed(4));
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
    canonicalMediaRetiredRef.current = false;
    releasePhoneTtgVideo(videoRef.current);
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
    onMediaError?.('ttg-animation');
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
    if (root) root.dataset.phoneTtgPlayback = endpoint === 0
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
        ...phoneTtgStableEndpointInput(endpoint, reducedMotionRef.current),
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
      rootRef.current
        ?.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]')
        ?.removeAttribute('data-ttg-static-media-fallback');
      if (!forwardRequestedRef.current) {
        forwardStateRef.current = endpoint === 0 ? 'stable-initial' : 'stable-terminal';
      }
      if (rootRef.current) {
        rootRef.current.dataset.phoneTtgPlayback = endpoint === 0
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
    const runAction = phoneTtgForwardRunAction(
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
      if (rootRef.current) rootRef.current.dataset.phoneTtgPlayback = 'starting-forward';
      let playback: Promise<void>;
      try {
        playback = Promise.resolve(currentVideo.play());
      } catch {
        playback = Promise.reject(new Error('TTG native playback rejected'));
      }
      void playback.then(() => {
        if (
          !phoneTtgOwnsNativeRun(
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
        if (rootRef.current) rootRef.current.dataset.phoneTtgPlayback = 'playing-forward';
      }).catch(() => {
        if (
          phoneTtgOwnsNativeRun(
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
    if (root) root.dataset.phoneTtgActive = String(activeRef.current);
    const action = phoneTtgMediaAction(
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
    if (!canonicalMediaRetiredRef.current) {
      return;
    }
    if (action === 'play-forward') {
      if (forwardRequestedRef.current) startForwardPlayback(false);
      return;
    }
    cancelForwardRun(action === 'hold-terminal' ? 'stable-terminal' : 'stable-initial');
    void prepareStableFrame(action === 'hold-terminal' ? 1 : 0);
  }, [cancelForwardRun, mediaMounted, prepareStableFrame, releaseMedia, renderFrame, startForwardPlayback]);

  /** Keep scroll as trigger diagnostics only; never seek the active playhead. */
  const update = useCallback((rawProgress: number) => {
    const progress = stableProgress(rawProgress);
    const previousDirection = directionRef.current;
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    const root = rootRef.current;
    if (root) root.dataset.phoneTtgScrollProgress = progress.toFixed(4);

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
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video) return;
    const handleLoadedMetadata = () => {
      if (canonicalMediaRetiredRef.current) reconcileMedia();
    };
    const handleTimeUpdate = () => {
      if (
        forwardRequestedRef.current
        && phoneTtgOwnsNativeRun(
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
        || !phoneTtgOwnsNativeRun(
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
      root.dataset.phoneTtgPlayback = 'playing-forward';
    };
    const handleEnded = () => {
      if (
        !forwardRequestedRef.current
        || !phoneTtgOwnsNativeRun(
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
      root.dataset.phoneTtgPlayback = 'complete-forward';
      if (!completionReportedRef.current) {
        completionReportedRef.current = true;
        completionListenerRef.current?.('ttg-animation');
      }
    };
    const handleAssetError = (event: Event) => {
      if (event.target instanceof HTMLImageElement || event.target === video) {
        failMedia();
      }
    };
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('ended', handleEnded);
    root.addEventListener('error', handleAssetError, true);
    // Child passive effects create TTG's canonical hold-frame driver after the
    // phone wrapper commits. Retire that driver on the next compositor frame,
    // then start the single phone-owned AOD-style run without competing seeks.
    const ownershipFrame = canonicalMediaRetiredRef.current
      ? 0
      : window.requestAnimationFrame(() => {
          disposeTtgMedia(root);
          canonicalMediaRetiredRef.current = true;
          reconcileMedia();
        });
    if (canonicalMediaRetiredRef.current) reconcileMedia();
    return () => {
      if (ownershipFrame) window.cancelAnimationFrame(ownershipFrame);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('ended', handleEnded);
      root.removeEventListener('error', handleAssetError, true);
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
      delete root.dataset.phoneTtgActive;
      delete root.dataset.phoneTtgProgress;
      delete root.dataset.phoneTtgScrollProgress;
      delete root.dataset.phoneTtgVisualProgress;
      delete root.dataset.phoneTtgPlayback;
      delete root.dataset.phoneMediaState;
      root.style.removeProperty('--phone-ttg-background-y');
      root.style.removeProperty('--phone-ttg-background-scale');
      root.style.removeProperty('--phone-ttg-middle-y');
      root.style.removeProperty('--phone-ttg-middle-scale');
      root.style.removeProperty('--phone-ttg-foreground-y');
      root.style.removeProperty('--phone-ttg-figure-y');
      root.style.removeProperty('--phone-ttg-figure-scale');
      root.style.removeProperty('--phone-ttg-figure-opacity');
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
      className="phone-ttg"
      data-phone-scene="ttg-animation"
      data-phone-media-owner="ttg-figure-motion"
      data-phone-media-state={mediaState}
      aria-hidden="true"
    >
      <div className="phone-ttg__fallback" data-phone-media-fallback="ttg" />
      {mediaMounted && (
        <TtgSurface
          scene="ttg-animation"
          hidden={false}
          registerHandle={registerHandle}
        />
      )}
    </section>
  );
});

export default PhoneTtg;
