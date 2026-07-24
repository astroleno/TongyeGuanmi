import {
  renderPhoneContactHold,
  renderPhoneContactProgress
} from '../scenes/PhoneContact';
import { CRANE_CONTACT_COPY_CUE } from '../../../story/crane-contact-contract';
import {
  clearPhoneEndpoint,
  createPhoneEndpointAdapter,
  presentPhoneEndpoint,
  setPhoneEndpointLayer
} from './PhoneEndpointTransition';

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const PhoneCraneContactTransition = createPhoneEndpointAdapter({
  layerAttribute: 'data-phone-crane-contact-layer',
  renderFrame(from, to, rawProgress, _direction, reducedMotion) {
    const raw = clamp(rawProgress);
    const progress = reducedMotion ? (raw < 0.5 ? 0 : 1) : raw;
    const contact = clamp(
      (progress - CRANE_CONTACT_COPY_CUE.atProgress)
      / (1 - CRANE_CONTACT_COPY_CUE.atProgress)
    );
    renderPhoneContactProgress(to, contact);
    to?.style.setProperty('--r4-contact-paper-alpha', contact.toFixed(4));
    to?.style.setProperty('--r4-contact-wash-alpha', contact.toFixed(4));
    setPhoneEndpointLayer(
      to,
      'data-phone-crane-contact-layer',
      contact > 0.001
    );
    presentPhoneEndpoint(from, progress >= 0.999 ? 0 : 1, false);
    presentPhoneEndpoint(to, contact > 0.001 ? 1 : 0, false);
    from?.setAttribute('data-phone-crane-contact-handoff', 'source');
    to?.setAttribute('data-phone-crane-contact-handoff', 'receiver');
  },
  settle(from, to) {
    presentPhoneEndpoint(from, 0, false);
    presentPhoneEndpoint(to, 1, true);
    renderPhoneContactHold(to);
  },
  reset(from, to) {
    clearPhoneEndpoint(from);
    clearPhoneEndpoint(to);
  }
});

export default PhoneCraneContactTransition;
