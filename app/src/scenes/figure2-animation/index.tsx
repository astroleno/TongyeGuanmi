import { useEffect, useRef } from 'react';
import { driveTimelineVideo } from '../../media/timeline-video-driver';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import type { InkDepthTransform } from '../../transitions/shared/inkField';

const CLOUD_IMAGE = new URL('../../../../assets/figure2-cloud-source.png', import.meta.url).href;
const FRONT_WHITE_IMAGE = new URL('../../../../assets/figure2-front-white-source.png', import.meta.url).href;
const FRONT_COLOR_IMAGE = new URL('../../../../assets/figure2-front-color-source.png', import.meta.url).href;
const FAR_ARCH_MASK = new URL('../../../../assets/arch2b-alpha.png', import.meta.url).href;
const MIDDLE_IMAGE = new URL('../../../../assets/figure2-middle-fresco-opaque-alpha.png', import.meta.url).href;
const MIDDLE_MASK_IMAGE = new URL('../../../../assets/figure2-middle-window-mask.png', import.meta.url).href;
const LEFT_VIDEO = new URL('../../../../assets/figure2a-alpha-auto.webm', import.meta.url).href;
const RIGHT_VIDEO = new URL('../../../../assets/figure2b-alpha-auto.webm', import.meta.url).href;
const LEFT_POSTER = new URL('../../../../assets/figure2a-alpha-reverse-lite-poster.png', import.meta.url).href;
const RIGHT_POSTER = new URL('../../../../assets/figure2b-alpha-reverse-lite-poster.png', import.meta.url).href;
export const FIGURE2_LEFT_MEDIA_KEY = 'figure2-left-alpha';
export const FIGURE2_RIGHT_MEDIA_KEY = 'figure2-right-alpha';

export type Figure2AnimationRenderState = {
  progress: number;
  proofProgress: number;
  stageOpacity: number;
  backgroundOpacity: number;
  figureOpacity: number;
  cameraScale: number;
  depthTransform: InkDepthTransform;
};

type Figure2Root = HTMLElement & {
  __r4Figure2Progress?: number;
};

type Figure2RenderOptions = {
  proofProgress?: number;
  syncVideo?: boolean;
  videoMode?: 'seek' | 'native' | 'none';
  mediaRun?: {
    runId: string;
    direction: 1 | -1;
    reducedMotion?: boolean;
  };
};

const VIDEO_SEGMENT_SECONDS = 5;
const VIDEO_END_EPSILON = 0.045;
export const FIGURE2_INTRO_PLAYBACK_MS = 2600;
const FIGURE2_MIDDLE_ASPECT_RATIO = 16 / 9;

function smoothStep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function figure2Viewport(root: HTMLElement | null): Readonly<{ width: number; height: number }> {
  const rect = root?.getBoundingClientRect?.();
  const width = rect?.width || root?.clientWidth || (typeof window === 'undefined' ? 1440 : window.innerWidth) || 1440;
  const height = rect?.height || root?.clientHeight || (typeof window === 'undefined' ? 900 : window.innerHeight) || 900;
  return {
    width: Math.max(1, width),
    height: Math.max(1, height)
  };
}

export function figure2DepthTransformForProgress(
  root: HTMLElement | null,
  progress: number
): InkDepthTransform {
  const viewport = figure2Viewport(root);
  const viewportRatio = viewport.width / viewport.height;
  const cover = viewportRatio >= FIGURE2_MIDDLE_ASPECT_RATIO
    ? {
        x: 0,
        y: (viewport.height - viewport.width / FIGURE2_MIDDLE_ASPECT_RATIO) / 2,
        width: viewport.width,
        height: viewport.width / FIGURE2_MIDDLE_ASPECT_RATIO
      }
    : {
        x: (viewport.width - viewport.height * FIGURE2_MIDDLE_ASPECT_RATIO) / 2,
        y: 0,
        width: viewport.height * FIGURE2_MIDDLE_ASPECT_RATIO,
        height: viewport.height
      };
  const eased = smoothStep(progress);
  return {
    viewport,
    cover,
    camera: {
      scale: Number((1.012 + eased * 0.13).toFixed(4)),
      translateX: 0,
      translateY: Number((-eased * 34).toFixed(2)),
      originX: 0.5,
      originY: 0.56
    }
  };
}

function syncFigureVideos(
  root: HTMLElement | null,
  progress: number,
  mode: 'timeline' | 'native-preferred',
  mediaRun: Figure2RenderOptions['mediaRun']
): void {
  if (typeof root?.querySelectorAll !== 'function') {
    return;
  }
  const run = mediaRun ?? { runId: 'figure2-static', direction: 1 as const };
  root.querySelectorAll<HTMLVideoElement>('[data-figure2-video]').forEach((video) => {
    driveTimelineVideo(video, {
      runId: run.runId,
      direction: run.direction,
      progress,
      durationFallbackSeconds: VIDEO_SEGMENT_SECONDS,
      startSeconds: 0.001,
      endEpsilonSeconds: VIDEO_END_EPSILON,
      timelineDurationMs: FIGURE2_INTRO_PLAYBACK_MS,
      mode,
      ...(run.reducedMotion !== undefined ? { reducedMotion: run.reducedMotion } : {})
    });
  });
}

export function renderFigure2AnimationProgress(
  root: HTMLElement | null,
  progress: number,
  options: Figure2RenderOptions = {}
): Figure2AnimationRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = smoothStep(clamped);
  const proofProgress = smoothStep(Math.min(1, Math.max(0, options.proofProgress ?? 0)));
  const backgroundOpacity = 1;
  const stageOpacity = 1;
  const figureOpacity = 1;
  const cameraScale = 1.012 + eased * 0.13;
  const cloudScale = 1 + eased * 0.10;
  const cloudY = eased * 3;
  const farArcadeScale = 1 + eased * 0.22;
  const farArcadeY = 10 + eased * 8;
  const middleY = -eased * 34;
  const nearArchScale = 1.025 + eased * 0.11;
  const nearArchBlur = eased * 3.6;
  const figureY = -eased * 12;
  const figureScale = 1 + eased * 0.035;
  const depthTransform = figure2DepthTransformForProgress(root, clamped);
  root?.style.setProperty('--r4-figure2-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-figure2-proof-progress', proofProgress.toFixed(4));
  root?.style.setProperty('--r4-figure2-stage-opacity', stageOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-background-opacity', backgroundOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-figure-opacity', figureOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-contact-shadow-opacity', (0.82 * figureOpacity).toFixed(4));
  root?.style.setProperty('--r4-figure2-camera-scale', cameraScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-cloud-y', `${cloudY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-cloud-scale', cloudScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-far-arcade-y', `${farArcadeY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-far-arcade-scale', farArcadeScale.toFixed(4));
  root?.style.setProperty('--r4-figure2-middle-y', `${middleY.toFixed(2)}px`);
  const retainedArch = typeof root?.closest === 'function'
    ? root
        .closest<HTMLElement>('[data-testid="r2-stage"]')
        ?.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]')
    : null;
  retainedArch?.style.setProperty('--r4-figure2-near-arch-scale', nearArchScale.toFixed(4));
  retainedArch?.style.setProperty('--r4-figure2-near-arch-blur', `${nearArchBlur.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-figure-y', `${figureY.toFixed(2)}px`);
  root?.style.setProperty('--r4-figure2-figure-scale', figureScale.toFixed(4));
  root?.setAttribute('data-figure2-progress', clamped.toFixed(4));
  root?.setAttribute('data-figure2-proof-progress', proofProgress.toFixed(4));
  if (root) {
    (root as Figure2Root).__r4Figure2Progress = clamped;
  }
  const videoMode = options.videoMode ?? (options.syncVideo === false ? 'none' : 'seek');
  if (videoMode === 'seek') {
    syncFigureVideos(root, clamped, 'timeline', options.mediaRun);
  } else if (videoMode === 'native') {
    syncFigureVideos(root, clamped, 'native-preferred', options.mediaRun);
  }
  return {
    progress: clamped,
    proofProgress,
    stageOpacity,
    backgroundOpacity,
    figureOpacity,
    cameraScale,
    depthTransform
  };
}

export function renderFigure2ProofTransitionProgress(root: HTMLElement | null, progress: number): Figure2AnimationRenderState {
  return renderFigure2AnimationProgress(root, 1, { proofProgress: progress, syncVideo: false });
}

export function renderFigure2Hold(root: HTMLElement | null): void {
  renderFigure2AnimationProgress(root, 0, {
    videoMode: 'seek',
    mediaRun: { runId: 'figure2-hold', direction: -1 }
  });
}

function Figure2AnimationScene({ hidden, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const leftVideoRef = useRef<HTMLVideoElement | null>(null);
  const rightVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videos = [leftVideoRef.current, rightVideoRef.current].filter(Boolean) as HTMLVideoElement[];
    for (const video of videos) {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.pause();
    }
  }, [hidden]);

  return (
    <article ref={rootRef} className="r4-figure2" data-r4-scene="figure2-animation">
      <div ref={(element) => registerHandle?.('stage', element)} className="r4-figure2__field">
        <div className="r4-figure2__depth-field" data-figure2-depth-ranked-field="true">
          <div className="r4-figure2__middle-camera">
            <div className="r4-figure2__window-mask" style={{ WebkitMaskImage: `url(${MIDDLE_MASK_IMAGE})`, maskImage: `url(${MIDDLE_MASK_IMAGE})` }}>
              <img className="r4-figure2__cloud" src={CLOUD_IMAGE} alt="" aria-hidden="true" />
              <div className="r4-figure2__far-arcade" aria-hidden="true">
                <img className="r4-figure2__far-arcade-white" src={FRONT_WHITE_IMAGE} alt="" style={{ WebkitMask: `url(${FAR_ARCH_MASK}) center / contain no-repeat`, mask: `url(${FAR_ARCH_MASK}) center / contain no-repeat` }} />
                <img className="r4-figure2__far-arcade-color" src={FRONT_COLOR_IMAGE} alt="" style={{ WebkitMask: `url(${FAR_ARCH_MASK}) center / contain no-repeat`, mask: `url(${FAR_ARCH_MASK}) center / contain no-repeat` }} />
                <img className="r4-figure2__far-arcade-relief" src={FRONT_WHITE_IMAGE} alt="" style={{ WebkitMask: `url(${FAR_ARCH_MASK}) center / contain no-repeat`, mask: `url(${FAR_ARCH_MASK}) center / contain no-repeat` }} />
              </div>
            </div>
            <img className="r4-figure2__middle" src={MIDDLE_IMAGE} alt="" aria-hidden="true" />
          </div>
        </div>
        <div
          className="r4-figure2__figure-depth-surface"
          data-figure2-figure-depth-surface="true"
        >
          <div
            ref={(element) => registerHandle?.('figures', element)}
            className="r4-figure2__figures"
            data-figure2-figure-field="true"
            aria-label="子问老子人物动画"
          >
            <div className="r4-figure2__people-contact-shadow" aria-hidden="true" />
            <figure className="r4-figure2__figure r4-figure2__figure--left">
              <video
                ref={(element) => {
                  leftVideoRef.current = element;
                  registerHandle?.('left-video', element);
                }}
                data-figure2-video
                data-media-key={FIGURE2_LEFT_MEDIA_KEY}
                src={LEFT_VIDEO}
                poster={LEFT_POSTER}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
              />
              <figcaption>问道者</figcaption>
            </figure>
            <figure className="r4-figure2__figure r4-figure2__figure--right">
              <video
                ref={(element) => {
                  rightVideoRef.current = element;
                  registerHandle?.('right-video', element);
                }}
                data-figure2-video
                data-media-key={FIGURE2_RIGHT_MEDIA_KEY}
                src={RIGHT_VIDEO}
                poster={RIGHT_POSTER}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
              />
              <figcaption>老子</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </article>
  );
}

export const figure2AnimationScene: SceneModule = {
  id: 'figure2-animation',
  Component: Figure2AnimationScene,
  renderHold: renderFigure2Hold,
  requiredHandles: ['stage', 'figures', 'left-video', 'right-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
