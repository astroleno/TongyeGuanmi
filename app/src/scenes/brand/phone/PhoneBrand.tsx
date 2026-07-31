import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { BRAND_COPY } from '../copy';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import type { PhoneSceneAdapterHandle } from '../../../production/phone/types';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../../../production/phone/phone-story/runtime';
import './PhoneBrand.css';

type PhoneBrandStaticPresentationBinding = {
  token: PresentationToken;
  key: string;
  frameSequence: number;
  report: (frame: PhoneRenderedPresentationFrame) => void;
  reported: boolean;
  paintFrame: number | null;
  proofFrame: number | null;
};

function cancelPhoneBrandStaticPresentationFrames(
  binding: PhoneBrandStaticPresentationBinding
): void {
  if (typeof window === 'undefined') return;
  if (binding.paintFrame !== null) window.cancelAnimationFrame(binding.paintFrame);
  if (binding.proofFrame !== null) window.cancelAnimationFrame(binding.proofFrame);
  binding.paintFrame = null;
  binding.proofFrame = null;
}

/** The Brand leaf preserves the runner-issued static token unchanged. */
export function phoneBrandStaticPresentationFrame(
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

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Brand begins at a readable stable surface so the existing Unit 4
 * Proof → Brand ink receiver can own conceal/reveal without creating a blank
 * pre-roll. The small offset is a local phone entrance, not a desktop crop.
 */
export function phoneBrandFrame(
  rawProgress: number,
  reducedMotion = false
): Readonly<{ progress: number; opacity: number; y: number }> {
  const progress = reducedMotion ? 1 : clamp(rawProgress);
  return {
    progress,
    opacity: 0.96 + progress * 0.04,
    y: (1 - progress) * 12
  };
}

function applyBrandFrame(
  root: HTMLElement | null,
  rawProgress: number,
  reducedMotion: boolean
): void {
  if (!root) return;
  const frame = phoneBrandFrame(rawProgress, reducedMotion);
  root.style.setProperty('--phone-brand-opacity', frame.opacity.toFixed(4));
  root.style.setProperty('--phone-brand-y', `${frame.y.toFixed(2)}px`);
  if (import.meta.env.DEV) {
    root.dataset.phoneBrandProgress = frame.progress.toFixed(4);
  }
}

/** Native document-flow phone adapter for the canonical Brand chapter. */
export const PhoneBrand = forwardRef<
  PhoneSceneAdapterHandle,
  Group45PhoneSceneProps
>(function PhoneBrand({ active, reducedMotion, onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const presentationBindingRef = useRef<
    PhoneBrandStaticPresentationBinding | null
  >(null);

  const update = useCallback((progress: number) => {
    applyBrandFrame(rootRef.current, progress, reducedMotion);
  }, [reducedMotion]);
  const enter = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (import.meta.env.DEV) root.dataset.phoneBrandActive = 'true';
    update(1);
  }, [update]);
  const leave = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    // This remains document content. Do not inert or hide it from the one
    // accessible story tree merely because its visual bridge has retired.
    if (import.meta.env.DEV) root.dataset.phoneBrandActive = 'false';
  }, []);
  const releaseStaticPresentation = useCallback((
    token?: PresentationToken
  ): boolean => {
    const binding = presentationBindingRef.current;
    if (
      !binding
      || (token && binding.key !== phoneRuntimePresentationTokenKey(token))
    ) return false;
    cancelPhoneBrandStaticPresentationFrames(binding);
    const root = rootRef.current;
    if (root?.dataset.phoneBrandStaticPoster === binding.key) {
      delete root.dataset.phoneBrandStaticPoster;
    }
    if (presentationBindingRef.current === binding) {
      presentationBindingRef.current = null;
    }
    return true;
  }, []);
  const requestBoundStaticPresentation = useCallback(() => {
    const binding = presentationBindingRef.current;
    if (
      !binding
      || binding.reported
      || binding.paintFrame !== null
      || binding.proofFrame !== null
      || typeof window === 'undefined'
    ) return;
    // The candidate has already been laid out by the authority. Paint the
    // canonical Brand endpoint, then submit its immutable leaf fact only on
    // the following browser frame.
    binding.paintFrame = window.requestAnimationFrame(() => {
      binding.paintFrame = null;
      if (presentationBindingRef.current !== binding || binding.reported) {
        return;
      }
      const root = rootRef.current;
      if (!root) return;
      update(1);
      root.dataset.phoneBrandStaticPoster = binding.key;
      if (
        presentationBindingRef.current !== binding
        || root.dataset.phoneBrandStaticPoster !== binding.key
      ) return;
      binding.proofFrame = window.requestAnimationFrame(() => {
        binding.proofFrame = null;
        if (
          presentationBindingRef.current !== binding
          || binding.reported
          || root.dataset.phoneBrandStaticPoster !== binding.key
        ) return;
        binding.reported = true;
        binding.frameSequence += 1;
        binding.report(phoneBrandStaticPresentationFrame(
          binding.token,
          binding.frameSequence,
          typeof performance !== 'undefined'
            && typeof performance.now === 'function'
            ? performance.now()
            : 0
        ));
      });
    });
  }, [update]);

  useEffect(() => {
    update(1);
    onReady?.();
    return () => { releaseStaticPresentation(); };
  }, [onReady, releaseStaticPresentation, update]);

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
      releaseStaticPresentation();
      if (token.kind !== 'static-poster') return;
      presentationBindingRef.current = {
        token,
        key: phoneRuntimePresentationTokenKey(token),
        frameSequence: 0,
        report,
        reported: false,
        paintFrame: null,
        proofFrame: null
      };
      requestBoundStaticPresentation();
    },
    disposePresentation(token) {
      releaseStaticPresentation(token);
    },
    dispose() {
      releaseStaticPresentation();
      const root = rootRef.current;
      if (!root) return;
      if (import.meta.env.DEV) delete root.dataset.phoneBrandActive;
      if (import.meta.env.DEV) delete root.dataset.phoneBrandProgress;
      root.style.removeProperty('--phone-brand-opacity');
      root.style.removeProperty('--phone-brand-y');
    }
  }), [enter, leave, releaseStaticPresentation, requestBoundStaticPresentation, update]);

  return (
    <article
      ref={rootRef}
      id="brand"
      className="phone-brand"
      data-phone-scene="brand"
      data-phone-reading="native-document"
      aria-labelledby="phone-brand-title"
    >
      <div className="phone-brand__content">
        <section className="phone-brand__definition">
          <span>{BRAND_COPY[0]}</span>
          <h2 id="phone-brand-title">{BRAND_COPY[1]}</h2>
          <p>{BRAND_COPY[2]}</p>
        </section>
        <section className="phone-brand__definition">
          <span>{BRAND_COPY[3]}</span>
          <h2>{BRAND_COPY[4]}</h2>
          <p>{BRAND_COPY[5]}</p>
        </section>
      </div>
    </article>
  );
});

export default PhoneBrand;
