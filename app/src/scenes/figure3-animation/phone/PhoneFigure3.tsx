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
import { FIGURE3_SERVICES_DURATION_MS } from '../../../story/timings';
import type { ScenePresentationAdapterHandle } from '../../../story/presentation';
import {
  FIGURE3_END_SECONDS,
  FIGURE3_HEVC_ALPHA_SRC,
  FIGURE3_MEDIA_KEY,
  FIGURE3_VIDEO_SRC
} from '..';
import './PhoneFigure3.css';

const FIGURE3_PHONE_RUN_ID = 'phone-figure3-scroll';

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type PhoneFigure3Frame = Readonly<{
  progress: number;
  videoOpacity: number;
  videoScale: number;
  backdropOpacity: number;
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
    videoScale: 1.015 + visualProgress * 0.035,
    backdropOpacity: 1 - visualProgress * 0.18
  };
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

/** Figure3 shares the canonical coalesced driver instead of per-scroll seeks. */
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
    // Match the accepted AOD behavior: entering forward gives the decoder a
    // normal native run. Reverse remains timeline-controlled because Figure3
    // has no separate reverse source.
    mode: direction === 1 ? 'native-preferred' : 'timeline',
    nativePlaybackDirection: 1,
    reducedMotion,
    allowSeekedFrameFallback: browserPrefersHevcAlpha()
  };
}

/**
 * Phone-owned Figure3 media surface. Its failure endpoint is a stable tonal
 * frame; the Figure3 → Services bridge then resolves to Services without any
 * waiting state or second media owner.
 */
export const PhoneFigure3 = forwardRef<
  ScenePresentationAdapterHandle,
  Group45PhoneSceneProps
>(function PhoneFigure3(
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
    const progress = clamp(rawProgress);
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    const root = rootRef.current;
    const frame = phoneFigure3Frame(progressRef.current, reducedMotion, mediaFailed);
    if (!root) return;
    root.style.setProperty('--phone-figure3-video-opacity', frame.videoOpacity.toFixed(4));
    root.style.setProperty('--phone-figure3-video-scale', frame.videoScale.toFixed(4));
    root.style.setProperty('--phone-figure3-backdrop-opacity', frame.backdropOpacity.toFixed(4));
    root.dataset.phoneFigure3Progress = frame.progress.toFixed(4);
    if (active && !mediaFailed && !reducedMotion && videoRef.current) {
      const startForwardAutoplay = forwardAutoplayPendingRef.current;
      driveTimelineVideo(
        videoRef.current,
        phoneFigure3MediaInput(
          startForwardAutoplay ? 0 : frame.progress,
          startForwardAutoplay ? 1 : directionRef.current,
          reducedMotion
        )
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
    releasePhoneFigure3Video(videoRef.current);
    setMediaMounted(false);
  }, []);
  const enter = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phoneFigure3Active = 'true';
    mediaRetiringRef.current = false;
    hasEnteredRef.current = true;
    if (!reducedMotion && !mediaFailed) {
      // Scroll may already have moved the visual rail by the time the video
      // mounts (notably on direct #figure3 entry). Keep the first forward
      // media input at the semantic start so the whole authored run plays.
      forwardAutoplayPendingRef.current = directionRef.current === 1;
      if (forwardAutoplayPendingRef.current) {
        root.dataset.phoneFigure3Playback = 'starting-forward';
      }
      warmMedia();
    }
    update(progressRef.current);
  }, [mediaFailed, reducedMotion, update, warmMedia]);
  const leave = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phoneFigure3Active = 'false';
    releaseMedia();
  }, [releaseMedia]);
  const failMedia = useCallback(() => {
    const root = rootRef.current;
    if (mediaRetiringRef.current || mediaFailedRef.current) return;
    mediaFailedRef.current = true;
    forwardAutoplayPendingRef.current = false;
    setMediaFailed(true);
    if (root) root.dataset.phoneMediaState = 'fallback';
    releaseMedia();
    onMediaError?.('figure3-animation');
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
      if (rootRef.current) rootRef.current.dataset.phoneFigure3Active = 'false';
      return;
    }
    leave();
  }, [active, enter, leave, mediaFailed, prewarm, reducedMotion, warmMedia]);
  useEffect(() => () => releasePhoneFigure3Video(videoRef.current), []);

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
      delete root.dataset.phoneFigure3Active;
      delete root.dataset.phoneFigure3Progress;
      delete root.dataset.phoneFigure3Playback;
      delete root.dataset.phoneMediaState;
      root.style.removeProperty('--phone-figure3-video-opacity');
      root.style.removeProperty('--phone-figure3-video-scale');
      root.style.removeProperty('--phone-figure3-backdrop-opacity');
    }
  }), [enter, leave, releaseMedia, update]);

  return (
    <section
      ref={rootRef}
      className="phone-figure3"
      data-phone-scene="figure3-animation"
      data-phone-media-owner="figure3-motion"
      data-phone-media-state={mediaFailed ? 'fallback' : 'ready'}
      aria-hidden="true"
    >
      <div className="phone-figure3__backdrop" />
      <div className="phone-figure3__field">
        {mediaMounted && (
          <video
            ref={videoRef}
            className="phone-figure3__video"
            data-media-key={FIGURE3_MEDIA_KEY}
            data-phone-figure3-video
            data-figure3-alpha-video
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={() => update(progressRef.current)}
            onPlay={() => {
              forwardAutoplayPendingRef.current = false;
              if (rootRef.current) rootRef.current.dataset.phoneFigure3Playback = 'playing-forward';
            }}
            onEnded={() => {
              if (rootRef.current) rootRef.current.dataset.phoneFigure3Playback = 'complete-forward';
            }}
            onError={failMedia}
          >
            <AlphaVideoSources
              webm={FIGURE3_VIDEO_SRC}
              hevc={FIGURE3_HEVC_ALPHA_SRC}
            />
          </video>
        )}
        <div className="phone-figure3__fallback" data-phone-media-fallback="figure3" />
      </div>
    </section>
  );
});

export default PhoneFigure3;
