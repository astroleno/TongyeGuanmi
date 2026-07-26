import { renderPhonePhPresentation } from '../../scenes/ph-animation/phone/PhonePh.motion';

const ENDPOINT_EPSILON = 0.001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function endpointProgress(rawProgress: number, reducedMotion: boolean): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

function presentInkEndpoint(
  element: HTMLElement | null,
  interactive: boolean
): void {
  if (!element) return;
  // Ink owns the only visual boundary. Both authored plates stay fully
  // opaque, otherwise the PH island becomes translucent through Lab.
  element.style.opacity = '1';
  element.style.visibility = 'visible';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
}

/**
 * Reuse the reviewed Star-map → AOD phone ink topology. Lab supplies only its
 * shared stable endpoint; this transition never imports PhoneLab or its refs.
 */
export const PHONE_LAB_PH_DECISION = Object.freeze({
  mode: 'horizontal-ink',
  source: 'star-map-aod-phone-field',
  field: 'bottom-to-top',
  grade: 'edge-bright',
  reason: 'Lab and the fully opaque PH opening plate share the reviewed phone ink contour.'
} as const);

export type PhoneLabPhFrame = Readonly<{
  progress: number;
  labOpacity: number;
  phOpacity: number;
  phProgress: 0;
}>;

export function phoneLabPhFrame(
  rawProgress: number,
  reducedMotion = false
): PhoneLabPhFrame {
  const progress = endpointProgress(rawProgress, reducedMotion);
  return {
    progress,
    labOpacity: 1,
    phOpacity: 1,
    phProgress: 0
  };
}

/**
 * Consumes only generic from/to endpoints supplied by the phone adapter
 * coordinator. It deliberately has no PhoneLab import or ref.
 */
export function applyPhoneLabPhFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  reducedMotion = false
): PhoneLabPhFrame {
  const frame = phoneLabPhFrame(rawProgress, reducedMotion);
  // PhonePh owns its presentation once mounted. Seed an uninitialized
  // receiver at the opening endpoint, but never rewind an already-presented
  // terminal frame when reverse() merely prepares the ink boundary.
  if (!to?.dataset.phonePhProgress) {
    renderPhonePhPresentation(to, 0, 1, reducedMotion);
  }
  // The source remains the one accessible tree until the contour lands. PH
  // is a cinematic surface beneath an aria-hidden stage.
  presentInkEndpoint(from, frame.progress < 1 - ENDPOINT_EPSILON);
  presentInkEndpoint(to, false);
  from?.setAttribute('data-phone-lab-ph-handoff', 'source');
  to?.setAttribute('data-phone-lab-ph-handoff', 'receiver');
  return frame;
}
