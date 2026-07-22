const EPSILON = 0.001;

export const PHONE_LAB_CONTACT_STOPS = Object.freeze({
  handoffEnd: 0.16,
  sceneMotionEnd: 0.78,
  endpoint: 1
});

/**
 * PH and Crane own native media time after a document threshold is crossed.
 * The acceptance shell listens for these local events to keep the document
 * snapped at that threshold without extending the shared PhoneStoryShell API.
 */
export const PHONE_LAB_CONTACT_AUTOPLAY_EVENT = 'phone-lab-contact-autoplay';

export type PhoneLabContactAutoplayEventDetail = Readonly<{
  scene: 'ph-animation' | 'crane-animation';
  phase: 'start' | 'complete';
  direction: 1 | -1;
}>;

export function dispatchPhoneLabContactAutoplay(
  target: EventTarget | null | undefined,
  detail: PhoneLabContactAutoplayEventDetail
): void {
  if (!target || typeof CustomEvent === 'undefined') return;
  target.dispatchEvent(new CustomEvent<PhoneLabContactAutoplayEventDetail>(
    PHONE_LAB_CONTACT_AUTOPLAY_EVENT,
    { bubbles: true, detail }
  ));
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range01(value: number, start: number, end: number): number {
  return clamp((value - start) / Math.max(EPSILON, end - start));
}

function reducedEndpoint(value: number, reducedMotion: boolean): number {
  const progress = clamp(value);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

export type PhoneLabContactPhaseFrame = Readonly<{
  progress: number;
  handoffProgress: number;
  sceneProgress: number;
  arrivalProgress: number;
  stageActive: boolean;
}>;

/**
 * Maps a pinned cinematic chapter to stable endpoints plus a single authored
 * scene run. The same geometry drives Lab → PH and Education → Crane.
 */
export function phoneLabContactPhaseFrame(
  rawProgress: number,
  reducedMotion = false
): PhoneLabContactPhaseFrame {
  const progress = reducedEndpoint(rawProgress, reducedMotion);
  const { handoffEnd, sceneMotionEnd, endpoint } = PHONE_LAB_CONTACT_STOPS;
  return {
    progress,
    handoffProgress: range01(progress, 0, handoffEnd),
    sceneProgress: range01(progress, handoffEnd, sceneMotionEnd),
    arrivalProgress: range01(progress, sceneMotionEnd, endpoint),
    stageActive: progress < endpoint - EPSILON
  };
}

/** Maps an element's native document distance to its pinned-stage progress. */
export function phoneLabContactScrollProgress(
  elementTop: number,
  elementHeight: number,
  viewportHeight: number
): number {
  const distance = Math.max(1, elementHeight - viewportHeight);
  return clamp(-elementTop / distance);
}
