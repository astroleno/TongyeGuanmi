import { createPhoneInkLeaf, type PhoneInkLeafOptions } from '../shared/phoneInkLeaf';

export const PHONE_HERO_PATTERN_INK_OPTIONS = Object.freeze({
  segmentId: 'hero-pattern',
  surfaceId: 'fx:hero-pattern',
  field: Object.freeze({
    kind: 'radial', origin: Object.freeze({ x: .5, y: .44 }),
    seed: 'portrait-hero-pattern-r5'
  }),
  grade: 'dark',
  canvasClassName: 'portrait-scroll-spike__ink',
  portraitInk: 'hero-pattern'
} as const satisfies PhoneInkLeafOptions);

export const PhoneHeroPatternTransition = createPhoneInkLeaf(
  PHONE_HERO_PATTERN_INK_OPTIONS
);

export default PhoneHeroPatternTransition;
export const phoneSegmentId = 'hero-pattern' as const;
