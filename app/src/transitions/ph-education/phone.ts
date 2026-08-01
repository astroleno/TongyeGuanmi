import { createElement, useLayoutEffect, useMemo, useRef } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';
import { renderPhonePhPresentation } from '../../scenes/ph-animation/phone/PhonePh.motion';
import { renderEducationProgress } from '../../scenes/education';
import {
  INTRA_CHAPTER_DISSOLVE_MS,
  PH_PLAYBACK_MS
} from '../../story/timings';

const ENDPOINT_EPSILON = .001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range01(value: number, start: number, end: number): number {
  return clamp((value - start) / Math.max(.0001, end - start));
}

function transitionProgress(rawProgress: number, reducedMotion: boolean): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < .5 ? 0 : 1) : progress;
}

function applyDissolveEndpoint(
  element: HTMLElement | null,
  opacity: number,
  interactive: boolean
): void {
  if (!element) return;
  element.style.opacity = opacity.toFixed(4);
  element.style.visibility = 'visible';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
}

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
  const phProgress = range01(progress, 0, PHONE_PH_EDUCATION_ANIMATION_STOP);
  const educationProgress = range01(
    progress, PHONE_PH_EDUCATION_ANIMATION_STOP, 1
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

/** Stateless compatibility projection for the old acceptance shell only. */
export function applyPhonePhEducationFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  options: Readonly<{ reducedMotion?: boolean }> = {}
): PhonePhEducationFrame {
  const frame = phonePhEducationFrame(rawProgress, options.reducedMotion);
  renderPhonePhPresentation(
    from, frame.phProgress, 1, options.reducedMotion
  );
  renderEducationProgress(to, 1);
  applyDissolveEndpoint(from, frame.phOpacity, false);
  applyDissolveEndpoint(
    to, frame.educationOpacity,
    frame.educationOpacity >= 1 - ENDPOINT_EPSILON
  );
  from?.setAttribute('data-phone-ph-education-handoff', 'source');
  from?.setAttribute('data-phone-ph-education-fade-owner', 'scene-root');
  to?.setAttribute('data-phone-ph-education-handoff', 'receiver');
  to?.setAttribute('data-phone-ph-education-fade-owner', 'scene-root');
  return frame;
}

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

export function settlePhonePhEducationDocumentFlow(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  applyDissolveEndpoint(from, 0, false);
  applyDissolveEndpoint(to, 1, true);
}

/** Between-plane command leaf; presentation owns source and receiver opacity. */
export function PhonePhEducationTransition({ reports }: Readonly<{
  reports: PhoneLeafReportPort;
}>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(0);
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
      const frame = phonePhEducationFrame(rawProgress);
      progressRef.current = frame.progress;
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      root.style.setProperty(
        '--phone-ph-education-progress', frame.educationProgress.toFixed(4)
      );
    },
    settle(endpoint) {
      progressRef.current = endpoint;
      const frame = phonePhEducationFrame(endpoint);
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      root.style.setProperty(
        '--phone-ph-education-progress', frame.educationProgress.toFixed(4)
      );
    },
    pause() {},
    dispose() {
      const root = rootRef.current;
      if (!root) return;
      delete root.dataset.phoneTransitionProgress;
      root.style.removeProperty('--phone-ph-education-progress');
    }
  }), []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    reports.registerMount({
      root,
      surfaces: [{ id: 'between:ph-education', element: root, kind: 'dom' }],
      commands
    });
  }, [commands, reports]);

  return createElement('div', {
    ref: rootRef,
    'data-phone-transition': 'ph-education',
    'aria-hidden': 'true'
  });
}

export default PhonePhEducationTransition;
