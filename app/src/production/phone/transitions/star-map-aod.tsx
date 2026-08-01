import { createPhoneInkAdapter } from './PhoneInkTransition';
import { PHONE_STAR_MAP_AOD_INK_OPTIONS } from '../../../transitions/star-map-aod/phone';

export const PhoneStarMapAodTransition = createPhoneInkAdapter({
  id: 'portrait-star-aod-ink',
  field: PHONE_STAR_MAP_AOD_INK_OPTIONS.field,
  canvasClassName: PHONE_STAR_MAP_AOD_INK_OPTIONS.canvasClassName,
  portraitInk: PHONE_STAR_MAP_AOD_INK_OPTIONS.portraitInk,
  grade: PHONE_STAR_MAP_AOD_INK_OPTIONS.grade
});

export default PhoneStarMapAodTransition;
