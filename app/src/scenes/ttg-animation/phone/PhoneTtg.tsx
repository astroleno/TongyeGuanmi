import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { AlphaVideoSources, browserPrefersHevcAlpha } from '../../../media/alpha-video-sources';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  type TimelineVideoDriveInput
} from '../../../media/timeline-video-driver';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import { TTG_PLAYBACK_MS } from '../../../story/timings';
import type { ScenePresentationAdapterHandle } from '../../../story/presentation';
import {
  TTG_BG_SRC,
  TTG_FIGURE_END_SECONDS,
  TTG_FIGURE_HEVC_ALPHA_SRC,
  TTG_FIGURE_VIDEO_SRC,
  TTG_MEDIA_KEY,
  TTG_MIDDLE_SRC,
  TTG_FRONT_SRC
} from '..';
import './PhoneTtg.css';

const TTG_PHONE_RUN_ID = 'phone-ttg-scroll';

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

/** Forward owns native playback; reverse is coalesced by the shared timeline driver. */
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
    // The forward leg owns a native decoder run, like the proven Figure2
    // phone path. A reverse arrival resolves through the stable timeline.
    mode: direction === 1 ? 'native-preferred' : 'timeline',
    nativePlaybackDirection: 1,
    reducedMotion,
    allowSeekedFrameFallback: browserPrefersHevcAlpha()
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

function drivePhoneTtgVideo(
  video: HTMLVideoElement | null,
  progress: number,
  direction: 1 | -1,
  reducedMotion: boolean
): void {
  if (!video || reducedMotion) return;
  driveTimelineVideo(video, phoneTtgMediaInput(progress, direction, reducedMotion));
}

/** One video owner plus static layers; decoder work is coalesced by the shared driver. */
export const PhoneTtg = forwardRef<
  ScenePresentationAdapterHandle,
  Group45PhoneSceneProps
>(function PhoneTtg(
  { active, prewarm = false, reducedMotion, onMediaError, onReady },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const forwardAutoplayPendingRef = useRef(false);
  const hasEnteredRef = useRef(false);
  const mediaFailedRef = useRef(false);
  const mediaRetiringRef = useRef(false);
  const [mediaMounted, setMediaMounted] = useState((active || prewarm) && !reducedMotion);
  const [mediaFailed, setMediaFailed] = useState(false);

  const update = useCallback((rawProgress: number) => {
    const progress = stableProgress(rawProgress);
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    const root = rootRef.current;
    const frame = phoneTtgFrame(progress, reducedMotion, mediaFailed);
    if (!root) return;
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
    if (active && !mediaFailed) {
      const startForwardAutoplay = forwardAutoplayPendingRef.current;
      drivePhoneTtgVideo(
        videoRef.current,
        startForwardAutoplay ? 0 : frame.progress,
        startForwardAutoplay ? 1 : directionRef.current,
        reducedMotion
      );
    }
  }, [active, mediaFailed, reducedMotion]);

  const warmMedia = useCallback(() => {
    mediaRetiringRef.current = false;
    if (!reducedMotion && !mediaFailed) setMediaMounted(true);
  }, [mediaFailed, reducedMotion]);

  const releaseMedia = useCallback(() => {
    mediaRetiringRef.current = true;
    forwardAutoplayPendingRef.current = false;
    releasePhoneTtgVideo(videoRef.current);
    setMediaMounted(false);
  }, []);
  const enter = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phoneTtgActive = 'true';
    mediaRetiringRef.current = false;
    hasEnteredRef.current = true;
    if (!reducedMotion && !mediaFailed) {
      // Do not let direct hash navigation or a fast scroll skip the authored
      // Figure2-style forward run before its video has mounted.
      forwardAutoplayPendingRef.current = directionRef.current === 1;
      if (forwardAutoplayPendingRef.current) {
        root.dataset.phoneTtgPlayback = 'starting-forward';
      }
      warmMedia();
    }
    update(progressRef.current);
  }, [mediaFailed, reducedMotion, update, warmMedia]);
  const leave = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phoneTtgActive = 'false';
    releaseMedia();
  }, [releaseMedia]);
  const failMedia = useCallback(() => {
    if (mediaRetiringRef.current || mediaFailedRef.current) return;
    mediaFailedRef.current = true;
    forwardAutoplayPendingRef.current = false;
    setMediaFailed(true);
    if (rootRef.current) rootRef.current.dataset.phoneMediaState = 'fallback';
    releaseMedia();
    onMediaError?.('ttg-animation');
  }, [onMediaError, releaseMedia]);

  useEffect(() => {
    update(progressRef.current);
  }, [update]);
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  useEffect(() => {
    if (active) {
      enter();
      return;
    }
    if (prewarm && !hasEnteredRef.current && !reducedMotion && !mediaFailed) {
      warmMedia();
      if (rootRef.current) rootRef.current.dataset.phoneTtgActive = 'false';
      return;
    }
    leave();
  }, [active, enter, leave, mediaFailed, prewarm, reducedMotion, warmMedia]);
  useEffect(() => () => releasePhoneTtgVideo(videoRef.current), []);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update,
    enter,
    leave,
    reverse: enter,
    dispose() {
      releaseMedia();
      const root = rootRef.current;
      if (!root) return;
      delete root.dataset.phoneTtgActive;
      delete root.dataset.phoneTtgProgress;
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
  }), [enter, leave, releaseMedia, update]);

  return (
    <section
      ref={rootRef}
      className="phone-ttg"
      data-phone-scene="ttg-animation"
      data-phone-media-owner="ttg-figure-motion"
      data-phone-media-state={mediaFailed ? 'fallback' : 'ready'}
      aria-hidden="true"
    >
      <div className="phone-ttg__field">
        <img
          className="phone-ttg__layer phone-ttg__layer--background"
          src={TTG_BG_SRC}
          alt=""
          onError={failMedia}
        />
        <img
          className="phone-ttg__layer phone-ttg__layer--middle"
          src={TTG_MIDDLE_SRC}
          alt=""
          onError={failMedia}
        />
        <img
          className="phone-ttg__layer phone-ttg__layer--foreground"
          src={TTG_FRONT_SRC}
          alt=""
          onError={failMedia}
        />
        {mediaMounted && (
          <video
            ref={videoRef}
            className="phone-ttg__layer phone-ttg__layer--figure"
            data-media-key={TTG_MEDIA_KEY}
            data-phone-ttg-video
            data-ttg-figure-video
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={() => update(progressRef.current)}
            onPlay={() => {
              forwardAutoplayPendingRef.current = false;
              if (rootRef.current) rootRef.current.dataset.phoneTtgPlayback = 'playing-forward';
            }}
            onEnded={() => {
              if (rootRef.current) rootRef.current.dataset.phoneTtgPlayback = 'complete-forward';
            }}
            onError={failMedia}
          >
            <AlphaVideoSources
              webm={TTG_FIGURE_VIDEO_SRC}
              hevc={TTG_FIGURE_HEVC_ALPHA_SRC}
            />
          </video>
        )}
      </div>
    </section>
  );
});

export default PhoneTtg;
