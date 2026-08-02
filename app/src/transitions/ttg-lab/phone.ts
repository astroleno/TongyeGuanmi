import { createElement, useLayoutEffect, useMemo, useRef } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';
import { PHONE_TTG_LAB_ANIMATION_STOP } from '../../scenes/ttg-animation/phone/motion';

export const PHONE_TTG_LAB_DECISION = {
  strategy: 'desktop-overlay-dissolve',
  camera: 'stable-ttg-terminal-frame',
  topology: 'lab-receiver-over-retained-ttg-source',
  dissolveStart: PHONE_TTG_LAB_ANIMATION_STOP,
  forwardEndpoint: 'lab:reading-top',
  reverseEndpoint: 'ttg-animation:stable-terminal-then-reverse',
  rationale: 'Match desktop TTG → Lab: the same Lab document root dissolves over a fully presented TTG terminal frame. Reverse fades only Lab away, so Safari never composites the retained figure video through a translucent scene ancestor.'
} as const;

export type PhoneTtgLabFrame = Readonly<{
  progress: number;
  fromOpacity: number;
  toOpacity: number;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneTtgLabFrame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false,
  direction: 1 | -1 = 1
): PhoneTtgLabFrame {
  const chapterProgress = clamp(rawProgress);
  const progress = mediaFailed
    ? direction === 1 ? 1 : 0
    : reducedMotion ? chapterProgress <= 0 ? 0 : 1
      : clamp((chapterProgress - PHONE_TTG_LAB_ANIMATION_STOP)
        / (1 - PHONE_TTG_LAB_ANIMATION_STOP));
  return { progress, fromOpacity: 1, toOpacity: progress };
}

function applyEndpoint(
  element: HTMLElement | null,
  opacity: number,
  id: 'ttg-lab',
  documentFlow = false
): void {
  if (!element) return;
  if (documentFlow) {
    element.dataset.phoneDissolve = id;
    element.dataset.phoneDissolveOpacity = opacity.toFixed(4);
    element.style.opacity = opacity.toFixed(4);
    element.style.pointerEvents = 'none';
    element.inert = true;
    return;
  }
  const visible = opacity > .001;
  element.style.opacity = opacity.toFixed(4);
  element.style.visibility = visible ? 'visible' : 'hidden';
  element.style.pointerEvents = visible ? 'auto' : 'none';
  element.inert = !visible;
  element.dataset.phoneDissolve = id;
}

function clearEndpoint(element: HTMLElement | null, documentFlow = false): void {
  if (!element) return;
  if (documentFlow) {
    delete element.dataset.phoneDissolve;
    delete element.dataset.phoneDissolveOpacity;
    element.style.removeProperty('opacity');
    element.style.removeProperty('pointer-events');
    element.inert = false;
    return;
  }
  element.style.removeProperty('opacity');
  element.style.removeProperty('visibility');
  element.style.removeProperty('pointer-events');
  element.inert = false;
  delete element.dataset.phoneDissolve;
}

/** Legacy migration helper; the clean leaf never mutates scene endpoints. */
export function settlePhoneTtgLabDocumentFlow(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  applyEndpoint(from, 0, 'ttg-lab', true);
  clearEndpoint(to, true);
}

/** Between-plane command leaf; presentation owns source and receiver opacity. */
export function PhoneTtgLabTransition({
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
      const frame = phoneTtgLabFrame(progress, false, false, directionRef.current);
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      root.style.setProperty('--phone-ttg-lab-progress', frame.progress.toFixed(4));
    },
    settle(endpoint) {
      progressRef.current = endpoint;
      const frame = phoneTtgLabFrame(endpoint);
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      root.style.setProperty('--phone-ttg-lab-progress', frame.progress.toFixed(4));
    },
    pause() {},
    dispose() {
      const root = rootRef.current;
      if (!root) return;
      delete root.dataset.phoneTransitionProgress;
      root.style.removeProperty('--phone-ttg-lab-progress');
    }
  }), []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    reports.registerMount({
      root,
      surfaces: [{ id: 'between:ttg-lab', element: root, kind: 'dom' }],
      commands
    });
  }, [commands, reports]);

  return createElement('div', {
    ref: rootRef,
    'data-phone-transition': 'ttg-lab',
    'aria-hidden': 'true'
  });
}

export default PhoneTtgLabTransition;
export const phoneSegmentId = 'ttg-lab' as const;
