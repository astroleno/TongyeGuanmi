import { createPhoneProgressLeaf } from '../shared/phoneProgressLeaf';

/** Choreography and PhoneContact own pixels; this leaf proves the between-plane mount only. */
export const PhoneCraneContactTransition = createPhoneProgressLeaf({
  segmentId: 'crane-contact', surfaceId: 'between:crane-contact'
});

export default PhoneCraneContactTransition;
export const phoneSegmentId = 'crane-contact' as const;
