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

function figure3ReverseMediaInput(
  runId: string,
  progress: number
): TimelineVideoDriveInput {
  return {
    runId,
    direction: -1,
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
 * source zero. Reverse reuses the canonical timeline driver's coalesced seek
 * path because Figure3 has no approved reverse asset.
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
  const paperCompositorRef = useRef<PhoneFigure3PaperCompositor | null>(null);
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
  const reverseRunIdRef = useRef('phone-figure3-reverse-0');
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
    if (name !== 'figure3-video') return;
    element?.setAttribute('data-phone-figure3-video', '');
    videoRef.current = element as HTMLVideoElement | null;
  }, []);

  const renderFrame = useCallback((
    rawProgress: number,
    playbackDirection?: Group45NativeAutoplayDirection
  ) => {
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
    const video = videoRef.current;
    if (playbackDirection === -1 && video) {
      driveTimelineVideo(
        video,
        figure3ReverseMediaInput(reverseRunIdRef.current, frame.progress)
      );
    }
  }, []);

  const mountMedia = useCallback(() => {
    if (mediaMountedRef.current) return;
    mediaMountedRef.current = true;
    mediaRetiringRef.current = false;
    setMediaMounted(true);
  }, []);

  const releaseMedia = useCallback(() => {
    runGenerationRef.current += 1;
    mediaRetiringRef.current = true;
    forwardRequestedRef.current = false;
    paperCompositorRef.current?.dispose();
    paperCompositorRef.current = null;
    releasePhoneFigure3PaperCanvas(canvasRef.current);
    playbackRef.current?.dispose();
    playbackRef.current = null;
    releasePhoneFigure3Video(videoRef.current);
    const root = rootRef.current;
    if (root) delete root.dataset.phoneFigure3PaperCompositor;
    mediaMountedRef.current = false;
    setMediaReady(false);
    setMediaMounted(false);
  }, []);

  const failMedia = useCallback(() => {
    if (mediaRetiringRef.current || mediaFailedRef.current) return;
    mediaFailedRef.current = true;
    setMediaFailed(true);
    renderFrame(1);
    releaseMedia();
    rootRef.current?.setAttribute('data-phone-media-state', 'fallback');
    mediaErrorListenerRef.current?.('figure3-animation');
  }, [releaseMedia, renderFrame]);

  const startRun = useCallback((runDirection: 1 | -1) => {
    if (reducedMotionRef.current || mediaFailedRef.current) return;
    activeRef.current = true;
    directionRef.current = runDirection;
    runGenerationRef.current += 1;
    if (runDirection === -1) {
      reverseRunIdRef.current = `phone-figure3-reverse-${runGenerationRef.current}`;
    } else {
      // A completed reverse leaves a shared seek driver on this element.
      // Retire it before native forward playback takes sole ownership again.
      if (videoRef.current) disposeTimelineVideoDriver(videoRef.current);
    }
    if (runDirection === 1) hasForwardRunRef.current = true;
    forwardRequestedRef.current = true;
    mountMedia();
    const playback = playbackRef.current;
    if (!playback) return;
    if (!playback.active) completionReportedRef.current = false;
    forwardRequestedRef.current = false;
    playback.start(runDirection);
  }, [mountMedia]);

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
    playback.reset(endpoint);
    renderFrame(endpoint);
  }, [mountMedia, releaseMedia, renderFrame, startRun]);

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
  }, [mediaMounted]);

  useEffect(() => {
    if (!mediaMounted) return;
    const video = videoRef.current;
    if (!video) return;
    mediaRetiringRef.current = false;
    disposeTimelineVideoDriver(video);
    const playback = createGroup45NativeAutoplay(video, {
      durationSeconds: FIGURE3_END_SECONDS,
      onProgress: (progress, playbackDirection) => {
        renderFrame(progress, playbackDirection);
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
      onComplete: (playbackDirection) => {
        const completionGeneration = runGenerationRef.current;
        hasForwardRunRef.current = playbackDirection === 1;
        forwardRequestedRef.current = false;
        const endpoint = playbackDirection === 1 ? 1 : 0;
        renderFrame(endpoint, playbackDirection);
        const reportCompletion = () => {
          if (
            mediaRetiringRef.current
            || completionGeneration !== runGenerationRef.current
            || completionReportedRef.current
          ) return;
          completionReportedRef.current = true;
          completionListenerRef.current?.('figure3-animation', playbackDirection);
        };
        if (playbackDirection === 1) {
          reportCompletion();
          return;
        }
        const reverseVideo = videoRef.current;
        if (!reverseVideo) {
          failMedia();
          return;
        }
        // Keep the shell pinned until Safari has presented the initial frame;
        // logical progress alone must never release into Brand early.
        void prepareTimelineVideoFrame(
          reverseVideo,
          figure3ReverseMediaInput(reverseRunIdRef.current, 0)
        ).then((result) => {
          if (result?.status !== 'ready') return;
          reportCompletion();
        }).catch(failMedia);
      },
      onError: failMedia
    });
    playbackRef.current = playback;
    playback.reset(0);
    reconcileMedia();
    return () => {
      playback.dispose();
      if (playbackRef.current === playback) playbackRef.current = null;
    };
  }, [failMedia, mediaMounted, reconcileMedia, renderFrame]);

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
      delete root.dataset.phoneFigure3Active;
      delete root.dataset.phoneFigure3Progress;
      delete root.dataset.phoneFigure3ScrollProgress;
      delete root.dataset.phoneFigure3Playback;
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
