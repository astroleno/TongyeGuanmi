export type Figure3RenderState = {
  progress: number;
  fillOpacity: number;
  videoOpacity: number;
  videoScale: number;
};

type Figure3RenderOptions = Readonly<{
  mediaRun?: {
    runId: string;
    direction: 1 | -1;
  };
}>;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
};
const range01 = (value: number, start: number, end: number) => clamp((value - start) / Math.max(0.0001, end - start));
const acceleratedProgress = (progress: number) => {
  const p = clamp(progress);
  return clamp(0.78 * p + 0.22 * p * p);
};

export const FIGURE3_HOLD_PROGRESS = 0;

function figure3Section(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="figure3-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="figure3-animation"]') ?? null;
}

export function renderFigure3AnimationProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  options: Figure3RenderOptions = {}
): Figure3RenderState {
  const section = figure3Section(root);
  const progress = acceleratedProgress(rawProgress);
  const fillOpacity = 0;
  // The segment layer owns the Figure3 fade. Keeping the presented video
  // opaque through its terminal frame avoids a second binary fade at settle.
  const videoOpacity = 1;
  const backdropSettle = smoothStep(range01(progress, 0.06, 0.84));
  const videoScale = 1.004 + progress * 0.052;
  const progressValue = progress.toFixed(4);

  section?.style.setProperty('--figure3-progress', progressValue);
  section?.style.setProperty('--figure3-fill-opacity', fillOpacity.toFixed(4));
  section?.style.setProperty('--figure3-video-opacity', videoOpacity.toFixed(4));
  section?.style.setProperty('--figure3-backdrop-opacity', (1 - backdropSettle * 0.46).toFixed(4));
  section?.style.setProperty('--figure3-backdrop-scale', (1.06 + backdropSettle * 0.08).toFixed(4));
  section?.style.setProperty('--figure3-video-scale', videoScale.toFixed(4));
  section?.setAttribute('data-figure3-progress', progressValue);
  if (options.mediaRun) {
    section?.setAttribute('data-figure3-playback-run', options.mediaRun.runId);
    section?.setAttribute('data-figure3-playback-direction', String(options.mediaRun.direction));
  }

  return { progress, fillOpacity, videoOpacity, videoScale };
}

export function renderFigure3Hold(root: HTMLElement | null): void {
  renderFigure3AnimationProgress(root, FIGURE3_HOLD_PROGRESS);
}
