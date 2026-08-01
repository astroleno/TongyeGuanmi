import { createPhoneInkAdapter } from './PhoneInkTransition';
import { PHONE_PATTERN_STAR_MAP_INK_OPTIONS } from '../../../transitions/pattern-star-map/phone';

export const PhonePatternStarMapTransition = createPhoneInkAdapter({
  id: 'portrait-pattern-star-ink',
  field: PHONE_PATTERN_STAR_MAP_INK_OPTIONS.field,
  canvasClassName: PHONE_PATTERN_STAR_MAP_INK_OPTIONS.canvasClassName,
  portraitInk: PHONE_PATTERN_STAR_MAP_INK_OPTIONS.portraitInk,
  grade: PHONE_PATTERN_STAR_MAP_INK_OPTIONS.grade
});

export default PhonePatternStarMapTransition;
