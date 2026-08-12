import {
  createPhoneInkLeaf,
  type PhoneInkLeafOptions
} from '../shared/phoneInkLeaf';
import './phone.css';

export const PHONE_LAB_PH_FIELD = Object.freeze({
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'phone-lab-ph-r5'
} as const);

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
