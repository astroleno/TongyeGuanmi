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
  TTG_FIGURE_END_SECONDS,
  disposeTtgMedia,
  renderTtgAnimationProgress,
  ttgAnimationScene
} from '..';
import './PhoneTtg.css';

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
  | 'hold-initial'
  | 'hold-terminal';

type PhoneTtgProps = Group45PhoneSceneProps & Readonly<{
  onComplete?: (scene: 'ttg-animation') => void;
}>;

/** Figure2-derived phone camera over TTG's canonical media/layer owner. */
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
  if (active) return direction === -1 ? 'hold-initial' : 'play-forward';
  if (!prewarm) return 'release';
  return hasForwardRun && direction === 1 ? 'hold-terminal' : 'hold-initial';
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

function playbackLabel(status: Group45NativeAutoplayStatus): string {
  if (status === 'idle') return 'stable-initial';
  if (status === 'complete') return 'complete-forward';
  if (status === 'starting') return 'starting-forward';
  if (status === 'playing') return 'playing-forward';
  return status;
}

/**
 * TTG keeps the accepted Figure2 camera and adopts 4c659e3's AOD media clock:
 * source-zero play is immediate, rAF/timeupdate drive all layers, visibility
 * suspension is recoverable, and no paused seek gates the first moving frame.
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
    if (name !== 'figure-video') return;
    element?.setAttribute('data-phone-ttg-video', '');
    videoRef.current = element as HTMLVideoElement | null;
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
    disposeTtgMedia(rootRef.current);
    releasePhoneTtgVideo(videoRef.current);
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
    mediaErrorListenerRef.current?.('ttg-animation');
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
        onProgress: renderFrame,
        onReady: () => setMediaReady(true),
        onStatus: (status) => {
          if (rootRef.current) {
            rootRef.current.dataset.phoneTtgPlayback = playbackLabel(status);
          }
        },
        onComplete: () => {
          hasForwardRunRef.current = true;
          forwardRequestedRef.current = false;
          renderFrame(1);
          if (!completionReportedRef.current) {
            completionReportedRef.current = true;
            completionListenerRef.current?.('ttg-animation');
          }
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
      disposeTtgMedia(root);
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
