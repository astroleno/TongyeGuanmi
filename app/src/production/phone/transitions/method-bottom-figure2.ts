import { createPhoneInkAdapter } from './PhoneInkTransition';

export const PHONE_METHOD_FIGURE2_FIELD = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'method-bottom-figure2-phone'
} as const;

export const PhoneMethodBottomFigure2Transition = createPhoneInkAdapter({
  id: 'phone-method-bottom-figure2',
  field: PHONE_METHOD_FIGURE2_FIELD,
  canvasClassName: 'phone-grade-a__method-ink',
  portraitInk: 'method-figure2',
  grade: 'dark'
});

export default PhoneMethodBottomFigure2Transition;
