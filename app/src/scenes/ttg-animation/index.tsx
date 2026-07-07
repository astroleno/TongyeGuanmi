import type { SceneComponentProps, SceneModule } from '../../story/types';

export const TTG_MEDIA_KEY = 'ttg_figure-alpha-scrub';
export const TTG_BG_SRC = new URL('../../../../assets/ttg_bg.png', import.meta.url).href;
export const TTG_MIDDLE_SRC = new URL('../../../../assets/ttg_middle-alpha.png', import.meta.url).href;
export const TTG_MIDDLE_OVERLAY_SRC = new URL('../../../../assets/ttg_middle-original-overlay-alpha.png', import.meta.url).href;
export const TTG_FRONT_SRC = new URL('../../../../assets/ttg_front-original-overlay-alpha.png', import.meta.url).href;
export const TTG_FRONT_OVERLAY_SRC = new URL('../../../../assets/ttg_front-alpha.png', import.meta.url).href;
export const TTG_FIGURE_VIDEO_SRC = new URL('../../../../assets/ttg_figure-alpha-scrub.webm', import.meta.url).href;
export const TTG_FIGURE_REVERSE_VIDEO_SRC = new URL('../../../../assets/ttg_figure-alpha-scrub-reverse.webm', import.meta.url).href;
export const TTG_FIGURE_POSTER_SRC = new URL('../../../../assets/ttg_figure-alpha-scrub-poster.png', import.meta.url).href;

export type TtgRenderState = {
  progress: number;
  visualProgress: number;
  bgY: number;
  middleY: number;
  frontY: number;
  figureY: number;
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

function seekVideo(video: HTMLVideoElement | null | undefined, progress: number): void {
  if (!video) {
    return;
  }
  video.loop = false;
  video.pause();
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : TTG_CONFIG.videoDurationFallback;
  const targetTime = Math.max(0, Math.min(duration - 0.02, progress * duration));
  if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.016) {
    video.currentTime = targetTime;
  }
}

export function renderTtgAnimationProgress(root: HTMLElement | null | undefined, rawProgress: number): TtgRenderState {
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

  seekVideo(section?.querySelector<HTMLVideoElement>('[data-ttg-figure-video]'), progress);
  seekVideo(section?.querySelector<HTMLVideoElement>('[data-ttg-figure-video-reverse]'), 1 - progress);

  return { progress, visualProgress, bgY, middleY, frontY, figureY };
}

function TtgAnimationScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('field', element);
        renderTtgAnimationProgress(element, 1);
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
                preload="auto"
                playsInline
              />
              <video
                className="ttg-layer ttg-layer--figure"
                data-ttg-figure-video-reverse
                src={TTG_FIGURE_REVERSE_VIDEO_SRC}
                width="720"
                height="1280"
                muted
                preload="auto"
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
  requiredHandles: ['field', 'figure-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
