import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import {
  createGroup45NativeAutoplay,
  type Group45NativeAutoplay,
  type Group45NativeAutoplayStatus
} from '../../../production/phone/adapter-groups/group4-5-native-autoplay';
import type { ScenePresentationAdapterHandle } from '../../../story/presentation';
import {
  FIGURE3_END_SECONDS,
  figure3AnimationScene,
  renderFigure3AnimationProgress
} from '..';
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
}>;

export type PhoneFigure3MediaAction =
  | 'release'
  | 'static-fallback'
  | 'play-forward'
  | 'hold-initial'
  | 'hold-terminal';

type PhoneFigure3Props = Group45PhoneSceneProps & Readonly<{
  onComplete?: (scene: 'figure3-animation') => void;
}>;

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
    videoScale: 1.015 + visualProgress * .035,
    backdropOpacity: 1 - visualProgress * .18
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

function playbackLabel(status: Group45NativeAutoplayStatus): string {
  if (status === 'idle') return 'stable-initial';
  if (status === 'complete') return 'complete-forward';
  if (status === 'starting') return 'starting-forward';
  if (status === 'playing') return 'playing-forward';
  return status;
}

/**
 * Figure3 follows the accepted AOD ownership model from 4c659e3: the shell
 * starts and pins one run, then the native decoder owns time from source zero.
 * There is no paused seek/requestVideoFrameCallback gate before video.play().
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
  const completionListenerRef = useRef(onComplete);
  const mediaErrorListenerRef = useRef(onMediaError);
  const [mediaMounted, setMediaMounted] = useState(mediaMountedRef.current);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  completionListenerRef.current = onComplete;
  mediaErrorListenerRef.current = onMediaError;

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
    root.style.setProperty('--phone-figure3-video-opacity', frame.videoOpacity.toFixed(4));
    root.style.setProperty('--phone-figure3-video-scale', frame.videoScale.toFixed(4));
    root.style.setProperty('--phone-figure3-backdrop-opacity', frame.backdropOpacity.toFixed(4));
    root.dataset.phoneFigure3Progress = frame.progress.toFixed(4);
  }, []);

  const mountMedia = useCallback(() => {
    if (mediaMountedRef.current) return;
    mediaMountedRef.current = true;
    mediaRetiringRef.current = false;
    setMediaMounted(true);
  }, []);

  const releaseMedia = useCallback(() => {
    mediaRetiringRef.current = true;
    forwardRequestedRef.current = false;
    playbackRef.current?.dispose();
    playbackRef.current = null;
    releasePhoneFigure3Video(videoRef.current);
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

  const startForwardRun = useCallback(() => {
    if (reducedMotionRef.current || mediaFailedRef.current) return;
    activeRef.current = true;
    directionRef.current = 1;
    hasForwardRunRef.current = true;
    forwardRequestedRef.current = true;
    mountMedia();
    const playback = playbackRef.current;
    if (!playback) return;
    if (!playback.active) completionReportedRef.current = false;
    forwardRequestedRef.current = false;
    playback.start();
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
    if (action === 'play-forward') {
      if (forwardRequestedRef.current) startForwardRun();
      return;
    }
    forwardRequestedRef.current = false;
    const endpoint = action === 'hold-terminal' ? 1 : 0;
    playback.reset(endpoint);
    renderFrame(endpoint);
  }, [mountMedia, releaseMedia, renderFrame, startForwardRun]);

  useEffect(() => {
    if (!mediaMounted) return;
    const video = videoRef.current;
    if (!video) return;
    mediaRetiringRef.current = false;
    disposeTimelineVideoDriver(video);
    const playback = createGroup45NativeAutoplay(video, {
      durationSeconds: FIGURE3_END_SECONDS,
      onProgress: renderFrame,
      onReady: () => setMediaReady(true),
      onStatus: (status) => {
        if (rootRef.current) {
          rootRef.current.dataset.phoneFigure3Playback = playbackLabel(status);
        }
      },
      onComplete: () => {
        hasForwardRunRef.current = true;
        forwardRequestedRef.current = false;
        renderFrame(1);
        if (!completionReportedRef.current) {
          completionReportedRef.current = true;
          completionListenerRef.current?.('figure3-animation');
        }
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
    if (active && direction === 1 && (!wasActive || previousDirection !== 1)) {
      forwardRequestedRef.current = true;
    } else if (!active || direction === -1) {
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
      startForwardRun();
    },
    leave() {
      activeRef.current = false;
      forwardRequestedRef.current = false;
      reconcileMedia();
    },
    reverse() {
      activeRef.current = false;
      directionRef.current = -1;
      forwardRequestedRef.current = false;
      playbackRef.current?.reset(0);
      renderFrame(0);
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
  }), [reconcileMedia, releaseMedia, renderFrame, startForwardRun, update]);

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
