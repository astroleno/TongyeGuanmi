import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  timelineVideoDriverFor,
  type TimelineVideoDriveInput
} from '../../media/timeline-video-driver';
import { TTG_PLAYBACK_MS } from '../../story/timings';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const TTG_MEDIA_KEY = 'ttg_figure-alpha-scrub';
export const TTG_REVERSE_MEDIA_KEY = 'ttg_figure-alpha-scrub-reverse';
export const TTG_BG_SRC = new URL('../../../../assets/ttg_bg.png', import.meta.url).href;
export const TTG_MIDDLE_SRC = new URL('../../../../assets/ttg_middle-alpha.png', import.meta.url).href;
export const TTG_MIDDLE_OVERLAY_SRC = new URL('../../../../assets/ttg_middle-original-overlay-alpha.png', import.meta.url).href;
export const TTG_FRONT_SRC = new URL('../../../../assets/ttg_front-original-overlay-alpha.png', import.meta.url).href;
export const TTG_FRONT_OVERLAY_SRC = new URL('../../../../assets/ttg_front-alpha.png', import.meta.url).href;
export const TTG_FIGURE_VIDEO_SRC = new URL('../../../../assets/ttg_figure-alpha-scrub.webm', import.meta.url).href;
export const TTG_FIGURE_REVERSE_VIDEO_SRC = new URL('../../../../assets/ttg_figure-alpha-scrub-reverse.webm', import.meta.url).href;
export const TTG_FIGURE_POSTER_SRC = new URL('../../../../assets/ttg_figure-alpha-scrub-poster.png', import.meta.url).href;
export const TTG_HOLD_PROGRESS = 0;

export type TtgRenderState = {
  progress: number;
  visualProgress: number;
  bgY: number;
  middleY: number;
  frontY: number;
  figureY: number;
};

export type TtgMediaRun = {
  runId: string;
  direction: 1 | -1;
  reducedMotion?: boolean;
};

type TtgRenderOptions = {
  mediaRun?: TtgMediaRun;
};

const TTG_CONFIG = {
  videoDurationFallback: 2.459,
  bgTravelVh: 14.3,
  middleTravelVh: 23.5,
  frontYVh: 29.2,
  frontTravelVh: 13.1,
  frontOverlayOpacity: 0.2,
  figureScale: 0.8,
  figureYVh: -8.5,
  figureTravelVh: 16.5
} as const;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const stableProgress = (value: number) => (value < 0.002 ? 0 : value > 0.998 ? 1 : clamp(value));
const acceleratedProgress = (progress: number) => {
  const p = stableProgress(progress);
  return clamp(0.78 * p + 0.22 * p * p);
};

function viewportHeight(): number {
  return typeof window === 'undefined' ? 800 : window.innerHeight;
}

type TtgSurface = 'forward' | 'reverse';

type TtgSurfaceState = {
  token: number;
  runId: string;
  direction: 1 | -1;
  pendingSurface?: TtgSurface;
  pendingProgress?: number;
  pendingReady?: Promise<void>;
};

const surfaceStates = new WeakMap<HTMLElement, TtgSurfaceState>();

function mediaInput(
  mediaRun: NonNullable<TtgRenderOptions['mediaRun']>,
  progress: number,
  mode: NonNullable<TimelineVideoDriveInput['mode']>
): TimelineVideoDriveInput {
  return {
    runId: mediaRun.runId,
    direction: mediaRun.direction,
    progress,
    durationFallbackSeconds: TTG_CONFIG.videoDurationFallback,
    endEpsilonSeconds: 0.02,
    timelineDurationMs: TTG_PLAYBACK_MS,
    mode,
    nativePlaybackDirection: 1,
    ...(mediaRun.reducedMotion !== undefined ? { reducedMotion: mediaRun.reducedMotion } : {})
  };
}

function setActiveSurface(
  section: HTMLElement,
  surface: TtgSurface,
  forwardVideo: HTMLVideoElement,
  reverseVideo: HTMLVideoElement
): void {
  const active = surface === 'forward' ? forwardVideo : reverseVideo;
  const inactive = surface === 'forward' ? reverseVideo : forwardVideo;
  active.classList.add('is-active');
  inactive.classList.remove('is-active');
  section.dataset.ttgActiveSurface = surface;
}

function parkSurface(video: HTMLVideoElement): void {
  disposeTimelineVideoDriver(video);
  video.pause();
  video.dataset.ttgSurfaceParked = 'true';
  if (video.preload !== 'metadata') {
    video.preload = 'metadata';
    video.load?.();
  }
}

function prepareAndActivate(
  section: HTMLElement,
  surface: TtgSurface,
  progress: number,
  mediaRun: NonNullable<TtgRenderOptions['mediaRun']>,
  forwardVideo: HTMLVideoElement,
  reverseVideo: HTMLVideoElement
): Promise<void> {
  const target = surface === 'forward' ? forwardVideo : reverseVideo;
  const state = surfaceStates.get(section) ?? {
    token: 0,
    runId: mediaRun.runId,
    direction: mediaRun.direction
  };
  if (
    state.pendingSurface === surface
    && state.runId === mediaRun.runId
    && state.direction === mediaRun.direction
    && state.pendingProgress !== undefined
    && Math.abs(state.pendingProgress - progress) <= 0.001
  ) {
    return state.pendingReady ?? Promise.resolve();
  }
  state.token += 1;
  state.runId = mediaRun.runId;
  state.direction = mediaRun.direction;
  state.pendingSurface = surface;
  state.pendingProgress = progress;
  surfaceStates.set(section, state);
  const token = state.token;
  section.dataset.ttgPendingSurface = surface;
  const input = mediaInput(mediaRun, progress, 'timeline');
  let activated = false;
  const activate = () => {
    if (
      activated
      || state.token !== token
      || state.runId !== mediaRun.runId
      || state.direction !== mediaRun.direction
    ) {
      return;
    }
    activated = true;
    delete state.pendingSurface;
    delete state.pendingProgress;
    setActiveSurface(section, surface, forwardVideo, reverseVideo);
    delete section.dataset.ttgPendingSurface;
    delete target.dataset.ttgSurfaceParked;
    driveTimelineVideo(target, { ...input, mode: 'native-preferred', nativePlaybackDirection: 1 });
    const inactive = surface === 'forward' ? reverseVideo : forwardVideo;
    parkSurface(inactive);
  };
  const ready = prepareTimelineVideoFrame(target, input);
  const pendingReady = (async () => {
    if (timelineVideoDriverFor(target).snapshot().frameReady) {
      activate();
    }
    const result = await ready;
    if (result?.status === 'ready') {
      activate();
    }
  })();
  state.pendingReady = pendingReady;
  void pendingReady.finally(() => {
    if (state.pendingReady === pendingReady) {
      delete state.pendingReady;
    }
  });
  return pendingReady;
}

function driveFigurePlayback(
  section: HTMLElement | null,
  progress: number,
  mediaRun: NonNullable<TtgRenderOptions['mediaRun']>
): void {
  const forwardVideo = section?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
  const reverseVideo = section?.querySelector<HTMLVideoElement>('[data-ttg-figure-video-reverse]');
  section?.setAttribute('data-ttg-playback-direction', String(mediaRun.direction));
  section?.setAttribute('data-ttg-playback-run', mediaRun.runId);
  section?.setAttribute('data-ttg-raw-progress', progress.toFixed(4));
  section?.setAttribute('data-ttg-playback-active', String(progress > 0.001 && progress < 0.999));
  if (!section || !forwardVideo || !reverseVideo) {
    return;
  }

  const desiredSurface: TtgSurface = mediaRun.direction === 1 ? 'forward' : 'reverse';
  const desiredVideo = desiredSurface === 'forward' ? forwardVideo : reverseVideo;
  const mediaProgress = desiredSurface === 'forward' ? progress : 1 - progress;
  const desiredIsActive = desiredVideo.classList.contains('is-active');

  if (!desiredIsActive) {
    void prepareAndActivate(
      section,
      desiredSurface,
      mediaProgress,
      mediaRun,
      forwardVideo,
      reverseVideo
    );
    return;
  }

  const snapshot = driveTimelineVideo(
    desiredVideo,
    mediaInput(mediaRun, mediaProgress, 'native-preferred')
  );
  delete desiredVideo.dataset.ttgSurfaceParked;
  section.dataset.ttgPlaybackFallback = String(snapshot?.nativeFallback ?? false);
  parkSurface(desiredSurface === 'forward' ? reverseVideo : forwardVideo);

  if (mediaRun.direction === -1 && progress <= 0.001) {
    void prepareAndActivate(section, 'forward', 0, mediaRun, forwardVideo, reverseVideo);
  }
}

export function prepareTtgAnimationFrame(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: TtgMediaRun
): Promise<void> {
  renderTtgAnimationProgress(root, rawProgress, { mediaRun });
  const section = root?.matches('[data-r4-scene="ttg-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]') ?? null;
  const forwardVideo = section?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
  const reverseVideo = section?.querySelector<HTMLVideoElement>('[data-ttg-figure-video-reverse]');
  if (!section || !forwardVideo || !reverseVideo) {
    return Promise.resolve();
  }
  const progress = stableProgress(rawProgress);
  const surface: TtgSurface = mediaRun.direction === 1 ? 'forward' : 'reverse';
  const mediaProgress = surface === 'forward' ? progress : 1 - progress;
  return prepareAndActivate(
    section,
    surface,
    mediaProgress,
    mediaRun,
    forwardVideo,
    reverseVideo
  );
}

export function renderTtgAnimationProgress(root: HTMLElement | null | undefined, rawProgress: number, options: TtgRenderOptions = {}): TtgRenderState {
  const section = root?.matches('[data-r4-scene="ttg-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]') ?? null;
  const progress = stableProgress(rawProgress);
  const visualProgress = acceleratedProgress(progress);
  const vh = viewportHeight();
  const bgY = -visualProgress * vh * (TTG_CONFIG.bgTravelVh / 100);
  const middleY = visualProgress * vh * (TTG_CONFIG.middleTravelVh / 100);
  const frontY = vh * (TTG_CONFIG.frontYVh / 100) + visualProgress * vh * (TTG_CONFIG.frontTravelVh / 100);
  const figureY = vh * (TTG_CONFIG.figureYVh / 100) + visualProgress * vh * (TTG_CONFIG.figureTravelVh / 100);

  section?.style.setProperty('--ttg-progress', visualProgress.toFixed(4));
  section?.style.setProperty('--ttg-figure-progress', visualProgress.toFixed(4));
  section?.style.setProperty('--ttg-front-overlay-opacity', TTG_CONFIG.frontOverlayOpacity.toFixed(3));
  section?.style.setProperty('--ttg-bg-y', `${bgY.toFixed(2)}px`);
  section?.style.setProperty('--ttg-bg-scale', (1 + visualProgress * 0.018).toFixed(4));
  section?.style.setProperty('--ttg-middle-y', `${middleY.toFixed(2)}px`);
  section?.style.setProperty('--ttg-middle-scale', (1 + visualProgress * 0.012).toFixed(4));
  section?.style.setProperty('--ttg-front-y', `${frontY.toFixed(2)}px`);
  section?.style.setProperty('--ttg-figure-y', `${figureY.toFixed(2)}px`);
  section?.style.setProperty('--ttg-figure-scale', TTG_CONFIG.figureScale.toFixed(4));
  section?.setAttribute('data-ttg-progress', visualProgress.toFixed(4));

  if (options.mediaRun) {
    driveFigurePlayback(section, progress, options.mediaRun);
  } else {
    const forwardVideo = section?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
    const reverseVideo = section?.querySelector<HTMLVideoElement>('[data-ttg-figure-video-reverse]');
    if (section && forwardVideo && reverseVideo) {
      setActiveSurface(section, 'forward', forwardVideo, reverseVideo);
    }
    if (forwardVideo) {
      parkSurface(forwardVideo);
    }
    if (reverseVideo) {
      parkSurface(reverseVideo);
    }
    section?.setAttribute('data-ttg-raw-progress', progress.toFixed(4));
  }

  return { progress, visualProgress, bgY, middleY, frontY, figureY };
}

export function renderTtgHold(root: HTMLElement | null): void {
  renderTtgAnimationProgress(root, TTG_HOLD_PROGRESS);
}

function TtgAnimationScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('field', element);
      }}
      className="ttg-page r4-ttg-animation"
      data-r4-scene="ttg-animation"
      data-ttg-transition
      data-ttg-stage
      data-ttg-duration="2.5"
      data-ttg-scroll-vh="153"
      data-ttg-video-duration="2.459"
      data-ttg-bg-travel-vh="14.3"
      data-ttg-middle-travel-vh="23.5"
      data-ttg-front-y-vh="29.2"
      data-ttg-front-travel-vh="13.1"
      data-ttg-front-overlay-opacity="0.2"
      data-ttg-figure-scale="0.80"
      data-ttg-figure-y-vh="-8.5"
      data-ttg-figure-travel-vh="16.5"
      aria-label="Talk to the God visual scene"
    >
      <div className="ttg-scroll">
        <div className="ttg-sticky">
          <div className="ttg-field">
            <div className="ttg-layer-stack" aria-hidden="true">
              <img className="ttg-layer ttg-layer--bg" src={TTG_BG_SRC} alt="" />
              <img className="ttg-layer ttg-layer--middle" src={TTG_MIDDLE_SRC} alt="" />
              <img className="ttg-layer ttg-layer--middle-overlay" src={TTG_MIDDLE_OVERLAY_SRC} alt="" />
              <img className="ttg-layer ttg-layer--front" src={TTG_FRONT_SRC} alt="" />
              <img className="ttg-layer ttg-layer--front-overlay" src={TTG_FRONT_OVERLAY_SRC} alt="" />
              <video
                ref={(element) => registerHandle?.('figure-video', element)}
                className="ttg-layer ttg-layer--figure is-active"
                data-ttg-figure-video
                data-media-key={TTG_MEDIA_KEY}
                src={TTG_FIGURE_VIDEO_SRC}
                poster={TTG_FIGURE_POSTER_SRC}
                width="720"
                height="1280"
                muted
                preload="metadata"
                playsInline
              />
              <video
                ref={(element) => registerHandle?.('figure-video-reverse', element)}
                className="ttg-layer ttg-layer--figure"
                data-ttg-figure-video-reverse
                data-media-key={TTG_REVERSE_MEDIA_KEY}
                src={TTG_FIGURE_REVERSE_VIDEO_SRC}
                width="720"
                height="1280"
                muted
                preload="metadata"
                playsInline
              />
            </div>
            <div className="ttg-progress" aria-hidden="true"><span /></div>
          </div>
        </div>
      </div>
    </article>
  );
}

export const ttgAnimationScene: SceneModule = {
  id: 'ttg-animation',
  Component: TtgAnimationScene,
  renderHold: renderTtgHold,
  requiredHandles: ['field', 'figure-video', 'figure-video-reverse'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
