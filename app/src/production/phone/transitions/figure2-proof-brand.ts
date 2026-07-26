import { createPhoneInkAdapter } from './PhoneInkTransition';

export const PHONE_PROOF_BRAND_FIELD = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'figure2-proof-brand-phone'
} as const;

export function alignPhoneProofBrandReceiver(
  host: HTMLElement,
  receiver: HTMLElement
): () => void {
  const receiverRect = receiver.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  receiver.dataset.phoneProofBrandAligned = 'true';
  receiver.style.setProperty(
    '--phone-proof-brand-align-x',
    `${hostRect.left - receiverRect.left}px`
  );
  receiver.style.setProperty(
    '--phone-proof-brand-align-y',
    `${hostRect.top - receiverRect.top}px`
  );
  return () => {
    delete receiver.dataset.phoneProofBrandAligned;
    receiver.style.removeProperty('--phone-proof-brand-align-x');
    receiver.style.removeProperty('--phone-proof-brand-align-y');
  };
}

/** Aligns the one canonical document receiver while the fixed ink owns it. */
export const PhoneFigure2ProofBrandTransition = createPhoneInkAdapter({
  id: 'phone-figure2-proof-brand',
  field: PHONE_PROOF_BRAND_FIELD,
  canvasClassName: 'phone-grade-a__proof-brand-ink',
  portraitInk: 'proof-brand',
  grade: 'dark',
  reducedMotionStrategy: 'boundary',
  alignReceiver: alignPhoneProofBrandReceiver
});

export default PhoneFigure2ProofBrandTransition;
