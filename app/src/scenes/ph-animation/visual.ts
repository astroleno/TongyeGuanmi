export type PhRenderState = {
  progress: number;
  bgY: number;
  frontY: number;
  figureY: number;
};

export type PhRenderOptions = Readonly<{
  mediaRun?: {
    runId: string;
    direction: 1 | -1;
  };
}>;

const PH_HOLD_PROGRESS = 0;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothStep(value: number): number {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
}

function phSection(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ph-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]') ?? null;
}

export const phPlaybackProgress = (progress: number): number => {
  const p = clamp(progress);
  return clamp(0.78 * p + 0.22 * p * p);
};

export function renderPhAnimationProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  options: PhRenderOptions = {}
): PhRenderState {
  const section = phSection(root);
  const raw = clamp(rawProgress);
  const progress = phPlaybackProgress(raw);
  const eased = smoothStep(progress);
  const bgY = eased * -18;
  const frontY = eased * 230;
  const figureY = eased * 135;

  section?.style.setProperty('--ph-progress', progress.toFixed(4));
  section?.style.setProperty('--ph-bg-parallax-y', `${bgY.toFixed(2)}px`);
  section?.style.setProperty('--ph-front-parallax-y', `${frontY.toFixed(2)}px`);
  section?.style.setProperty('--ph-figure-parallax-y', `${figureY.toFixed(2)}px`);
  section?.setAttribute('data-ph-progress', progress.toFixed(4));
  if (options.mediaRun) {
    section?.setAttribute('data-ph-playback-direction', String(options.mediaRun.direction));
    section?.setAttribute('data-ph-playback-run', options.mediaRun.runId);
  }
  section?.setAttribute('data-ph-raw-progress', raw.toFixed(4));
  section?.setAttribute('data-ph-playback-active', String(raw > 0.001 && raw < 0.999));

  return { progress, bgY, frontY, figureY };
}

export function renderPhHold(root: HTMLElement | null): void {
  renderPhAnimationProgress(root, PH_HOLD_PROGRESS);
}
