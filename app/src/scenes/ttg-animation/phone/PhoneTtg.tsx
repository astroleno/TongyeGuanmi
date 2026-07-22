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
  return video.dataset.phoneGroup45FrameReady === 'true'
    && video.readyState >= 2
    && !video.seeking
    && Math.abs(video.currentTime - target) <= tolerance;
}

export function phoneTtgHasReusableTerminalFrame(
  video: PhoneTtgEndpointVideo
): boolean {
  return phoneTtgHasReusableEndpointFrame(video, 1);
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
    root.dataset.phoneTtgProgress = frame.progress.toFixed(4);
    root.dataset.phoneTtgVisualProgress = frame.visualProgress.toFixed(4);
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
    renderFrame(1);
    releaseMedia();
    rootRef.current?.setAttribute('data-phone-media-state', 'fallback');
    mediaErrorListenerRef.current?.('ttg-animation');
  }, [releaseMedia, renderFrame]);

  const startRun = useCallback((runDirection: 1 | -1) => {
    if (reducedMotionRef.current || mediaFailedRef.current) return;
    activeRef.current = true;
    directionRef.current = runDirection;
    cancelChapterTransition();
    const generation = ++runGenerationRef.current;
    if (runDirection === -1) {
      reverseRunIdRef.current = `phone-ttg-reverse-${generation}`;
    } else if (videoRef.current) {
      // Retire the previous reverse seek driver before native playback takes
      // sole ownership of the TTG video again.
      disposeTimelineVideoDriver(videoRef.current);
    }
    if (runDirection === 1) hasForwardRunRef.current = true;
    forwardRequestedRef.current = true;
    mountMedia();
    const playback = playbackRef.current;
    if (!playback) return;
    completionReportedRef.current = false;
    forwardRequestedRef.current = false;
    if (runDirection === 1) {
      playback.start(1);
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
    failMedia,
    mountMedia,
    publishChapterProgress,
    runChapterDissolve
  ]);

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
  }, [mountMedia, releaseMedia, renderFrame, startRun]);

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
        onReady: () => setMediaReady(true),
        onStatus: (status, playbackDirection) => {
          if (rootRef.current) {
            rootRef.current.dataset.phoneTtgPlayback = playbackLabel(
              status,
              playbackDirection
            );
          }
        },
        onComplete: (playbackDirection) => {
          const completionGeneration = runGenerationRef.current;
          hasForwardRunRef.current = playbackDirection === 1;
          forwardRequestedRef.current = false;
          const endpoint = playbackDirection === 1 ? 1 : 0;
          renderFrame(endpoint, playbackDirection);
          if (playbackDirection === 1) {
            const forwardVideo = videoRef.current;
            if (!forwardVideo) {
              failMedia();
              return;
            }
            rootRef.current?.setAttribute(
              'data-phone-ttg-playback',
              'preparing-terminal-frame'
            );
            // Native time can finish between decoded frames on Safari. Pin
            // the exact authored endpoint before Lab starts uncovering it.
            void prepareTimelineVideoFrame(
              forwardVideo,
              ttgEndpointMediaInput(
                'phone-ttg-forward-terminal-' + completionGeneration,
                1,
                1
              )
            ).then((result) => {
              if (
                mediaRetiringRef.current
                || completionGeneration !== runGenerationRef.current
              ) return;
              if (result?.status !== 'ready') {
                failMedia();
                return;
              }
              forwardVideo.dataset.phoneGroup45FrameReady = 'true';
              renderFrame(1);
              runChapterDissolve(1, completionGeneration, () => {
                reportRunCompletion(1, completionGeneration);
              });
            }).catch(failMedia);
            return;
          }
          const reverseVideo = videoRef.current;
          if (!reverseVideo) {
            failMedia();
            return;
          }
          // Do not unlock the Lab boundary until the initial TTG frame is
          // actually presented; a canonical clock endpoint is not evidence.
          void prepareTimelineVideoFrame(
            reverseVideo,
            ttgEndpointMediaInput(reverseRunIdRef.current, 0, -1)
          ).then((result) => {
            if (
              mediaRetiringRef.current
              || completionGeneration !== runGenerationRef.current
            ) return;
            if (result?.status !== 'ready') {
              failMedia();
              return;
            }
            reverseVideo.dataset.phoneGroup45FrameReady = 'true';
            renderFrame(0);
            reportRunCompletion(-1, completionGeneration);
          }).catch(failMedia);
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
    rootRef.current?.setAttribute(
      'data-phone-ttg-scroll-progress',
      stableProgress(rawProgress).toFixed(4)
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
      forwardRequestedRef.current = false;
      reconcileMedia();
    },
    reverse() {
      activeRef.current = true;
      directionRef.current = -1;
      forwardRequestedRef.current = true;
      startRun(-1);
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
