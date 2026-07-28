import {
  clearPhoneEndpoint,
  createPhoneEndpointAdapter,
  presentPhoneEndpoint
} from '../../production/phone/transitions/PhoneEndpointTransition';
import {
  releasePhoneContactEntrance,
  renderPhoneContactEntrance,
  renderPhoneContactHold
} from '../../scenes/contact/phone/presentation';
import { CRANE_CONTACT_COPY_CUE } from '../../story/crane-contact-contract';

const owner = 'phone-crane-contact:phone';
const clamp = (value: number) => Math.min(1, Math.max(0, value));

function settle(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  presentPhoneEndpoint(from, 0, false);
  presentPhoneEndpoint(to, 1, true);
  renderPhoneContactHold(to);
}

export const PhoneCraneContactTransition = createPhoneEndpointAdapter([
  (from, to, rawProgress, _direction, reducedMotion) => {
    const progress = reducedMotion ? (rawProgress < 0.5 ? 0 : 1) : rawProgress;
    const contact = clamp(
      (progress - CRANE_CONTACT_COPY_CUE.atProgress)
      / (1 - CRANE_CONTACT_COPY_CUE.atProgress)
    );
    renderPhoneContactEntrance(to, contact, contact, owner);
    presentPhoneEndpoint(from, progress >= 0.999 ? 0 : 1, false);
    presentPhoneEndpoint(to, contact > 0.001 ? 1 : 0, false);
  },
  settle,
  (from, to, progress) => {
    const endpoint = progress >= 0.999 ? 1 : 0;
    releasePhoneContactEntrance(to, owner, endpoint);
    if (endpoint === 1) renderPhoneContactHold(to);
    clearPhoneEndpoint(from);
    clearPhoneEndpoint(to);
  }
]);

export default PhoneCraneContactTransition;
