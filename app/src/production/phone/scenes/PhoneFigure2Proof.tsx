import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  figure2ProofScene,
  renderFigure2ProofHold
} from '../../../scenes/figure2-proof';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../types';
import './PhoneFigure2Proof.css';

const Figure2ProofSurface = figure2ProofScene.Component;

/** One canonical Proof article; document progress moves its three panels. */
export const PhoneFigure2Proof = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneFigure2Proof({ onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'copy') rootRef.current = element;
  }, []);

  useEffect(() => {
    renderFigure2ProofHold(rootRef.current);
    onReady?.();
  }, [onReady]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(progress) {
      const root = rootRef.current;
      const viewportHeight = root?.parentElement?.clientHeight
        || window.innerHeight
        || 1;
      root?.style.setProperty(
        '--phone-proof-translate-y',
        `${(-2 * viewportHeight * Math.min(1, Math.max(0, progress))).toFixed(2)}px`
      );
      root?.setAttribute('data-phone-proof-progress', progress.toFixed(4));
    },
    enter() {
      const root = rootRef.current;
      if (!root) return;
      root.inert = false;
      root.removeAttribute('aria-hidden');
    },
    leave() {
      const root = rootRef.current;
      if (!root) return;
      root.inert = true;
    },
    reverse() {},
    dispose() {}
  }), []);

  return (
    <Figure2ProofSurface
      scene="figure2-proof"
      hidden={false}
      registerHandle={registerHandle}
    />
  );
});

export default PhoneFigure2Proof;
