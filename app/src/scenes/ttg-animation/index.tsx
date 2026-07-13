import { useEffect, useRef } from 'react';
import {
  createDirectionalMediaController,
  type DirectionalMediaController,
  type DirectionalMediaControllerSnapshot,
  type DirectionalMediaInput
} from '../../media/directional-media-controller';
import { MediaPreparationError } from '../../media/media-preparation';
import { TTG_PLAYBACK_MS } from '../../story/timings';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const TTG_MEDIA_KEY = 'ttg_figure-alpha-scrub';
export const TTG_REVERSE_MEDIA_KEY = 'ttg_figure-alpha-scrub-reverse';
export const TTG_BG_SRC = new URL('../../../../assets/ttg_bg.png', import.meta.url).href;
export const TTG_MIDDLE_SRC = new URL('../../../../assets/ttg_middle-composite.png', import.meta.url).href;
export const TTG_FRONT_SRC = new URL('../../../../assets/ttg_front-composite.png', import.meta.url).href;
export const TTG_FIGURE_VIDEO_SRC = new URL('../../../../assets/ttg_figure-alpha-scrub.webm', import.meta.url).href;
export const TTG_FIGURE_REVERSE_VIDEO_SRC = new URL('../../../../assets/ttg_figure-alpha-scrub-reverse.webm', import.meta.url).href;
export const TTG_FIGURE_POSTER_SRC = new URL('../../../../assets/ttg_figure-alpha-scrub-poster.png', import.meta.url).href;
export const TTG_FIGURE_TERMINAL_SRC = new URL('../../../../assets/ttg_figure-terminal.png', import.meta.url).href;
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

const TTG_CONFIG = {
  videoDurationFallback: 2.459,
  bgTravelVh: 14.3,
  middleTravelVh: 23.5,
  frontYVh: 29.2,
  frontTravelVh: 13.1,
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

type TtgMediaManager = {
  controller: DirectionalMediaController;
  generation: number;
  activeSurface?: TtgSurface;
  activeRunId?: string;
  preparedActivation?: DirectionalMediaInput;
  preparedTerminalActivation?: Pick<TtgMediaRun, 'runId' | 'direction'>;
  terminalReadyRunId?: string;
  preparedForwardStart?: DirectionalMediaInput;
};

export type TtgMediaSnapshot = Readonly<{
  activeSurface: TtgSurface | undefined;
  activeRunId: string | undefined;
  preparedForwardStart: boolean;
  controller: DirectionalMediaControllerSnapshot;
}>;

const mediaManagers = new WeakMap<HTMLElement, TtgMediaManager>();

function ttgSection(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ttg-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]') ?? null;
}

function mediaInput(
  surface: TtgSurface,
  mediaRun: NonNullable<TtgRenderOptions['mediaRun']>,
  progress: number,
  mode: NonNullable<DirectionalMediaInput['mode']>
): DirectionalMediaInput {
  return {
    surface,
    runId: mediaRun.runId,
    direction: mediaRun.direction,
    progress,
    durationFallbackSeconds: TTG_CONFIG.videoDurationFallback,
    endEpsilonSeconds: 0.02,
    timelineDurationMs: TTG_PLAYBACK_MS,
    mode,
    nativePlaybackDirection: 1,
    ...(mediaRun.reducedMotion !== undefined ? { reducedMotion: mediaRun.reducedMotion } : {}),
    ...(mediaRun.signal ? { signal: mediaRun.signal } : {})
  };
}

function managerFor(section: HTMLElement): TtgMediaManager {
  const existing = mediaManagers.get(section);
  if (existing) {
    return existing;
  }
  const forward = section.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
  const reverse = section.querySelector<HTMLVideoElement>('[data-ttg-figure-video-reverse]');
  if (!forward || !reverse) {
    throw new Error('TTG directional media surfaces are unavailable');
  }
  const manager: TtgMediaManager = {
    controller: createDirectionalMediaController({
      surfaces: { forward, reverse },
      parkedPreload: 'metadata'
    }),
    generation: 0
  };
  mediaManagers.set(section, manager);
  return manager;
}

function terminalSurface(section: HTMLElement): HTMLImageElement {
  const terminal = section.querySelector<HTMLImageElement>('[data-ttg-figure-terminal]');
  if (!terminal) {
    throw new Error('TTG terminal figure surface is unavailable');
  }
  return terminal;
}

function abortError(signal: AbortSignal | undefined, runId: string): MediaPreparationError {
  return new MediaPreparationError(
    'MEDIA_PREPARATION_ABORTED',
    `TTG terminal frame preparation was aborted for ${runId}`,
    signal?.reason === undefined ? {} : { cause: signal.reason }
  );
}

async function prepareTerminalSurface(
  section: HTMLElement,
  mediaRun: TtgMediaRun
): Promise<void> {
  if (mediaRun.signal?.aborted) {
    throw abortError(mediaRun.signal, mediaRun.runId);
  }
  const terminal = terminalSurface(section);
  if (typeof terminal.decode !== 'function') {
    if (terminal.complete && terminal.naturalWidth > 0) {
      return;
    }
    throw new MediaPreparationError(
      'MEDIA_ELEMENT_ERROR',
      `TTG terminal frame is not loaded for ${mediaRun.runId}`
    );
  }
  try {
    await terminal.decode();
  } catch (cause) {
    if (mediaRun.signal?.aborted) {
      throw abortError(mediaRun.signal, mediaRun.runId);
    }
    throw new MediaPreparationError(
      'MEDIA_ELEMENT_ERROR',
      `TTG terminal frame failed to decode for ${mediaRun.runId}`,
      { cause }
    );
  }
  if (mediaRun.signal?.aborted) {
    throw abortError(mediaRun.signal, mediaRun.runId);
  }
}

function hideTerminalSurface(section: HTMLElement): void {
  terminalSurface(section).classList.remove('is-active');
}

function showTerminalSurface(section: HTMLElement, manager: TtgMediaManager): void {
  manager.generation += 1;
  manager.controller.park('forward');
  manager.controller.park('reverse');
  terminalSurface(section).classList.add('is-active');
  delete manager.activeSurface;
  delete manager.activeRunId;
  delete manager.preparedActivation;
  delete manager.preparedTerminalActivation;
  delete section.dataset.ttgPendingSurface;
  section.dataset.ttgActiveSurface = 'terminal';
  section.dataset.ttgHoldPoster = 'terminal';
}

function markActive(
  section: HTMLElement,
  manager: TtgMediaManager,
  input: DirectionalMediaInput
): void {
  manager.activeSurface = input.surface as TtgSurface;
  manager.activeRunId = input.runId;
  hideTerminalSurface(section);
  section.dataset.ttgActiveSurface = input.surface;
  section.dataset.ttgPlaybackRun = input.runId;
  section.dataset.ttgPlaybackDirection = String(input.direction);
  delete section.dataset.ttgPendingSurface;
  delete section.dataset.ttgHoldPoster;
}

async function prepareSurface(
  section: HTMLElement,
  input: DirectionalMediaInput
): Promise<TtgMediaManager> {
  const manager = managerFor(section);
  const generation = ++manager.generation;
  section.dataset.ttgPendingSurface = input.surface;
  const result = await manager.controller.prepare(input);
  if (manager.generation !== generation || result.status !== 'ready') {
    throw new Error(`TTG ${input.surface} media preparation became stale`);
  }
  return manager;
}

function activateSurface(
  section: HTMLElement,
  manager: TtgMediaManager,
  input: DirectionalMediaInput
): void {
  manager.controller.activate(input);
  markActive(section, manager, input);
}

function driveFigurePlayback(
  section: HTMLElement | null,
  progress: number,
  mediaRun: NonNullable<TtgRenderOptions['mediaRun']>
): void {
  section?.setAttribute('data-ttg-playback-direction', String(mediaRun.direction));
  section?.setAttribute('data-ttg-playback-run', mediaRun.runId);
  section?.setAttribute('data-ttg-raw-progress', progress.toFixed(4));
  section?.setAttribute('data-ttg-playback-active', String(progress > 0.001 && progress < 0.999));
  if (!section) {
    return;
  }
  const manager = mediaManagers.get(section);
  const surface: TtgSurface = mediaRun.direction === 1 ? 'forward' : 'reverse';
  if (
    !manager
    || manager.activeSurface !== surface
    || manager.activeRunId !== mediaRun.runId
  ) {
    return;
  }
  const mediaProgress = surface === 'forward' ? progress : 1 - progress;
  const snapshot = manager.controller.drive(
    mediaInput(surface, mediaRun, mediaProgress, 'native-preferred')
  );
  section.dataset.ttgPlaybackFallback = String(snapshot?.nativeFallback ?? false);
}

export function prepareTtgAnimationFrame(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: TtgMediaRun
): Promise<void> {
  renderTtgAnimationProgress(root, rawProgress);
  const section = ttgSection(root);
  if (!section) {
    return Promise.reject(new Error('TTG scene root is unavailable'));
  }
  const progress = stableProgress(rawProgress);
  const surface: TtgSurface = mediaRun.direction === 1 ? 'forward' : 'reverse';
  const mediaProgress = surface === 'forward' ? progress : 1 - progress;
  const timelineInput = mediaInput(surface, mediaRun, mediaProgress, 'timeline');
  return prepareSurface(section, timelineInput).then((manager) => {
    activateSurface(section, manager, { ...timelineInput, mode: 'native-preferred' });
  });
}

export async function prepareTtgSourceTerminal(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): Promise<void> {
  renderTtgAnimationProgress(root, 1);
  const section = ttgSection(root);
  if (!section) {
    throw new Error('TTG scene root is unavailable');
  }
  const manager = managerFor(section);
  const generation = ++manager.generation;
  await prepareTerminalSurface(section, mediaRun);
  if (manager.generation !== generation || mediaRun.signal?.aborted) {
    throw abortError(mediaRun.signal, mediaRun.runId);
  }
  manager.terminalReadyRunId = mediaRun.runId;
  manager.preparedTerminalActivation = {
    runId: mediaRun.runId,
    direction: mediaRun.direction
  };
}

export async function prepareTtgPlaybackLeg(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): Promise<void> {
  const section = ttgSection(root);
  if (!section) {
    throw new Error('TTG scene root is unavailable');
  }
  if (mediaRun.direction === 1) {
    renderTtgAnimationProgress(section, 0);
    const input = mediaInput('forward', mediaRun, 0, 'timeline');
    const [manager] = await Promise.all([
      prepareSurface(section, input),
      prepareTerminalSurface(section, mediaRun)
    ]);
    manager.preparedActivation = { ...input, mode: 'native-preferred' };
    manager.terminalReadyRunId = mediaRun.runId;
    delete manager.preparedForwardStart;
    return;
  }

  renderTtgAnimationProgress(section, 1);
  const reverseInput = mediaInput('reverse', mediaRun, 0, 'timeline');
  const manager = await prepareSurface(section, reverseInput);
  manager.preparedActivation = { ...reverseInput, mode: 'native-preferred' };
  delete manager.preparedForwardStart;
}

export function commitTtgPlaybackLeg(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): void {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  const input = manager?.preparedActivation;
  const terminalInput = manager?.preparedTerminalActivation;
  if (
    section
    && manager
    && terminalInput?.runId === mediaRun.runId
    && terminalInput.direction === mediaRun.direction
    && !mediaRun.signal?.aborted
  ) {
    showTerminalSurface(section, manager);
    return;
  }
  if (
    !section
    || !manager
    || !input
    || input.runId !== mediaRun.runId
    || input.direction !== mediaRun.direction
    || input.signal?.aborted
  ) {
    throw new Error('TTG playback surface is not ready for commit');
  }
  activateSurface(section, manager, input);
  delete manager.preparedActivation;
}

export function commitTtgTerminalFrame(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): void {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  if (
    !section
    || !manager
    || manager.terminalReadyRunId !== mediaRun.runId
    || mediaRun.signal?.aborted
  ) {
    throw new Error('TTG terminal frame is not ready for commit');
  }
  showTerminalSurface(section, manager);
}

export function commitTtgForwardStart(
  root: HTMLElement | null | undefined,
  mediaRun: TtgMediaRun
): void {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  if (
    !section
    || !manager
    || manager.activeSurface !== 'reverse'
    || manager.activeRunId !== mediaRun.runId
    || mediaRun.direction !== -1
  ) {
    throw new Error('TTG canonical forward-start frame is not ready');
  }
  parkTtgMedia(section);
}

export function parkTtgMedia(root: HTMLElement | null | undefined): void {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  if (!section || !manager) {
    return;
  }
  manager.generation += 1;
  manager.controller.park('forward');
  manager.controller.park('reverse');
  const forward = section.querySelector<HTMLVideoElement>('[data-ttg-figure-video]');
  const reverse = section.querySelector<HTMLVideoElement>('[data-ttg-figure-video-reverse]');
  if (forward) {
    try {
      forward.currentTime = 0;
    } catch {
      // The authored poster remains the canonical hold if the browser refuses the seek.
    }
  }
  forward?.classList.add('is-active');
  reverse?.classList.remove('is-active');
  hideTerminalSurface(section);
  delete manager.activeSurface;
  delete manager.activeRunId;
  delete manager.preparedActivation;
  delete manager.preparedTerminalActivation;
  delete manager.terminalReadyRunId;
  delete manager.preparedForwardStart;
  delete section.dataset.ttgActiveSurface;
  delete section.dataset.ttgPendingSurface;
  section.dataset.ttgHoldPoster = 'true';
}

export function disposeTtgMedia(root: HTMLElement | null | undefined): void {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  if (!section || !manager) {
    return;
  }
  manager.generation += 1;
  delete manager.preparedActivation;
  delete manager.preparedTerminalActivation;
  delete manager.terminalReadyRunId;
  delete manager.preparedForwardStart;
  hideTerminalSurface(section);
  manager.controller.dispose();
  mediaManagers.delete(section);
  delete section.dataset.ttgActiveSurface;
  delete section.dataset.ttgPendingSurface;
}

export function ttgMediaSnapshot(root: HTMLElement | null | undefined): TtgMediaSnapshot | null {
  const section = ttgSection(root);
  const manager = section ? mediaManagers.get(section) : undefined;
  return manager
    ? {
        activeSurface: manager.activeSurface,
        activeRunId: manager.activeRunId,
        preparedForwardStart: Boolean(manager.preparedForwardStart),
        controller: manager.controller.snapshot()
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
  section?.setAttribute('data-ttg-progress', visualProgress.toFixed(4));

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
  const forwardVideoRef = useRef<HTMLVideoElement | null>(null);
  const reverseVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    for (const video of [forwardVideoRef.current, reverseVideoRef.current]) {
      if (!video) {
        continue;
      }
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.pause();
    }
    return () => disposeTtgMedia(root);
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
      data-ttg-video-duration="2.459"
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
              <img
                ref={(element) => registerHandle?.('figure-terminal', element)}
                className="ttg-layer ttg-layer--figure ttg-layer--figure-terminal"
                data-ttg-figure-terminal
                src={TTG_FIGURE_TERMINAL_SRC}
                alt=""
                width="720"
                height="1280"
                decoding="async"
              />
              <video
                ref={(element) => {
                  forwardVideoRef.current = element;
                  registerHandle?.('figure-video', element);
                }}
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
                ref={(element) => {
                  reverseVideoRef.current = element;
                  registerHandle?.('figure-video-reverse', element);
                }}
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
  requiredHandles: ['field', 'figure-terminal', 'figure-video', 'figure-video-reverse'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
