/** @deprecated v=16 characterization aliases for the production phone runtime. */
export {
  PHONE_FIGURE_AUTOPLAY_START_PROGRESS as PORTRAIT_FIGURE_AUTOPLAY_START_PROGRESS,
  PHONE_FIGURE_DURATION_SECONDS as PORTRAIT_FIGURE_DURATION_SECONDS,
  attachPhoneDeviceParallax as attachPortraitDeviceParallax,
  createPhoneFigurePlayback as createPortraitFigurePlayback,
  phoneDeviceParallaxSample as portraitDeviceParallaxSample,
  phoneFigureFallbackSourceFor as portraitFigureFallbackSourceFor,
  phoneFigureSourceFor as portraitFigureSourceFor
} from '../phone/hero-motion';
export type {
  PhoneDeviceParallax as PortraitDeviceParallax,
  PhoneFigurePlayback as PortraitFigurePlayback,
  PhoneFigureSource as PortraitFigureSource,
  PhoneFigureSources as PortraitFigureSources,
  PhoneParallaxTarget as PortraitParallaxTarget
} from '../phone/hero-motion';
