import { createPhoneInkLeaf, type PhoneInkLeafOptions } from '../shared/phoneInkLeaf';

export const PHONE_PATTERN_STAR_MAP_INK_OPTIONS = Object.freeze({
  segmentId: 'pattern-star-map',
  surfaceId: 'fx:pattern-star-map',
  field: Object.freeze({
    kind: 'radial', origin: Object.freeze({ x: .5, y: .28 }),
    seed: 'portrait-pattern-star-r5'
  }),
  grade: 'dark',
  canvasClassName: 'portrait-scroll-spike__ink',
  portraitInk: 'pattern-star'
} as const satisfies PhoneInkLeafOptions);

export const PhonePatternStarMapTransition = createPhoneInkLeaf(
  PHONE_PATTERN_STAR_MAP_INK_OPTIONS
);

export default PhonePatternStarMapTransition;
export const phoneSegmentId = 'pattern-star-map' as const;
