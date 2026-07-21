import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { AlphaVideoSources } from '../../../media/alpha-video-sources';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
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

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type PhoneTtgFrame = Readonly<{
  progress: number;
  backgroundY: number;
  middleY: number;
  foregroundY: number;
  figureY: number;
  figureOpacity: number;
}>;

/** Deliberately narrow mobile camera for the individual TTG source layers. */
export function phoneTtgFrame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false
): PhoneTtgFrame {
  const progress = mediaFailed ? 1 : reducedMotion ? 0 : clamp(rawProgress);
  const eased = progress * progress * (3 - 2 * progress);
  return {
    progress,
    backgroundY: eased === 0 ? 0 : -8 * eased,
    middleY: 12 * eased,
    foregroundY: 16 + 14 * eased,
    figureY: -4 + 10 * eased,
    figureOpacity: mediaFailed || reducedMotion ? 0 : 1
  };
}

/** Release TTG's sole video owner before the scene retires. */
export function releasePhoneTtgVideo(video: HTMLVideoElement | null): void {
  if (!video) return;
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

function setVideoFrame(video: HTMLVideoElement | null, progress: number): void {
  if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
  const time = Math.min(TTG_FIGURE_END_SECONDS, Math.max(0, progress * TTG_FIGURE_END_SECONDS));
  if (Math.abs(video.currentTime - time) < 0.02) return;
  try {
    video.currentTime = time;
  } catch {
    // Error state is reported by the media element.
  }
}

/** One video owner plus static image layers for the TTG visual chapter. */
export const PhoneTtg = forwardRef<
  ScenePresentationAdapterHandle,
  Group45PhoneSceneProps
>(function PhoneTtg(
  { active, reducedMotion, onMediaError, onReady },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef(0);
  const mediaFailedRef = useRef(false);
  const mediaRetiringRef = useRef(false);
  const [mediaMounted, setMediaMounted] = useState(active && !reducedMotion);
  const [mediaFailed, setMediaFailed] = useState(false);

  const update = useCallback((rawProgress: number) => {
    progressRef.current = clamp(rawProgress);
    const root = rootRef.current;
    const frame = phoneTtgFrame(progressRef.current, reducedMotion, mediaFailed);
    if (!root) return;
    root.style.setProperty('--phone-ttg-background-y', `${frame.backgroundY.toFixed(2)}%`);
    root.style.setProperty('--phone-ttg-middle-y', `${frame.middleY.toFixed(2)}%`);
    root.style.setProperty('--phone-ttg-foreground-y', `${frame.foregroundY.toFixed(2)}%`);
    root.style.setProperty('--phone-ttg-figure-y', `${frame.figureY.toFixed(2)}%`);
    root.style.setProperty('--phone-ttg-figure-opacity', frame.figureOpacity.toFixed(4));
    root.dataset.phoneTtgProgress = frame.progress.toFixed(4);
    setVideoFrame(videoRef.current, frame.progress);
  }, [mediaFailed, reducedMotion]);

  const releaseMedia = useCallback(() => {
    mediaRetiringRef.current = true;
    releasePhoneTtgVideo(videoRef.current);
    setMediaMounted(false);
  }, []);
  const enter = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phoneTtgActive = 'true';
    mediaRetiringRef.current = false;
    if (!reducedMotion && !mediaFailed) {
      setMediaMounted(true);
    }
    update(progressRef.current);
  }, [mediaFailed, reducedMotion, update]);
  const leave = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phoneTtgActive = 'false';
    releaseMedia();
  }, [releaseMedia]);
  const failMedia = useCallback(() => {
    if (mediaRetiringRef.current || mediaFailedRef.current) return;
    mediaFailedRef.current = true;
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
    if (active) enter();
    else leave();
  }, [active, enter, leave]);
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
      delete root.dataset.phoneMediaState;
      root.style.removeProperty('--phone-ttg-background-y');
      root.style.removeProperty('--phone-ttg-middle-y');
      root.style.removeProperty('--phone-ttg-foreground-y');
      root.style.removeProperty('--phone-ttg-figure-y');
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
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={() => update(progressRef.current)}
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
