import {
  createElement,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import type {
  Group45PhoneTransitionProps
} from '../../production/phone/adapter-groups/group4-5';
import {
  createPhoneInkTransition,
  type PhoneInkTransition
} from '../../production/phone/phone-ink';
import type { TransitionPresentationAdapterHandle } from '../../story/presentation';

export const PHONE_SERVICES_TTG_FIELD = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'services-ttg-phone-r5'
} as const;

export const PHONE_SERVICES_TTG_DECISION = {
  strategy: 'validated-phone-ink',
  camera: 'star-map-aod-bottom-to-top-field',
  fallback: 'stable-endpoint-dissolve',
  forwardEndpoint: 'ttg-animation:stable-initial-frame',
  reverseEndpoint: 'services:reading-end',
  rationale: 'Reuse 4c659e3\'s accepted bottom-to-top phone ink field while Services remains the native document owner and TTG remains the sole visual owner.'
} as const;

export type PhoneServicesTtgFrame = Readonly<{
  progress: number;
  fromOpacity: number;
  toOpacity: number;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneServicesTtgFrame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false,
  direction: 1 | -1 = 1
): PhoneServicesTtgFrame {
  const progress = mediaFailed
    ? direction === 1 ? 1 : 0
    : reducedMotion ? rawProgress <= 0 ? 0 : 1
      : clamp(rawProgress);
  return { progress, fromOpacity: 1 - progress, toOpacity: progress };
}

/**
 * Services → TTG reuses the physical-iPhone-approved Star-map → AOD field.
 * The tall Services article is never clipped as a desktop-sized layer; the
 * fixed TTG receiver alone owns the reveal boundary over the live document.
 */
export const PhoneServicesTtgTransition = forwardRef<
  TransitionPresentationAdapterHandle,
  Group45PhoneTransitionProps
>(function PhoneServicesTtgTransition(
  { host, from, to, reducedMotion, documentFlow = false, onReady },
  forwardedRef
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transitionRef = useRef<PhoneInkTransition | null>(null);
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);

  const render = useCallback((rawProgress: number) => {
    const nextProgress = clamp(rawProgress);
    if (nextProgress > progressRef.current + .0001) directionRef.current = 1;
    if (nextProgress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = nextProgress;
    const mediaFailed = from?.dataset.phoneMediaState === 'fallback'
      || to?.dataset.phoneMediaState === 'fallback';
    const frame = phoneServicesTtgFrame(
      nextProgress,
      reducedMotion,
      mediaFailed,
      directionRef.current
    );
    transitionRef.current?.render(frame.progress);
    if (host) {
      host.dataset.phoneTransition = 'services-ttg:validated-phone-ink';
      host.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
    }
    if (from) {
      from.dataset.phoneInkSource = 'services-ttg';
      from.dataset.phoneInkSourceOpacity = frame.fromOpacity.toFixed(4);
    }
    if (to) {
      to.dataset.phoneInkReceiver = 'services-ttg';
      to.dataset.phoneInkReceiverOpacity = frame.toOpacity.toFixed(4);
    }
  }, [from, host, reducedMotion, to]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!host || !to || !canvas) return;
    const transition = createPhoneInkTransition({
      host,
      canvas,
      id: 'phone-services-ttg',
      // A native document chapter is taller than the fixed stage. Revealing
      // only the receiver preserves the same contour without scaling or
      // clipping the Services accessibility tree as a visual layer.
      from: documentFlow ? null : from,
      to,
      field: PHONE_SERVICES_TTG_FIELD,
      grade: 'edge-bright'
    });
    transitionRef.current = transition;
    render(reducedMotion ? 1 : 0);
    onReady?.();
    return () => {
      transition.dispose();
      if (transitionRef.current === transition) transitionRef.current = null;
      if (from) {
        delete from.dataset.phoneInkSource;
        delete from.dataset.phoneInkSourceOpacity;
      }
      delete to.dataset.phoneInkReceiver;
      delete to.dataset.phoneInkReceiverOpacity;
      if (host.dataset.phoneTransition?.startsWith('services-ttg:')) {
        delete host.dataset.phoneTransition;
        delete host.dataset.phoneTransitionProgress;
      }
    };
  }, [documentFlow, from, host, onReady, reducedMotion, render, to]);

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
      render(1);
    },
    dispose() {
      transitionRef.current?.dispose();
      transitionRef.current = null;
    }
  }), [render]);

  return createElement('canvas', {
    ref: canvasRef,
    className: 'portrait-scroll-spike__ink phone-services-ttg__ink',
    'data-portrait-ink': 'services-ttg',
    'aria-hidden': 'true'
  });
});

export default PhoneServicesTtgTransition;
