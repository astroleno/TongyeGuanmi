import { createPhoneInkAdapter } from '../../production/phone/transitions/PhoneInkTransition';
import { renderPhonePhPresentation } from '../../scenes/ph-animation/phone/PhonePh.motion';
import './phone.css';

const field = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'phone-lab-ph-r5'
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

export const PhoneLabPhTransition = createPhoneInkAdapter({
  id: 'phone-lab-ph-ink',
  field,
  grade: 'edge-bright',
  canvasClassName: 'phone-lab-ph__ink',
  maskSource: false,
  releaseOnLeave: true,
  renderFrame(from, to, rawProgress, reducedMotion) {
    const progress = reducedMotion ? (rawProgress < 0.5 ? 0 : 1) : rawProgress;
    if (!to?.dataset.phonePhProgress) {
      renderPhonePhPresentation(to, 0, 1, reducedMotion);
    }
    renderEndpoint(from, progress < 0.999);
    renderEndpoint(to, false);
    return progress;
  }
});

export default PhoneLabPhTransition;
