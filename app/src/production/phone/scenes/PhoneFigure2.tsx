import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  ensureFigure2HoldFrame,
  figure2AnimationScene,
  renderFigure2AnimationProgress
} from '../../../scenes/figure2-animation';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../types';
import './PhoneFigure2.css';

const Figure2Surface = figure2AnimationScene.Component;

/** Phone composition for the canonical Figure2 media/camera owner. */
export const PhoneFigure2 = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneFigure2({ onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'stage') {
      rootRef.current = element?.closest<HTMLElement>('[data-r4-scene="figure2-animation"]') ?? null;
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const controller = new AbortController();
    void ensureFigure2HoldFrame(root, controller.signal)
      .catch(() => undefined)
      .then(() => {
        if (!controller.signal.aborted) onReady?.();
      });
    return () => controller.abort();
  }, [onReady]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(progress) {
      renderFigure2AnimationProgress(rootRef.current, progress, {
        videoMode: 'none'
      });
    },
    enter() {
      rootRef.current?.removeAttribute('aria-hidden');
    },
    leave() {
      rootRef.current?.setAttribute('aria-hidden', 'true');
    },
    reverse() {},
    dispose() {}
  }), []);

  return (
    <Figure2Surface
      scene="figure2-animation"
      hidden={false}
      registerHandle={registerHandle}
    />
  );
});

export default PhoneFigure2;
