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

export const PHONE_TTG_LAB_DECISION = {
  strategy: 'endpoint-dissolve',
  camera: 'none',
  forwardEndpoint: 'lab:reading-top',
  reverseEndpoint: 'ttg-animation:stable-initial-frame',
  rationale: 'TTG retains its one local media owner; a stable dissolve removes the unvalidated phone hold from the original staged bridge.'
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
  const progress = mediaFailed
    ? direction === 1 ? 1 : 0
    : reducedMotion ? rawProgress <= 0 ? 0 : 1
      : clamp(rawProgress);
  return { progress, fromOpacity: 1 - progress, toOpacity: progress };
}

function applyEndpoint(
  element: HTMLElement | null,
  opacity: number,
  id: 'ttg-lab'
): void {
  if (!element) return;
  const visible = opacity > 0.001;
  element.style.opacity = opacity.toFixed(4);
  element.style.visibility = visible ? 'visible' : 'hidden';
  element.style.pointerEvents = visible ? 'auto' : 'none';
  element.inert = !visible;
  element.dataset.phoneDissolve = id;
}

function clearEndpoint(element: HTMLElement | null): void {
  if (!element) return;
  element.style.removeProperty('opacity');
  element.style.removeProperty('visibility');
  element.style.removeProperty('pointer-events');
  element.inert = false;
  delete element.dataset.phoneDissolve;
}

/** TTG failure lands on Lab's stable reading root, which Unit 6 can consume. */
export const PhoneTtgLabTransition = forwardRef<
  TransitionPresentationAdapterHandle,
  Group45PhoneTransitionProps
>(function PhoneTtgLabTransition(
  { host, from, to, reducedMotion, onReady },
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
    const frame = phoneTtgLabFrame(
      progress,
      reducedMotion,
      mediaFailed,
      directionRef.current
    );
    if (host) {
      host.dataset.phoneTransition = 'ttg-lab:endpoint-dissolve';
      host.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
    }
    applyEndpoint(from, frame.fromOpacity, 'ttg-lab');
    applyEndpoint(to, frame.toOpacity, 'ttg-lab');
  }, [from, host, reducedMotion, to]);

  useLayoutEffect(() => {
    render(0);
    onReady?.();
    return () => {
      clearEndpoint(from);
      clearEndpoint(to);
      if (host?.dataset.phoneTransition?.startsWith('ttg-lab:')) {
        delete host.dataset.phoneTransition;
        delete host.dataset.phoneTransitionProgress;
      }
    };
  }, [from, host, onReady, render, to]);

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
      clearEndpoint(from);
      clearEndpoint(to);
    }
  }), [from, render, to]);

  return null;
});

export default PhoneTtgLabTransition;
