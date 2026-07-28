import { createPhoneInkAdapter } from './PhoneInkTransition';
import type { PhoneInkFieldRequest } from '../phone-ink';

export const PHONE_PROOF_BRAND_FIELD = [
  'horizontal',
  'figure2-proof-brand-phone',
  'bottom-to-top',
  null,
  null
] as const satisfies PhoneInkFieldRequest;

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
export const PhoneFigure2ProofBrandTransition = createPhoneInkAdapter([
  'phone-figure2-proof-brand',
  PHONE_PROOF_BRAND_FIELD,
  'dark',
  'phone-grade-a__proof-brand-ink',
  'proof-brand',
  'boundary',
  null,
  alignPhoneProofBrandReceiver,
  null
]);

export default PhoneFigure2ProofBrandTransition;
