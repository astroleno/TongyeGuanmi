import { renderPhonePhPresentation } from '../../../scenes/ph-animation/phone/PhonePh.motion';
import '../../../transitions/lab-ph/phone.css';
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

export const PhoneLabPhTransition = createPhoneInkAdapter({
  id: 'phone-lab-ph-ink',
  field: {
    kind: 'horizontal',
    direction: 'bottom-to-top',
    seed: 'phone-lab-ph-r5'
  },
  grade: 'edge-bright',
  canvasClassName: 'phone-lab-ph__ink',
  maskSource: false,
  releaseOnLeave: true,
  reverseProgress: 1,
  renderFrame(from, to, rawProgress, reducedMotion) {
    const clamped = Math.min(1, Math.max(0, rawProgress));
    const progress = reducedMotion ? (clamped < 0.5 ? 0 : 1) : clamped;
    if (!to?.dataset.phonePhProgress) {
      renderPhonePhPresentation(to, 0, 1, reducedMotion);
    }
    endpoint(from, progress < 0.999);
    endpoint(to, false);
    from?.setAttribute('data-phone-lab-ph-handoff', 'source');
    to?.setAttribute('data-phone-lab-ph-handoff', 'receiver');
    return progress;
  }
});

export default PhoneLabPhTransition;
