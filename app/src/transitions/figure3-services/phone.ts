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
import type { TransitionPresentationAdapterHandle } from '../../story/presentation';

export const PHONE_FIGURE3_SERVICES_DECISION = {
  strategy: 'endpoint-dissolve',
  camera: 'none',
  forwardEndpoint: 'services:reading-top',
  reverseEndpoint: 'figure3-animation:stable-initial-frame',
  rationale: 'The source video already owns local playback; an unvalidated phone camera would add a second timing owner.'
} as const;

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
      : clamp(rawProgress);
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
    return;
  }
  element.style.removeProperty('opacity');
  element.style.removeProperty('visibility');
  element.style.removeProperty('pointer-events');
  element.inert = false;
  delete element.dataset.phoneDissolve;
}

/** Figure3 media failure resolves directly to the Services reading endpoint. */
export const PhoneFigure3ServicesTransition = forwardRef<
  TransitionPresentationAdapterHandle,
  Group45PhoneTransitionProps
>(function PhoneFigure3ServicesTransition(
  { host, from, to, reducedMotion, documentFlow = false, onReady },
  forwardedRef
) {
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const render = useCallback((rawProgress: number) => {
    const progress = clamp(rawProgress);
    if (progress > progressRef.current + 0.0001) directionRef.current = 1;
    if (progress < progressRef.current - 0.0001) directionRef.current = -1;
    progressRef.current = progress;
    const mediaFailed = from?.dataset.phoneMediaState === 'fallback'
      || to?.dataset.phoneMediaState === 'fallback';
    const frame = phoneFigure3ServicesFrame(
      progress,
      reducedMotion,
      mediaFailed,
      directionRef.current
    );
    if (host) {
      host.dataset.phoneTransition = 'figure3-services:endpoint-dissolve';
      host.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
    }
    applyEndpoint(from, frame.fromOpacity, 'figure3-services', documentFlow);
    applyEndpoint(to, frame.toOpacity, 'figure3-services', documentFlow);
  }, [documentFlow, from, host, reducedMotion, to]);

  useLayoutEffect(() => {
    render(0);
    onReady?.();
    return () => {
      clearEndpoint(from, documentFlow);
      clearEndpoint(to, documentFlow);
      if (host?.dataset.phoneTransition?.startsWith('figure3-services:')) {
        delete host.dataset.phoneTransition;
        delete host.dataset.phoneTransitionProgress;
      }
    };
  }, [documentFlow, from, host, onReady, render, to]);

  useImperativeHandle(forwardedRef, () => ({
    render,
    enter() {
      directionRef.current = 1;
      render(0);
    },
    leave() {
      directionRef.current = 1;
      render(1);
    },
    reverse() {
      directionRef.current = -1;
      render(0);
    },
    dispose() {
      clearEndpoint(from, documentFlow);
      clearEndpoint(to, documentFlow);
    }
  }), [documentFlow, from, render, to]);

  return null;
});

export default PhoneFigure3ServicesTransition;
