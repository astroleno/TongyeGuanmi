import { CRANE_TIMELINE_DURATION_SECONDS } from '..';

const FIGURE_START_SECONDS = 0.5;
const FIGURE_FULLSCREEN_SECONDS = FIGURE_START_SECONDS + 1;
const FLOCK_END_SECONDS = 2.5;
/*
 * At packed frame 45 (≈1.5s), the flock matte reaches y=0. Growing the
 * retained-height camera from .57 to 1 places that edge 10.95lvh below the
 * viewport top, so the paired translation closes the remaining distance.
 */
export const PHONE_CRANE_FLOCK_TOP_ARRIVAL_SECONDS = 1.5;
export const PHONE_CRANE_FLOCK_TOP_ARRIVAL_Y_VH = -10.95;
export const PHONE_CRANE_FLOCK_OPENING_SCALE = 0.57;
export const PHONE_CRANE_FLOCK_ARRIVAL_SCALE = 1;
export const PHONE_CRANE_FIGURE_OPENING_SCALE = 0.5;
export const PHONE_CRANE_FIGURE_OPENING_X_VH = -3.75;
export const PHONE_CRANE_FIGURE_OPENING_Y_VH = 8.75;

/** The complete desktop-authored endpoint used after native playback ends. */
export const PHONE_CRANE_STABLE_HOLD_PROGRESS = 1;

export type PhoneCranePlaybackDirection = 1 | -1;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function finiteInRange(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
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
  _direction: PhoneCranePlaybackDirection = 1
): void {
  void _direction;
  const section = rootFor(root);
  if (!section) return;
  const timelineProgress = clamp(rawProgress);
  const progress = acceleratedProgress(timelineProgress);
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
  const videoOpacity = figureActive ? 1 : 0;
  const flockOpacity = (
    1 - smoothStep(range01(time, FLOCK_END_SECONDS - 0.24, FLOCK_END_SECONDS))
  );
  const flockRise = smoothStep(range01(
    time,
    0,
    PHONE_CRANE_FLOCK_TOP_ARRIVAL_SECONDS
  ));
  const flockY = PHONE_CRANE_FLOCK_TOP_ARRIVAL_Y_VH * flockRise;
  const flockOpeningScale = finiteInRange(
    section.dataset.phoneCraneFlockOpeningScale,
    PHONE_CRANE_FLOCK_OPENING_SCALE,
    0.25,
    1.5
  );
  const flockScale = (
    flockOpeningScale
    + (PHONE_CRANE_FLOCK_ARRIVAL_SCALE - flockOpeningScale) * flockRise
  );
  const flockRetired = time >= FLOCK_END_SECONDS - 0.001;
  const figureY = 198 * (1 - grow);
  const figureOpeningScale = finiteInRange(
    section.dataset.phoneCraneFigureOpeningScale,
    PHONE_CRANE_FIGURE_OPENING_SCALE,
    0.25,
    1.5
  );
  const figureOpeningX = finiteInRange(
    section.dataset.phoneCraneFigureOpeningX,
    PHONE_CRANE_FIGURE_OPENING_X_VH,
    -25,
    25
  );
  const figureOpeningY = finiteInRange(
    section.dataset.phoneCraneFigureOpeningY,
    PHONE_CRANE_FIGURE_OPENING_Y_VH,
    -25,
    25
  );
  const openingWeight = 1 - grow;
  const videoScale = figureOpeningScale + (1 - figureOpeningScale) * grow;
  const figureCameraX = figureOpeningX * openingWeight;
  const figureCameraY = figureOpeningY * openingWeight;
  const clipBottom = (1 - unmask) * 42;
  // Desktop Crane sends every architectural plate below the viewport across
  // the same 0.08 → 0.78 timeline range. Holding the phone camera at 20%
  // left the roof and clouds visible beneath Contact and made the figure look
  // as if it stopped when the flock ended.
  const exit = smoothStep(range01(progress, 0.08, 0.78));
  const viewportHeight = section.getBoundingClientRect?.().height
    || section.clientHeight
    || section.ownerDocument?.defaultView?.innerHeight
    || 720;
  const downExitY = viewportHeight * 1.38 * exit;

  section.style.setProperty('--crane-progress', progress.toFixed(4));
  section.style.setProperty('--crane-video-scale', videoScale.toFixed(4));
  section.style.setProperty(
    '--phone-crane-figure-camera-x',
    `${figureCameraX.toFixed(2)}lvh`
  );
  section.style.setProperty(
    '--phone-crane-figure-camera-y',
    `${figureCameraY.toFixed(2)}lvh`
  );
  section.style.setProperty('--crane-figure-x', '0px');
  section.style.setProperty('--crane-figure-base-y', `${figureY.toFixed(1)}px`);
  section.style.setProperty('--crane-video-y', '0px');
  section.style.setProperty('--crane-video-opacity', videoOpacity.toFixed(4));
  section.style.setProperty('--crane-video-clip-bottom', `${clipBottom.toFixed(2)}%`);
  section.style.setProperty('--crane-flock-opacity', flockOpacity.toFixed(4));
  section.style.setProperty('--crane-flock-y', `${flockY.toFixed(2)}lvh`);
  section.style.setProperty(
    '--phone-crane-flock-motion-scale',
    flockScale.toFixed(4)
  );
  section.dataset.craneProgress = progress.toFixed(4);
  section.dataset.phoneCraneProgress = timelineProgress.toFixed(4);
  section.dataset.phoneCraneFlockState = flockRetired
    ? 'retired'
    : 'active';
  section.dataset.phoneCraneClock = 'presented-media';

  /*
   * The packed flock stops on its safe terminal bitmap before Figure finishes.
   * Chromium repaints the CSS-variable opacity, but physical Safari can retain
   * that last Canvas layer after its decoder pauses. Retire the actual painted
   * surface at the authored 2.5s cue, then restore it as soon as reverse moves
   * below the cue. The compositor stays allocated for reverse; only its visual
   * participation changes.
   */
  const flockCanvas = section.querySelector<HTMLElement>(
    '.phone-crane__flock-canvas'
  );
  if (flockCanvas) {
    flockCanvas.style.opacity = flockRetired ? '0' : '';
    flockCanvas.style.visibility = flockRetired ? 'hidden' : 'visible';
  }

  setTransform(
    section.querySelector<HTMLElement>('.crane-layer--cloud-back'),
    `translate3d(-50%, ${(downExitY * 0.82).toFixed(2)}px, 0)`
  );
  setTransform(
    section.querySelector<HTMLElement>('.crane-layer--arch'),
    `translate3d(-50%, calc(${downExitY.toFixed(2)}px + var(--phone-crane-tune-building-y, 3.25lvh)), 0)`
  );
  setTransform(
    section.querySelector<HTMLElement>('.crane-layer--cloud-front-second'),
    `translate3d(-50%, calc(${(downExitY * 1.28).toFixed(2)}px + var(--phone-crane-tune-bottom-cloud-y, 3.25lvh)), 0)`
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
