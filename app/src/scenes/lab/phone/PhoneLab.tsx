import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { LAB_COPY } from '../copy';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import type { PhoneSceneAdapterHandle } from '../../../production/phone/types';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../../../production/phone/phone-story/runtime';
import './PhoneLab.css';

const LAB_ROW_OFFSETS = [11, 14, 17, 20, 23, 26] as const;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneLabFrame(
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

function applyLabFrame(
  root: HTMLElement | null,
  rawProgress: number,
  reducedMotion: boolean
): void {
  if (!root) return;
  const frame = phoneLabFrame(rawProgress, reducedMotion);
  root.style.setProperty('--phone-lab-opacity', frame.opacity.toFixed(4));
  root.style.setProperty('--phone-lab-y', `${frame.y.toFixed(2)}px`);
  if (import.meta.env.DEV) {
    root.dataset.phoneLabProgress = frame.progress.toFixed(4);
  }
}

/** A native leaf returns the machine token untouched after its static paint. */
export function phoneLabStaticPresentationFrame(
  token: PresentationToken,
  frameSequence: number,
  observedAt: number
): PhoneRenderedPresentationFrame {
  return {
    token,
    frameSequence,
    observedAt,
    origin: 'leaf-static-poster'
  };
}

/** Native document-flow Lab chapter; its root is the stable Lab → PH input. */
export const PhoneLab = forwardRef<
  PhoneSceneAdapterHandle,
  Group45PhoneSceneProps
>(function PhoneLab({ active, reducedMotion, onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const presentationBindingRef = useRef<Readonly<{
    token: PresentationToken;
    key: string;
    frameSequence: number;
    report: (frame: PhoneRenderedPresentationFrame) => void;
  }> | null>(null);
  const update = useCallback((progress: number) => {
    applyLabFrame(rootRef.current, progress, reducedMotion);
  }, [reducedMotion]);
  const enter = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (import.meta.env.DEV) root.dataset.phoneLabActive = 'true';
    root.dataset.phoneLabStableInput = 'lab-ph';
    update(1);
  }, [update]);
  const leave = useCallback(() => {
    if (import.meta.env.DEV && rootRef.current) {
      rootRef.current.dataset.phoneLabActive = 'false';
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
    next.report(phoneLabStaticPresentationFrame(
      next.token,
      next.frameSequence,
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : 0
    ));
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
      // One frame applies the endpoint and the next observes the browser's
      // post-layout static paint. The key guard rejects retired callbacks.
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
      if (import.meta.env.DEV) delete root.dataset.phoneLabActive;
      if (import.meta.env.DEV) delete root.dataset.phoneLabProgress;
      delete root.dataset.phoneLabStableInput;
      root.style.removeProperty('--phone-lab-opacity');
      root.style.removeProperty('--phone-lab-y');
    }
  }), [enter, leave, reportPresentedFrame, update]);

  return (
    <article
      ref={rootRef}
      id="lab"
      className="phone-lab"
      data-phone-scene="lab"
      data-phone-reading="native-document"
      data-phone-lab-stable-input="lab-ph"
      aria-labelledby="phone-lab-title"
    >
      <section className="phone-lab__screen phone-lab__screen--intro">
        <header className="phone-lab__hero">
          <p className="phone-lab__eyebrow">{LAB_COPY[7]}</p>
          <h2 id="phone-lab-title">
            <span>{LAB_COPY[8]}</span>
            <span>{LAB_COPY[9]}</span>
          </h2>
          <p>
            {LAB_COPY[0]} <em>{LAB_COPY[1]}</em>{LAB_COPY[2]}
          </p>
          <p>{LAB_COPY[10]}</p>
        </header>
      </section>
      <section className="phone-lab__screen phone-lab__screen--scenarios">
        <ol className="phone-lab__list" aria-label="AI 落地场景">
          {LAB_ROW_OFFSETS.map((offset) => (
            <li key={LAB_COPY[offset]} className="phone-lab__row">
              <span>{LAB_COPY[offset]}</span>
              <h3>{LAB_COPY[offset + 1]}</h3>
              <p>{LAB_COPY[offset + 2]}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
});

export default PhoneLab;
