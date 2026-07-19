/** @deprecated v=16 characterization aliases for the production phone runtime. */
export {
  PHONE_AOD_METHOD_START_PROGRESS as PORTRAIT_AOD_METHOD_START_PROGRESS,
  createPhoneAodAutoplay as createPortraitAodAutoplay,
  phoneAodBackdropPresentation as portraitAodBackdropPresentation,
  phoneAodMethodProgress as portraitAodMethodProgress,
  phoneAodPresentation as portraitAodPresentation
} from '../phone/aod-autoplay';
export type {
  PhoneAodAutoplay as PortraitAodAutoplay,
  PhoneAodBackdropPresentation as PortraitAodBackdropPresentation,
  PhoneAodPlaybackDirection as PortraitAodPlaybackDirection,
  PhoneAodPresentation as PortraitAodPresentation
} from '../phone/aod-autoplay';
