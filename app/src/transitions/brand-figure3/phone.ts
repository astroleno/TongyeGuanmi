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

export const PHONE_BRAND_FIGURE3_FIELD = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'brand-figure3'
} as const;

export const PHONE_BRAND_FIGURE3_DECISION = {
  strategy: 'validated-phone-ink',
  camera: 'desktop-brand-figure3/star-map-aod-bottom-to-top-field',
  fallback: 'stable-endpoint-dissolve',
  forwardEndpoint: 'figure3-animation:stable-initial-frame',
  reverseEndpoint: 'brand:readable-hold',
  rationale: 'Reuse the authored desktop Brand → Figure3 contour through the physical-iPhone-approved Star-map → AOD field renderer; the same Brand and Figure3 roots remain the complementary A/B owners.'
} as const;

export type PhoneBrandFigure3Frame = Readonly<{
  progress: number;
  fromOpacity: number;
  toOpacity: number;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneBrandFigure3Frame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false,
  direction: 1 | -1 = 1
): PhoneBrandFigure3Frame {
  const progress = mediaFailed
    ? direction === 1 ? 1 : 0
    : reducedMotion ? rawProgress <= 0 ? 0 : 1
      : clamp(rawProgress);
  return { progress, fromOpacity: 1 - progress, toOpacity: progress };
}

/**
 * The production desktop bridge and accepted Star-map → AOD phone bridge use
 * the same bottom-to-top field. Brand and Figure3 stay mounted as the only two
 * complementary owners; no duplicate dissolve receiver or media pre-roll is
 * introduced around the shared document boundary.
 */
export const PhoneBrandFigure3Transition = forwardRef<
  TransitionPresentationAdapterHandle,
  Group45PhoneTransitionProps
>(function PhoneBrandFigure3Transition(
  { host, from, to, reducedMotion, onReady },
  forwardedRef
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transitionRef = useRef<PhoneInkTransition | null>(null);
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const render = useCallback((rawProgress: number) => {
    const progress = clamp(rawProgress);
    if (progress > progressRef.current + 0.0001) directionRef.current = 1;
    if (progress < progressRef.current - 0.0001) directionRef.current = -1;
    progressRef.current = progress;
    const mediaFailed = from?.dataset.phoneMediaState === 'fallback'
      || to?.dataset.phoneMediaState === 'fallback';
    const frame = phoneBrandFigure3Frame(
      progress,
      reducedMotion,
      mediaFailed,
      directionRef.current
    );
    transitionRef.current?.render(frame.progress);
    if (host) {
      host.dataset.phoneTransition = 'brand-figure3:validated-phone-ink';
      host.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
    }
    if (from) {
      from.dataset.phoneInkSource = 'brand-figure3';
      from.dataset.phoneInkSourceOpacity = frame.fromOpacity.toFixed(4);
    }
    if (to) {
      to.dataset.phoneInkReceiver = 'brand-figure3';
      to.dataset.phoneInkReceiverOpacity = frame.toOpacity.toFixed(4);
    }
  }, [from, host, reducedMotion, to]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!host || !from || !to || !canvas) return;
    const transition = createPhoneInkTransition({
      host,
      canvas,
      id: 'phone-brand-figure3',
      from,
      to,
      field: PHONE_BRAND_FIGURE3_FIELD,
      grade: 'edge-bright',
      releaseBoundaryGeometryAtEndpoints: true
    });
    transitionRef.current = transition;
    // Reduced motion still starts on Brand and commits Figure3 only after the
    // shared boundary is crossed; frame mapping performs that endpoint jump.
    render(0);
    onReady?.();
    return () => {
      transition.dispose();
      if (transitionRef.current === transition) transitionRef.current = null;
      delete from.dataset.phoneInkSource;
      delete from.dataset.phoneInkSourceOpacity;
      delete to.dataset.phoneInkReceiver;
      delete to.dataset.phoneInkReceiverOpacity;
      if (host?.dataset.phoneTransition?.startsWith('brand-figure3:')) {
        delete host.dataset.phoneTransition;
        delete host.dataset.phoneTransitionProgress;
      }
    };
  }, [from, host, onReady, reducedMotion, render, to]);

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
    className: 'portrait-scroll-spike__ink phone-brand-figure3__ink',
    'data-portrait-ink': 'brand-figure3',
    'aria-hidden': 'true'
  });
});

export default PhoneBrandFigure3Transition;
