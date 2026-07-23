import {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { METHOD_COPY } from '../../../story/copy';
import { sceneFromHash } from '../../navigation';
import type {
  PhoneMethodAdapterProps,
  PhoneSceneAdapterHandle
} from '../types';
import { phoneDirectEntryCompletesAod } from '../phone-stage-timeline';
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
  onGradeACheckpoint,
  onGradeASceneChange,
  onGradeAEdgeScene,
  reducedMotion
}, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const bridgeRef = useRef<HTMLDivElement | null>(null);
  const stepsRef = useRef<HTMLOListElement | null>(null);
  const gradeASlotRef = useRef<HTMLDivElement | null>(null);
  const [gradeARequested, setGradeARequested] = useState(false);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    const steps = stepsRef.current;
    if (!active || !steps) return;
    return motionDriver.revealReadingSteps(steps);
  }, [active, motionDriver]);

  useEffect(() => {
    if (!active || gradeARequested) return;
    const scene = sceneFromHash(window.location.hash);
    if (phoneDirectEntryCompletesAod(scene)) {
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
  }, [active, gradeARequested]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(rawProgress) {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      const progress = clamp(rawProgress);
      const ease = progress * progress * (3 - 2 * progress);
      const visible = progress > 0.001;
      const owner = rootRef.current?.closest<HTMLElement>('.portrait-scroll-spike');
      if (owner) {
        owner.dataset.portraitAodMethodVisible = String(visible);
        owner.dataset.portraitMethodEntrance = progress.toFixed(4);
      }
      motionDriver.set(bridge, {
        autoAlpha: ease,
        y: 30 * (1 - ease),
        filter: `blur(${((1 - ease) * 8).toFixed(2)}px)`
      });
      bridge.style.display = visible ? 'flex' : 'none';
    },
    enter() {},
    leave() {},
    reverse() {},
    dispose() {}
  }), [motionDriver]);

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
          ref={stepsRef}
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
              {...(onGradeACheckpoint
                ? { onCheckpoint: onGradeACheckpoint }
                : {})}
              {...(onGradeASceneChange
                ? { onSceneChange: onGradeASceneChange }
                : {})}
              {...(onGradeAEdgeScene
                ? { onEdgeScene: onGradeAEdgeScene }
                : {})}
            />
          </Suspense>
        )}
      </div>
    </>
  );
});

export default PhoneMethodTop;
