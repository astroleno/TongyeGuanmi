import { renderPhoneCranePresentation } from '../../scenes/crane-animation/phone/PhoneCrane.motion';
import { renderEducationHold } from '../../scenes/education';

const ENDPOINT_EPSILON = 0.001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function transitionProgress(rawProgress: number, reducedMotion: boolean): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

function presentInkEndpoint(
  element: HTMLElement | null,
  interactive: boolean
): void {
  if (!element) return;
  // As in Unit 5's Services → TTG bridge, the native document stays intact
  // underneath an opaque fixed receiver. The contour—not endpoint opacity—
  // is the sole visual boundary.
  element.style.opacity = '1';
  element.style.visibility = 'visible';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
}

export const PHONE_EDUCATION_CRANE_FIELD = Object.freeze({
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'phone-education-crane-r5'
} as const);

/** Reuse the physical-iPhone-approved Unit 5 ink ownership topology. */
export const PHONE_EDUCATION_CRANE_DECISION = Object.freeze({
  mode: 'horizontal-ink',
  source: 'services-ttg/star-map-aod-phone-field',
  field: 'bottom-to-top',
  grade: 'edge-bright',
  fallback: 'stable-endpoint-contour',
  reason: 'Education remains the native document owner while the opaque Crane opening frame is revealed by the shared phone ink field.'
} as const);

export type PhoneEducationCraneFrame = Readonly<{
  progress: number;
  educationOpacity: 1;
  craneOpacity: 1;
  craneProgress: 0;
}>;

export function phoneEducationCraneFrame(
  rawProgress: number,
  reducedMotion = false
): PhoneEducationCraneFrame {
  return {
    progress: transitionProgress(rawProgress, reducedMotion),
    educationOpacity: 1,
    craneOpacity: 1,
    craneProgress: 0
  };
}

export function applyPhoneEducationCraneFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  reducedMotion = false
): PhoneEducationCraneFrame {
  const frame = phoneEducationCraneFrame(rawProgress, reducedMotion);
  renderEducationHold(from);
  // Pre-register Crane at frame zero while its root remains fully opaque.
  // Initialising WebGL beneath a dissolving opacity-zero root can leave
  // physical Safari repainting only the CSS camera over one stale frame.
  if (!to?.dataset.phoneCraneProgress) {
    renderPhoneCranePresentation(to, 0);
  }
  presentInkEndpoint(from, frame.progress < 1 - ENDPOINT_EPSILON);
  presentInkEndpoint(to, false);
  from?.setAttribute('data-phone-education-crane-handoff', 'source');
  to?.setAttribute('data-phone-education-crane-handoff', 'receiver');
  return frame;
}
