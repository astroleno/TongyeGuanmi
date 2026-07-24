import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { SiteFooter } from '../../../components/SiteFooter';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import '../../../production/editorial-layout.css';
import './PhoneContact.css';

const CONTACT_COPY = [
  'START FROM THE FIELD',
  '把你拿不准的那个决定，先拿出来聊。',
  '带上一个正在耗人耗钱的环节、一场谈不拢的管理层会，或者孩子的留学规划。我们先帮你拆成看得懂、落得了地的下一步。一次现场诊断你会拿到三样东西：哪个环节值得上 AI、先后顺序、大概要投入多少。真要做，也是先挑一个环节小做，几天内见到能跑的东西，再谈要不要扩大。聊完再决定要不要合作，不推销、不卖课。',
  '约一次 AI 现场诊断',
  '回到首屏'
] as const;

export function renderPhoneContactProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number
): void {
  const progress = Math.min(1, Math.max(0, rawProgress));
  root?.style.setProperty('--r4-contact-progress', progress.toFixed(4));
  root?.style.setProperty('--r4-contact-opacity', progress.toFixed(4));
  root?.style.setProperty(
    '--r4-contact-y',
    `${((1 - progress) * 20).toFixed(2)}px`
  );
  root?.setAttribute('data-contact-progress', progress.toFixed(4));
}

export function renderPhoneContactHold(
  root: HTMLElement | null | undefined
): void {
  renderPhoneContactProgress(root, 1);
  root?.style.setProperty('--r4-contact-paper-alpha', '1.0000');
  root?.style.setProperty('--r4-contact-wash-alpha', '1.0000');
}

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
    renderPhoneContactHold(rootRef.current);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    renderPhoneContactHold(root);
    if (import.meta.env.DEV) root.dataset.phoneContactStable = 'true';
    onReady?.();
    return () => {
      if (import.meta.env.DEV) delete root.dataset.phoneContactStable;
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
      renderPhoneContactHold(root);
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

  return (
    <div
      id="contact"
      className="phone-contact"
      data-phone-scene="contact"
      data-phone-contact-state="terminal"
      data-phone-input-owner="native-document"
      data-phone-input-policy="wheel-touch-keyboard-focus-pointer-native"
    >
      <article
        ref={rootRef}
        className="r4-contact contact-endpoint"
        data-r4-scene="contact"
      >
        <div className="r4-contact__content">
          <span className="eyebrow">{CONTACT_COPY[0]}</span>
          <h2>{CONTACT_COPY[1]}</h2>
          <p>{CONTACT_COPY[2]}</p>
          <div className="contact-actions">
            <a
              className="btn btn-primary"
              href="mailto:contact@example.com?subject=%E5%90%8C%E9%87%8E%E8%A7%82%E5%B9%82%20AI%20%E8%AF%8A%E6%96%AD%E5%92%A8%E8%AF%A2"
            >
              {CONTACT_COPY[3]}
            </a>
            <a className="text-link" href="#top">{CONTACT_COPY[4]}</a>
          </div>
        </div>
        <SiteFooter />
      </article>
    </div>
  );
});

export default PhoneContact;
