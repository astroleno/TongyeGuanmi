import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  educationScene,
  renderEducationHold,
  renderEducationProgress
} from '..';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import './PhoneEducation.css';

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Explicitly documents that document reading owns all input over Education.
 * Unit 7's scroll coordinator must consume this policy rather than attach a
 * cinematic wheel, touch, keyboard, or focus handler to the article.
 */
export const PHONE_EDUCATION_INPUT_POLICY = Object.freeze({
  wheel: 'native',
  touch: 'native',
  keyboard: 'native',
  focus: 'native'
} as const);

/** Native-flow Education article; it never creates a second scrollport. */
export const PhoneEducation = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneEducation({ onReady, reducedMotion }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);

  const render = useCallback((rawProgress: number) => {
    const progress = clamp(rawProgress);
    renderEducationProgress(
      rootRef.current,
      reducedMotion ? (progress < 0.5 ? 0 : 1) : progress
    );
  }, [reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    renderEducationHold(root);
    root.dataset.phoneEducationScroll = 'native';
    onReady?.();
    return () => {
      delete root.dataset.phoneEducationScroll;
    };
  }, [onReady]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update: render,
    enter() {
      const root = rootRef.current;
      if (!root) return;
      root.inert = false;
      root.removeAttribute('aria-hidden');
      renderEducationHold(root);
    },
    leave() {
      const root = rootRef.current;
      if (!root) return;
      root.inert = true;
      root.setAttribute('aria-hidden', 'true');
    },
    reverse() {
      const root = rootRef.current;
      if (!root) return;
      root.inert = false;
      root.removeAttribute('aria-hidden');
    },
    dispose() {}
  }), [render]);

  const EducationSurface = educationScene.Component;
  return (
    <div
      id={educationScene.id}
      className="phone-education"
      data-phone-scene="education"
      data-phone-input-owner="native-document"
      data-phone-input-policy="wheel-touch-keyboard-focus-native"
    >
      <EducationSurface
        scene={educationScene.id}
        hidden={false}
        registerHandle={(name, element) => {
          if (name === 'copy') rootRef.current = element;
        }}
      />
    </div>
  );
});

export default PhoneEducation;
