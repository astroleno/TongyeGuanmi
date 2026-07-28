import { createPhoneInkAdapter } from './PhoneInkTransition';
import type { PhoneInkFieldRequest } from '../phone-ink';

export const PHONE_METHOD_FIGURE2_FIELD = [
  'horizontal',
  'method-bottom-figure2-phone',
  'bottom-to-top',
  null,
  null
] as const satisfies PhoneInkFieldRequest;

export const PhoneMethodBottomFigure2Transition = createPhoneInkAdapter([
  'phone-method-bottom-figure2',
  PHONE_METHOD_FIGURE2_FIELD,
  'dark',
  'phone-grade-a__method-ink',
  'method-figure2',
  null,
  null,
  null,
  null
]);

export default PhoneMethodBottomFigure2Transition;
