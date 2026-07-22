import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle
} from 'react';
import {
  renderPhHold
} from '../../scenes/ph-animation';
import type {
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../../production/phone/types';

const ENDPOINT_EPSILON = 0.001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function endpointProgress(rawProgress: number, reducedMotion: boolean): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

function applyEndpointVisibility(element: HTMLElement | null, opacity: number): void {
  if (!element) return;
  const visible = opacity > ENDPOINT_EPSILON;
  const interactive = opacity >= 1 - ENDPOINT_EPSILON;
  element.style.opacity = opacity.toFixed(4);
  element.style.visibility = visible ? 'visible' : 'hidden';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
}

/**
 * No physical-phone Lab → PH camera has been approved yet. Use the shared
 * handoff endpoints and a deterministic dissolve until Unit 7 receives the
 * final Lab integration commit.
 */
export const PHONE_LAB_PH_DECISION = Object.freeze({
  mode: 'endpoint-dissolve',
  source: 'shared-adapter-handoff',
  reason: 'No verified phone camera is available at the Unit 6 boundary.'
} as const);

export type PhoneLabPhFrame = Readonly<{
  progress: number;
  labOpacity: number;
  phOpacity: number;
  phProgress: 0;
}>;

export function phoneLabPhFrame(
  rawProgress: number,
  reducedMotion = false
): PhoneLabPhFrame {
  const progress = endpointProgress(rawProgress, reducedMotion);
  return {
    progress,
    labOpacity: 1 - progress,
    phOpacity: progress,
    phProgress: 0
  };
}

/**
 * Consumes only generic from/to endpoints supplied by the phone adapter
 * coordinator. It deliberately has no PhoneLab import or ref.
 */
export function applyPhoneLabPhFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  reducedMotion = false
): PhoneLabPhFrame {
  const frame = phoneLabPhFrame(rawProgress, reducedMotion);
  renderPhHold(to);
  applyEndpointVisibility(from, frame.labOpacity);
  applyEndpointVisibility(to, frame.phOpacity);
  from?.setAttribute('data-phone-lab-ph-handoff', 'source');
  to?.setAttribute('data-phone-lab-ph-handoff', 'receiver');
  return frame;
}

export const PhoneLabPhTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
>(function PhoneLabPhTransition({ from, onReady, reducedMotion, to }, forwardedRef) {
  const render = useCallback((progress: number) => {
    applyPhoneLabPhFrame(from, to, progress, reducedMotion);
  }, [from, reducedMotion, to]);

  useEffect(() => {
    renderPhHold(to);
    onReady?.();
  }, [onReady, reducedMotion, to]);

  useImperativeHandle(forwardedRef, () => ({
    render,
    enter() {
      render(0);
    },
    leave() {
      render(1);
    },
    reverse() {
      render(0);
    }
  }), [render]);

  return null;
});

export default PhoneLabPhTransition;
