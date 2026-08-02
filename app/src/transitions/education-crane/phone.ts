import { renderPhoneCranePresentation } from '../../scenes/crane-animation/phone/PhoneCrane.motion';
import { renderEducationHold } from '../../scenes/education';
import {
  createPhoneInkLeaf,
  type PhoneInkLeafOptions
} from '../shared/phoneInkLeaf';
import './phone.css';

const ENDPOINT_EPSILON = .001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function transitionProgress(rawProgress: number, reducedMotion: boolean): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < .5 ? 0 : 1) : progress;
}

function presentInkEndpoint(
  element: HTMLElement | null,
  interactive: boolean
): void {
  if (!element) return;
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

/** Stateless compatibility projection for the old formal shell only. */
export function applyPhoneEducationCraneFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  reducedMotion = false
): PhoneEducationCraneFrame {
  const frame = phoneEducationCraneFrame(rawProgress, reducedMotion);
  renderEducationHold(from);
  if (!to?.dataset.phoneCraneProgress) renderPhoneCranePresentation(to, 0);
  presentInkEndpoint(from, frame.progress < 1 - ENDPOINT_EPSILON);
  presentInkEndpoint(to, false);
  from?.setAttribute('data-phone-education-crane-handoff', 'source');
  to?.setAttribute('data-phone-education-crane-handoff', 'receiver');
  return frame;
}

export const PHONE_EDUCATION_CRANE_OPTIONS = Object.freeze({
  segmentId: 'education-crane',
  surfaceId: 'fx:education-crane',
  field: PHONE_EDUCATION_CRANE_FIELD,
  grade: 'edge-bright',
  canvasClassName: 'phone-education-crane__ink',
  portraitInk: 'education-crane'
} as const satisfies PhoneInkLeafOptions);

/** Runtime/projector own both planes; this leaf owns only the Ink surface. */
export const PhoneEducationCraneTransition = createPhoneInkLeaf(
  PHONE_EDUCATION_CRANE_OPTIONS
);

export default PhoneEducationCraneTransition;
export const phoneSegmentId = 'education-crane' as const;
