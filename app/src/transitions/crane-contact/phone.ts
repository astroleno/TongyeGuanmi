import { createElement, useLayoutEffect, useMemo, useRef } from 'react';
import {
  releaseContactEntrance,
  renderContactEntrance,
  renderContactHold
} from '../../scenes/contact';
import { storyManifest } from '../../story/manifest';
import type { SpineSegmentNode } from '../../story/types';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';
import './phone.css';

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
    craneOpacity: progress >= 1 - ENDPOINT_EPSILON ? 0 : 1,
    contactOpacity: contactProgress > ENDPOINT_EPSILON ? 1 : 0,
    copyCueActive: progress >= PHONE_CRANE_CONTACT_COPY_CUE.atProgress
  };
}

function closestElement(
  element: HTMLElement | null,
  selector: string
): HTMLElement | null {
  const candidate = element as (HTMLElement & {
    closest?: (value: string) => Element | null;
  }) | null;
  return candidate?.closest?.(selector) as HTMLElement | null ?? null;
}

function setContactOverlay(to: HTMLElement | null, active: boolean): void {
  const documentSlot = closestElement(
    to,
    '[data-phone-acceptance-chapter="contact"]'
  );
  if (active) {
    documentSlot?.setAttribute('data-phone-crane-contact-layer', 'true');
  } else {
    documentSlot?.removeAttribute('data-phone-crane-contact-layer');
  }
}

function clearEndpointVisibility(element: HTMLElement | null): void {
  if (!element) return;
  element.style.opacity = '';
  element.style.visibility = '';
  element.style.pointerEvents = '';
  element.inert = false;
  element.removeAttribute('aria-hidden');
}

export function settlePhoneCraneContactDocumentFlow(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  // Match 35b0aee Figure3 → Services: do not clear and later recreate the
  // Contact paper compositor when reverse arms at this shared boundary.
  applyEndpointVisibility(from, 0, false);
  setContactOverlay(to, false);
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
  setContactOverlay(to, frame.contactProgress > ENDPOINT_EPSILON);
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

export function disposePhoneCraneContactProjection(
  from: HTMLElement | null,
  to: HTMLElement | null,
  progress: number
): void {
  const endpoint = progress >= 1 - ENDPOINT_EPSILON ? 1 : 0;
  releaseContactEntrance(to, 'phone-crane-contact:phone', endpoint);
  if (endpoint === 1) renderContactHold(to);
  setContactOverlay(to, false);
  clearEndpointVisibility(from);
  clearEndpointVisibility(to);
}

/** Between-plane command leaf; presentation owns both endpoint trees. */
export function PhoneCraneContactTransition({ reports }: Readonly<{
  reports: PhoneLeafReportPort;
}>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind() {},
    activate(command): PhoneActivationInvocation {
      return {
        invocationId: command.invocationId,
        surfaceIds: command.surfaceIds,
        invoked: false,
        settlements: []
      };
    },
    render(rawProgress: number) {
      const frame = phoneCraneContactFrame(rawProgress);
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      root.style.setProperty(
        '--phone-crane-contact-progress', frame.contactProgress.toFixed(4)
      );
    },
    settle(endpoint) {
      const frame = phoneCraneContactFrame(endpoint);
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      root.style.setProperty(
        '--phone-crane-contact-progress', frame.contactProgress.toFixed(4)
      );
    },
    pause() {},
    dispose() {
      const root = rootRef.current;
      if (!root) return;
      delete root.dataset.phoneTransitionProgress;
      root.style.removeProperty('--phone-crane-contact-progress');
    }
  }), []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    reports.registerMount({
      root,
      surfaces: [{ id: 'between:crane-contact', element: root, kind: 'dom' }],
      commands
    });
  }, [commands, reports]);

  return createElement('div', {
    ref: rootRef,
    'data-phone-transition': 'crane-contact',
    'aria-hidden': 'true'
  });
}

export default PhoneCraneContactTransition;
