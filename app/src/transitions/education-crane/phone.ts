import { createPhoneInkAdapter } from '../../production/phone/transitions/PhoneInkTransition';
import { renderPhoneCranePresentation } from '../../scenes/crane-animation/phone/PhoneCrane.motion';
import {
  renderPhoneEducationHold
} from '../../scenes/education/phone/presentation';
import './phone.css';

const field = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'phone-education-crane-r5'
} as const;

function renderEndpoint(
  element: HTMLElement | null,
  interactive: boolean
): void {
  if (!element) return;
  element.style.opacity = '1';
  element.style.visibility = 'visible';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
}

export const PhoneEducationCraneTransition = createPhoneInkAdapter({
  id: 'phone-education-crane-ink',
  field,
  grade: 'edge-bright',
  canvasClassName: 'phone-education-crane__ink',
  maskSource: false,
  releaseOnLeave: true,
  renderFrame(from, to, rawProgress, reducedMotion) {
    const progress = reducedMotion ? (rawProgress < 0.5 ? 0 : 1) : rawProgress;
    renderPhoneEducationHold(from);
    if (!to?.dataset.phoneCraneProgress) {
      renderPhoneCranePresentation(to, 0);
    }
    renderEndpoint(from, progress < 0.999);
    renderEndpoint(to, false);
    return progress;
  }
});

export default PhoneEducationCraneTransition;
