import {
  clearPhoneEndpoint,
  createPhoneEndpointAdapter,
  presentPhoneEndpoint
} from '../../production/phone/transitions/PhoneEndpointTransition';
import { renderPhonePhPresentation } from '../../scenes/ph-animation/phone/PhonePh.motion';
import {
  renderPhoneEducationProgress
} from '../../scenes/education/phone/presentation';
import {
  INTRA_CHAPTER_DISSOLVE_MS,
  PH_PLAYBACK_MS
} from '../../story/timings';

const stop = PH_PLAYBACK_MS / (PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const range = (value: number, start: number, end: number) => (
  clamp((value - start) / Math.max(0.0001, end - start))
);

function renderEducation(to: HTMLElement | null, progress: number): void {
  renderPhoneEducationProgress(to, 1);
  presentPhoneEndpoint(to, range(progress, stop, 1), false);
}

function settle(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  presentPhoneEndpoint(from, 0, false);
  presentPhoneEndpoint(to, 1, true);
}

export const PhonePhEducationTransition = createPhoneEndpointAdapter([
  (from, to, rawProgress, direction, reducedMotion) => {
    const progress = reducedMotion ? (rawProgress < 0.5 ? 0 : 1) : rawProgress;
    if (direction === -1) {
      renderEducation(to, progress);
      return;
    }
    renderPhonePhPresentation(from, range(progress, 0, stop), 1, reducedMotion);
    presentPhoneEndpoint(from, 1, false);
    renderEducation(to, progress);
  },
  settle,
  (from, to) => {
    clearPhoneEndpoint(from);
    clearPhoneEndpoint(to);
  }
]);

export default PhonePhEducationTransition;
