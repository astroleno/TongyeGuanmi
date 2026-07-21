import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  prepareCraneAnimationFrame,
  renderCraneAnimationProgress,
  type CraneMediaRun
} from '../../scenes/crane-animation';
import {
  applyPhoneCraneMediaFallback,
  parkPhoneCraneMedia
} from '../../scenes/crane-animation/phone/PhoneCrane';
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
    mediaRun?: CraneMediaRun;
    runId?: string;
  }> = {}
): PhoneCraneContactFrame {
  const frame = phoneCraneContactFrame(rawProgress, options.reducedMotion);
  const runId = options.runId ?? 'phone-crane-contact:render';
  renderCraneAnimationProgress(
    from,
    frame.craneProgress,
    options.mediaRun ? { mediaRun: options.mediaRun } : undefined
  );
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
  const directionRef = useRef<1 | -1>(1);
  const revisionRef = useRef(0);
  const mediaFailedRef = useRef(false);
  const parkedAtEndpointRef = useRef(false);

  const render = useCallback((rawProgress: number) => {
    const requested = mediaFailedRef.current ? 1 : rawProgress;
    const progress = transitionProgress(requested, reducedMotion);
    if (progress > lastProgressRef.current + ENDPOINT_EPSILON) {
      if (directionRef.current !== 1) revisionRef.current += 1;
      directionRef.current = 1;
    } else if (progress < lastProgressRef.current - ENDPOINT_EPSILON) {
      if (directionRef.current !== -1) revisionRef.current += 1;
      directionRef.current = -1;
    }
    lastProgressRef.current = progress;
    const runId = `phone-crane-contact:${directionRef.current}:${revisionRef.current}`;
    const mediaRun: CraneMediaRun = {
      runId,
      direction: directionRef.current,
      nativePlayback: false,
      reducedMotion
    };
    const frame = applyPhoneCraneContactFrame(from, to, requested, {
      mediaRun,
      reducedMotion,
      runId
    });
    if (frame.progress >= 1 - ENDPOINT_EPSILON) {
      if (!parkedAtEndpointRef.current) {
        parkPhoneCraneMedia(from);
        parkedAtEndpointRef.current = true;
      }
    } else {
      parkedAtEndpointRef.current = false;
    }
  }, [from, reducedMotion, to]);

  useEffect(() => {
    mediaFailedRef.current = false;
    parkedAtEndpointRef.current = false;
    const controller = new AbortController();
    renderContactHold(to);
    onReady?.();
    if (from && !reducedMotion) {
      void prepareCraneAnimationFrame(from, 0, {
        runId: 'phone-crane-contact:prewarm',
        direction: 1,
        reducedMotion,
        signal: controller.signal
      }).catch(() => {
        if (controller.signal.aborted) return;
        mediaFailedRef.current = true;
        applyPhoneCraneMediaFallback(from);
        renderContactHold(to);
        applyPhoneCraneContactFrame(from, to, 1, {
          reducedMotion: true,
          runId: 'phone-crane-contact:fallback'
        });
      });
    }
    return () => controller.abort();
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
      const runId = `phone-crane-contact:${directionRef.current}:${revisionRef.current}`;
      releaseContactEntrance(to, runId, endpoint);
      if (endpoint === 1) renderContactHold(to);
      parkPhoneCraneMedia(from);
    }
  }), [from, render, to]);

  return null;
});

export default PhoneCraneContactTransition;
