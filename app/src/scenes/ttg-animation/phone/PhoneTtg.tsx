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
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  timelineVideoDriverFor,
  type TimelineVideoDriveInput
} from '../../../media/timeline-video-driver';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import { waitForPhoneTargetPresentation } from '../../../production/phone/phone-target-presentation';
import {
  createGroup45NativeAutoplay,
  type Group45NativeAutoplay,
  type Group45NativeAutoplayDirection,
  type Group45NativeAutoplayStatus
} from '../../../production/phone/adapter-groups/group4-5-native-autoplay';
import type {
  ScenePresentationAdapterHandle,
  TargetPresentationRequest
} from '../../../story/presentation';
import {
  TTG_FIGURE_END_SECONDS,
  disposeTtgMedia,
  renderTtgAnimationProgress,
  ttgAnimationScene
} from '..';
import './PhoneTtg.css';
import {
  PHONE_TTG_LAB_DISSOLVE_MS,
  phoneTtgDissolveChapterProgress,
  phoneTtgMediaChapterProgress,
  phoneTtgReverseFrameProgress
} from './motion';

const TtgSurface = ttgAnimationScene.Component;
const PHONE_TTG_INITIAL_DATA_TIMEOUT_MS = 8000;
const PHONE_TTG_ENDPOINT_EVIDENCE_TIMEOUT_MS = 1000;

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

type PhoneTtgProps = Group45PhoneSceneProps & Readonly<{
  onComplete?: (scene: 'ttg-animation', direction: 1 | -1) => void;
}>;

/** Desktop-authored TTG motion sampled inside the portrait crop. */
export function phoneTtgFrame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false,
  height = viewportHeight()
): PhoneTtgFrame {
  const progress = reducedMotion ? 0 : stableProgress(rawProgress);
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

/** Scroll selects the stable endpoint; native media owns a forward run. */
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

/** Release the sole video owner and its decoder before TTG retires. */
export function releasePhoneTtgVideo(video: HTMLVideoElement | null): void {
  if (!video) return;
  disposeTimelineVideoDriver(video);
  video.pause();
  delete video.dataset.phoneTtgEndpointReady;
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

function ttgReverseMediaInput(
  runId: string,
  progress: number
): TimelineVideoDriveInput {
  return {
    runId,
    direction: -1,
    progress: phoneTtgReverseFrameProgress(progress),
    durationFallbackSeconds: 2.5,
    startSeconds: 0,
    endSeconds: TTG_FIGURE_END_SECONDS,
    timelineDurationMs: TTG_FIGURE_END_SECONDS * 1000,
    mode: 'timeline',
    nativePlaybackDirection: 1,
    allowSeekedFrameFallback: browserPrefersHevcAlpha()
  };
}

function ttgEndpointMediaInput(
  runId: string,
  endpoint: 0 | 1,
  direction: 1 | -1
): TimelineVideoDriveInput {
  return {
    ...ttgReverseMediaInput(runId, endpoint),
    direction
  };
}

type PhoneTtgEndpointVideo = Pick<
  HTMLVideoElement,
  'currentTime' | 'duration' | 'readyState' | 'seeking' | 'dataset'
>;

export function phoneTtgHasReusableEndpointFrame(
  video: PhoneTtgEndpointVideo,
  endpoint: 0 | 1
): boolean {
  const terminal = Number.isFinite(video.duration) && video.duration > 0
    ? Math.min(TTG_FIGURE_END_SECONDS, video.duration)
    : TTG_FIGURE_END_SECONDS;
  const target = endpoint === 1 ? terminal : 0;
  const tolerance = endpoint === 1 ? .08 : .04;
  const endpointLabel = endpoint === 1 ? 'terminal' : 'initial';
  return video.dataset.phoneTtgEndpointReady === endpointLabel
    && video.dataset.phoneGroup45FrameReady === 'true'
    && video.readyState >= 2
    && !video.seeking
    && Math.abs(video.currentTime - target) <= tolerance;
}

export function phoneTtgHasReusableTerminalFrame(
  video: PhoneTtgEndpointVideo
): boolean {
  return phoneTtgHasReusableEndpointFrame(video, 1);
}

export function markPhoneTtgPresentedEndpoint(
  video: HTMLVideoElement,
  mediaTime: number
): void {
  const terminal = Number.isFinite(video.duration) && video.duration > 0
    ? Math.min(TTG_FIGURE_END_SECONDS, video.duration)
    : TTG_FIGURE_END_SECONDS;
  if (Math.abs(mediaTime - terminal) > .08) return;
  video.dataset.phoneGroup45FrameReady = 'true';
  video.dataset.phoneTtgEndpointReady = 'terminal';
}

function waitForPhoneTtgEndpoint(
  presented: () => boolean
): Promise<boolean> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const inspect = (now: number) => {
      if (presented()) {
        resolve(true);
        return;
      }
      if (now - startedAt >= PHONE_TTG_ENDPOINT_EVIDENCE_TIMEOUT_MS) {
        resolve(false);
        return;
      }
      window.requestAnimationFrame(inspect);
    };
    window.requestAnimationFrame(inspect);
  });
}

function waitForPhoneTtgReverseEndpoint(
  video: HTMLVideoElement,
  runId: string
): Promise<boolean> {
  return waitForPhoneTtgEndpoint(() => {
    const snapshot = timelineVideoDriverFor(video).snapshot();
    return snapshot.runId === runId
      && snapshot.direction === -1
      && (snapshot.desiredProgress ?? 1) <= .001
      && snapshot.frameReady
      && video.currentTime <= .04;
  });
}

function waitForPhoneTtgCurrentData(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (video.readyState >= 2) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timeout = 0;
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout) window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      resolve(ready);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    const onAbort = () => finish(false);
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    if (video.readyState >= 2) {
      finish(true);
      return;
    }
    timeout = window.setTimeout(
      () => finish(false),
      PHONE_TTG_INITIAL_DATA_TIMEOUT_MS
    );
  });
}

/**
 * TTG keeps one canonical media owner. Forward playback remains native; the
 * reverse leg prepares its terminal frame before Lab uncovers TTG, then uses
 * the shared coalesced seek driver at the source's authored 30 fps cadence.
 * Both directions reserve the desktop-authored final 600 ms for the Lab
 * dissolve instead of hiding that handoff inside media playback.
 */
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
    onProgress,
    onReady
  },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playbackRef = useRef<Group45NativeAutoplay | null>(null);
  const activeRef = useRef(active);
  const directionRef = useRef<1 | -1>(direction);
  const prewarmRef = useRef(prewarm);
  const reducedMotionRef = useRef(reducedMotion);
  const mediaMountedRef = useRef((active || prewarm) && !reducedMotion);
  const mediaFailedRef = useRef(false);
  const mediaRetiringRef = useRef(false);
  const hasForwardRunRef = useRef(false);
  const forwardRequestedRef = useRef(active && direction === 1 && !reducedMotion);
  const completionReportedRef = useRef(false);
  const runGenerationRef = useRef(0);
  const initialFrameGenerationRef = useRef(0);
  const initialFramePreparationRef = useRef<Promise<boolean> | null>(null);
  const initialFrameAbortRef = useRef<AbortController | null>(null);
  const reverseRunIdRef = useRef('phone-ttg-reverse-0');
  const chapterTransitionFrameRef = useRef(0);
  const completionListenerRef = useRef(onComplete);
  const mediaErrorListenerRef = useRef(onMediaError);
  const progressListenerRef = useRef(onProgress);
  const [mediaMounted, setMediaMounted] = useState(mediaMountedRef.current);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  completionListenerRef.current = onComplete;
  mediaErrorListenerRef.current = onMediaError;
  progressListenerRef.current = onProgress;

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name !== 'figure-video') return;
    element?.setAttribute('data-phone-ttg-video', '');
    videoRef.current = element as HTMLVideoElement | null;
  }, []);

  const renderFrame = useCallback((
    rawProgress: number,
    playbackDirection?: Group45NativeAutoplayDirection
  ) => {
    const root = rootRef.current;
    const frame = phoneTtgFrame(
      rawProgress,
      reducedMotionRef.current,
      mediaFailedRef.current
    );
    if (!root) return;
    renderTtgAnimationProgress(root, frame.progress);
    const surface = root.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    surface?.style.setProperty('--ttg-bg-y', `${frame.backgroundY.toFixed(2)}px`);
    surface?.style.setProperty('--ttg-bg-scale', frame.backgroundScale.toFixed(4));
    surface?.style.setProperty('--ttg-middle-y', `${frame.middleY.toFixed(2)}px`);
    surface?.style.setProperty('--ttg-middle-scale', frame.middleScale.toFixed(4));
    surface?.style.setProperty('--ttg-front-y', `${frame.foregroundY.toFixed(2)}px`);
    surface?.style.setProperty('--ttg-figure-y', `${frame.figureY.toFixed(2)}px`);
    surface?.style.setProperty('--ttg-figure-scale', frame.figureScale.toFixed(4));
    surface?.style.setProperty('--ttg-figure-video-opacity', frame.figureOpacity.toFixed(4));
    surface?.removeAttribute('data-ttg-static-media-fallback');
    root.style.setProperty('--phone-ttg-background-y', `${frame.backgroundY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-background-scale', frame.backgroundScale.toFixed(4));
    root.style.setProperty('--phone-ttg-middle-y', `${frame.middleY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-middle-scale', frame.middleScale.toFixed(4));
    root.style.setProperty('--phone-ttg-foreground-y', `${frame.foregroundY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-figure-y', `${frame.figureY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-figure-scale', frame.figureScale.toFixed(4));
    root.style.setProperty('--phone-ttg-figure-opacity', frame.figureOpacity.toFixed(4));
    if (import.meta.env.DEV) {
      root.dataset.phoneTtgProgress = frame.progress.toFixed(4);
      root.dataset.phoneTtgVisualProgress = frame.visualProgress.toFixed(4);
    }
    const video = videoRef.current;
    if (playbackDirection === -1 && video) {
      driveTimelineVideo(
        video,
        ttgReverseMediaInput(reverseRunIdRef.current, frame.progress)
      );
    }
  }, []);

  const cancelChapterTransition = useCallback(() => {
    if (!chapterTransitionFrameRef.current) return;
    window.cancelAnimationFrame(chapterTransitionFrameRef.current);
    chapterTransitionFrameRef.current = 0;
  }, []);

  const publishChapterProgress = useCallback((
    progress: number,
    playbackDirection: Group45NativeAutoplayDirection
  ) => {
    progressListenerRef.current?.(
      'ttg-animation',
      stableProgress(progress),
      playbackDirection
    );
  }, []);

  const runChapterDissolve = useCallback((
    playbackDirection: Group45NativeAutoplayDirection,
    generation: number,
    onComplete: () => void
  ) => {
    cancelChapterTransition();
    let startedAt: number | undefined;
    const tick: FrameRequestCallback = (time) => {
      chapterTransitionFrameRef.current = 0;
      if (
        mediaRetiringRef.current
        || generation !== runGenerationRef.current
      ) return;
      if (startedAt === undefined) startedAt = time;
      const progress = clamp(
        (time - startedAt) / PHONE_TTG_LAB_DISSOLVE_MS
      );
      publishChapterProgress(
        phoneTtgDissolveChapterProgress(progress, playbackDirection),
        playbackDirection
      );
      rootRef.current?.setAttribute(
        'data-phone-ttg-playback',
        playbackDirection === 1
          ? 'dissolving-to-lab'
          : 'dissolving-to-ttg'
      );
      if (progress >= 1) {
        onComplete();
        return;
      }
      chapterTransitionFrameRef.current = window.requestAnimationFrame(tick);
    };
    chapterTransitionFrameRef.current = window.requestAnimationFrame(tick);
  }, [cancelChapterTransition, publishChapterProgress]);

  const reportRunCompletion = useCallback((
    playbackDirection: Group45NativeAutoplayDirection,
    generation: number
  ) => {
    if (
      mediaRetiringRef.current
      || generation !== runGenerationRef.current
      || completionReportedRef.current
    ) return;
    completionReportedRef.current = true;
    completionListenerRef.current?.('ttg-animation', playbackDirection);
  }, []);

  const mountMedia = useCallback(() => {
    if (mediaMountedRef.current) return;
    mediaMountedRef.current = true;
    mediaRetiringRef.current = false;
    setMediaMounted(true);
  }, []);

  const releaseMedia = useCallback(() => {
    runGenerationRef.current += 1;
    initialFrameGenerationRef.current += 1;
    initialFrameAbortRef.current?.abort();
    initialFrameAbortRef.current = null;
    initialFramePreparationRef.current = null;
    cancelChapterTransition();
    mediaRetiringRef.current = true;
    forwardRequestedRef.current = false;
    playbackRef.current?.dispose();
    playbackRef.current = null;
    disposeTtgMedia(rootRef.current);
    releasePhoneTtgVideo(videoRef.current);
    mediaMountedRef.current = false;
    setMediaReady(false);
    setMediaMounted(false);
  }, [cancelChapterTransition]);

  const failMedia = useCallback(() => {
    if (mediaRetiringRef.current || mediaFailedRef.current) return;
    mediaFailedRef.current = true;
    setMediaFailed(true);
    releaseMedia();
    rootRef.current?.setAttribute(
      'data-phone-media-state',
      'retryable-failure'
    );
    mediaErrorListenerRef.current?.('ttg-animation');
  }, [releaseMedia]);

  const ensureInitialFrame = useCallback((video: HTMLVideoElement) => {
    if (phoneTtgHasReusableEndpointFrame(video, 0)) {
      setMediaReady(true);
      return Promise.resolve(true);
    }
    const pending = initialFramePreparationRef.current;
    if (pending) return pending;

    const preparationGeneration = ++initialFrameGenerationRef.current;
    const preparationController = new AbortController();
    initialFrameAbortRef.current?.abort();
    initialFrameAbortRef.current = preparationController;
    video.preload = 'auto';
    try {
      if (video.readyState < 2) video.load();
    } catch {
      // The exact-frame driver can still settle once the source becomes ready.
    }
    rootRef.current?.setAttribute(
      'data-phone-ttg-playback',
      'preparing-initial-frame'
    );
    const preparation = waitForPhoneTtgCurrentData(
      video,
      preparationController.signal
    ).then((hasCurrentData) => {
      if (
        !hasCurrentData
        || mediaRetiringRef.current
        || preparationGeneration !== initialFrameGenerationRef.current
      ) return null;
      return prepareTimelineVideoFrame(
        video,
        {
          ...ttgEndpointMediaInput(
            `phone-ttg-initial-${preparationGeneration}`,
            0,
            1
          ),
          // The prewarmed stage is intentionally visibility-hidden. Chromium
          // can withhold rVFC there, while iOS HEVC already needs the same
          // decoded-current-data fallback. A settled seek plus 120 ms of stable
          // current data is sufficient before the ink contour exposes video.
          allowSeekedFrameFallback: true,
          signal: preparationController.signal
        }
      );
    }).then((result) => {
      if (
        mediaRetiringRef.current
        || preparationGeneration !== initialFrameGenerationRef.current
        || videoRef.current !== video
      ) return false;
      if (result?.status !== 'ready') return false;
      video.dataset.phoneGroup45FrameReady = 'true';
      video.dataset.phoneTtgEndpointReady = 'initial';
      setMediaReady(true);
      renderFrame(0);
      rootRef.current?.setAttribute(
        'data-phone-ttg-playback',
        'prepared-initial-frame'
      );
      return true;
    }).catch(() => {
      if (
        mediaRetiringRef.current
        || preparationGeneration !== initialFrameGenerationRef.current
      ) return false;
      failMedia();
      return false;
    }).finally(() => {
      if (initialFrameAbortRef.current === preparationController) {
        initialFrameAbortRef.current = null;
      }
      if (initialFramePreparationRef.current === preparation) {
        initialFramePreparationRef.current = null;
      }
    });
    initialFramePreparationRef.current = preparation;
    return preparation;
  }, [failMedia, renderFrame]);

  const startRun = useCallback((runDirection: 1 | -1) => {
    if (reducedMotionRef.current || mediaFailedRef.current) return;
    activeRef.current = true;
    directionRef.current = runDirection;
    cancelChapterTransition();
    const generation = ++runGenerationRef.current;
    if (runDirection === -1) {
      reverseRunIdRef.current = `phone-ttg-reverse-${generation}`;
    }
    if (runDirection === 1) hasForwardRunRef.current = true;
    forwardRequestedRef.current = true;
    mountMedia();
    const playback = playbackRef.current;
    if (!playback) return;
    completionReportedRef.current = false;
    forwardRequestedRef.current = false;
    if (runDirection === 1) {
      const video = videoRef.current;
      if (!video) {
        failMedia();
        return;
      }
      const beginForwardPlayback = () => {
        if (
          mediaRetiringRef.current
          || generation !== runGenerationRef.current
        ) return;
        // The exact initial frame is now physically present. Retire its seek
        // driver before native playback takes sole ownership of the video.
        disposeTimelineVideoDriver(video);
        playback.start(1);
      };
      if (phoneTtgHasReusableEndpointFrame(video, 0)) {
        beginForwardPlayback();
        return;
      }
      void ensureInitialFrame(video).then((ready) => {
        if (
          !ready
          || mediaRetiringRef.current
          || generation !== runGenerationRef.current
        ) return;
        beginForwardPlayback();
      });
      return;
    }

    const video = videoRef.current;
    if (!video) {
      failMedia();
      return;
    }
    const retainedTerminal = phoneTtgHasReusableTerminalFrame(video);
    publishChapterProgress(1, -1);
    rootRef.current?.setAttribute(
      'data-phone-ttg-playback',
      retainedTerminal
        ? 'retained-reverse-terminal'
        : 'preparing-reverse-terminal'
    );
    if (retainedTerminal) {
      // Figure2 retains its presented endpoint across the following chapter.
      // Keep that physical frame under Lab, dissolve the same Lab root away,
      // then start reverse without remounting or re-seeking before the reveal.
      runChapterDissolve(-1, generation, () => {
        if (
          mediaRetiringRef.current
          || generation !== runGenerationRef.current
        ) return;
        playback.start(-1);
      });
      return;
    }
    playback.reset(1);
    void prepareTimelineVideoFrame(
      video,
      ttgReverseMediaInput(reverseRunIdRef.current, 1)
    ).then((result) => {
      if (
        mediaRetiringRef.current
        || generation !== runGenerationRef.current
      ) return;
      if (result?.status !== 'ready') {
        failMedia();
        return;
      }
      video.dataset.phoneGroup45FrameReady = 'true';
      video.dataset.phoneTtgEndpointReady = 'terminal';
      runChapterDissolve(-1, generation, () => {
        if (
          mediaRetiringRef.current
          || generation !== runGenerationRef.current
        ) return;
        playback.start(-1);
      });
    }).catch(failMedia);
  }, [
    cancelChapterTransition,
    ensureInitialFrame,
    failMedia,
    mountMedia,
    publishChapterProgress,
    runChapterDissolve
  ]);

  const reconcileMedia = useCallback(() => {
    const root = rootRef.current;
    if (root && import.meta.env.DEV) {
      root.dataset.phoneTtgActive = String(activeRef.current);
    }
    const action = phoneTtgMediaAction(
      activeRef.current,
      prewarmRef.current,
      reducedMotionRef.current,
      mediaFailedRef.current,
      hasForwardRunRef.current,
      directionRef.current
    );
    if (action === 'static-fallback') {
      if (!mediaFailedRef.current) renderFrame(0);
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
      if (forwardRequestedRef.current) {
        startRun(action === 'play-forward' ? 1 : -1);
      }
      return;
    }
    forwardRequestedRef.current = false;
    const endpoint = action === 'hold-terminal' ? 1 : 0;
    const video = videoRef.current;
    if (video && phoneTtgHasReusableEndpointFrame(video, endpoint)) {
      // The endpoint was physically presented before the shell handoff.
      // Keep it parked instead of resetting currentTime and blanking Safari's
      // hardware video plane for one compositor frame.
      video.pause();
      renderFrame(endpoint);
      root?.setAttribute(
        'data-phone-ttg-playback',
        endpoint === 1 ? 'retained-terminal' : 'retained-initial'
      );
      return;
    }
    playback.reset(endpoint);
    renderFrame(endpoint);
    if (endpoint === 0 && video) {
      void ensureInitialFrame(video);
    }
  }, [ensureInitialFrame, mountMedia, releaseMedia, renderFrame, startRun]);

  useEffect(() => {
    if (!mediaMounted) return;
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video) return;
    let disposed = false;
    mediaRetiringRef.current = false;
    const handleAssetError = (event: Event) => {
      if (event.target instanceof HTMLImageElement || event.target === video) {
        failMedia();
      }
    };
    root.addEventListener('error', handleAssetError, true);

    // The canonical child prepares a desktop hold frame in its passive effect.
    // Retire that owner after effects flush, then give the same video element
    // directly to the AOD-style phone clock. No two drivers touch the playhead.
    const ownershipFrame = window.requestAnimationFrame(() => {
      if (disposed) return;
      disposeTtgMedia(root);
      disposeTimelineVideoDriver(video);
      const playback = createGroup45NativeAutoplay(video, {
        durationSeconds: TTG_FIGURE_END_SECONDS,
        onProgress: (progress, playbackDirection) => {
          renderFrame(progress, playbackDirection);
          publishChapterProgress(
            phoneTtgMediaChapterProgress(progress),
            playbackDirection
          );
        },
        onStatus: (status, playbackDirection) => {
          if (rootRef.current) {
            rootRef.current.dataset.phoneTtgPlayback = playbackLabel(
              status,
              playbackDirection
            );
          }
        },
        onPresentedFrame: (mediaTime) => {
          markPhoneTtgPresentedEndpoint(video, mediaTime);
        },
        onComplete: (playbackDirection) => {
          const completionGeneration = runGenerationRef.current;
          hasForwardRunRef.current = playbackDirection === 1;
          forwardRequestedRef.current = false;
          if (playbackDirection === 1) {
            const forwardVideo = videoRef.current;
            if (!forwardVideo) {
              failMedia();
              return;
            }
            void waitForPhoneTtgEndpoint(
              () => phoneTtgHasReusableEndpointFrame(forwardVideo, 1)
            ).then((presented) => {
              if (
                mediaRetiringRef.current
                || completionGeneration !== runGenerationRef.current
              ) return;
              if (!presented) {
                failMedia();
                return;
              }
              runChapterDissolve(1, completionGeneration, () => {
                reportRunCompletion(1, completionGeneration);
              });
            });
            return;
          }
          const reverseVideo = videoRef.current;
          if (!reverseVideo) {
            failMedia();
            return;
          }
          // The reverse driver already requested this endpoint during its real
          // final tick. Wait for that presentation evidence without re-seeking.
          void waitForPhoneTtgReverseEndpoint(
            reverseVideo,
            reverseRunIdRef.current
          ).then((presented) => {
            if (
              mediaRetiringRef.current
              || completionGeneration !== runGenerationRef.current
            ) return;
            if (!presented) {
              failMedia();
              return;
            }
            reverseVideo.dataset.phoneGroup45FrameReady = 'true';
            reverseVideo.dataset.phoneTtgEndpointReady = 'initial';
            setMediaReady(true);
            reportRunCompletion(-1, completionGeneration);
          });
        },
        onError: failMedia
      });
      playbackRef.current = playback;
      playback.reset(0);
      reconcileMedia();
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(ownershipFrame);
      root.removeEventListener('error', handleAssetError, true);
      const playback = playbackRef.current;
      playback?.dispose();
      if (playbackRef.current === playback) playbackRef.current = null;
      cancelChapterTransition();
      disposeTtgMedia(root);
    };
  }, [
    cancelChapterTransition,
    ensureInitialFrame,
    failMedia,
    mediaMounted,
    publishChapterProgress,
    reconcileMedia,
    renderFrame,
    reportRunCompletion,
    runChapterDissolve
  ]);

  useEffect(() => {
    const wasActive = activeRef.current;
    const previousDirection = directionRef.current;
    activeRef.current = active;
    directionRef.current = direction;
    prewarmRef.current = prewarm;
    reducedMotionRef.current = reducedMotion;
    if (active && (!wasActive || previousDirection !== direction)) {
      forwardRequestedRef.current = true;
    } else if (!active) {
      forwardRequestedRef.current = false;
    }
    reconcileMedia();
  }, [active, direction, prewarm, reconcileMedia, reducedMotion]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => () => releaseMedia(), [releaseMedia]);

  const update = useCallback((rawProgress: number) => {
    if (import.meta.env.DEV) {
      rootRef.current?.setAttribute(
        'data-phone-ttg-scroll-progress',
        stableProgress(rawProgress).toFixed(4)
      );
    }
  }, []);

  const prepareTargetPresentation = useCallback((
    request: TargetPresentationRequest
  ): Promise<void> => {
    const root = rootRef.current;
    if (!root) {
      return Promise.reject(new Error('TTG target root unavailable'));
    }
    if (reducedMotionRef.current) {
      renderFrame(request.progress);
      return Promise.resolve();
    }
    if (mediaFailedRef.current) {
      mediaFailedRef.current = false;
      setMediaFailed(false);
      mediaRetiringRef.current = false;
      delete root.dataset.phoneMediaState;
    }
    mountMedia();
    const endpoint = request.progress >= 0.999 ? 1 : 0;
    let terminalRequested = false;
    return waitForPhoneTargetPresentation(
      () => {
        if (root.dataset.phoneMediaState === 'retryable-failure') {
          return 'retryable-failure';
        }
        const video = videoRef.current;
        if (!video) return null;
        const endpointReady = video.dataset.phoneTtgEndpointReady;
        if (
          (endpoint === 0 && endpointReady === 'initial')
          || (endpoint === 1 && endpointReady === 'terminal')
        ) {
          return true;
        }
        if (endpoint === 0) {
          void ensureInitialFrame(video);
        } else if (!terminalRequested) {
          terminalRequested = true;
          void prepareTimelineVideoFrame(
            video,
            ttgEndpointMediaInput(request.runId, 1, request.direction)
          ).then((result) => {
            if (result?.status !== 'ready' || request.signal.aborted) return;
            video.dataset.phoneGroup45FrameReady = 'true';
            video.dataset.phoneTtgEndpointReady = 'terminal';
            renderFrame(1);
          }).catch(failMedia);
        }
        return null;
      },
      request.signal
    );
  }, [
    ensureInitialFrame,
    failMedia,
    mountMedia,
    renderFrame
  ]);

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
      forwardRequestedRef.current = false;
      reconcileMedia();
    },
    reverse() {
      activeRef.current = true;
      directionRef.current = -1;
      forwardRequestedRef.current = true;
      startRun(-1);
    },
    prepareTargetPresentation,
    dispose() {
      releaseMedia();
      const root = rootRef.current;
      if (!root) return;
      if (import.meta.env.DEV) {
        delete root.dataset.phoneTtgActive;
        delete root.dataset.phoneTtgProgress;
        delete root.dataset.phoneTtgScrollProgress;
        delete root.dataset.phoneTtgVisualProgress;
      }
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
  }), [
    prepareTargetPresentation,
    reconcileMedia,
    releaseMedia,
    renderFrame,
    startRun,
    update
  ]);

  const mediaState = mediaFailed
    ? 'retryable-failure'
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
