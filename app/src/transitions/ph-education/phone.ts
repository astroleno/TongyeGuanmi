import { createPhoneProgressLeaf } from '../shared/phoneProgressLeaf';

/** Choreography and the two scene leaves own media, opacity, and copy geometry. */
export const PhonePhEducationTransition = createPhoneProgressLeaf({
  segmentId: 'ph-education', surfaceId: 'between:ph-education'
});

export default PhonePhEducationTransition;
export const phoneSegmentId = 'ph-education' as const;
