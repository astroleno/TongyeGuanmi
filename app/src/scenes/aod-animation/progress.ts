import { range01, smoothStep } from '../../pilot/visibility';

type AodTransitionConfig = {
  durationSeconds: number;
  videoDurationFallback: number;
  fullscreenStartSeconds: number;
  fullscreenEndSeconds: number;
  backdropExitStartSeconds: number;
  backdropExitEndSeconds: number;
  figureStartScale: number;
  figureStartYVh: number;
};

const HOMEPAGE_AOD_CONFIG: AodTransitionConfig = {
  durationSeconds: 2,
  videoDurationFallback: 5.03,
  fullscreenStartSeconds: 0,
  fullscreenEndSeconds: 0.85,
  backdropExitStartSeconds: 0.18,
  backdropExitEndSeconds: 1.55,
  figureStartScale: 1,
  figureStartYVh: 10.5
};

function viewportHeight(): number {
  return typeof window === 'undefined' ? 800 : window.innerHeight;
}

function acceleratedProgress(rawProgress: number): number {
  const t = Math.min(1, Math.max(0, rawProgress));
  return Math.min(1, Math.max(0, 0.78 * t + 0.22 * t * t));
}

function secondsRange(progress: number, startSeconds: number, endSeconds: number, durationSeconds: number): number {
  return range01(progress, startSeconds / durationSeconds, endSeconds / durationSeconds);
}

function formatPx(value: number): string {
  return `${value.toFixed(2)}px`;
}

function aodSection(root: HTMLElement | null | undefined): HTMLElement | null {
  if (!root) {
    return null;
  }
  return root.matches('[data-aod-transition]')
    ? root
    : root.querySelector<HTMLElement>('[data-aod-transition]');
}

function videoIn(root: HTMLElement | null | undefined): HTMLVideoElement | null {
  return root?.querySelector<HTMLVideoElement>('[data-aod-figure-video]') ?? null;
}

export function renderAodTransitionProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  options: { video?: HTMLVideoElement | null | undefined } = {}
): void {
  const section = aodSection(root);
  if (!section) {
    return;
  }

  const p = acceleratedProgress(rawProgress);
  const config = HOMEPAGE_AOD_CONFIG;
  const backdropExit = smoothStep(secondsRange(
    p,
    config.backdropExitStartSeconds,
    config.backdropExitEndSeconds,
    config.durationSeconds
  ));
  const fullscreen = smoothStep(secondsRange(
    p,
    config.fullscreenStartSeconds,
    config.fullscreenEndSeconds,
    config.durationSeconds
  ));
  const upExitY = viewportHeight() * -1.08;
  const backgroundFade = 1 - backdropExit;
  const paperWash = smoothStep(range01(p, 0.42, 0.86));
  const bottomMist = smoothStep(range01(p, 0.56, 1));
  const paperSolid = smoothStep(range01(p, 0.70, 1));
  const methodEnter = smoothStep(range01(p, 0.44, 0.86));
  const figureScale = config.figureStartScale + fullscreen * (1 - config.figureStartScale);
  const figureY = (1 - fullscreen) * viewportHeight() * (config.figureStartYVh / 100);

  section.style.setProperty('--aod-transition-progress', p.toFixed(4));
  section.style.setProperty('--aod-transition-sun-x', '0px');
  section.style.setProperty('--aod-transition-sun-y', formatPx(backdropExit * upExitY * 1.02));
  section.style.setProperty('--aod-transition-sun-opacity', (0.96 * backgroundFade).toFixed(4));
  section.style.setProperty('--aod-transition-sun-scale', (1 + backdropExit * 0.025).toFixed(4));
  section.style.setProperty('--aod-transition-cloud-x', '0px');
  section.style.setProperty('--aod-transition-cloud-y', formatPx(backdropExit * upExitY * 1.16));
  section.style.setProperty('--aod-transition-cloud-opacity', (0.98 * backgroundFade).toFixed(4));
  section.style.setProperty('--aod-transition-cloud-scale', (1 + backdropExit * 0.025).toFixed(4));
  section.style.setProperty('--aod-transition-figure-y', formatPx(figureY));
  section.style.setProperty('--aod-transition-figure-scale', figureScale.toFixed(4));
  section.style.setProperty('--aod-transition-paper-wash-opacity', (paperWash * 0.92).toFixed(4));
  section.style.setProperty('--aod-transition-bottom-mist-opacity', (bottomMist * 0.96).toFixed(4));
  section.style.setProperty('--aod-transition-bottom-mist-y', formatPx((1 - bottomMist) * 18));
  section.style.setProperty('--aod-transition-paper-solid-opacity', paperSolid.toFixed(4));
  section.style.setProperty('--aod-transition-method-progress', methodEnter.toFixed(4));
  section.style.setProperty('--aod-transition-method-y', formatPx((1 - methodEnter) * 26));
  section.style.setProperty('--aod-transition-method-blur', `${((1 - methodEnter) * 9).toFixed(2)}px`);

  for (let index = 0; index < 9; index += 1) {
    const itemProgress = smoothStep(range01(p, 0.40 + index * 0.03, 0.58 + index * 0.03));
    section.style.setProperty(`--aod-method-item-${index}`, itemProgress.toFixed(4));
    section.style.setProperty(`--aod-method-y-${index}`, formatPx((1 - itemProgress) * 18));
  }

  const video = options.video ?? videoIn(section);
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    const targetTime = Math.max(0, Math.min(video.duration - 0.02, p * video.duration));
    if (Math.abs(video.currentTime - targetTime) > 0.016) {
      video.currentTime = targetTime;
    }
  }
}
