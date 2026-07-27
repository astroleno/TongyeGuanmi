import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import type {
  PhoneTransitionAdapterComponent,
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../types';

type Direction = 1 | -1;

export function presentPhoneEndpoint(
  element: HTMLElement | null,
  opacity: number,
  interactive: boolean
): void {
  if (!element) return;
  element.style.opacity = opacity.toFixed(4);
  element.style.visibility = 'visible';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.inert = !interactive;
  element.setAttribute('aria-hidden', String(!interactive));
}

export function clearPhoneEndpoint(element: HTMLElement | null): void {
  if (!element) return;
  element.style.opacity = '';
  element.style.visibility = '';
  element.style.pointerEvents = '';
  element.inert = false;
  element.removeAttribute('aria-hidden');
}

export function createPhoneEndpointAdapter(options: Readonly<{
  renderFrame: (
    from: HTMLElement | null,
    to: HTMLElement | null,
    progress: number,
    direction: Direction,
    reducedMotion: boolean
  ) => void;
  settle: (from: HTMLElement | null, to: HTMLElement | null) => void;
  reset?: (
    from: HTMLElement | null,
    to: HTMLElement | null,
    progress: number
  ) => void;
}>): PhoneTransitionAdapterComponent {
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(
    function PhoneEndpointTransition(
      { from, onReady, reducedMotion, to },
      forwardedRef
    ) {
      const directionRef = useRef<Direction>(1);
      const progressRef = useRef(0);
      const render = useCallback((progress: number) => {
        progressRef.current = progress;
        options.renderFrame(
          from,
          to,
          progress,
          directionRef.current,
          reducedMotion
        );
      }, [from, reducedMotion, to]);
      useEffect(() => {
        onReady?.();
      }, [onReady]);
      useImperativeHandle(forwardedRef, () => ({
        render,
        begin() {},
        commitEndpoint(endpoint) {
          render(endpoint);
          if (endpoint === 1) options.settle(from, to);
        },
        releaseEndpoint() {},
        enter() {
          directionRef.current = 1;
          render(0);
        },
        leave() {
          if (directionRef.current === -1) {
            render(0);
            directionRef.current = 1;
            return;
          }
          render(1);
          options.settle(from, to);
        },
        reverse() {
          directionRef.current = -1;
          render(1);
        },
        dispose() {
          directionRef.current = 1;
          options.reset?.(from, to, progressRef.current);
        }
      }), [from, render, to]);
      return null;
    }
  );
}
