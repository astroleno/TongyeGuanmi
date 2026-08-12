import { createPhoneProgressLeaf } from '../shared/phoneProgressLeaf';

/** Choreography and the two scene leaves own media, opacity, and copy geometry. */
export const PhoneTtgLabTransition = createPhoneProgressLeaf({
  segmentId: 'ttg-lab', surfaceId: 'between:ttg-lab'
});

export default PhoneTtgLabTransition;
export const phoneSegmentId = 'ttg-lab' as const;
