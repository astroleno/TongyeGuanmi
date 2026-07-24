import { renderPhoneEducationHold } from '../scenes/PhoneEducation';
import { renderPhonePhPresentation } from '../../../scenes/ph-animation/phone/PhonePh.motion';
import {
  INTRA_CHAPTER_DISSOLVE_MS,
  PH_PLAYBACK_MS
} from '../../../story/timings';
import {
  clearPhoneEndpoint,
  createPhoneEndpointAdapter,
  presentPhoneEndpoint
} from './PhoneEndpointTransition';

const STOP = PH_PLAYBACK_MS / (PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const range = (value: number, start: number) => (
  clamp((value - start) / Math.max(0.0001, 1 - start))
);

export const PhonePhEducationTransition = createPhoneEndpointAdapter({
  layerAttribute: 'data-phone-ph-education-layer',
  renderFrame(from, to, rawProgress, direction, reducedMotion) {
    const raw = clamp(rawProgress);
    const progress = reducedMotion ? (raw < 0.5 ? 0 : 1) : raw;
    const education = range(progress, STOP);
    if (direction === 1) {
      renderPhonePhPresentation(
        from,
        clamp(progress / STOP),
        1,
        reducedMotion
      );
      presentPhoneEndpoint(from, 1, false);
    }
    renderPhoneEducationHold(to);
    presentPhoneEndpoint(to, education, false);
    from?.setAttribute('data-phone-ph-education-handoff', 'source');
    to?.setAttribute('data-phone-ph-education-handoff', 'receiver');
  },
  settle(from, to) {
    presentPhoneEndpoint(from, 0, false);
    presentPhoneEndpoint(to, 1, true);
  },
  reset(from, to) {
    clearPhoneEndpoint(from);
    clearPhoneEndpoint(to);
  }
});

export default PhonePhEducationTransition;
