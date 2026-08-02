import { createPhoneInkLeaf } from '../shared/phoneInkLeaf';

export const PHONE_FIGURE2_PROOF_BRAND_OPTIONS = Object.freeze({
  segmentId: 'figure2-proof-brand',
  surfaceId: 'fx:figure2-proof-brand' as const,
  field: Object.freeze({
    kind: 'horizontal' as const,
    direction: 'bottom-to-top' as const,
    seed: 'figure2-proof-brand-phone'
  }),
  grade: 'dark' as const,
  canvasClassName: 'phone-grade-a__proof-brand-ink',
  portraitInk: 'proof-brand'
});

export const PhoneFigure2ProofBrandTransition = createPhoneInkLeaf(
  PHONE_FIGURE2_PROOF_BRAND_OPTIONS
);

export default PhoneFigure2ProofBrandTransition;
export const phoneSegmentId = 'figure2-proof-brand' as const;
