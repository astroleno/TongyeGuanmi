import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  releaseContactEntrance,
  renderContactEntrance,
  renderContactHold
} from '../../scenes/contact';
import { storyManifest } from '../../story/manifest';
import type { SpineSegmentNode } from '../../story/types';
import type {
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../../production/phone/types';

const ENDPOINT_EPSILON = 0.001;

function craneContactCopyCue() {
  const segment = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => (
      node.kind === 'segment' && node.id === 'crane-contact'
    )
  );
  if (!segment?.copyCue) {
    throw new Error('crane-contact copy cue is required by the product manifest');
  }
  return segment.copyCue;
}

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
 * The accepted Contact arrival point is canonical Crane playback plus the
 * manifest cue. The phone fallback is a deterministic dissolve at that cue.
 */
export const PHONE_CRANE_CONTACT_DECISION = Object.freeze({
  mode: 'endpoint-dissolve',
  source: 'manifest-copy-cue',
  reason: 'Contact keeps a stable accessible terminal rather than an unverified camera.'
} as const);

export const PHONE_CRANE_CONTACT_COPY_CUE = craneContactCopyCue();

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
    craneOpacity: 1 - contactProgress,
    contactOpacity: contactProgress,
    copyCueActive: progress >= PHONE_CRANE_CONTACT_COPY_CUE.atProgress
  };
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
  }> = {}
): PhoneCraneContactFrame {
  const frame = phoneCraneContactFrame(rawProgress, options.reducedMotion);
  const runId = options.runId ?? 'phone-crane-contact:render';
  // Crane owns its media/player for the whole cinematic chapter. This
  // transition only reveals the Contact endpoint at the manifest cue, so it
  // cannot pause or retarget a live Crane video on scroll.
  renderContactEntrance(
    to,
    frame.copyCueActive ? 1 : 0,
    frame.contactProgress,
    runId
  );
  applyEndpointVisibility(from, frame.craneOpacity);
  applyEndpointVisibility(to, frame.contactOpacity);
  from?.setAttribute('data-phone-crane-contact-handoff', 'source');
  to?.setAttribute('data-phone-crane-contact-handoff', 'receiver');
  return frame;
}

export const PhoneCraneContactTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
>(function PhoneCraneContactTransition(
  { from, onReady, reducedMotion, to },
  forwardedRef
) {
  const lastProgressRef = useRef(0);

  const render = useCallback((rawProgress: number) => {
    const progress = transitionProgress(rawProgress, reducedMotion);
    lastProgressRef.current = progress;
    const runId = 'phone-crane-contact:phone';
    applyPhoneCraneContactFrame(from, to, rawProgress, {
      reducedMotion,
      runId
    });
  }, [from, reducedMotion, to]);

  useEffect(() => {
    renderContactHold(to);
    onReady?.();
  }, [from, onReady, reducedMotion, to]);

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
      const endpoint = lastProgressRef.current >= 1 - ENDPOINT_EPSILON ? 1 : 0;
      releaseContactEntrance(to, 'phone-crane-contact:phone', endpoint);
      if (endpoint === 1) renderContactHold(to);
    }
  }), [render, to]);

  return null;
});

export default PhoneCraneContactTransition;
