import { renderPhonePhPresentation } from '../../scenes/ph-animation/phone/PhonePh.motion';
import { renderEducationProgress } from '../../scenes/education';
import {
  INTRA_CHAPTER_DISSOLVE_MS,
  PH_PLAYBACK_MS
} from '../../story/timings';

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

function applyDissolveEndpoint(
  element: HTMLElement | null,
  opacity: number,
  interactive: boolean
): void {
  if (!element) return;
  element.style.opacity = opacity.toFixed(4);
  // 35b0aee keeps document-flow endpoints composited at opacity zero. Their
  // accessibility and input ownership still follow the interactive flag.
  element.style.visibility = 'visible';
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
  endpointPolicy: 'persistent-endpoint-opacity',
  reason: 'Phone PH stays fully opaque while the one native Education root dissolves over its terminal frame.'
} as const);

export const PHONE_PH_EDUCATION_PLAYBACK_MS = PH_PLAYBACK_MS;
export const PHONE_PH_EDUCATION_DISSOLVE_MS = INTRA_CHAPTER_DISSOLVE_MS;
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
  const phProgress = range01(
    progress,
    0,
    PHONE_PH_EDUCATION_ANIMATION_STOP
  );
  const educationProgress = range01(
    progress,
    PHONE_PH_EDUCATION_ANIMATION_STOP,
    1
  );
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

/**
 * Reverse playback is owned by PhonePh. This receiver-only sample lets the
 * native Education page dissolve away without writing PH back to its terminal
 * frame on every reverse animation tick.
 */
export function applyPhonePhEducationReverseFrame(
  to: HTMLElement | null,
  rawProgress: number,
  reducedMotion = false
): PhonePhEducationFrame {
  const frame = phonePhEducationFrame(rawProgress, reducedMotion);
  renderEducationProgress(to, 1);
  applyDissolveEndpoint(to, frame.educationOpacity, false);
  return frame;
}

/** Commit the receiver at the same shared document boundary as the PH marker. */
export function settlePhonePhEducationDocumentFlow(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  // 35b0aee: keep both endpoints on the same compositor topology after the
  // forward handoff. Reverse can then arm without rebuilding Education's
  // paper layer or PH's hidden retained source.
  applyDissolveEndpoint(from, 0, false);
  applyDissolveEndpoint(to, 1, true);
}
