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
import {
  phoneRuntimePresentationTokenKey,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../phone-story/runtime';
import './PhoneFigure2Proof.css';

const Figure2ProofSurface = figure2ProofScene.Component;

type PhoneFigure2ProofStaticPresentationBinding = {
  token: PresentationToken;
  key: string;
  frameSequence: number;
  report: (frame: PhoneRenderedPresentationFrame) => void;
  reported: boolean;
  paintFrame: number | null;
  proofFrame: number | null;
};

function cancelFigure2ProofStaticPresentationFrames(
  binding: PhoneFigure2ProofStaticPresentationBinding
): void {
  if (typeof window === 'undefined') return;
  if (binding.paintFrame !== null) window.cancelAnimationFrame(binding.paintFrame);
  if (binding.proofFrame !== null) window.cancelAnimationFrame(binding.proofFrame);
  binding.paintFrame = null;
  binding.proofFrame = null;
}

/** The Proof leaf preserves the runner-issued static token unchanged. */
export function phoneFigure2ProofStaticPresentationFrame(
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

/** One canonical Proof article; document progress moves its three panels. */
export const PhoneFigure2Proof = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneFigure2Proof({ active, onReady }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const staticPresentationBindingRef = useRef<
    PhoneFigure2ProofStaticPresentationBinding | null
  >(null);
  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'copy') rootRef.current = element;
  }, []);
  const releaseStaticPresentation = useCallback((
    token?: PresentationToken
  ): boolean => {
    const binding = staticPresentationBindingRef.current;
    if (
      !binding
      || (token && binding.key !== phoneRuntimePresentationTokenKey(token))
    ) return false;
    cancelFigure2ProofStaticPresentationFrames(binding);
    const root = rootRef.current;
    if (root?.dataset.figure2ProofStaticPoster === binding.key) {
      delete root.dataset.figure2ProofStaticPoster;
    }
    if (staticPresentationBindingRef.current === binding) {
      staticPresentationBindingRef.current = null;
    }
    return true;
  }, []);
  const requestBoundStaticPresentation = useCallback(() => {
    const binding = staticPresentationBindingRef.current;
    if (
      !binding
      || binding.reported
      || binding.paintFrame !== null
      || binding.proofFrame !== null
      || typeof window === 'undefined'
    ) return;
    // The target candidate is already projected by the authority. Paint the
    // authored opening hold, mark that exact target, then wait one additional
    // browser frame before reporting the leaf-owned physical fact.
    binding.paintFrame = window.requestAnimationFrame(() => {
      binding.paintFrame = null;
      if (staticPresentationBindingRef.current !== binding || binding.reported) {
        return;
      }
      const root = rootRef.current;
      if (!root) return;
      renderFigure2ProofHold(root);
      root.dataset.figure2ProofStaticPoster = binding.key;
      if (
        staticPresentationBindingRef.current !== binding
        || root.dataset.figure2ProofStaticPoster !== binding.key
      ) return;
      binding.proofFrame = window.requestAnimationFrame(() => {
        binding.proofFrame = null;
        if (
          staticPresentationBindingRef.current !== binding
          || binding.reported
          || root.dataset.figure2ProofStaticPoster !== binding.key
        ) return;
        binding.reported = true;
        binding.frameSequence += 1;
        binding.report(phoneFigure2ProofStaticPresentationFrame(
          binding.token,
          binding.frameSequence,
          typeof performance !== 'undefined'
            && typeof performance.now === 'function'
            ? performance.now()
            : 0
        ));
      });
    });
  }, []);

  useEffect(() => {
    renderFigure2ProofHold(rootRef.current);
    onReady?.();
    return () => { releaseStaticPresentation(); };
  }, [onReady, releaseStaticPresentation]);

  /* Active is accessibility/resource state; surface roles own presentation. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.inert = !active;
    if (active) root.removeAttribute('aria-hidden');
    else root.setAttribute('aria-hidden', 'true');
  }, [active]);

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
    enter() {},
    leave() {},
    reverse() {},
    presentPresentation(token, report) {
      releaseStaticPresentation();
      if (token.kind !== 'static-poster') return;
      staticPresentationBindingRef.current = {
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
    }
  }), [releaseStaticPresentation, requestBoundStaticPresentation]);

  return (
    <Figure2ProofSurface
      scene="figure2-proof"
      hidden={false}
      registerHandle={registerHandle}
    />
  );
});

export default PhoneFigure2Proof;
