import { CRANE_TIMELINE_DURATION_SECONDS } from '..';

const FIGURE_START_SECONDS = 0.5;
const FIGURE_FULLSCREEN_SECONDS = FIGURE_START_SECONDS + 1;
const FLOCK_END_SECONDS = 2.5;
const PHONE_CRANE_CAMERA_HOLD_PROGRESS = 0.2;

/** The verified media endpoint used after native playback completes. */
export const PHONE_CRANE_STABLE_HOLD_PROGRESS = 0.42;

export type PhoneCranePlaybackDirection = 1 | -1;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothStep(value: number): number {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

function range01(value: number, start: number, end: number): number {
  return clamp((value - start) / Math.max(0.0001, end - start));
}

function acceleratedProgress(progress: number): number {
  const value = clamp(progress);
  return clamp(0.78 * value + 0.22 * value * value);
}

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="crane-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="crane-animation"]') ?? null;
}

function setTransform(element: HTMLElement | null, transform: string): void {
  if (element) element.style.transform = transform;
}

/**
 * AOD-style phone camera: native media runs to completion while the paper
 * camera settles at a verified in-scene endpoint instead of exiting to blank.
 * This renderer never touches either video playhead.
 */
export function renderPhoneCranePresentation(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  direction: PhoneCranePlaybackDirection = 1
): void {
  const section = rootFor(root);
  if (!section) return;
  const timelineProgress = clamp(rawProgress);
  const progress = acceleratedProgress(timelineProgress);
  const cameraProgress = acceleratedProgress(Math.min(
    timelineProgress,
    PHONE_CRANE_CAMERA_HOLD_PROGRESS
  ));
  const time = timelineProgress * CRANE_TIMELINE_DURATION_SECONDS;
  const grow = smoothStep(range01(
    time,
    FIGURE_START_SECONDS,
    FIGURE_FULLSCREEN_SECONDS
  ));
  const unmask = smoothStep(range01(
    time,
    FIGURE_START_SECONDS + 0.12,
    FIGURE_START_SECONDS + 1.05
  ));
  const figureActive = time >= FIGURE_START_SECONDS;
  const reverseOpacity = direction === -1 ? timelineProgress : 1;
  const videoOpacity = (figureActive ? 1 : 0) * reverseOpacity;
  const flockOpacity = (
    1 - smoothStep(range01(time, FLOCK_END_SECONDS - 0.24, FLOCK_END_SECONDS))
  ) * reverseOpacity;
  const figureY = 198 * (1 - grow);
  const videoScale = 0.8 + 0.2 * grow;
  const clipBottom = (1 - unmask) * 42;
  const exit = smoothStep(range01(cameraProgress, 0.08, 0.78));
  const viewportHeight = section.ownerDocument?.defaultView?.innerHeight ?? 720;
  const downExitY = viewportHeight * 1.38 * exit;

  section.style.setProperty('--crane-progress', progress.toFixed(4));
  section.style.setProperty('--crane-video-scale', videoScale.toFixed(4));
  section.style.setProperty('--crane-figure-x', '0px');
  section.style.setProperty('--crane-figure-base-y', `${figureY.toFixed(1)}px`);
  section.style.setProperty('--crane-video-y', '0px');
  section.style.setProperty('--crane-video-opacity', videoOpacity.toFixed(4));
  section.style.setProperty('--crane-video-clip-bottom', `${clipBottom.toFixed(2)}%`);
  section.style.setProperty('--crane-flock-opacity', flockOpacity.toFixed(4));
  section.style.setProperty('--crane-flock-y', '0px');
  section.dataset.craneProgress = progress.toFixed(4);
  section.dataset.phoneCraneProgress = timelineProgress.toFixed(4);
  section.dataset.phoneCraneClock = direction === 1 ? 'native' : 'endpoint-dissolve';

  setTransform(
    section.querySelector<HTMLElement>('.crane-layer--cloud-back'),
    `translate3d(-50%, ${(downExitY * 0.82).toFixed(2)}px, 0)`
  );
  setTransform(
    section.querySelector<HTMLElement>('.crane-layer--arch'),
    `translate3d(-50%, ${downExitY.toFixed(2)}px, 0)`
  );
  setTransform(
    section.querySelector<HTMLElement>('.crane-layer--cloud-front-second'),
    `translate3d(-50%, ${(downExitY * 1.28).toFixed(2)}px, 0)`
  );
  setTransform(
    section.querySelector<HTMLElement>('.crane-layer--cloud-front'),
    `translate3d(-50%, ${(downExitY * 1.14).toFixed(2)}px, 0)`
  );
}

export function phoneCranePresentationProgress(
  rawProgress: number,
  reducedMotion = false
): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}
