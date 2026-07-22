import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  renderPhAnimationProgress,
  type PhMediaRun
} from '../../scenes/ph-animation';
import {
  renderPhonePhAnimationProgress
} from '../../scenes/ph-animation/phone/PhonePh';
import { renderEducationProgress } from '../../scenes/education';
import {
  INTRA_CHAPTER_DISSOLVE_MS,
  PH_PLAYBACK_MS
} from '../../story/timings';
import type {
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../../production/phone/types';

const ENDPOINT_EPSILON = 0.001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range01(value: number, start: number, end: number): number {
  return clamp((value - start) / Math.max(0.0001, end - start));
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

/**
 * Keep the canonical PH playback duration and then dissolve immediately into
 * Education. There is no extra document hold between the two endpoints.
 */
export const PHONE_PH_EDUCATION_DECISION = Object.freeze({
  mode: 'endpoint-dissolve',
  source: 'canonical-ph-timing',
  reason: 'The validated phone endpoint is PH terminal frame plus native Education.'
} as const);

export const PHONE_PH_EDUCATION_ANIMATION_STOP = PH_PLAYBACK_MS
  / (PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);

export type PhonePhEducationFrame = Readonly<{
  progress: number;
  phProgress: number;
  educationProgress: number;
  phOpacity: number;
  educationOpacity: number;
}>;

export function phonePhEducationFrame(
  rawProgress: number,
  reducedMotion = false
): PhonePhEducationFrame {
  const progress = transitionProgress(rawProgress, reducedMotion);
  const phProgress = clamp(progress / PHONE_PH_EDUCATION_ANIMATION_STOP);
  const educationProgress = range01(
    progress,
    PHONE_PH_EDUCATION_ANIMATION_STOP,
    1
  );
  return {
    progress,
    phProgress,
    educationProgress,
    phOpacity: 1 - educationProgress,
    educationOpacity: educationProgress
  };
}

export function phonePhEducationFallbackFrame(): PhonePhEducationFrame {
  return phonePhEducationFrame(1, true);
}

export function applyPhonePhEducationFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  options: Readonly<{
    reducedMotion?: boolean;
    mediaRun?: PhMediaRun;
  }> = {}
): PhonePhEducationFrame {
  const frame = phonePhEducationFrame(rawProgress, options.reducedMotion);
  if (options.mediaRun) {
    renderPhonePhAnimationProgress(from, frame.phProgress, options.mediaRun);
  } else {
    renderPhAnimationProgress(from, frame.phProgress);
  }
  renderEducationProgress(to, frame.educationProgress);
  applyEndpointVisibility(from, frame.phOpacity);
  applyEndpointVisibility(to, frame.educationOpacity);
  from?.setAttribute('data-phone-ph-education-handoff', 'source');
  to?.setAttribute('data-phone-ph-education-handoff', 'receiver');
  return frame;
}

export const PhonePhEducationTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
>(function PhonePhEducationTransition(
  { from, onReady, reducedMotion, to },
  forwardedRef
) {
  const lastProgressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const revisionRef = useRef(0);

  const render = useCallback((rawProgress: number) => {
    const progress = transitionProgress(rawProgress, reducedMotion);
    if (progress > lastProgressRef.current + ENDPOINT_EPSILON) {
      if (directionRef.current !== 1) revisionRef.current += 1;
      directionRef.current = 1;
    } else if (progress < lastProgressRef.current - ENDPOINT_EPSILON) {
      if (directionRef.current !== -1) revisionRef.current += 1;
      directionRef.current = -1;
    }
    lastProgressRef.current = progress;
    const mediaRun: PhMediaRun = {
      runId: `phone-ph-education:${directionRef.current}:${revisionRef.current}`,
      direction: directionRef.current,
      reducedMotion
    };
    applyPhonePhEducationFrame(from, to, rawProgress, { mediaRun, reducedMotion });
  }, [from, reducedMotion, to]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

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

export default PhonePhEducationTransition;
