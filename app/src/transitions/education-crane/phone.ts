import {
  createElement,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import {
  createPhoneInkTransition,
  type PhoneInkTransition
} from '../../production/phone/phone-ink';
import type {
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../../production/phone/types';
import { renderPhoneCranePresentation } from '../../scenes/crane-animation/phone/PhoneCrane.motion';
import { renderEducationHold } from '../../scenes/education';
import './phone.css';

const ENDPOINT_EPSILON = 0.001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function transitionProgress(rawProgress: number, reducedMotion: boolean): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

function presentInkEndpoint(
  element: HTMLElement | null,
  interactive: boolean
): void {
  if (!element) return;
  // As in Unit 5's Services → TTG bridge, the native document stays intact
  // underneath an opaque fixed receiver. The contour—not endpoint opacity—
  // is the sole visual boundary.
  element.style.opacity = '1';
  element.style.visibility = 'visible';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
}

export const PHONE_EDUCATION_CRANE_FIELD = Object.freeze({
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'phone-education-crane-r5'
} as const);

/** Reuse the physical-iPhone-approved Unit 5 ink ownership topology. */
export const PHONE_EDUCATION_CRANE_DECISION = Object.freeze({
  mode: 'horizontal-ink',
  source: 'services-ttg/star-map-aod-phone-field',
  field: 'bottom-to-top',
  grade: 'edge-bright',
  fallback: 'stable-endpoint-contour',
  reason: 'Education remains the native document owner while the opaque Crane opening frame is revealed by the shared phone ink field.'
} as const);

export type PhoneEducationCraneFrame = Readonly<{
  progress: number;
  educationOpacity: 1;
  craneOpacity: 1;
  craneProgress: 0;
}>;

export function phoneEducationCraneFrame(
  rawProgress: number,
  reducedMotion = false
): PhoneEducationCraneFrame {
  return {
    progress: transitionProgress(rawProgress, reducedMotion),
    educationOpacity: 1,
    craneOpacity: 1,
    craneProgress: 0
  };
}

export function applyPhoneEducationCraneFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  reducedMotion = false
): PhoneEducationCraneFrame {
  const frame = phoneEducationCraneFrame(rawProgress, reducedMotion);
  renderEducationHold(from);
  // Pre-register Crane at frame zero while its root remains fully opaque.
  // Initialising WebGL beneath a dissolving opacity-zero root can leave
  // physical Safari repainting only the CSS camera over one stale frame.
  if (!to?.dataset.phoneCraneProgress) {
    renderPhoneCranePresentation(to, 0);
  }
  presentInkEndpoint(from, frame.progress < 1 - ENDPOINT_EPSILON);
  presentInkEndpoint(to, false);
  from?.setAttribute('data-phone-education-crane-handoff', 'source');
  to?.setAttribute('data-phone-education-crane-handoff', 'receiver');
  return frame;
}

export const PhoneEducationCraneTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
>(function PhoneEducationCraneTransition(
  { from, host, onReady, reducedMotion, to },
  forwardedRef
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<PhoneInkTransition | null>(null);
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);

  const ensureInk = useCallback((): PhoneInkTransition | null => {
    if (inkRef.current) return inkRef.current;
    const canvas = canvasRef.current;
    if (!host || !to || !canvas) return null;
    canvas.className = 'phone-education-crane__ink';
    const ink = createPhoneInkTransition({
      host,
      canvas,
      id: 'phone-education-crane-ink',
      // Education owns two native reading screens. Clipping that long root to
      // one fixed viewport would remove its visible tail, so only Crane owns
      // the complementary reveal contour.
      from: null,
      to,
      field: PHONE_EDUCATION_CRANE_FIELD,
      grade: 'edge-bright'
    });
    inkRef.current = ink;
    return ink;
  }, [host, to]);

  const releaseInk = useCallback(() => {
    const ink = inkRef.current;
    if (!ink) return;
    ink.dispose();
    inkRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }, []);

  const render = useCallback((rawProgress: number) => {
    const nextProgress = clamp(rawProgress);
    if (nextProgress > progressRef.current + 0.0001) {
      directionRef.current = 1;
    }
    if (nextProgress < progressRef.current - 0.0001) {
      directionRef.current = -1;
    }
    progressRef.current = nextProgress;
    const frame = applyPhoneEducationCraneFrame(
      from,
      to,
      nextProgress,
      reducedMotion
    );
    ensureInk()?.render(frame.progress);
    if (host) {
      host.dataset.phoneTransition = 'education-crane:validated-phone-ink';
      host.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
      host.dataset.phoneTransitionDirection = directionRef.current === 1
        ? 'forward'
        : 'reverse';
    }
  }, [ensureInk, from, host, reducedMotion, to]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!host || !from || !to || !canvas) return;
    ensureInk();
    render(0);
    onReady?.();
    return () => {
      releaseInk();
      if (host.dataset.phoneTransition?.startsWith('education-crane:')) {
        delete host.dataset.phoneTransition;
        delete host.dataset.phoneTransitionProgress;
        delete host.dataset.phoneTransitionDirection;
      }
    };
  }, [
    ensureInk,
    from,
    host,
    onReady,
    reducedMotion,
    releaseInk,
    render,
    to
  ]);

  useImperativeHandle(forwardedRef, () => ({
    render,
    enter() {
      directionRef.current = 1;
      render(0);
    },
    leave() {
      directionRef.current = 1;
      render(1);
      // Native Crane playback now owns the stage. Release only the transition
      // renderer; the separately owned packed-alpha surfaces remain intact.
      releaseInk();
    },
    reverse() {
      directionRef.current = -1;
      render(1);
    },
    dispose() {
      releaseInk();
      if (host?.dataset.phoneTransition?.startsWith('education-crane:')) {
        delete host.dataset.phoneTransition;
        delete host.dataset.phoneTransitionProgress;
        delete host.dataset.phoneTransitionDirection;
      }
    }
  }), [host, releaseInk, render]);

  return createElement('canvas', {
    ref: canvasRef,
    className: 'phone-education-crane__ink',
    'data-phone-education-crane-ink': 'bottom-to-top',
    'aria-hidden': 'true'
  });
});

export default PhoneEducationCraneTransition;
