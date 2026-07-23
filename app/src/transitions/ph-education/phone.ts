import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle
} from 'react';
import { renderPhonePhPresentation } from '../../scenes/ph-animation/phone/PhonePh.motion';
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

function transitionProgress(rawProgress: number, reducedMotion: boolean): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

function applyDissolveEndpoint(
  element: HTMLElement | null,
  opacity: number,
  interactive: boolean
): void {
  if (!element) return;
  const visible = opacity > ENDPOINT_EPSILON;
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
  source: '4b861b58-ttg-lab-overlay-dissolve',
  topology: 'education-receiver-over-retained-ph-source',
  reason: 'Phone PH stays fully opaque while the one native Education root dissolves over its terminal frame.'
} as const);

export const PHONE_PH_EDUCATION_PLAYBACK_MS = PH_PLAYBACK_MS;
export const PHONE_PH_EDUCATION_DISSOLVE_MS = INTRA_CHAPTER_DISSOLVE_MS;

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
  // PhonePh has already completed its canonical native-clock run. This
  // adapter is only the short second leg from the desktop handoff.
  const phProgress = 1;
  const educationProgress = progress;
  return {
    progress,
    phProgress,
    educationProgress,
    phOpacity: 1,
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
  }> = {}
): PhonePhEducationFrame {
  const frame = phonePhEducationFrame(rawProgress, options.reducedMotion);
  // PH is the only owner of its video/clock. This Grade B bridge merely
  // holds its canonical visual endpoint while it dissolves to native reading.
  renderPhonePhPresentation(
    from,
    frame.phProgress,
    1,
    options.reducedMotion
  );
  // Desktop prepares Education's final hold before the dissolve. Keep the
  // same target state here and let the root opacity be the only bridge clock.
  renderEducationProgress(to, 1);
  // Match 4b861b58 TTG → Lab: never alpha-fade the retained media ancestor.
  // The receiver alone owns opacity and covers the source as one whole scene.
  applyDissolveEndpoint(from, frame.phOpacity, false);
  applyDissolveEndpoint(
    to,
    frame.educationOpacity,
    frame.educationOpacity >= 1 - ENDPOINT_EPSILON
  );
  from?.setAttribute('data-phone-ph-education-handoff', 'source');
  from?.setAttribute('data-phone-ph-education-fade-owner', 'scene-root');
  to?.setAttribute('data-phone-ph-education-handoff', 'receiver');
  to?.setAttribute('data-phone-ph-education-fade-owner', 'scene-root');
  return frame;
}

function setEducationOverlay(to: HTMLElement | null, active: boolean): void {
  const wrapper = to?.closest<HTMLElement>('.phone-education');
  const documentSlot = wrapper?.closest<HTMLElement>(
    '[data-phone-acceptance-chapter="education"]'
  );
  if (active) {
    to?.setAttribute('data-phone-ph-education-overlay', 'true');
    wrapper?.setAttribute('data-phone-ph-education-overlay-host', 'true');
    documentSlot?.setAttribute('data-phone-ph-education-overlay-layer', 'true');
  } else {
    to?.removeAttribute('data-phone-ph-education-overlay');
    wrapper?.removeAttribute('data-phone-ph-education-overlay-host');
    documentSlot?.removeAttribute('data-phone-ph-education-overlay-layer');
  }
}

function clearDissolveEndpoint(element: HTMLElement | null): void {
  if (!element) return;
  element.style.opacity = '';
  element.style.visibility = '';
  element.style.pointerEvents = '';
  element.inert = false;
  element.removeAttribute('aria-hidden');
}

/** Commit the fixed receiver back to its one native document position. */
export function settlePhonePhEducationDocumentFlow(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  applyDissolveEndpoint(from, 0, false);
  clearDissolveEndpoint(to);
}

export const PhonePhEducationTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
>(function PhonePhEducationTransition(
  { from, onReady, reducedMotion, to },
  forwardedRef
) {
  const render = useCallback((rawProgress: number) => {
    applyPhonePhEducationFrame(from, to, rawProgress, { reducedMotion });
  }, [from, reducedMotion, to]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useImperativeHandle(forwardedRef, () => ({
    render,
    enter() {
      setEducationOverlay(to, true);
      render(0);
    },
    leave() {
      render(1);
      settlePhonePhEducationDocumentFlow(from, to);
      setEducationOverlay(to, false);
    },
    reverse() {
      setEducationOverlay(to, true);
      render(1);
    },
    dispose() {
      setEducationOverlay(to, false);
      clearDissolveEndpoint(from);
      clearDissolveEndpoint(to);
    }
  }), [from, render, to]);

  return null;
});

export default PhonePhEducationTransition;
