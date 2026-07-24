import { renderPhoneCranePresentation } from '../../../scenes/crane-animation/phone/PhoneCrane.motion';
import { renderPhoneEducationHold } from '../scenes/PhoneEducation';
import '../../../transitions/education-crane/phone.css';
import { createPhoneInkAdapter } from './PhoneInkTransition';

const endpoint = (
  element: HTMLElement | null,
  interactive: boolean
) => {
  if (!element) return;
  element.style.opacity = '1';
  element.style.visibility = 'visible';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
};

export const PhoneEducationCraneTransition = createPhoneInkAdapter({
  id: 'phone-education-crane-ink',
  field: {
    kind: 'horizontal',
    direction: 'bottom-to-top',
    seed: 'phone-education-crane-r5'
  },
  grade: 'edge-bright',
  canvasClassName: 'phone-education-crane__ink',
  maskSource: false,
  releaseOnLeave: true,
  reverseProgress: 1,
  renderFrame(from, to, rawProgress, reducedMotion) {
    const clamped = Math.min(1, Math.max(0, rawProgress));
    const progress = reducedMotion ? (clamped < 0.5 ? 0 : 1) : clamped;
    renderPhoneEducationHold(from);
    if (!to?.dataset.phoneCraneProgress) {
      renderPhoneCranePresentation(to, 0);
    }
    endpoint(from, progress < 0.999);
    endpoint(to, false);
    from?.setAttribute('data-phone-education-crane-handoff', 'source');
    to?.setAttribute('data-phone-education-crane-handoff', 'receiver');
    return progress;
  }
});

export default PhoneEducationCraneTransition;
