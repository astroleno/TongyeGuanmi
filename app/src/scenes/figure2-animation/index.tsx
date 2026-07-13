import { useEffect, useRef } from 'react';
import {
  createDirectionalMediaController,
  type DirectionalMediaController,
  type DirectionalMediaControllerSnapshot,
  type DirectionalMediaInput
} from '../../media/directional-media-controller';
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
const LEFT_REVERSE_VIDEO = new URL('../../../../assets/figure2a-alpha.webm', import.meta.url).href;
const RIGHT_REVERSE_VIDEO = new URL('../../../../assets/figure2b-alpha.webm', import.meta.url).href;
const LEFT_POSTER = new URL('../../../../assets/figure2a-alpha-reverse-lite-poster.png', import.meta.url).href;
const RIGHT_POSTER = new URL('../../../../assets/figure2b-alpha-reverse-lite-poster.png', import.meta.url).href;
export const FIGURE2_LEFT_MEDIA_KEY = 'figure2-left-alpha';
export const FIGURE2_RIGHT_MEDIA_KEY = 'figure2-right-alpha';
export const FIGURE2_LEFT_REVERSE_MEDIA_KEY = 'figure2-left-alpha-reverse';
export const FIGURE2_RIGHT_REVERSE_MEDIA_KEY = 'figure2-right-alpha-reverse';

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
  videoMode?: 'seek' | 'native' | 'none';
  mediaRun?: {
    runId: string;
    direction: 1 | -1;
    reducedMotion?: boolean;
  };
};

type Figure2MediaDirection = 'forward' | 'reverse';
type Figure2MediaSide = 'left' | 'right';

type Figure2MediaManager = {
  left: DirectionalMediaController;
  right: DirectionalMediaController;
  activeDirection?: Figure2MediaDirection;
  activeRunId?: string;
  prepared?: {
    surface: Figure2MediaDirection;
    runId: string;
    input: DirectionalMediaInput;
    generation: number;
  };
  generation: number;
};

export type Figure2MediaPreparation = Readonly<{
  runId: string;
  direction: 1 | -1;
  timelineDurationMs?: number;
  reducedMotion?: boolean;
  signal?: AbortSignal;
}>;

export type Figure2DirectionalMediaSnapshot = Readonly<{
  activeDirection: Figure2MediaDirection | undefined;
  activeRunId: string | undefined;
  left: DirectionalMediaControllerSnapshot;
  right: DirectionalMediaControllerSnapshot;
}>;

const mediaManagers = new WeakMap<HTMLElement, Figure2MediaManager>();
const FORWARD_VIDEO_SECONDS = 2.417;
const REVERSE_VIDEO_SECONDS = 5;
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

function surfaceForDirection(direction: 1 | -1): Figure2MediaDirection {
  return direction === 1 ? 'forward' : 'reverse';
}

function mediaProgressForDirection(progress: number, direction: 1 | -1): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return direction === 1 ? clamped : 1 - clamped;
}

function mediaInput(
  surface: Figure2MediaDirection,
  preparation: Figure2MediaPreparation,
  progress: number
): DirectionalMediaInput {
  return {
    surface,
    runId: preparation.runId,
    direction: preparation.direction,
    progress,
    durationFallbackSeconds: surface === 'forward' ? FORWARD_VIDEO_SECONDS : REVERSE_VIDEO_SECONDS,
    startSeconds: 0.001,
    endEpsilonSeconds: VIDEO_END_EPSILON,
    timelineDurationMs: preparation.timelineDurationMs ?? FIGURE2_INTRO_PLAYBACK_MS,
    mode: 'native-preferred',
    nativePlaybackDirection: 1,
    ...(preparation.reducedMotion !== undefined
      ? { reducedMotion: preparation.reducedMotion }
      : {}),
    ...(preparation.signal ? { signal: preparation.signal } : {})
  };
}

function videoFor(
  videos: readonly HTMLVideoElement[],
  side: Figure2MediaSide,
  direction: Figure2MediaDirection
): HTMLVideoElement | undefined {
  return videos.find((video) => (
    video.dataset.figure2Side === side
    && video.dataset.figure2Direction === direction
  ));
}

function createFigure2MediaManager(root: HTMLElement): Figure2MediaManager {
  const videos = [...root.querySelectorAll<HTMLVideoElement>('[data-figure2-video]')];
  const leftForward = videoFor(videos, 'left', 'forward');
  const leftReverse = videoFor(videos, 'left', 'reverse');
  const rightForward = videoFor(videos, 'right', 'forward');
  const rightReverse = videoFor(videos, 'right', 'reverse');
  if (!leftForward || !leftReverse || !rightForward || !rightReverse) {
    throw new Error('Figure2 directional media requires forward and reverse surfaces for both figures');
  }
  return {
    left: createDirectionalMediaController({
      surfaces: { forward: leftForward, reverse: leftReverse },
      parkedPreload: 'metadata'
    }),
    right: createDirectionalMediaController({
      surfaces: { forward: rightForward, reverse: rightReverse },
      parkedPreload: 'metadata'
    }),
    generation: 0
  };
}

function managerFor(root: HTMLElement): Figure2MediaManager {
  const existing = mediaManagers.get(root);
  if (existing) {
    return existing;
  }
  const manager = createFigure2MediaManager(root);
  mediaManagers.set(root, manager);
  return manager;
}

export async function prepareFigure2MediaLeg(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): Promise<void> {
  if (!root) {
    throw new Error('Figure2 media root is unavailable');
  }
  const manager = managerFor(root);
  const surface = surfaceForDirection(preparation.direction);
  if (manager.activeDirection === surface && manager.activeRunId === preparation.runId) {
    return;
  }
  const generation = ++manager.generation;
  delete root.dataset.figure2HoldPoster;
  const input = mediaInput(surface, preparation, 0);
  const [leftResult, rightResult] = await Promise.all([
    manager.left.prepare(input),
    manager.right.prepare(input)
  ]);
  if (
    manager.generation !== generation
    || leftResult.status !== 'ready'
    || rightResult.status !== 'ready'
  ) {
    throw new Error(`Figure2 ${surface} media preparation became stale`);
  }

  const leftStatus = manager.left.snapshot().surfaces[surface]?.status;
  const rightStatus = manager.right.snapshot().surfaces[surface]?.status;
  const readyStatuses = new Set(['ready', 'active', 'terminal']);
  if (!leftStatus || !rightStatus || !readyStatuses.has(leftStatus) || !readyStatuses.has(rightStatus)) {
    throw new Error(`Figure2 ${surface} media pair is not atomically ready`);
  }

  manager.prepared = {
    surface,
    runId: preparation.runId,
    input,
    generation
  };
  root.dataset.figure2PendingMediaDirection = surface;
  root.dataset.figure2PendingMediaRun = preparation.runId;
}

export function commitFigure2MediaLeg(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): void {
  if (!root) {
    throw new Error('Figure2 media root is unavailable');
  }
  const manager = managerFor(root);
  const surface = surfaceForDirection(preparation.direction);
  if (manager.activeDirection === surface && manager.activeRunId === preparation.runId) {
    return;
  }
  const prepared = manager.prepared;
  if (
    !prepared
    || prepared.surface !== surface
    || prepared.runId !== preparation.runId
    || prepared.generation !== manager.generation
    || preparation.signal?.aborted
  ) {
    throw new Error(`Figure2 ${surface} media is not prepared for commit`);
  }

  manager.left.activate(prepared.input);
  manager.right.activate(prepared.input);
  manager.activeDirection = surface;
  manager.activeRunId = preparation.runId;
  delete manager.prepared;
  root.dataset.figure2MediaDirection = surface;
  root.dataset.figure2MediaRun = preparation.runId;
  delete root.dataset.figure2HoldPoster;
  delete root.dataset.figure2PendingMediaDirection;
  delete root.dataset.figure2PendingMediaRun;
}

export function driveFigure2MediaLeg(
  root: HTMLElement | null,
  progress: number,
  preparation: Figure2MediaPreparation
): void {
  if (!root) {
    return;
  }
  const manager = mediaManagers.get(root);
  const surface = surfaceForDirection(preparation.direction);
  if (
    !manager
    || manager.activeDirection !== surface
    || manager.activeRunId !== preparation.runId
  ) {
    return;
  }
  const input = mediaInput(
    surface,
    preparation,
    mediaProgressForDirection(progress, preparation.direction)
  );
  manager.left.drive(input);
  manager.right.drive(input);
}

export function parkFigure2Media(root: HTMLElement | null): void {
  if (!root) {
    return;
  }
  const manager = mediaManagers.get(root);
  if (!manager) {
    return;
  }
  manager.generation += 1;
  delete manager.prepared;
  for (const surface of ['forward', 'reverse'] as const) {
    manager.left.park(surface);
    manager.right.park(surface);
  }
  delete manager.activeDirection;
  delete manager.activeRunId;
  delete root.dataset.figure2MediaDirection;
  delete root.dataset.figure2MediaRun;
  delete root.dataset.figure2PendingMediaDirection;
  delete root.dataset.figure2PendingMediaRun;
}

export function disposeFigure2Media(root: HTMLElement | null): void {
  if (!root) {
    return;
  }
  const manager = mediaManagers.get(root);
  if (!manager) {
    return;
  }
  manager.generation += 1;
  delete manager.prepared;
  manager.left.dispose();
  manager.right.dispose();
  mediaManagers.delete(root);
  delete root.dataset.figure2MediaDirection;
  delete root.dataset.figure2MediaRun;
  delete root.dataset.figure2PendingMediaDirection;
  delete root.dataset.figure2PendingMediaRun;
}

export function figure2DirectionalMediaSnapshot(
  root: HTMLElement | null
): Figure2DirectionalMediaSnapshot | null {
  if (!root) {
    return null;
  }
  const manager = mediaManagers.get(root);
  return manager
    ? {
        activeDirection: manager.activeDirection,
        activeRunId: manager.activeRunId,
        left: manager.left.snapshot(),
        right: manager.right.snapshot()
      }
    : null;
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
  const videoMode = options.videoMode ?? 'none';
  if (videoMode === 'native' && options.mediaRun) {
    driveFigure2MediaLeg(root, clamped, options.mediaRun);
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
  return renderFigure2AnimationProgress(root, 1, { proofProgress: progress, videoMode: 'none' });
}

export function renderFigure2Hold(root: HTMLElement | null): void {
  renderFigure2AnimationProgress(root, 0, {
    videoMode: 'none'
  });
  if (!root) {
    return;
  }
  parkFigure2Media(root);
  const videos = [...root.querySelectorAll<HTMLVideoElement>('[data-figure2-video]')];
  for (const video of videos) {
    const isForward = video.dataset.figure2Direction === 'forward';
    video.pause();
    if (isForward) {
      video.classList.add('is-active');
      try {
        video.currentTime = 0;
      } catch {
        // The authored poster remains the canonical hold if the browser refuses the seek.
      }
    } else {
      video.classList.remove('is-active');
    }
  }
  root.dataset.figure2HoldPoster = 'true';
}

function Figure2AnimationScene({ registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const leftVideoRef = useRef<HTMLVideoElement | null>(null);
  const rightVideoRef = useRef<HTMLVideoElement | null>(null);
  const leftReverseVideoRef = useRef<HTMLVideoElement | null>(null);
  const rightReverseVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const videos = [
      leftVideoRef.current,
      rightVideoRef.current,
      leftReverseVideoRef.current,
      rightReverseVideoRef.current
    ].filter(Boolean) as HTMLVideoElement[];
    for (const video of videos) {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.pause();
    }
    return () => disposeFigure2Media(root);
  }, []);

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
              <div className="r4-figure2__media-stack">
                <video
                  ref={(element) => {
                    leftVideoRef.current = element;
                    registerHandle?.('left-video', element);
                  }}
                  className="r4-figure2__video is-active"
                  data-figure2-video
                  data-figure2-side="left"
                  data-figure2-direction="forward"
                  data-media-key={FIGURE2_LEFT_MEDIA_KEY}
                  src={LEFT_VIDEO}
                  poster={LEFT_POSTER}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                />
                <video
                  ref={(element) => {
                    leftReverseVideoRef.current = element;
                    registerHandle?.('left-video-reverse', element);
                  }}
                  className="r4-figure2__video"
                  data-figure2-video
                  data-figure2-side="left"
                  data-figure2-direction="reverse"
                  data-media-key={FIGURE2_LEFT_REVERSE_MEDIA_KEY}
                  src={LEFT_REVERSE_VIDEO}
                  poster={LEFT_POSTER}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                />
              </div>
              <figcaption>问道者</figcaption>
            </figure>
            <figure className="r4-figure2__figure r4-figure2__figure--right">
              <div className="r4-figure2__media-stack">
                <video
                  ref={(element) => {
                    rightVideoRef.current = element;
                    registerHandle?.('right-video', element);
                  }}
                  className="r4-figure2__video is-active"
                  data-figure2-video
                  data-figure2-side="right"
                  data-figure2-direction="forward"
                  data-media-key={FIGURE2_RIGHT_MEDIA_KEY}
                  src={RIGHT_VIDEO}
                  poster={RIGHT_POSTER}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                />
                <video
                  ref={(element) => {
                    rightReverseVideoRef.current = element;
                    registerHandle?.('right-video-reverse', element);
                  }}
                  className="r4-figure2__video"
                  data-figure2-video
                  data-figure2-side="right"
                  data-figure2-direction="reverse"
                  data-media-key={FIGURE2_RIGHT_REVERSE_MEDIA_KEY}
                  src={RIGHT_REVERSE_VIDEO}
                  poster={RIGHT_POSTER}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                />
              </div>
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
  requiredHandles: [
    'stage',
    'figures',
    'left-video',
    'right-video',
    'left-video-reverse',
    'right-video-reverse'
  ],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
