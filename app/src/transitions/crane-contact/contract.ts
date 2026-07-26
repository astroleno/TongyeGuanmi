import {
  renderContactEntrance,
  renderContactHold
} from '../../scenes/contact';
import { CRANE_CONTACT_COPY_CUE } from '../../story/crane-contact-contract';

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

function applyEndpointVisibility(
  element: HTMLElement | null,
  opacity: number,
  interactive = opacity >= 1 - ENDPOINT_EPSILON
): void {
  if (!element) return;
  element.style.opacity = opacity.toFixed(4);
  // Keep both endpoint layers on one persistent compositor topology. Opacity
  // owns visibility; interactive/inert still owns accessibility and input.
  element.style.visibility = 'visible';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
}

/**
 * The accepted Contact arrival point is canonical Crane playback plus the
 * manifest cue. The phone fallback is a deterministic dissolve at that cue.
 */
export const PHONE_CRANE_CONTACT_DECISION = Object.freeze({
  mode: 'endpoint-dissolve',
  source: 'desktop-crane-contact-copy-cue',
  topology: 'shared-boundary-contact-receiver-over-retained-crane-source',
  endpointPolicy: 'persistent-endpoint-opacity',
  reason: 'Crane stays snapped and opaque while the one native Contact root enters over its final authored fifth at the same document edge.'
} as const);

export const PHONE_CRANE_CONTACT_COPY_CUE = CRANE_CONTACT_COPY_CUE;

export type PhoneCraneContactFrame = Readonly<{
  progress: number;
  craneProgress: number;
  contactProgress: number;
  craneOpacity: number;
  contactOpacity: number;
  copyCueActive: boolean;
}>;

export function phoneCraneContactFrame(
  rawProgress: number,
  reducedMotion = false
): PhoneCraneContactFrame {
  const progress = transitionProgress(rawProgress, reducedMotion);
  const contactProgress = range01(
    progress,
    PHONE_CRANE_CONTACT_COPY_CUE.atProgress,
    1
  );
  return {
    progress,
    craneProgress: progress,
    contactProgress,
    craneOpacity: progress >= 1 - ENDPOINT_EPSILON ? 0 : 1,
    contactOpacity: contactProgress > ENDPOINT_EPSILON ? 1 : 0,
    copyCueActive: progress >= PHONE_CRANE_CONTACT_COPY_CUE.atProgress
  };
}

export function settlePhoneCraneContactDocumentFlow(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  // Match 35b0aee Figure3 → Services: do not clear and later recreate the
  // Contact paper compositor when reverse arms at this shared boundary.
  applyEndpointVisibility(from, 0, false);
  applyEndpointVisibility(to, 1, true);
  renderContactHold(to);
}

export function phoneCraneContactFallbackFrame(): PhoneCraneContactFrame {
  return phoneCraneContactFrame(1, true);
}

export function applyPhoneCraneContactFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  options: Readonly<{
    reducedMotion?: boolean;
    runId?: string;
    interactiveEndpoint?: boolean;
  }> = {}
): PhoneCraneContactFrame {
  const frame = phoneCraneContactFrame(rawProgress, options.reducedMotion);
  const runId = options.runId ?? 'phone-crane-contact:render';
  // Crane owns its media/player for the whole cinematic chapter. This
  // transition only reveals the Contact endpoint at the manifest cue, so it
  // cannot pause or retarget a live Crane video on scroll.
  renderContactEntrance(
    to,
    frame.contactProgress,
    frame.contactProgress,
    runId
  );
  applyEndpointVisibility(from, frame.craneOpacity, false);
  applyEndpointVisibility(
    to,
    frame.contactOpacity,
    (options.interactiveEndpoint ?? true)
      && frame.progress >= 1 - ENDPOINT_EPSILON
  );
  from?.setAttribute('data-phone-crane-contact-handoff', 'source');
  to?.setAttribute('data-phone-crane-contact-handoff', 'receiver');
  return frame;
}
