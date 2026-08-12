import {
  createPhoneInkLeaf,
  type PhoneInkLeafOptions
} from '../shared/phoneInkLeaf';
import './phone.css';

export const PHONE_EDUCATION_CRANE_FIELD = Object.freeze({
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'phone-education-crane-r5'
} as const);

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
