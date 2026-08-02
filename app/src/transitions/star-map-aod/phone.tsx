import { createPhoneInkLeaf, type PhoneInkLeafOptions } from '../shared/phoneInkLeaf';

export const PHONE_STAR_MAP_AOD_INK_OPTIONS = Object.freeze({
  segmentId: 'star-map-aod',
  surfaceId: 'fx:star-map-aod',
  field: Object.freeze({
    kind: 'horizontal', direction: 'bottom-to-top', seed: 'portrait-star-aod-r5'
  }),
  grade: 'edge-bright',
  canvasClassName: 'portrait-scroll-spike__ink',
  portraitInk: 'star-aod'
} as const satisfies PhoneInkLeafOptions);

export const PhoneStarMapAodTransition = createPhoneInkLeaf(
  PHONE_STAR_MAP_AOD_INK_OPTIONS
);

export default PhoneStarMapAodTransition;
export const phoneSegmentId = 'star-map-aod' as const;
