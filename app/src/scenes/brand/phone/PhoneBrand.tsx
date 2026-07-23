import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { BRAND_COPY } from '..';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import type { ScenePresentationAdapterHandle } from '../../../story/presentation';
import './PhoneBrand.css';

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
  root.dataset.phoneBrandProgress = frame.progress.toFixed(4);
}

/** Native document-flow phone adapter for the canonical Brand chapter. */
export const PhoneBrand = forwardRef<
  ScenePresentationAdapterHandle,
  Group45PhoneSceneProps
>(function PhoneBrand({ active, reducedMotion, onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);

  const update = useCallback((progress: number) => {
    applyBrandFrame(rootRef.current, progress, reducedMotion);
  }, [reducedMotion]);
  const enter = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phoneBrandActive = 'true';
    update(1);
  }, [update]);
  const leave = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    // This remains document content. Do not inert or hide it from the one
    // accessible story tree merely because its visual bridge has retired.
    root.dataset.phoneBrandActive = 'false';
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
    dispose() {
      const root = rootRef.current;
      if (!root) return;
      delete root.dataset.phoneBrandActive;
      delete root.dataset.phoneBrandProgress;
      root.style.removeProperty('--phone-brand-opacity');
      root.style.removeProperty('--phone-brand-y');
    }
  }), [enter, leave, update]);

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
