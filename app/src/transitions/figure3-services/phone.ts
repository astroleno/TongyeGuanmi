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

export const PHONE_FIGURE3_SERVICES_DECISION = {
  strategy: 'endpoint-dissolve',
  camera: 'none',
  topology: 'persistent-endpoint-opacity',
  copyCueProgress: 0.8,
  receiverOwner: 'services:document-root',
  receiverCopies: 1,
  forwardEndpoint: 'services:reading-top',
  reverseEndpoint: 'figure3-animation:stable-initial-frame',
  rationale: 'Figure3 and the one Services document root share a boundary; the source video remains the sole clock and Services enters over its final 20%.'
} as const;

export const PHONE_FIGURE3_SERVICES_START_PROGRESS = 0.8;

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
  direction: 1 | -1 = 1,
  terminalEndpoint: 0 | 1 | null = null
): PhoneFigure3ServicesFrame {
  const progress = terminalEndpoint ?? (mediaFailed
    ? direction === 1 ? 1 : 0
    : reducedMotion ? rawProgress <= 0 ? 0 : 1
      : clamp(
        (clamp(rawProgress) - PHONE_FIGURE3_SERVICES_START_PROGRESS)
          / (1 - PHONE_FIGURE3_SERVICES_START_PROGRESS)
      ));
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
    element.style.opacity = opacity.toFixed(4);
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
    return;
  }
  element.style.removeProperty('opacity');
  element.style.removeProperty('visibility');
  element.style.removeProperty('pointer-events');
  element.inert = false;
  delete element.dataset.phoneDissolve;
}

/**
 * Keep both document-flow endpoints on the same compositor topology after the
 * forward handoff. Removing Services' opacity layer here and recreating it
 * when reverse arms makes Safari repaint its translucent paper gradients,
 * which looks like the reading opener entered twice before Figure3 rewinds.
 */
export function settlePhoneFigure3ServicesDocumentFlow(
  from: HTMLElement | null,
  to: HTMLElement | null
): void {
  applyEndpoint(from, 0, 'figure3-services', true);
  applyEndpoint(to, 1, 'figure3-services', true);
}

/** Figure3 media failure resolves directly to the Services reading endpoint. */
export const PhoneFigure3ServicesTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  Group45PhoneTransitionProps
>(function PhoneFigure3ServicesTransition(
  { host, from, to, reducedMotion, documentFlow = false, onReady },
  forwardedRef
) {
  const progressRef = useRef(0);
  const committedEndpointRef = useRef<0 | 1 | null>(null);
  // Decoder/compositor callbacks can arrive one frame after the controller
  // has released geometry. Keep the settled endpoint authoritative until the
  // next begin(), so a late 0-progress sample cannot blank Services.
  const releasedEndpointRef = useRef<0 | 1 | null>(null);
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
      directionRef.current,
      releasedEndpointRef.current
    );
    if (import.meta.env.DEV && host) {
      host.dataset.phoneTransition = 'figure3-services:endpoint-dissolve';
      host.dataset.phoneTransitionProgress = frame.progress.toFixed(4);
    }
    applyEndpoint(
      from,
      frame.fromOpacity,
      'figure3-services',
      documentFlow
    );
    applyEndpoint(
      to,
      frame.toOpacity,
      'figure3-services',
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
        && host?.dataset.phoneTransition?.startsWith('figure3-services:')
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
        settlePhoneFigure3ServicesDocumentFlow(from, to);
      }
      committedEndpointRef.current = null;
    },
    enter() {
      directionRef.current = 1;
      render(0);
    },
    leave() {
      directionRef.current = 1;
      render(1);
      if (documentFlow) {
        settlePhoneFigure3ServicesDocumentFlow(from, to);
      } else {
        clearEndpoint(from);
        clearEndpoint(to);
      }
    },
    reverse() {
      directionRef.current = -1;
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

export default PhoneFigure3ServicesTransition;
