import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  contactScene,
  renderContactHold
} from '..';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import '../../../production/editorial-layout.css';
import './PhoneContact.css';

/**
 * Contact is a terminal native document article. Its controls must remain
 * outside cinematic wheel, touch, keyboard, focus, and pointer ownership.
 */
export const PHONE_CONTACT_INPUT_POLICY = Object.freeze({
  wheel: 'native',
  touch: 'native',
  keyboard: 'native',
  focus: 'native',
  pointer: 'native'
} as const);

/** Stable Contact endpoint with no media, canvas, or global listener owner. */
export const PhoneContact = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneContact({ onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);

  const render = useCallback(() => {
    renderContactHold(rootRef.current);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    renderContactHold(root);
    root.dataset.phoneContactStable = 'true';
    onReady?.();
    return () => {
      delete root.dataset.phoneContactStable;
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
      renderContactHold(root);
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

  const ContactSurface = contactScene.Component;
  return (
    <div
      id={contactScene.id}
      className="phone-contact"
      data-phone-scene="contact"
      data-phone-contact-state="terminal"
      data-phone-input-owner="native-document"
      data-phone-input-policy="wheel-touch-keyboard-focus-pointer-native"
    >
      <ContactSurface
        scene={contactScene.id}
        hidden={false}
        registerHandle={(name, element) => {
          if (name === 'copy') rootRef.current = element;
        }}
      />
    </div>
  );
});

export default PhoneContact;
