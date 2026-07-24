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

export function setPhoneEndpointLayer(
  element: HTMLElement | null,
  attribute: string,
  active: boolean
): void {
  const slot = element?.closest<HTMLElement>(
    '[data-phone-acceptance-chapter]'
  );
  if (active) slot?.setAttribute(attribute, 'true');
  else slot?.removeAttribute(attribute);
}

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
  layerAttribute: string;
  renderFrame: (
    from: HTMLElement | null,
    to: HTMLElement | null,
    progress: number,
    direction: Direction,
    reducedMotion: boolean
  ) => void;
  settle: (from: HTMLElement | null, to: HTMLElement | null) => void;
  reset?: (from: HTMLElement | null, to: HTMLElement | null) => void;
}>): PhoneTransitionAdapterComponent {
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(
    function PhoneEndpointTransition(
      { from, onReady, reducedMotion, to },
      forwardedRef
    ) {
      const directionRef = useRef<Direction>(1);
      const layer = useCallback((active: boolean) => {
        setPhoneEndpointLayer(to, options.layerAttribute, active);
      }, [to]);
      const render = useCallback((progress: number) => {
        options.renderFrame(
          from,
          to,
          progress,
          directionRef.current,
          reducedMotion
        );
      }, [from, reducedMotion, to]);
      useEffect(() => {
        render(0);
        onReady?.();
      }, [onReady, render]);
      useImperativeHandle(forwardedRef, () => ({
        render,
        enter() {
          directionRef.current = 1;
          layer(true);
          render(0);
        },
        leave() {
          if (directionRef.current === -1) {
            render(0);
            layer(false);
            directionRef.current = 1;
            return;
          }
          render(1);
          options.settle(from, to);
          layer(false);
        },
        reverse() {
          directionRef.current = -1;
          layer(true);
          render(1);
        },
        dispose() {
          directionRef.current = 1;
          layer(false);
          options.reset?.(from, to);
        }
      }), [from, layer, render, to]);
      return null;
    }
  );
}
