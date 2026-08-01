import { createElement, useLayoutEffect, useMemo, useRef } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';

export const PHONE_FIGURE3_SERVICES_DECISION = {
  strategy: 'endpoint-dissolve',
  camera: 'none',
  topology: 'persistent-endpoint-opacity',
  copyCueProgress: .8,
  receiverOwner: 'services:document-root',
  receiverCopies: 1,
  forwardEndpoint: 'services:reading-top',
  reverseEndpoint: 'figure3-animation:stable-initial-frame',
  rationale: 'Figure3 and the one Services document root share a boundary; the source video remains the sole clock and Services enters over its final 20%.'
} as const;

export const PHONE_FIGURE3_SERVICES_START_PROGRESS = .8;

export type PhoneFigure3ServicesFrame = Readonly<{
  progress: number;
  fromOpacity: number;
  toOpacity: number;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneFigure3ServicesFrame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false,
  direction: 1 | -1 = 1
): PhoneFigure3ServicesFrame {
  const progress = mediaFailed
    ? direction === 1 ? 1 : 0
    : reducedMotion ? rawProgress <= 0 ? 0 : 1
      : clamp(
        (clamp(rawProgress) - PHONE_FIGURE3_SERVICES_START_PROGRESS)
          / (1 - PHONE_FIGURE3_SERVICES_START_PROGRESS)
      );
  return { progress, fromOpacity: 1 - progress, toOpacity: progress };
}

function applyEndpoint(
  element: HTMLElement | null,
  opacity: number,
  id: 'figure3-services',
  documentFlow = false
): void {
  if (!element) return;
  if (documentFlow) {
    element.dataset.phoneDissolve = id;
    element.dataset.phoneDissolveOpacity = opacity.toFixed(4);
    element.style.opacity = opacity.toFixed(4);
    return;
  }
  const visible = opacity > .001;
  element.style.opacity = opacity.toFixed(4);
  element.style.visibility = visible ? 'visible' : 'hidden';
  element.style.pointerEvents = visible ? 'auto' : 'none';
  element.inert = !visible;
  element.dataset.phoneDissolve = id;
}

/** Legacy migration helper; the clean leaf never mutates scene endpoints. */
export function settlePhoneFigure3ServicesDocumentFlow(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  applyEndpoint(from, 0, 'figure3-services', true);
  applyEndpoint(to, 1, 'figure3-services', true);
}

export function PhoneFigure3ServicesTransition({
  reports
}: Readonly<{ reports: PhoneLeafReportPort }>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind() {},
    activate(command): PhoneActivationInvocation {
      return { invocationId: command.invocationId, surfaceIds: command.surfaceIds,
        invoked: false, settlements: [] };
    },
    render(rawProgress: number) {
      const progress = clamp(rawProgress);
      if (progress > progressRef.current + .0001) directionRef.current = 1;
      if (progress < progressRef.current - .0001) directionRef.current = -1;
      progressRef.current = progress;
      const frame = phoneFigure3ServicesFrame(progress, false, false, directionRef.current);
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      root.style.setProperty('--phone-figure3-services-progress', frame.progress.toFixed(4));
    },
    settle(endpoint) {
      progressRef.current = endpoint;
      const frame = phoneFigure3ServicesFrame(endpoint);
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      root.style.setProperty('--phone-figure3-services-progress', frame.progress.toFixed(4));
    },
    pause() {},
    dispose() {
      const root = rootRef.current;
      if (!root) return;
      delete root.dataset.phoneTransitionProgress;
      root.style.removeProperty('--phone-figure3-services-progress');
    }
  }), []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    reports.registerMount({
      root,
      surfaces: [{ id: 'between:figure3-services', element: root, kind: 'dom' }],
      commands
    });
  }, [commands, reports]);

  return createElement('div', {
    ref: rootRef,
    'data-phone-transition': 'figure3-services',
    'aria-hidden': 'true'
  });
}

export default PhoneFigure3ServicesTransition;
