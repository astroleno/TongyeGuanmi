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
import { renderPhonePhPresentation } from '../../scenes/ph-animation/phone/PhonePh.motion';
import type {
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../../production/phone/types';
import './phone.css';

const ENDPOINT_EPSILON = 0.001;
const INK_GATE_START = 0.06;
const INK_GATE_END = 0.94;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function endpointProgress(rawProgress: number, reducedMotion: boolean): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

/**
 * The shared field keeps a short authored pre/post roll around its ownership
 * gate. Lab's native document edge has no matching concealed sibling, so feed
 * that gate-compensated progress to the field: its mean contour then lands on
 * the actual Lab bottom at every scroll sample.
 */
export function phoneLabPhAlignedInkProgress(rawProgress: number): number {
  const progress = clamp(rawProgress);
  if (progress <= ENDPOINT_EPSILON) return 0;
  if (progress >= 1 - ENDPOINT_EPSILON) return 1;
  return INK_GATE_START + progress * (INK_GATE_END - INK_GATE_START);
}

function presentInkEndpoint(
  element: HTMLElement | null,
  interactive: boolean
): void {
  if (!element) return;
  // Ink owns the only visual boundary. Both authored plates stay fully
  // opaque, otherwise the PH island becomes translucent through Lab.
  element.style.opacity = '1';
  element.style.visibility = 'visible';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
}

/**
 * Reuse the reviewed Star-map → AOD phone ink topology. Lab supplies only its
 * shared stable endpoint; this transition never imports PhoneLab or its refs.
 */
export const PHONE_LAB_PH_DECISION = Object.freeze({
  mode: 'horizontal-ink',
  source: 'star-map-aod-phone-field',
  field: 'bottom-to-top',
  grade: 'edge-bright',
  reason: 'Lab and the fully opaque PH opening plate share the reviewed phone ink contour.'
} as const);

const PHONE_LAB_PH_FIELD = Object.freeze({
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'phone-lab-ph-r5'
} as const);

export type PhoneLabPhFrame = Readonly<{
  progress: number;
  labOpacity: number;
  phOpacity: number;
  phProgress: 0;
}>;

export function phoneLabPhFrame(
  rawProgress: number,
  reducedMotion = false
): PhoneLabPhFrame {
  const progress = endpointProgress(rawProgress, reducedMotion);
  return {
    progress,
    labOpacity: 1,
    phOpacity: 1,
    phProgress: 0
  };
}

/**
 * Consumes only generic from/to endpoints supplied by the phone adapter
 * coordinator. It deliberately has no PhoneLab import or ref.
 */
export function applyPhoneLabPhFrame(
  from: HTMLElement | null,
  to: HTMLElement | null,
  rawProgress: number,
  reducedMotion = false
): PhoneLabPhFrame {
  const frame = phoneLabPhFrame(rawProgress, reducedMotion);
  renderPhonePhPresentation(to, 0, 1, reducedMotion);
  // The source remains the one accessible tree until the contour lands. PH
  // is a cinematic surface beneath an aria-hidden stage.
  presentInkEndpoint(from, frame.progress < 1 - ENDPOINT_EPSILON);
  presentInkEndpoint(to, false);
  from?.setAttribute('data-phone-lab-ph-handoff', 'source');
  to?.setAttribute('data-phone-lab-ph-handoff', 'receiver');
  return frame;
}

export const PhoneLabPhTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
>(function PhoneLabPhTransition(
  { from, host, onReady, reducedMotion, to },
  forwardedRef
) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const inkRef = useRef<PhoneInkTransition | null>(null);

    const ensureInk = useCallback((): PhoneInkTransition | null => {
      if (inkRef.current) return inkRef.current;
      const canvas = canvasRef.current;
      if (!host || !to || !canvas) return null;
      // createPhoneInkTransition adds its shared class to an existing Canvas.
      // Normalize before each recycled run so reverse navigation cannot
      // accumulate duplicate renderer classes.
      canvas.className = 'phone-lab-ph__ink';
      const ink = createPhoneInkTransition({
        host,
        canvas,
        id: 'phone-lab-ph-ink',
        // Unlike Star-map → AOD, Lab is taller than one viewport. Applying the
        // viewport contour to that long document root clips away the visible
        // Lab tail. Keep it intact underneath the PH reveal instead.
        from: null,
        to,
        field: PHONE_LAB_PH_FIELD,
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

    const render = useCallback((progress: number) => {
      const frame = applyPhoneLabPhFrame(from, to, progress, reducedMotion);
      const inkProgress = phoneLabPhAlignedInkProgress(frame.progress);
      if (
        inkProgress > ENDPOINT_EPSILON
        && inkProgress < 1 - ENDPOINT_EPSILON
      ) {
        ensureInk()?.render(inkProgress);
      } else {
        inkRef.current?.render(inkProgress);
      }
    }, [ensureInk, from, reducedMotion, to]);

    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!host || !from || !to || !canvas) return;
      // Lab is a native document scene, not a sibling inside the fixed PH
      // stage. The stage backing must therefore stay transparent until PH's
      // own clipped root has covered the viewport.
      host.dataset.phoneLabPhInkSurface = 'transparent';
      ensureInk();
      render(reducedMotion ? 1 : 0);
      onReady?.();
      return () => {
        releaseInk();
        delete host.dataset.phoneLabPhInkSurface;
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
        render(0);
      },
      leave() {
        render(1);
        releaseInk();
      },
      reverse() {
        render(0);
      },
      dispose() {
        releaseInk();
        if (host) delete host.dataset.phoneLabPhInkSurface;
      }
    }), [host, releaseInk, render]);

    return createElement('canvas', {
      ref: canvasRef,
      className: 'phone-lab-ph__ink',
      'data-phone-lab-ph-ink': 'bottom-to-top',
      'aria-hidden': 'true'
    });
});

export default PhoneLabPhTransition;
