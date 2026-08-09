import { range01, smoothStep } from '../../pilot/visibility';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';

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

export const AOD_ALPHA_FRAME_COUNT = 78;
export const AOD_FIRST_FULL_ALPHA_FRAME = 16;
export const AOD_SOURCE_ALPHA_END = AOD_FIRST_FULL_ALPHA_FRAME / (AOD_ALPHA_FRAME_COUNT - 1);
export const AOD_ALPHA_BACKGROUND_HOLD_PROGRESS = 1 / 3;
export const AOD_TIMELINE_ALPHA_END = 0.48;
export const AOD_PHONE_TIMELINE_ALPHA_START = 0.49;
export const AOD_PHONE_TIMELINE_ALPHA_END = 0.59;
export const AOD_FIRST_FULL_ALPHA_PROGRESS = AOD_TIMELINE_ALPHA_END;
export const AOD_BACKDROP_ALPHA_EXIT_START_PROGRESS = AOD_ALPHA_BACKGROUND_HOLD_PROGRESS;

function alphaEndProgress(rawProgress: number): number {
  return Math.min(0.999, Math.max(0.001, rawProgress));
}

export function mapAodTimelineToMediaProgress(
  rawProgress: number,
  rawAlphaEndProgress = AOD_TIMELINE_ALPHA_END
): number {
  const progress = Math.min(1, Math.max(0, rawProgress));
  const alphaEnd = alphaEndProgress(rawAlphaEndProgress);
  if (progress <= alphaEnd) {
    return (progress / alphaEnd) * AOD_SOURCE_ALPHA_END;
  }
  return AOD_SOURCE_ALPHA_END
    + ((progress - alphaEnd) / (1 - alphaEnd))
      * (1 - AOD_SOURCE_ALPHA_END);
}

export function mapAodMediaToTimelineProgress(
  rawMediaProgress: number,
  rawAlphaEndProgress = AOD_TIMELINE_ALPHA_END
): number {
  const mediaProgress = Math.min(1, Math.max(0, rawMediaProgress));
  const alphaEnd = alphaEndProgress(rawAlphaEndProgress);
  if (mediaProgress <= AOD_SOURCE_ALPHA_END) {
    return (mediaProgress / AOD_SOURCE_ALPHA_END) * alphaEnd;
  }
  return alphaEnd
    + ((mediaProgress - AOD_SOURCE_ALPHA_END) / (1 - AOD_SOURCE_ALPHA_END))
      * (1 - alphaEnd);
}

/**
 * Native playback keeps the authored alpha portion through the selected point
 * of the reversible AOD timeline (48% by default, 59% on phone). The first
 * source segment slows down and the opaque segment catches up without
 * changing the total duration.
 */
export function aodPlaybackRateForMediaProgress(
  rawMediaProgress: number,
  rawAlphaEndProgress = AOD_TIMELINE_ALPHA_END
): number {
  const mediaProgress = Math.min(1, Math.max(0, rawMediaProgress));
  const alphaEnd = alphaEndProgress(rawAlphaEndProgress);
  return mediaProgress <= AOD_SOURCE_ALPHA_END
    ? AOD_SOURCE_ALPHA_END / alphaEnd
    : (1 - AOD_SOURCE_ALPHA_END) / (1 - alphaEnd);
}

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

export function renderAodTransitionProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  rawAlphaEndProgress = AOD_TIMELINE_ALPHA_END
): void {
  const section = aodSection(root);
  if (!section) {
    return;
  }

  const raw = Math.min(1, Math.max(0, rawProgress));
  const alphaEnd = alphaEndProgress(rawAlphaEndProgress);
  const p = acceleratedProgress(raw);
  const mediaProgress = mapAodTimelineToMediaProgress(raw, alphaEnd);
  const alphaComposite = raw < alphaEnd;
  const config = HOMEPAGE_AOD_CONFIG;
  const backdropExit = smoothStep(range01(
    raw,
    AOD_ALPHA_BACKGROUND_HOLD_PROGRESS,
    config.backdropExitEndSeconds / config.durationSeconds
  ));
  const fullscreen = smoothStep(secondsRange(
    p,
    config.fullscreenStartSeconds,
    config.fullscreenEndSeconds,
    config.durationSeconds
  ));
  const upExitY = viewportHeight() * -1.08;
  const alphaBackdropFade = 1 - smoothStep(range01(
    raw,
    AOD_BACKDROP_ALPHA_EXIT_START_PROGRESS,
    alphaEnd
  ));
  const backgroundFade = Math.min(1 - backdropExit, alphaBackdropFade);
  const methodEnter = smoothStep(range01(p, 0.44, 0.86));
  const figureScale = config.figureStartScale + fullscreen * (1 - config.figureStartScale);
  const figureY = (1 - fullscreen) * viewportHeight() * (config.figureStartYVh / 100);

  section.style.setProperty('--aod-transition-progress', p.toFixed(4));
  section.setAttribute('data-aod-media-progress', mediaProgress.toFixed(4));
  section.setAttribute('data-aod-alpha-composite', semanticBoolean(alphaComposite));
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
  section.style.setProperty('--aod-transition-method-progress', methodEnter.toFixed(4));
  section.style.setProperty('--aod-transition-method-y', formatPx((1 - methodEnter) * 26));
  section.style.setProperty('--aod-transition-method-blur', `${((1 - methodEnter) * 9).toFixed(2)}px`);

  for (let index = 0; index < 9; index += 1) {
    const itemProgress = smoothStep(range01(p, 0.40 + index * 0.03, 0.58 + index * 0.03));
    section.style.setProperty(`--aod-method-item-${index}`, itemProgress.toFixed(4));
    section.style.setProperty(`--aod-method-y-${index}`, formatPx((1 - itemProgress) * 18));
  }

}
