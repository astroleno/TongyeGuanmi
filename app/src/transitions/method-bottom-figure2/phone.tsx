import { createPhoneInkLeaf } from '../shared/phoneInkLeaf';

export function phoneMethodBottomFigure2Progress(progress: number): number {
  return Math.min(1, Math.max(0, progress) / .8);
}

export const PHONE_METHOD_BOTTOM_FIGURE2_OPTIONS = Object.freeze({
  segmentId: 'method-bottom-figure2',
  surfaceId: 'fx:method-bottom-figure2' as const,
  field: Object.freeze({
    kind: 'horizontal' as const,
    direction: 'bottom-to-top' as const,
    seed: 'method-bottom-figure2-phone'
  }),
  grade: 'dark' as const,
  mapProgress: phoneMethodBottomFigure2Progress,
  canvasClassName: 'phone-grade-a__method-ink',
  portraitInk: 'method-figure2'
});

export const PhoneMethodBottomFigure2Transition = createPhoneInkLeaf(
  PHONE_METHOD_BOTTOM_FIGURE2_OPTIONS
);

export default PhoneMethodBottomFigure2Transition;
