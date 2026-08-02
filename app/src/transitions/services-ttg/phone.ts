import { createPhoneInkLeaf, type PhoneInkLeafOptions } from '../shared/phoneInkLeaf';

export const PHONE_SERVICES_TTG_FIELD = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'services-ttg-phone-r5'
} as const;

export const PHONE_SERVICES_TTG_DECISION = {
  strategy: 'validated-phone-ink',
  camera: 'star-map-aod-bottom-to-top-field',
  fallback: 'stable-endpoint-dissolve',
  forwardEndpoint: 'ttg-animation:stable-initial-frame',
  reverseEndpoint: 'services:reading-end',
  rationale: 'Reuse 4c659e3\'s accepted bottom-to-top phone ink field while Services remains the native document owner and TTG remains the sole visual owner.'
} as const;

export type PhoneServicesTtgFrame = Readonly<{
  progress: number;
  fromOpacity: number;
  toOpacity: number;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneServicesTtgFrame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false,
  direction: 1 | -1 = 1
): PhoneServicesTtgFrame {
  const progress = mediaFailed
    ? direction === 1 ? 1 : 0
    : reducedMotion ? rawProgress <= 0 ? 0 : 1 : clamp(rawProgress);
  return { progress, fromOpacity: 1 - progress, toOpacity: progress };
}

export const PHONE_SERVICES_TTG_OPTIONS = Object.freeze({
  segmentId: 'services-ttg',
  surfaceId: 'fx:services-ttg',
  field: Object.freeze(PHONE_SERVICES_TTG_FIELD),
  grade: 'edge-bright',
  canvasClassName: 'portrait-scroll-spike__ink phone-services-ttg__ink',
  portraitInk: 'services-ttg'
} as const satisfies PhoneInkLeafOptions);

/** Runtime/projector own both endpoint planes; this leaf owns only the Ink. */
export const PhoneServicesTtgTransition = createPhoneInkLeaf(
  PHONE_SERVICES_TTG_OPTIONS
);

export default PhoneServicesTtgTransition;
export const phoneSegmentId = 'services-ttg' as const;
