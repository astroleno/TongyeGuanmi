import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import { METHOD_COPY } from '../../../story/copy';
import { sceneFromHash } from '../../navigation';
import type {
  PhoneMethodAdapterProps,
  PhonePresentationAdapterHandle,
  PhoneSceneAdapterHandle
} from '../types';
import { phoneDirectEntryCompletesAod } from '../phone-stage-timeline';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../phone-story/runtime';
import './PhoneMethodTop.css';

const PhoneGradeAStory = lazy(() => import('../PhoneGradeAStory').then((module) => ({
  default: module.PhoneGradeAStory
})));

const METHOD_TOP_COPY = METHOD_COPY.slice(0, 8);
const METHOD_STEPS_COPY = METHOD_COPY.slice(8, 23);
const METHOD_STEPS = Array.from({ length: 5 }, (_, index) => {
  const offset = index * 3;
  return {
    index: METHOD_STEPS_COPY[offset]!,
    title: METHOD_STEPS_COPY[offset + 1]!,
    body: METHOD_STEPS_COPY[offset + 2]!
  };
});

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

type PhoneMethodPresentationBinding = {
  token: PresentationToken;
  key: string;
  report: (frame: PhoneRenderedPresentationFrame) => void;
  frameSequence: number;
  reported: boolean;
  paintFrame: number | null;
  proofFrame: number | null;
};

type PhoneMethodPresentationHandle = PhonePresentationAdapterHandle & Readonly<{
  disposePresentation(token: PresentationToken): void;
}>;

function cancelMethodPresentationFrames(
  binding: PhoneMethodPresentationBinding
): void {
  if (typeof window === 'undefined') return;
  if (binding.paintFrame !== null) window.cancelAnimationFrame(binding.paintFrame);
  if (binding.proofFrame !== null) window.cancelAnimationFrame(binding.proofFrame);
  binding.paintFrame = null;
  binding.proofFrame = null;
}

/** The native Method leaf preserves the runner's complete static token. */
export function phoneMethodStaticPresentationFrame(
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

export function phoneMethodRequestsGradeAAtMount(hash: string): boolean {
  const scene = sceneFromHash(hash);
  /*
   * A direct Method entry must register its authored Grade A corridor before
   * the authority can measure and publish the native Method landing.
   */
  return scene === 'method-top' || phoneDirectEntryCompletesAod(scene);
}

/**
 * Owns the fixed AOD bridge and the first continuous Method reading section.
 * AOD supplies canonical progress; this adapter alone renders Method visuals.
 */
export const PhoneMethodTop = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneMethodAdapterProps
>(function PhoneMethodTop({
  active,
  motionDriver,
  onReady,
  stageHost,
  reducedMotion,
  directEntryScene = null
}, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const bridgeRef = useRef<HTMLDivElement | null>(null);
  const [steps, setSteps] = useState<HTMLOListElement | null>(null);
  const gradeASlotRef = useRef<HTMLDivElement | null>(null);
  const presentationBindingRef = useRef<PhoneMethodPresentationBinding | null>(null);
  const [gradeARequested, setGradeARequested] = useState(() => (
    typeof window !== 'undefined'
    && phoneMethodRequestsGradeAAtMount(window.location.hash)
  ));

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    if (!active || !steps) return;
    return motionDriver.revealReadingSteps(steps);
  }, [active, motionDriver]);

  const renderMethodProgress = useCallback((rawProgress: number) => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const progress = clamp(rawProgress);
    const ease = progress * progress * (3 - 2 * progress);
    const visible = progress > 0;
    motionDriver.set(bridge, {
      autoAlpha: ease,
      y: 30 * (1 - ease),
      filter: `blur(${((1 - ease) * 8).toFixed(2)}px)`
    });
    bridge.style.display = visible ? 'flex' : 'none';
  }, [motionDriver]);

  const requestBoundStaticPresentation = useCallback(() => {
    const binding = presentationBindingRef.current;
    if (
      !binding
      || binding.reported
      || binding.paintFrame !== null
      || binding.proofFrame !== null
      || typeof window === 'undefined'
    ) return;
    // The candidate projection has already made Method the target. Paint its
    // actual reading endpoint in one frame, then publish the exact raw token
    // only after the following browser frame has had a chance to composite.
    binding.paintFrame = window.requestAnimationFrame(() => {
      binding.paintFrame = null;
      if (presentationBindingRef.current !== binding || binding.reported) return;
      renderMethodProgress(1);
      if (!rootRef.current || presentationBindingRef.current !== binding) return;
      binding.proofFrame = window.requestAnimationFrame(() => {
        binding.proofFrame = null;
        if (presentationBindingRef.current !== binding || binding.reported) return;
        binding.reported = true;
        binding.frameSequence += 1;
        binding.report(phoneMethodStaticPresentationFrame(
          binding.token,
          binding.frameSequence,
          performance.now()
        ));
      });
    });
  }, [renderMethodProgress]);
  const methodPresentation = useMemo<PhoneMethodPresentationHandle>(() => ({
    presentPresentation(token, report) {
      const prior = presentationBindingRef.current;
      if (prior) cancelMethodPresentationFrames(prior);
      presentationBindingRef.current = {
        token,
        key: phoneRuntimePresentationTokenKey(token),
        report,
        frameSequence: 0,
        reported: false,
        paintFrame: null,
        proofFrame: null
      };
      requestBoundStaticPresentation();
    },
    disposePresentation(token) {
      const binding = presentationBindingRef.current;
      if (
        binding
        && binding.key === phoneRuntimePresentationTokenKey(token)
      ) {
        cancelMethodPresentationFrames(binding);
        presentationBindingRef.current = null;
      }
    }
  }), [requestBoundStaticPresentation]);

  useEffect(() => () => {
    const binding = presentationBindingRef.current;
    if (binding) cancelMethodPresentationFrames(binding);
    presentationBindingRef.current = null;
  }, []);

  useEffect(() => {
    if (gradeARequested) return;
    if (phoneMethodRequestsGradeAAtMount(window.location.hash)) {
      setGradeARequested(true);
      return;
    }
    const slot = gradeASlotRef.current;
    if (!slot || typeof IntersectionObserver === 'undefined') {
      setGradeARequested(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setGradeARequested(true);
        observer.disconnect();
      }
    }, { rootMargin: '400% 0px' });
    observer.observe(slot);
    return () => observer.disconnect();
  }, [gradeARequested]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update: renderMethodProgress,
    enter() {},
    leave() {},
    reverse() {},
    presentPresentation: methodPresentation.presentPresentation,
    disposePresentation: methodPresentation.disposePresentation,
    dispose() {
      const binding = presentationBindingRef.current;
      if (binding) cancelMethodPresentationFrames(binding);
      presentationBindingRef.current = null;
    }
  }), [methodPresentation, renderMethodProgress]);

  return (
    <>
      <section
        ref={rootRef}
        id="method"
        className="portrait-scroll-spike__reading"
        aria-label="同野观幂 AI 落地五步"
      >
        <div
          ref={bridgeRef}
          className="portrait-scroll-spike__reading-intro portrait-scroll-spike__method-bridge"
        >
          <div className="portrait-scroll-spike__method-bridge-content">
            <span>{METHOD_TOP_COPY[0]}</span>
            <h2 id="portrait-spike-method-title">
              <span>{METHOD_TOP_COPY[1]}</span>
              <span>{METHOD_TOP_COPY[2]}</span>
            </h2>
            <p>{METHOD_TOP_COPY[3]}</p>
          </div>
        </div>
        <ol
          ref={setSteps}
          className="portrait-scroll-spike__steps"
          aria-label="同野观幂 AI 落地五步"
        >
          {METHOD_STEPS.map((step) => (
            <li key={step.index}>
              <span>{step.index}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <div
        ref={gradeASlotRef}
        className="phone-grade-a-slot"
        data-phone-grade-a-requested={String(gradeARequested)}
      >
        {gradeARequested && (
          <Suspense fallback={null}>
            <PhoneGradeAStory
              reducedMotion={reducedMotion}
              stageHost={stageHost}
              methodCopySource={steps}
              methodPresentation={methodPresentation}
              directEntryScene={directEntryScene}
            />
          </Suspense>
        )}
      </div>
    </>
  );
});

export default PhoneMethodTop;
