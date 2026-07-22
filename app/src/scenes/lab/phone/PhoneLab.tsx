import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { LAB_COPY } from '..';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import type { ScenePresentationAdapterHandle } from '../../../story/presentation';
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
  root.dataset.phoneLabProgress = frame.progress.toFixed(4);
}

/** Native document-flow Lab chapter; its root is the stable Lab → PH input. */
export const PhoneLab = forwardRef<
  ScenePresentationAdapterHandle,
  Group45PhoneSceneProps
>(function PhoneLab({ active, reducedMotion, onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const update = useCallback((progress: number) => {
    applyLabFrame(rootRef.current, progress, reducedMotion);
  }, [reducedMotion]);
  const enter = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phoneLabActive = 'true';
    root.dataset.phoneLabStableInput = 'lab-ph';
    update(1);
  }, [update]);
  const leave = useCallback(() => {
    if (rootRef.current) rootRef.current.dataset.phoneLabActive = 'false';
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
      delete root.dataset.phoneLabActive;
      delete root.dataset.phoneLabProgress;
      delete root.dataset.phoneLabStableInput;
      root.style.removeProperty('--phone-lab-opacity');
      root.style.removeProperty('--phone-lab-y');
    }
  }), [enter, leave, update]);

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
