import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { SERVICES_COPY } from '../copy';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import type { PhoneSceneAdapterHandle } from '../../../production/phone/types';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../../../production/phone/phone-story/runtime';
import './PhoneServices.css';

const SERVICE_ROW_OFFSETS = [4, 8, 12, 16] as const;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneServicesFrame(
  rawProgress: number,
  reducedMotion = false
): Readonly<{ progress: number; opacity: number; y: number }> {
  const progress = reducedMotion ? 1 : clamp(rawProgress);
  return {
    progress,
    opacity: 0.98 + progress * 0.02,
    y: (1 - progress) * 10
  };
}

function applyServicesFrame(
  root: HTMLElement | null,
  rawProgress: number,
  reducedMotion: boolean
): void {
  if (!root) return;
  const frame = phoneServicesFrame(rawProgress, reducedMotion);
  root.style.setProperty('--phone-services-opacity', frame.opacity.toFixed(4));
  root.style.setProperty('--phone-services-y', `${frame.y.toFixed(2)}px`);
  if (import.meta.env.DEV) {
    root.dataset.phoneServicesProgress = frame.progress.toFixed(4);
  }
}

/** A semantic, native-scroll Services chapter with no internal scrollport. */
export const PhoneServices = forwardRef<
  PhoneSceneAdapterHandle,
  Group45PhoneSceneProps
>(function PhoneServices({ active, reducedMotion, onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const presentationBindingRef = useRef<Readonly<{
    token: PresentationToken;
    key: string;
    frameSequence: number;
    report: (frame: PhoneRenderedPresentationFrame) => void;
  }> | null>(null);
  const update = useCallback((progress: number) => {
    applyServicesFrame(rootRef.current, progress, reducedMotion);
  }, [reducedMotion]);
  const enter = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (import.meta.env.DEV) root.dataset.phoneServicesActive = 'true';
    update(1);
  }, [update]);
  const leave = useCallback(() => {
    if (import.meta.env.DEV && rootRef.current) {
      rootRef.current.dataset.phoneServicesActive = 'false';
    }
  }, []);
  const reportPresentedFrame = useCallback((key: string) => {
    const binding = presentationBindingRef.current;
    if (!binding || binding.key !== key) return;
    const next = {
      ...binding,
      frameSequence: binding.frameSequence + 1
    };
    presentationBindingRef.current = next;
    next.report({
      token: next.token,
      frameSequence: next.frameSequence,
      observedAt: typeof performance !== 'undefined'
        && typeof performance.now === 'function'
        ? performance.now()
        : 0,
      origin: 'leaf-static-poster'
    });
  }, []);

  useEffect(() => {
    update(1);
    onReady?.();
  }, [onReady, update]);
  useEffect(() => {
    if (active) enter();
    else leave();
  }, [active, enter, leave]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update,
    enter,
    leave,
    reverse: enter,
    presentPresentation(token, report) {
      const key = phoneRuntimePresentationTokenKey(token);
      presentationBindingRef.current = {
        token,
        key,
        frameSequence: 0,
        report
      };
      update(1);
      if (typeof window === 'undefined') return;
      // The first frame applies the endpoint; the second is the leaf's
      // post-layout static-poster observation for this immutable token.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => reportPresentedFrame(key));
      });
    },
    disposePresentation(token) {
      const binding = presentationBindingRef.current;
      if (
        binding
        && binding.key === phoneRuntimePresentationTokenKey(token)
      ) presentationBindingRef.current = null;
    },
    dispose() {
      presentationBindingRef.current = null;
      const root = rootRef.current;
      if (!root) return;
      if (import.meta.env.DEV) delete root.dataset.phoneServicesActive;
      if (import.meta.env.DEV) delete root.dataset.phoneServicesProgress;
      root.style.removeProperty('--phone-services-opacity');
      root.style.removeProperty('--phone-services-y');
    }
  }), [enter, leave, reportPresentedFrame, update]);

  return (
    <article
      ref={rootRef}
      id="services"
      className="phone-services"
      data-phone-scene="services"
      data-phone-reading="native-document"
      aria-labelledby="phone-services-title"
    >
      <header className="phone-services__hero">
        <p className="phone-services__eyebrow">{SERVICES_COPY[0]}</p>
        <h2 id="phone-services-title">
          <span>{SERVICES_COPY[1]}</span>
          <span>{SERVICES_COPY[2]}</span>
        </h2>
        <p>{SERVICES_COPY[3]}</p>
      </header>
      <ol className="phone-services__list" aria-label="企业服务能力">
        {SERVICE_ROW_OFFSETS.map((offset) => (
          <li key={SERVICES_COPY[offset]} className="phone-services__row">
            <span>{SERVICES_COPY[offset]}</span>
            <h3>{SERVICES_COPY[offset + 1]}</h3>
            <p>{SERVICES_COPY[offset + 2]}</p>
            <small>{SERVICES_COPY[offset + 3]}</small>
          </li>
        ))}
      </ol>
    </article>
  );
});

export default PhoneServices;
