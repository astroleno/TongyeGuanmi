import { createPhoneInkAdapter } from './PhoneInkTransition';
import { PHONE_HERO_PATTERN_INK_OPTIONS } from '../../../transitions/hero-pattern/phone';

export const PhoneHeroPatternTransition = createPhoneInkAdapter({
  id: 'portrait-hero-pattern-ink',
  field: PHONE_HERO_PATTERN_INK_OPTIONS.field,
  canvasClassName: PHONE_HERO_PATTERN_INK_OPTIONS.canvasClassName,
  portraitInk: PHONE_HERO_PATTERN_INK_OPTIONS.portraitInk,
  grade: PHONE_HERO_PATTERN_INK_OPTIONS.grade
});

export default PhoneHeroPatternTransition;
