import { renderPhonePhPresentation } from '../../scenes/ph-animation/phone/PhonePh.motion';
import {
  createPhoneInkLeaf,
  type PhoneInkLeafOptions
} from '../shared/phoneInkLeaf';
import './phone.css';

const ENDPOINT_EPSILON = .001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function endpointProgress(rawProgress: number, reducedMotion: boolean): number {
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

export const PHONE_LAB_PH_DECISION = Object.freeze({
  mode: 'horizontal-ink',
  source: 'star-map-aod-phone-field',
  field: 'bottom-to-top',
  grade: 'edge-bright',
  reason: 'Lab and the fully opaque PH opening plate share the reviewed phone ink contour.'
} as const);

export const PHONE_LAB_PH_FIELD = Object.freeze({
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'phone-lab-ph-r5'
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
  return { progress, labOpacity: 1, phOpacity: 1, phProgress: 0 };
}

/** Stateless compatibility helper for the old acceptance shell only. */
export function applyPhoneLabPhFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  reducedMotion = false
): PhoneLabPhFrame {
  const frame = phoneLabPhFrame(rawProgress, reducedMotion);
  if (!to?.dataset.phonePhProgress) {
    renderPhonePhPresentation(to, 0, 1, reducedMotion);
  }
  presentInkEndpoint(from, frame.progress < 1 - ENDPOINT_EPSILON);
  presentInkEndpoint(to, false);
  from?.setAttribute('data-phone-lab-ph-handoff', 'source');
  to?.setAttribute('data-phone-lab-ph-handoff', 'receiver');
  return frame;
}

export const PHONE_LAB_PH_OPTIONS = Object.freeze({
  segmentId: 'lab-ph',
  surfaceId: 'fx:lab-ph',
  field: PHONE_LAB_PH_FIELD,
  grade: 'edge-bright',
  canvasClassName: 'phone-lab-ph__ink',
  portraitInk: 'lab-ph'
} as const satisfies PhoneInkLeafOptions);

/** Runtime/projector own both endpoint planes; this leaf owns only the Ink. */
export const PhoneLabPhTransition = createPhoneInkLeaf(PHONE_LAB_PH_OPTIONS);

export default PhoneLabPhTransition;
export const phoneSegmentId = 'lab-ph' as const;
