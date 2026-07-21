import { createPhoneInkAdapter } from './PhoneInkTransition';

export const PHONE_PROOF_BRAND_FIELD = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'figure2-proof-brand-phone'
} as const;

/** Unit 5 supplies the Brand receiver; Unit 4 freezes this boundary contract. */
export const PhoneFigure2ProofBrandTransition = createPhoneInkAdapter({
  id: 'phone-figure2-proof-brand',
  field: PHONE_PROOF_BRAND_FIELD,
  canvasClassName: 'phone-grade-a__proof-brand-ink',
  portraitInk: 'proof-brand',
  grade: 'dark'
});

export default PhoneFigure2ProofBrandTransition;
