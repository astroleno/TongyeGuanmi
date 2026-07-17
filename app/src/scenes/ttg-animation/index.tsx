import { useEffect, useRef } from 'react';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput,
  type TimelineVideoDriverSnapshot
} from '../../media/timeline-video-driver';
import { AlphaVideoSources, browserPrefersHevcAlpha } from '../../media/alpha-video-sources';
import { TTG_PLAYBACK_MS } from '../../story/timings';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const TTG_MEDIA_KEY = 'ttg-figure-motion';
export const TTG_BG_SRC = new URL('../../../../assets/ttg-background.webp', import.meta.url).href;
export const TTG_MIDDLE_SRC = new URL('../../../../assets/ttg-middle.webp', import.meta.url).href;
export const TTG_FRONT_SRC = new URL('../../../../assets/ttg-foreground.webp', import.meta.url).href;
export const TTG_FIGURE_VIDEO_SRC = new URL('../../../../assets/ttg-figure-motion.webm', import.meta.url).href;
export const TTG_FIGURE_HEVC_ALPHA_SRC = new URL('../../../../assets/ttg-figure-motion-hevc-alpha.mp4', import.meta.url).href;
export const TTG_FIGURE_END_SECONDS = 2.467;
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
  signal?: AbortSignal;
};

type TtgRenderOptions = {
  mediaRun?: TtgMediaRun;
};

type TtgSection = HTMLElement & {
  __r4TtgProgress?: number;
};

type TtgMediaManager = {
  video: HTMLVideoElement;
  generation: number;
  activeRunId?: string;
  activeDirection?: 1 | -1;
  prepared?: {
    runId: string;
    direction: 1 | -1;
    progress: number;
    generation: number;
  };
  snapshot?: TimelineVideoDriverSnapshot | undefined;
};

export type TtgMediaSnapshot = Readonly<{
  activeRunId: string | undefined;
  activeDirection: 1 | -1 | undefined;
  video: TimelineVideoDriverSnapshot | undefined;
}>;

const TTG_CONFIG = {
  bgTravelVh: 14.3,
  middleTravelVh: 23.5,
  frontYVh: 29.2,
  frontTravelVh: 13.1,
  figureScale: 0.8,
  figureYVh: -8.5,
  figureTravelVh: 16.5
} as const;

const mediaManagers = new WeakMap<HTMLElement, TtgMediaManager>();

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const stableProgress = (value: number) => (value < 0.002 ? 0 : value > 0.998 ? 1 : clamp(value));
const acceleratedProgress = (progress: number) => {
  const p = stableProgress(progress);
  return clamp(0.78 * p + 0.22 * p * p);
};

function viewportHeight(): number {
  return typeof window === 'undefined' ? 800 : window.innerHeight;
}

function ttgSection(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ttg-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]') ?? null;
}

function managerFor(section: HTMLElement): TtgMediaManager {
  const existing = mediaManagers.get(section);
  if (existing) {
    return existing;
  }
  const video = section.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
  if (!video) {
    throw new Error('TTG media missing');
  }
  const manager: TtgMediaManager = { video, generation: 0 };
  mediaManagers.set(section, manager);
  return manager;
}

function mediaInput(
  mediaRun: TtgMediaRun,
  progress: number,
  mode: TimelineVideoDriveInput['mode'] = mediaRun.direction === 1 ? 'native-preferred' : 'timeline'
): TimelineVideoDriveInput {
  return {
    runId: mediaRun.runId,
    direction: mediaRun.direction,
    progress: stableProgress(progress),
    durationFallbackSeconds: 2.5,
    startSeconds: 0,
    endSeconds: TTG_FIGURE_END_SECONDS,
    timelineDurationMs: TTG_PLAYBACK_MS,
    mode,
    nativePlaybackDirection: 1,
    allowSeekedFrameFallback: browserPrefersHevcAlpha(),
    ...(mediaRun.reducedMotion !== undefined ? { reducedMotion: mediaRun.reducedMotion } : {}),
    ...(mediaRun.signal ? { signal: mediaRun.signal } : {})
  };
}

function heldProgress(section: HTMLElement, direction: 1 | -1): number {
  const current = (section as TtgSection).__r4TtgProgress;
  return current !== undefined && current > 0.001 && current < 0.999
    ? current
    : direction === 1 ? 0 : 1;
}

async function prepareMedia(
  section: HTMLElement,
  mediaRun: TtgMediaRun,
  progress: number
): Promise<void> {
  if (mediaRun.signal?.aborted) {
    throw new Error(`TTG aborted: ${mediaRun.runId}`);
  }
  const manager = managerFor(section);
  const generation = ++manager.generation;
  try {
    const result = await prepareTimelineVideoFrame(
      manager.video,
      mediaInput(mediaRun, progress, 'timeline')
    );
    if (
      mediaRun.signal?.aborted
      || manager.generation !== generation
      || result?.status !== 'ready'
    ) {
      throw new Error('TTG media stale');
    }
  } catch (error) {
    section.dataset.ttgStaticMediaFallback = 'true';
    throw error;
  }
  manager.prepared = {
    runId: mediaRun.runId,
    direction: mediaRun.direction,
    progress: stableProgress(progress),
    generation
  };
  section.dataset.ttgPendingMediaRun = mediaRun.runId;
  section.dataset.ttgPendingMediaDirection = String(mediaRun.direction);
  delete section.dataset.ttgStaticMediaFallback;
}

function commitPreparedMedia(section: HTMLElement, mediaRun: TtgMediaRun): void {
  const manager = managerFor(section);
  const prepared = manager.prepared;
  if (
    mediaRun.signal?.aborted
    || !prepared
    || prepared.runId !== mediaRun.runId
    || prepared.direction !== mediaRun.direction
    || prepared.generation !== manager.generation
  ) {
    throw new Error('TTG not ready');
  }
  const mode = mediaRun.direction === 1 && prepared.progress <= 0.001 ? 'timeline' : undefined;
  manager.snapshot = driveTimelineVideo(manager.video, mediaInput(mediaRun, prepared.progress, mode));
  manager.activeRunId = mediaRun.runId;
  manager.activeDirection = mediaRun.direction;
  delete manager.prepared;
  section.style.setProperty('--ttg-figure-video-opacity', '1');
  section.dataset.ttgPlaybackRun = mediaRun.runId;
  section.dataset.ttgPlaybackDirection = String(mediaRun.direction);
  delete section.dataset.ttgPendingMediaRun;
  delete section.dataset.ttgPendingMediaDirection;
  delete section.dataset.ttgStaticMediaFallback;
}

function driveFigurePlayback(
  section: HTMLElement | null,
  progress: number,
  mediaRun: TtgMediaRun
): void {
  section?.setAttribute('data-ttg-playback-direction', String(mediaRun.direction));
  section?.setAttribute('data-ttg-playback-run', mediaRun.runId);
  section?.setAttribute('data-ttg-raw-progress', progress.toFixed(4));
  section?.setAttribute('data-ttg-playback-active', String(progress > 0.001 && progress < 0.999));
  if (!section) {
    return;
  }
  const manager = mediaManagers.get(section);
  if (
    !manager
    || manager.activeRunId !== mediaRun.runId
    || manager.activeDirection !== mediaRun.direction
  ) {
    return;
  }
  manager.snapshot = driveTimelineVideo(manager.video, mediaInput(mediaRun, progress));
  section.dataset.ttgPlaybackFallback = String(manager.snapshot?.nativeFallback ?? false);
}

export async function prepareTtgAnimationFrame(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: TtgMediaRun
): Promise<void> {
  renderTtgAnimationProgress(root, rawProgress);
  const section = ttgSection(root);
  if (!section) {
    throw new Error('TTG unavailable');
  }
  await prepareMedia(section, mediaRun, stableProgress(rawProgress));
}

export async function prepareTtgSourceTerminal(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): Promise<void> {
  const section = ttgSection(root);
  if (!section) {
    throw new Error('TTG unavailable');
  }
  renderTtgAnimationProgress(section, 1);
  await prepareMedia(section, mediaRun, 1);
}

export async function prepareTtgPlaybackLeg(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): Promise<void> {
  const section = ttgSection(root);
  if (!section) {
    throw new Error('TTG unavailable');
  }
  const progress = heldProgress(section, mediaRun.direction);
  renderTtgAnimationProgress(section, progress);
  await prepareMedia(section, mediaRun, progress);
}

export function commitTtgPlaybackLeg(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): void {
  const section = ttgSection(root);
  if (!section) {
    throw new Error('TTG unavailable');
  }
  commitPreparedMedia(section, mediaRun);
}

export function commitTtgTerminalFrame(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): void {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  if (!section || !manager || manager.activeRunId !== mediaRun.runId) {
    throw new Error('TTG end stale');
  }
  manager.snapshot = driveTimelineVideo(manager.video, mediaInput(mediaRun, 1, 'timeline'));
}

export function commitTtgForwardStart(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): void {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  if (!section || !manager || manager.activeRunId !== mediaRun.runId) {
    throw new Error('TTG start stale');
  }
  manager.snapshot = driveTimelineVideo(manager.video, mediaInput(mediaRun, 0, 'timeline'));
}

export function parkTtgMedia(root: HTMLElement | null | undefined): void {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  if (!section || !manager) {
    return;
  }
  manager.generation += 1;
  manager.video.pause();
  disposeTimelineVideoDriver(manager.video);
  mediaManagers.delete(section);
  delete section.dataset.ttgPlaybackRun;
  delete section.dataset.ttgPlaybackDirection;
  delete section.dataset.ttgPendingMediaRun;
  delete section.dataset.ttgPendingMediaDirection;
}

export function disposeTtgMedia(root: HTMLElement | null | undefined): void {
  parkTtgMedia(root);
}

export function ttgMediaSnapshot(root: HTMLElement | null | undefined): TtgMediaSnapshot | null {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  return manager
    ? {
        activeRunId: manager.activeRunId,
        activeDirection: manager.activeDirection,
        video: manager.snapshot
      }
    : null;
}

export function renderTtgAnimationProgress(root: HTMLElement | null | undefined, rawProgress: number, options: TtgRenderOptions = {}): TtgRenderState {
  const section = ttgSection(root);
  const progress = stableProgress(rawProgress);
  const visualProgress = acceleratedProgress(progress);
  const vh = viewportHeight();
  const bgY = -visualProgress * vh * (TTG_CONFIG.bgTravelVh / 100);
  const middleY = visualProgress * vh * (TTG_CONFIG.middleTravelVh / 100);
  const frontY = vh * (TTG_CONFIG.frontYVh / 100) + visualProgress * vh * (TTG_CONFIG.frontTravelVh / 100);
  const figureY = vh * (TTG_CONFIG.figureYVh / 100) + visualProgress * vh * (TTG_CONFIG.figureTravelVh / 100);

  section?.style.setProperty('--ttg-progress', visualProgress.toFixed(4));
  section?.style.setProperty('--ttg-figure-progress', visualProgress.toFixed(4));
  section?.style.setProperty('--ttg-bg-y', `${bgY.toFixed(2)}px`);
  section?.style.setProperty('--ttg-bg-scale', (1 + visualProgress * 0.018).toFixed(4));
  section?.style.setProperty('--ttg-middle-y', `${middleY.toFixed(2)}px`);
  section?.style.setProperty('--ttg-middle-scale', (1 + visualProgress * 0.012).toFixed(4));
  section?.style.setProperty('--ttg-front-y', `${frontY.toFixed(2)}px`);
  section?.style.setProperty('--ttg-figure-y', `${figureY.toFixed(2)}px`);
  section?.style.setProperty('--ttg-figure-scale', TTG_CONFIG.figureScale.toFixed(4));
  section?.style.setProperty('--ttg-figure-video-opacity', '1');
  section?.setAttribute('data-ttg-progress', visualProgress.toFixed(4));
  if (section) {
    (section as TtgSection).__r4TtgProgress = progress;
  }

  if (options.mediaRun) {
    driveFigurePlayback(section, progress, options.mediaRun);
  } else {
    section?.setAttribute('data-ttg-playback-active', 'false');
    section?.setAttribute('data-ttg-raw-progress', progress.toFixed(4));
  }

  return { progress, visualProgress, bgY, middleY, frontY, figureY };
}

export function renderTtgHold(root: HTMLElement | null): void {
  renderTtgAnimationProgress(root, TTG_HOLD_PROGRESS);
}

function TtgAnimationScene({ registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    const controller = new AbortController();
    if (video) {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.pause();
    }
    if (root) {
      const mediaRun: TtgMediaRun = {
        runId: 'ttg-hold-frame',
        direction: 1,
        signal: controller.signal
      };
      void prepareTtgPlaybackLeg(root, mediaRun)
        .then(() => commitTtgPlaybackLeg(root, mediaRun))
        .catch(() => {
          root.dataset.ttgStaticMediaFallback = 'true';
        });
    }
    return () => {
      controller.abort();
      disposeTtgMedia(root);
    };
  }, []);

  return (
    <article
      ref={(element) => {
        rootRef.current = element;
        registerHandle?.('field', element);
      }}
      className="ttg-page r4-ttg-animation"
      data-r4-scene="ttg-animation"
      data-ttg-transition
      data-ttg-stage
      data-ttg-duration="2.5"
      data-ttg-scroll-vh="153"
      data-ttg-video-duration="2.5"
      data-ttg-bg-travel-vh="14.3"
      data-ttg-middle-travel-vh="23.5"
      data-ttg-front-y-vh="29.2"
      data-ttg-front-travel-vh="13.1"
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
              <img className="ttg-layer ttg-layer--front" src={TTG_FRONT_SRC} alt="" />
              <video
                ref={(element) => {
                  videoRef.current = element;
                  registerHandle?.('figure-video', element);
                }}
                className="ttg-layer ttg-layer--figure"
                data-ttg-figure-video
                data-media-key={TTG_MEDIA_KEY}
                width="720"
                height="1280"
                muted
                preload="metadata"
                playsInline
              >
                <AlphaVideoSources
                  webm={TTG_FIGURE_VIDEO_SRC}
                  hevc={TTG_FIGURE_HEVC_ALPHA_SRC}
                />
              </video>
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
  requiredHandles: ['field', 'figure-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
