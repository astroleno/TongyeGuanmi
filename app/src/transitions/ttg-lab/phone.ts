import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import type {
  Group45PhoneTransitionProps
} from '../../production/phone/adapter-groups/group4-5';
import type {
  PhoneTransitionAdapterHandle
} from '../../production/phone/types';
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
  direction: 1 | -1 = 1,
  terminalEndpoint: 0 | 1 | null = null
): PhoneTtgLabFrame {
  const chapterProgress = clamp(rawProgress);
  const progress = terminalEndpoint ?? (mediaFailed
    ? direction === 1 ? 1 : 0
    : reducedMotion ? chapterProgress <= 0 ? 0 : 1
      : clamp(
        (chapterProgress - PHONE_TTG_LAB_ANIMATION_STOP)
          / (1 - PHONE_TTG_LAB_ANIMATION_STOP)
      ));
  // TTG is the retained source plate. Lab alone owns the dissolve opacity:
  // fading the TTG ancestor makes Safari defer its alpha-video plane until
  // the ancestor returns to opacity 1, which hides the figure in reverse.
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
  const visible = opacity > 0.001;
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

/**
 * Lab returns to normal document flow at the forward endpoint, while TTG
 * stays at opacity zero until the fixed stage is retired. Clearing both
 * endpoints in the same frame briefly exposed TTG over the first Lab screen.
 */
export function settlePhoneTtgLabDocumentFlow(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  applyEndpoint(from, 0, 'ttg-lab', true);
  clearEndpoint(to, true);
}

/** TTG failure lands on Lab's stable reading root, which Unit 6 can consume. */
export const PhoneTtgLabTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  Group45PhoneTransitionProps
>(function PhoneTtgLabTransition(
  { host, from, to, reducedMotion, documentFlow = false, onReady },
  forwardedRef
) {
  const progressRef = useRef(0);
  const committedEndpointRef = useRef<0 | 1 | null>(null);
  // A media element may deliver one trailing timeline sample after the
  // controller releases geometry. Latch the committed endpoint so that
  // callback cannot erase the physical Lab (or rollback TTG) frame.
  const releasedEndpointRef = useRef<0 | 1 | null>(null);
  const directionRef = useRef<1 | -1>(1);
  const render = useCallback((rawProgress: number) => {
    const progress = clamp(rawProgress);
    if (progress > progressRef.current + 0.0001) directionRef.current = 1;
    if (progress < progressRef.current - 0.0001) directionRef.current = -1;
    progressRef.current = progress;
    const mediaFailed = from?.dataset.phoneMediaState === 'fallback'
      || to?.dataset.phoneMediaState === 'fallback';
    const frame = phoneTtgLabFrame(
      progress,
      reducedMotion,
      mediaFailed,
      directionRef.current,
      releasedEndpointRef.current
    );
    if (import.meta.env.DEV && host) {
      host.dataset.phoneTransition = 'ttg-lab:desktop-overlay-dissolve';
      host.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
    }
    applyEndpoint(
      from,
      frame.fromOpacity,
      'ttg-lab',
      documentFlow
    );
    applyEndpoint(
      to,
      frame.toOpacity,
      'ttg-lab',
      documentFlow
    );
  }, [documentFlow, from, host, reducedMotion, to]);

  useLayoutEffect(() => {
    onReady?.();
    return () => {
      clearEndpoint(from, documentFlow);
      clearEndpoint(to, documentFlow);
      if (
        import.meta.env.DEV
        && host?.dataset.phoneTransition?.startsWith('ttg-lab:')
      ) {
        delete host.dataset.phoneTransition;
        delete host.dataset.phoneTransitionProgress;
      }
    };
  }, [documentFlow, from, host, onReady, render, to]);

  useImperativeHandle(forwardedRef, () => ({
    render,
    begin() {
      committedEndpointRef.current = null;
      releasedEndpointRef.current = null;
    },
    commitEndpoint(endpoint) {
      committedEndpointRef.current = endpoint;
      render(endpoint);
    },
    releaseEndpoint() {
      const endpoint = committedEndpointRef.current;
      if (endpoint !== null) releasedEndpointRef.current = endpoint;
      if (endpoint === 1 && documentFlow) {
        settlePhoneTtgLabDocumentFlow(from, to);
      }
      committedEndpointRef.current = null;
    },
    enter() {
      directionRef.current = 1;
      progressRef.current = 0;
      render(0);
    },
    leave() {
      directionRef.current = 1;
      progressRef.current = 1;
      render(1);
      if (documentFlow) {
        settlePhoneTtgLabDocumentFlow(from, to);
      } else {
        clearEndpoint(from);
        clearEndpoint(to);
      }
    },
    reverse() {
      directionRef.current = -1;
      progressRef.current = 1;
      render(1);
    },
    dispose() {
      committedEndpointRef.current = null;
      releasedEndpointRef.current = null;
      clearEndpoint(from, documentFlow);
      clearEndpoint(to, documentFlow);
    }
  }), [documentFlow, from, render, to]);

  return null;
});

export default PhoneTtgLabTransition;
