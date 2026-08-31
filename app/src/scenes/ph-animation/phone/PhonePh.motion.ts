import {
  renderPhAnimationProgress,
  type PhRenderState
} from '..';

export type PhonePhPlaybackDirection = 1 | -1;

export type PhonePhRenderState = PhRenderState & Readonly<{
  frontY: number;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ph-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]') ?? null;
}

export function phonePhPresentationProgress(
  rawProgress: number,
  reducedMotion = false
): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

/**
 * The desktop camera lets the near island fall 95px faster than the figures.
 * On the portrait crop that separates feet from the ridge. The phone camera
 * keeps both plates on one vertical track, preserving their authored contact
 * throughout presented-frame playback and the PH → Education endpoint dissolve.
 */
export function phonePhForegroundParallaxY(
  state: Pick<PhRenderState, 'figureY'>
): number {
  return state.figureY;
}

/**
 * Sole phone presentation renderer for PH. It owns phone camera correction
 * and layer opacity, but never owns or seeks the media playhead.
 */
export function renderPhonePhPresentation(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  direction: PhonePhPlaybackDirection = 1,
  reducedMotion = false
): PhonePhRenderState {
  const section = rootFor(root);
  const progress = phonePhPresentationProgress(rawProgress, reducedMotion);
  const canonical = renderPhAnimationProgress(section, progress);
  const frontY = phonePhForegroundParallaxY(canonical);

  section?.style.setProperty('--ph-front-parallax-y', `${frontY.toFixed(2)}px`);
  section?.style.setProperty('--ph-video-opacity', '1');
  section?.setAttribute('data-phone-ph-progress', progress.toFixed(4));
  section?.setAttribute(
    'data-phone-ph-clock',
    direction === 1 ? 'presented-frame' : 'presented-frame-reverse'
  );

  return { ...canonical, frontY };
}
