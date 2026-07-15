import { useEffect, useRef } from 'react';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput,
  type TimelineVideoDriverSnapshot
} from '../../media/timeline-video-driver';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import type { InkDepthTransform } from '../../transitions/shared/inkField';

const CLOUD_IMAGE = new URL('../../../../assets/figure2-cloud.webp', import.meta.url).href;
const FAR_ARCH_IMAGE = new URL('../../../../assets/figure2-far-arch.webp', import.meta.url).href;
const MIDDLE_IMAGE = new URL('../../../../assets/figure2-middle-building.webp', import.meta.url).href;
const MIDDLE_MASK_IMAGE = new URL('../../../../assets/figure2-middle-window-mask.webp', import.meta.url).href;
const LEFT_VIDEO = new URL('../../../../assets/figure2-left-motion.webm', import.meta.url).href;
const RIGHT_VIDEO = new URL('../../../../assets/figure2-right-motion.webm', import.meta.url).href;
const LEFT_REVERSE_VIDEO = new URL('../../../../assets/figure2-left-motion-reverse.webm', import.meta.url).href;
const RIGHT_REVERSE_VIDEO = new URL('../../../../assets/figure2-right-motion-reverse.webm', import.meta.url).href;

export const FIGURE2_LEFT_MEDIA_KEY = 'figure2-left-motion';
export const FIGURE2_RIGHT_MEDIA_KEY = 'figure2-right-motion';
export const FIGURE2_LEFT_REVERSE_MEDIA_KEY = 'figure2-left-motion-reverse';
export const FIGURE2_RIGHT_REVERSE_MEDIA_KEY = 'figure2-right-motion-reverse';
export const FIGURE2_VIDEO_END_SECONDS = 2.567;
export const FIGURE2_INTRO_PLAYBACK_MS = 2600;

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

type Figure2MediaSide = 'left' | 'right';
type Figure2MediaPair = readonly [HTMLVideoElement, HTMLVideoElement];

type Figure2MediaManager = {
  forward: Figure2MediaPair;
  reverse: Figure2MediaPair;
  generation: number;
  activeDirection?: 1 | -1;
  activeRunId?: string;
  playbackEnabled: boolean;
  prepared?: {
    runId: string;
    direction: 1 | -1;
    progress: number;
    generation: number;
  };
  leftSnapshot?: TimelineVideoDriverSnapshot | undefined;
  rightSnapshot?: TimelineVideoDriverSnapshot | undefined;
};

export type Figure2MediaPreparation = Readonly<{
  runId: string;
  direction: 1 | -1;
  timelineDurationMs?: number;
  reducedMotion?: boolean;
  signal?: AbortSignal;
  startPlayback?: boolean;
}>;

export type Figure2DirectionalMediaSnapshot = Readonly<{
  activeDirection: 1 | -1 | undefined;
  activeRunId: string | undefined;
  left: TimelineVideoDriverSnapshot | undefined;
  right: TimelineVideoDriverSnapshot | undefined;
}>;

const mediaManagers = new WeakMap<HTMLElement, Figure2MediaManager>();
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

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function videoFor(root: HTMLElement, side: Figure2MediaSide, direction: 1 | -1): HTMLVideoElement | undefined {
  return [...root.querySelectorAll<HTMLVideoElement>('[data-figure2-video]')]
    .find((video) => video.dataset.figure2Side === side && Number(video.dataset.figure2Direction) === direction);
}

function pairFor(manager: Figure2MediaManager, direction: 1 | -1): Figure2MediaPair {
  return direction === 1 ? manager.forward : manager.reverse;
}

function mediaProgress(direction: 1 | -1, progress: number): number {
  return direction === 1 ? clamp(progress) : 1 - clamp(progress);
}

function managerFor(root: HTMLElement): Figure2MediaManager {
  const existing = mediaManagers.get(root);
  if (existing) {
    return existing;
  }
  const forward = [videoFor(root, 'left', 1), videoFor(root, 'right', 1)] as const;
  const reverse = [videoFor(root, 'left', -1), videoFor(root, 'right', -1)] as const;
  if (forward.some((video) => !video) || reverse.some((video) => !video)) {
    throw new Error('Figure2 media missing');
  }
  const manager: Figure2MediaManager = {
    forward: forward as Figure2MediaPair,
    reverse: reverse as Figure2MediaPair,
    generation: 0,
    playbackEnabled: false
  };
  mediaManagers.set(root, manager);
  return manager;
}

function mediaInput(
  preparation: Figure2MediaPreparation,
  progress: number,
  mode: TimelineVideoDriveInput['mode'] = 'native-preferred'
): TimelineVideoDriveInput {
  return {
    runId: preparation.runId,
    direction: preparation.direction,
    progress: clamp(progress),
    durationFallbackSeconds: 2.6,
    startSeconds: 0,
    endSeconds: FIGURE2_VIDEO_END_SECONDS,
    timelineDurationMs: preparation.timelineDurationMs ?? FIGURE2_INTRO_PLAYBACK_MS,
    mode,
    nativePlaybackDirection: 1,
    ...(preparation.reducedMotion !== undefined ? { reducedMotion: preparation.reducedMotion } : {}),
    ...(preparation.signal ? { signal: preparation.signal } : {})
  };
}

function heldProgress(root: HTMLElement, direction: 1 | -1): number {
  const current = (root as Figure2Root).__r4Figure2Progress;
  return current !== undefined && current > 0.001 && current < 0.999
    ? current
    : direction === 1 ? 0 : 1;
}

async function prepareFigure2Pair(
  root: HTMLElement,
  preparation: Figure2MediaPreparation,
  progress: number
): Promise<void> {
  if (preparation.signal?.aborted) {
    throw new Error('Figure2 prepare aborted');
  }
  const manager = managerFor(root);
  const pair = pairFor(manager, preparation.direction);
  const generation = ++manager.generation;
  const input = mediaInput(preparation, mediaProgress(preparation.direction, progress), 'timeline');
  try {
    const [left, right] = await Promise.all([
      prepareTimelineVideoFrame(pair[0], input),
      prepareTimelineVideoFrame(pair[1], input)
    ]);
    if (
      preparation.signal?.aborted
      || manager.generation !== generation
      || left?.status !== 'ready'
      || right?.status !== 'ready'
    ) {
      throw new Error('Figure2 media stale');
    }
  } catch (error) {
    root.dataset.figure2StaticMediaFallback = 'true';
    throw error;
  }
  manager.prepared = {
    runId: preparation.runId,
    direction: preparation.direction,
    progress: clamp(progress),
    generation
  };
  root.dataset.figure2PendingMediaRun = preparation.runId;
  root.dataset.figure2PendingMediaDirection = String(preparation.direction);
  delete root.dataset.figure2StaticMediaFallback;
}

export async function prepareFigure2MediaLeg(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): Promise<void> {
  if (!root) {
    throw new Error('Figure2 unavailable');
  }
  await prepareFigure2Pair(root, preparation, heldProgress(root, preparation.direction));
}

export async function prepareFigure2TerminalPair(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): Promise<void> {
  if (!root) {
    throw new Error('Figure2 unavailable');
  }
  await prepareFigure2Pair(root, preparation, 1);
}

function commitFigure2Pair(
  root: HTMLElement,
  preparation: Figure2MediaPreparation,
  progress: number,
  startPlayback: boolean
): void {
  const manager = managerFor(root);
  const pair = pairFor(manager, preparation.direction);
  const prepared = manager.prepared;
  if (
    preparation.signal?.aborted
    || !prepared
    || prepared.runId !== preparation.runId
    || prepared.direction !== preparation.direction
    || prepared.generation !== manager.generation
  ) {
    throw new Error('Figure2 not ready');
  }
  const input = mediaInput(
    preparation,
    mediaProgress(preparation.direction, progress),
    startPlayback ? undefined : 'timeline'
  );
  manager.leftSnapshot = driveTimelineVideo(pair[0], input);
  manager.rightSnapshot = driveTimelineVideo(pair[1], input);
  for (const video of pairFor(manager, preparation.direction === 1 ? -1 : 1)) {
    video.pause();
    video.dataset.figure2Inactive = 'true';
  }
  for (const video of pair) {
    delete video.dataset.figure2Inactive;
  }
  manager.activeRunId = preparation.runId;
  manager.activeDirection = preparation.direction;
  manager.playbackEnabled = startPlayback;
  delete manager.prepared;
  root.dataset.figure2MediaRun = preparation.runId;
  root.dataset.figure2MediaDirection = String(preparation.direction);
  delete root.dataset.figure2PendingMediaRun;
  delete root.dataset.figure2PendingMediaDirection;
  delete root.dataset.figure2StaticMediaFallback;
}

export function commitFigure2MediaLeg(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): void {
  if (!root) {
    throw new Error('Figure2 unavailable');
  }
  commitFigure2Pair(
    root,
    preparation,
    heldProgress(root, preparation.direction),
    preparation.startPlayback !== false
  );
}

export function commitFigure2TerminalPair(
  root: HTMLElement | null,
  preparation: Figure2MediaPreparation
): void {
  if (!root) {
    throw new Error('Figure2 unavailable');
  }
  commitFigure2Pair(root, preparation, 1, false);
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
  if (
    !manager
    || !manager.playbackEnabled
    || manager.activeRunId !== preparation.runId
    || manager.activeDirection !== preparation.direction
  ) {
    return;
  }
  const input = mediaInput(preparation, mediaProgress(preparation.direction, progress));
  const pair = pairFor(manager, preparation.direction);
  manager.leftSnapshot = driveTimelineVideo(pair[0], input);
  manager.rightSnapshot = driveTimelineVideo(pair[1], input);
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
  for (const video of [...manager.forward, ...manager.reverse]) {
    video.pause();
    disposeTimelineVideoDriver(video);
  }
  mediaManagers.delete(root);
  delete root.dataset.figure2MediaRun;
  delete root.dataset.figure2MediaDirection;
  delete root.dataset.figure2PendingMediaRun;
  delete root.dataset.figure2PendingMediaDirection;
}

export function disposeFigure2Media(root: HTMLElement | null): void {
  parkFigure2Media(root);
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
        left: manager.leftSnapshot,
        right: manager.rightSnapshot
      }
    : null;
}

export function renderFigure2AnimationProgress(
  root: HTMLElement | null,
  progress: number,
  options: Figure2RenderOptions = {}
): Figure2AnimationRenderState {
  const clamped = clamp(progress);
  const eased = smoothStep(clamped);
  const proofProgress = smoothStep(clamp(options.proofProgress ?? 0));
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
  root?.style.setProperty('--r4-figure2-video-opacity', '1');
  root?.setAttribute('data-figure2-progress', clamped.toFixed(4));
  root?.setAttribute('data-figure2-proof-progress', proofProgress.toFixed(4));
  if (root) {
    (root as Figure2Root).__r4Figure2Progress = clamped;
  }
  if (options.videoMode === 'native' && options.mediaRun) {
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
  renderFigure2AnimationProgress(root, 0, { videoMode: 'none' });
}

function Figure2AnimationScene({ registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const controller = new AbortController();
    for (const video of root?.querySelectorAll<HTMLVideoElement>('[data-figure2-video]') ?? []) {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.pause();
    }
    if (root) {
      const preparation: Figure2MediaPreparation = {
        runId: 'figure2-hold-frame',
        direction: 1,
        signal: controller.signal,
        startPlayback: false
      };
      void prepareFigure2MediaLeg(root, preparation)
        .then(() => commitFigure2MediaLeg(root, preparation))
        .catch(() => {
          root.dataset.figure2StaticMediaFallback = 'true';
        });
    }
    return () => {
      controller.abort();
      disposeFigure2Media(root);
    };
  }, []);

  return (
    <article ref={rootRef} className="r4-figure2" data-r4-scene="figure2-animation">
      <div
        ref={(element) => registerHandle?.('stage', element)}
        className="r4-figure2__field"
        data-figure2-ownership-surface="true"
      >
        <div className="r4-figure2__depth-field" data-figure2-depth-ranked-field="true">
          <div className="r4-figure2__middle-camera">
            <div className="r4-figure2__window-mask" style={{ WebkitMaskImage: `url(${MIDDLE_MASK_IMAGE})`, maskImage: `url(${MIDDLE_MASK_IMAGE})` }}>
              <img className="r4-figure2__cloud" src={CLOUD_IMAGE} alt="" aria-hidden="true" />
              <div className="r4-figure2__far-arcade" aria-hidden="true">
                <img src={FAR_ARCH_IMAGE} alt="" />
              </div>
            </div>
            <img className="r4-figure2__middle" src={MIDDLE_IMAGE} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="r4-figure2__figure-depth-surface" data-figure2-figure-depth-surface="true">
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
                    registerHandle?.('left-video', element);
                  }}
                  className="r4-figure2__video"
                  data-figure2-video
                  data-figure2-side="left"
                  data-figure2-direction="1"
                  data-media-key={FIGURE2_LEFT_MEDIA_KEY}
                  src={LEFT_VIDEO}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                />
                <video
                  className="r4-figure2__video"
                  data-figure2-video
                  data-figure2-side="left"
                  data-figure2-direction="-1"
                  data-figure2-inactive="true"
                  data-media-key={FIGURE2_LEFT_REVERSE_MEDIA_KEY}
                  src={LEFT_REVERSE_VIDEO}
                  muted
                  playsInline
                  preload="none"
                  aria-hidden="true"
                />
              </div>
              <figcaption>问道者</figcaption>
            </figure>
            <figure className="r4-figure2__figure r4-figure2__figure--right">
              <div className="r4-figure2__media-stack">
                <video
                  ref={(element) => {
                    registerHandle?.('right-video', element);
                  }}
                  className="r4-figure2__video"
                  data-figure2-video
                  data-figure2-side="right"
                  data-figure2-direction="1"
                  data-media-key={FIGURE2_RIGHT_MEDIA_KEY}
                  src={RIGHT_VIDEO}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                />
                <video
                  className="r4-figure2__video"
                  data-figure2-video
                  data-figure2-side="right"
                  data-figure2-direction="-1"
                  data-figure2-inactive="true"
                  data-media-key={FIGURE2_RIGHT_REVERSE_MEDIA_KEY}
                  src={RIGHT_REVERSE_VIDEO}
                  muted
                  playsInline
                  preload="none"
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
  requiredHandles: ['stage', 'figures', 'left-video', 'right-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
