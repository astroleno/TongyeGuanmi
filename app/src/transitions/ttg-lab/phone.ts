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
import { PHONE_TTG_LAB_ANIMATION_STOP } from '../../scenes/ttg-animation/phone/motion';
import type { TransitionPresentationAdapterHandle } from '../../story/presentation';

export const PHONE_TTG_LAB_DECISION = {
  strategy: 'desktop-timed-dissolve',
  camera: 'stable-ttg-terminal-frame',
  dissolveStart: PHONE_TTG_LAB_ANIMATION_STOP,
  forwardEndpoint: 'lab:reading-top',
  reverseEndpoint: 'ttg-animation:stable-terminal-then-reverse',
  rationale: 'Match desktop TTG → Lab: finish TTG media, then dissolve the same Lab document root over the final 600 ms. Reverse prepares TTG terminal before uncovering it.'
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
      : clamp(
        (chapterProgress - PHONE_TTG_LAB_ANIMATION_STOP)
          / (1 - PHONE_TTG_LAB_ANIMATION_STOP)
      );
  return { progress, fromOpacity: 1 - progress, toOpacity: progress };
}

function applyEndpoint(
  element: HTMLElement | null,
  opacity: number,
  id: 'ttg-lab',
  role: 'from' | 'to',
  documentFlow = false
): void {
  if (!element) return;
  if (documentFlow) {
    element.dataset.phoneDissolve = id;
    element.dataset.phoneDissolveOpacity = opacity.toFixed(4);
    if (role === 'from') {
      if (opacity >= .999) element.style.removeProperty('opacity');
      else element.style.opacity = opacity.toFixed(4);
    } else if (opacity > .001) {
      element.dataset.phoneTtgLabBridge = 'active';
      element.style.setProperty(
        '--phone-ttg-lab-bridge-opacity',
        opacity.toFixed(4)
      );
    } else {
      delete element.dataset.phoneTtgLabBridge;
      element.style.removeProperty('--phone-ttg-lab-bridge-opacity');
    }
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
    delete element.dataset.phoneTtgLabBridge;
    element.style.removeProperty('opacity');
    element.style.removeProperty('--phone-ttg-lab-bridge-opacity');
    return;
  }
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
    const frame = phoneTtgLabFrame(
      progress,
      reducedMotion,
      mediaFailed,
      directionRef.current
    );
    if (host) {
      host.dataset.phoneTransition = 'ttg-lab:desktop-timed-dissolve';
      host.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
    }
    applyEndpoint(from, frame.fromOpacity, 'ttg-lab', 'from', documentFlow);
    applyEndpoint(to, frame.toOpacity, 'ttg-lab', 'to', documentFlow);
  }, [documentFlow, from, host, reducedMotion, to]);

  useLayoutEffect(() => {
    render(0);
    onReady?.();
    return () => {
      clearEndpoint(from, documentFlow);
      clearEndpoint(to, documentFlow);
      if (host?.dataset.phoneTransition?.startsWith('ttg-lab:')) {
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
      clearEndpoint(from, documentFlow);
      clearEndpoint(to, documentFlow);
    },
    reverse() {
      directionRef.current = -1;
      render(1);
    },
    dispose() {
      clearEndpoint(from, documentFlow);
      clearEndpoint(to, documentFlow);
    }
  }), [documentFlow, from, render, to]);

  return null;
});

export default PhoneTtgLabTransition;
