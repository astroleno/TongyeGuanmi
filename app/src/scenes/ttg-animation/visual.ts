export type TtgRenderState = {
  progress: number;
  visualProgress: number;
  bgY: number;
  middleY: number;
  frontY: number;
  figureY: number;
};

type TtgRenderOptions = Readonly<{
  mediaRun?: {
    runId: string;
    direction: 1 | -1;
  };
}>;

type TtgSection = HTMLElement & {
  __r4TtgProgress?: number;
};

const TTG_CONFIG = {
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

function ttgSection(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ttg-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]') ?? null;
}

export function renderTtgAnimationProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  options: TtgRenderOptions = {}
): TtgRenderState {
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
    section?.setAttribute('data-ttg-playback-direction', String(options.mediaRun.direction));
    section?.setAttribute('data-ttg-playback-run', options.mediaRun.runId);
    section?.setAttribute('data-ttg-playback-active', 'false');
    section?.setAttribute('data-ttg-raw-progress', progress.toFixed(4));
  } else {
    section?.setAttribute('data-ttg-playback-active', 'false');
    section?.setAttribute('data-ttg-raw-progress', progress.toFixed(4));
  }

  return { progress, visualProgress, bgY, middleY, frontY, figureY };
}

export function renderTtgHold(root: HTMLElement | null): void {
  renderTtgAnimationProgress(root, 0);
}
