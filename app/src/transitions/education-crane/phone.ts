import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  prepareCraneAnimationFrame,
  renderCraneHold
} from '../../scenes/crane-animation';
import {
  applyPhoneCraneMediaFallback,
  parkPhoneCraneMedia
} from '../../scenes/crane-animation/phone/PhoneCrane';
import { renderEducationHold } from '../../scenes/education';
import type {
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../../production/phone/types';

const ENDPOINT_EPSILON = 0.001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function transitionProgress(rawProgress: number, reducedMotion: boolean): number {
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

/** A stable Education endpoint dissolves to the stable Crane camera. */
export const PHONE_EDUCATION_CRANE_DECISION = Object.freeze({
  mode: 'endpoint-dissolve',
  source: 'canonical-endpoints',
  reason: 'No verified phone-specific crane camera is approved for this bridge.'
} as const);

export type PhoneEducationCraneFrame = Readonly<{
  progress: number;
  educationOpacity: number;
  craneOpacity: number;
}>;

export function phoneEducationCraneFrame(
  rawProgress: number,
  reducedMotion = false
): PhoneEducationCraneFrame {
  const progress = transitionProgress(rawProgress, reducedMotion);
  return {
    progress,
    educationOpacity: 1 - progress,
    craneOpacity: progress
  };
}

export function applyPhoneEducationCraneFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  reducedMotion = false
): PhoneEducationCraneFrame {
  const frame = phoneEducationCraneFrame(rawProgress, reducedMotion);
  renderEducationHold(from);
  renderCraneHold(to);
  applyEndpointVisibility(from, frame.educationOpacity);
  applyEndpointVisibility(to, frame.craneOpacity);
  from?.setAttribute('data-phone-education-crane-handoff', 'source');
  to?.setAttribute('data-phone-education-crane-handoff', 'receiver');
  return frame;
}

export const PhoneEducationCraneTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
>(function PhoneEducationCraneTransition(
  { from, onReady, reducedMotion, to },
  forwardedRef
) {
  const prewarmRunRef = useRef(0);
  const render = useCallback((progress: number) => {
    applyPhoneEducationCraneFrame(from, to, progress, reducedMotion);
  }, [from, reducedMotion, to]);

  useEffect(() => {
    prewarmRunRef.current += 1;
    const run = prewarmRunRef.current;
    const controller = new AbortController();
    renderCraneHold(to);
    onReady?.();
    if (to && !reducedMotion) {
      void prepareCraneAnimationFrame(to, 0, {
        runId: `phone-education-crane:${run}`,
        direction: 1,
        reducedMotion,
        signal: controller.signal
      }).catch(() => {
        if (!controller.signal.aborted) applyPhoneCraneMediaFallback(to);
      });
    }
    return () => controller.abort();
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
    },
    dispose() {
      parkPhoneCraneMedia(to);
    }
  }), [render, to]);

  return null;
});

export default PhoneEducationCraneTransition;
