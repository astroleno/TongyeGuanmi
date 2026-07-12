import { driveTimelineVideo } from '../../media/timeline-video-driver';
import { CRANE_CONTACT_DURATION_MS } from '../../story/timings';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const CRANE_FIGURE_MEDIA_KEY = 'crane-figure1-transition';
export const CRANE_FLOCK_MEDIA_KEY = 'crane-figure2-transition';
export const CRANE_PAPER_SRC = new URL('../../../../assets/aod-paper-bg.png', import.meta.url).href;
export const CRANE_CLOUD_BACK_SRC = new URL('../../../../assets/crane1_cloud2-alpha.png', import.meta.url).href;
export const CRANE_ARCH_SRC = new URL('../../../../assets/crane1_arch-alpha.png', import.meta.url).href;
export const CRANE_CLOUD_FRONT_SRC = new URL('../../../../assets/crane1_cloud1-alpha.png', import.meta.url).href;
export const CRANE_CLOUD_FRONT_SECOND_SRC = new URL('../../../../assets/crane1_cloud-front2-alpha.png', import.meta.url).href;
export const CRANE_FIGURE_VIDEO_SRC = new URL('../../../../assets/crane-figure1-transition.webm', import.meta.url).href;
export const CRANE_FLOCK_VIDEO_SRC = new URL('../../../../assets/crane-figure2-transition.webm', import.meta.url).href;

const VIDEO_DURATION_FALLBACK = 2.5;
export const CRANE_PLAYBACK_MS = CRANE_CONTACT_DURATION_MS;
export const CRANE_TIMELINE_DURATION_SECONDS = CRANE_PLAYBACK_MS / 1000;
const FLOCK_START_SECONDS = 0;
const FLOCK_END_SECONDS = 2.5;
const FIGURE_START_SECONDS = 0.5;
const FIGURE_FULLSCREEN_SECONDS = FIGURE_START_SECONDS + 1;
const FIGURE_END_SECONDS = FIGURE_START_SECONDS + VIDEO_DURATION_FALLBACK;
const FIGURE_POSITION = { x: 0, y: 198, scale: 0.8 };
export const CRANE_HOLD_PROGRESS = 0;

export type CraneRenderState = {
  progress: number;
  videoScale: number;
  videoOpacity: number;
  flockOpacity: number;
  downExitY: number;
};

type CraneRenderOptions = {
  mediaRun?: {
    runId: string;
    direction: 1 | -1;
    reducedMotion?: boolean;
  };
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
};
const range01 = (value: number, start: number, end: number) => clamp((value - start) / Math.max(0.0001, end - start));
const stableProgress = (value: number) => {
  if (value < 0.002) {
    return 0;
  }
  if (value > 0.998) {
    return 1;
  }
  return clamp(value);
};
const acceleratedProgress = (progress: number) => {
  const p = stableProgress(progress);
  return clamp(0.78 * p + 0.22 * p * p);
};

function driveCraneTimeline(
  section: HTMLElement | null,
  progress: number,
  figureProgress: number,
  flockProgress: number,
  mediaRun: NonNullable<CraneRenderOptions['mediaRun']>
): void {
  const figureVideo = section?.querySelector<HTMLVideoElement>('[data-crane-figure-video]');
  const flockVideo = section?.querySelector<HTMLVideoElement>('[data-crane-figure-front-video]');
  for (const [video, mediaProgress] of [
    [figureVideo, figureProgress],
    [flockVideo, flockProgress]
  ] as const) {
    driveTimelineVideo(video, {
      runId: mediaRun.runId,
      direction: mediaRun.direction,
      progress: mediaProgress,
      durationFallbackSeconds: VIDEO_DURATION_FALLBACK,
      endEpsilonSeconds: 0.001,
      timelineDurationMs: CRANE_PLAYBACK_MS,
      mode: 'timeline',
      ...(mediaRun.reducedMotion !== undefined ? { reducedMotion: mediaRun.reducedMotion } : {})
    });
  }
  section?.setAttribute('data-crane-playback-direction', String(mediaRun.direction));
  section?.setAttribute('data-crane-playback-run', mediaRun.runId);
  section?.setAttribute('data-crane-playback-active', String(progress > 0.001 && progress < 0.999));
}

function setTransform(element: HTMLElement | null | undefined, transform: string): void {
  if (element) {
    element.style.transform = transform;
  }
}

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="crane-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="crane-animation"]') ?? null;
}

export function renderCraneAnimationProgress(root: HTMLElement | null | undefined, rawProgress: number, options: CraneRenderOptions = {}): CraneRenderState {
  const section = rootFor(root);
  const timelineProgress = stableProgress(rawProgress);
  const progress = acceleratedProgress(timelineProgress);
  const time = progress * CRANE_TIMELINE_DURATION_SECONDS;
  const grow = smoothStep(range01(time, FIGURE_START_SECONDS, FIGURE_FULLSCREEN_SECONDS));
  const unmask = smoothStep(range01(time, FIGURE_START_SECONDS + 0.12, FIGURE_START_SECONDS + 1.05));
  const figureActive = time >= FIGURE_START_SECONDS;
  const videoOpacity = figureActive ? 1 : 0;
  const flockOpacity = 1 - smoothStep(range01(time, FLOCK_END_SECONDS - 0.24, FLOCK_END_SECONDS));
  const figureX = FIGURE_POSITION.x * (1 - grow);
  const figureY = FIGURE_POSITION.y * (1 - grow);
  const videoScale = FIGURE_POSITION.scale + (1 - FIGURE_POSITION.scale) * grow;
  const clipBottom = (1 - unmask) * 42;
  const exit = smoothStep(range01(progress, 0.08, 0.78));
  const viewportHeight = section?.ownerDocument?.defaultView?.innerHeight ?? 720;
  const downExitY = viewportHeight * 1.38 * exit;

  section?.style.setProperty('--crane-progress', progress.toFixed(4));
  section?.style.setProperty('--crane-video-scale', videoScale.toFixed(4));
  section?.style.setProperty('--crane-figure-x', `${figureX.toFixed(1)}px`);
  section?.style.setProperty('--crane-figure-base-y', `${figureY.toFixed(1)}px`);
  section?.style.setProperty('--crane-video-y', '0px');
  section?.style.setProperty('--crane-video-opacity', videoOpacity.toFixed(4));
  section?.style.setProperty('--crane-video-clip-bottom', `${clipBottom.toFixed(2)}%`);
  section?.style.setProperty('--crane-flock-opacity', flockOpacity.toFixed(4));
  section?.style.setProperty('--crane-flock-y', '0px');
  section?.setAttribute('data-crane-progress', progress.toFixed(4));

  setTransform(section?.querySelector<HTMLElement>('.crane-layer--cloud-back'), `translate3d(-50%, ${(downExitY * 0.82).toFixed(2)}px, 0)`);
  setTransform(section?.querySelector<HTMLElement>('.crane-layer--arch'), `translate3d(-50%, ${downExitY.toFixed(2)}px, 0)`);
  setTransform(section?.querySelector<HTMLElement>('.crane-layer--cloud-front-second'), `translate3d(-50%, ${(downExitY * 1.28).toFixed(2)}px, 0)`);
  setTransform(section?.querySelector<HTMLElement>('.crane-layer--cloud-front'), `translate3d(-50%, ${(downExitY * 1.14).toFixed(2)}px, 0)`);
  const figureProgress = range01(time, FIGURE_START_SECONDS, FIGURE_END_SECONDS);
  const flockProgress = range01(time, FLOCK_START_SECONDS, FLOCK_END_SECONDS);
  if (options.mediaRun) {
    driveCraneTimeline(section, timelineProgress, figureProgress, flockProgress, options.mediaRun);
  } else {
    driveCraneTimeline(section, timelineProgress, figureProgress, flockProgress, {
      runId: 'crane-hold',
      direction: -1
    });
    section?.setAttribute('data-crane-playback-active', 'false');
  }

  return { progress, videoScale, videoOpacity, flockOpacity, downExitY };
}

export function renderCraneHold(root: HTMLElement | null): void {
  renderCraneAnimationProgress(root, CRANE_HOLD_PROGRESS);
}

function CraneAnimationScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('stage', element);
      }}
      className="crane-page r4-crane-animation"
      data-r4-scene="crane-animation"
      data-crane-stage
      aria-label="Crane visual transition scene"
    >
      <section className="crane-scroll" aria-hidden="true">
        <div className="crane-sticky">
          <div
            className="crane-field"
            style={{ backgroundImage: `url(${CRANE_PAPER_SRC})` }}
          >
            <div className="crane-paper" aria-hidden="true" />
            <div className="crane-layer-stack" data-transition-ghost="crane-motion" aria-hidden="true">
              <img className="crane-layer crane-layer--cloud-back" src={CRANE_CLOUD_BACK_SRC} alt="" />
              <div className="crane-video-transition crane-video-transition--figure">
                <video
                  ref={(element) => registerHandle?.('figure-video', element)}
                  className="crane-figure-video"
                  data-crane-figure-video
                  data-media-key={CRANE_FIGURE_MEDIA_KEY}
                  src={CRANE_FIGURE_VIDEO_SRC}
                  muted
                  preload="auto"
                  playsInline
                />
              </div>
              <img className="crane-layer crane-layer--arch" src={CRANE_ARCH_SRC} alt="" />
              <img className="crane-layer crane-layer--cloud-front" src={CRANE_CLOUD_FRONT_SRC} alt="" />
              <img className="crane-layer crane-layer--cloud-front-second" src={CRANE_CLOUD_FRONT_SECOND_SRC} alt="" />
              <div className="crane-video-transition crane-video-transition--front">
                <video
                  ref={(element) => registerHandle?.('flock-video', element)}
                  className="crane-figure-video crane-figure-video--front"
                  data-crane-figure-front-video
                  data-media-key={CRANE_FLOCK_MEDIA_KEY}
                  src={CRANE_FLOCK_VIDEO_SRC}
                  muted
                  preload="auto"
                  playsInline
                />
              </div>
            </div>
            <div className="crane-warmth" aria-hidden="true" />
            <div className="crane-center-wash" aria-hidden="true" />
            <div className="crane-texture" aria-hidden="true" />
          </div>
        </div>
      </section>
    </article>
  );
}

export const craneAnimationScene: SceneModule = {
  id: 'crane-animation',
  Component: CraneAnimationScene,
  renderHold: renderCraneHold,
  requiredHandles: ['stage', 'figure-video', 'flock-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
