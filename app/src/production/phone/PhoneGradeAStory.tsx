import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
import {
  FIGURE2_DISTANCE_EXPAND_SEGMENT
} from '../../story/figure2-distance-expand-contract';
import { usePhoneGradeAAdapters } from './usePhoneGradeAAdapters';
import {
  createPhoneGradeARunner,
  phoneGradeABoundaryProgress,
  type PhoneGradeARunView
} from './phone-grade-a-runtime';
import type {
  PhoneTransitionDirection
} from './phone-transition-coordinator';
import {
  usePhoneStoryOrchestrator
} from './PhoneStoryOrchestratorContext';
import type {
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import { PhoneBrandLabContinuation } from './PhoneBrandLabContinuation';
import {
  PhoneLabContactContinuation,
  type PhoneLabBoundary
} from './PhoneLabContactContinuation';
import { PhoneFigure2Arch } from './scenes/PhoneFigure2Arch';
import './PhoneGradeAStory.css';

const FIGURE2_PROOF_SPLIT = 0.72;
const ACTIVE_EDGE_TOLERANCE_PX = 1;
const GRADE_A_INK_BOUNDARIES = [0, 1, 2] as const;
export type GradeAInkBoundaryId = typeof GRADE_A_INK_BOUNDARIES[number];
const GRADE_A_PREPARE_TIMEOUT_MS = 10000;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneGradeAHandoffProgress(
  railTop: number,
  stageHeight: number
): number {
  return clamp((stageHeight - railTop) / Math.max(1, stageHeight));
}

export function phoneGradeAFigureProgress(
  railTop: number,
  railHeight: number
): number {
  return clamp(-railTop / Math.max(1, railHeight)) * FIGURE2_PROOF_SPLIT;
}

export function phoneGradeAArchFrame(
  revealProgress: number,
  figureProgress: number
): Readonly<{
  opacity: number;
  scale: number;
  blur: number;
  motionProgress: number;
}> {
  const reveal = clamp(revealProgress);
  const motionProgress = clamp(figureProgress / FIGURE2_PROOF_SPLIT);
  const eased = motionProgress * motionProgress * (3 - 2 * motionProgress);
  return {
    opacity: reveal * 0.98,
    scale: 1.025 + eased * 0.11,
    blur: eased * 3.6,
    motionProgress
  };
}

export function phoneGradeAProofProgress(
  trackTop: number,
  trackHeight: number,
  stageHeight: number
): number {
  return clamp(-trackTop / Math.max(1, trackHeight - stageHeight));
}

export function phoneGradeAProofBrandProgress(
  brandTop: number,
  stageHeight: number
): number {
  return clamp((stageHeight - brandTop) / Math.max(1, stageHeight));
}

export type PhoneGradeAStoryProps = Readonly<{
  reducedMotion: boolean;
  stageHost: HTMLElement | null;
  methodCopySource?: HTMLElement | null;
}>;

export function PhoneGradeAStory({
  reducedMotion,
  stageHost,
  methodCopySource = null
}: PhoneGradeAStoryProps) {
  const orchestrator = usePhoneStoryOrchestrator();
  const adapters = usePhoneGradeAAdapters();
  const {
    Figure2,
    Proof,
    MethodFigure2,
    Figure2Proof,
    ProofBrand
  } = adapters;
  const [adapterRevision, setAdapterRevision] = useState(0);
  const [figure2Ready, setFigure2Ready] = useState(false);
  const [proofReady, setProofReady] = useState(false);
  const [methodFigure2Ready, setMethodFigure2Ready] = useState(false);
  const [figure2ProofReady, setFigure2ProofReady] = useState(false);
  const [proofBrandReady, setProofBrandReady] = useState(false);
  const [brandRoot, setBrandRoot] = useState<HTMLElement | null>(null);
  const [labBoundary, setLabBoundary] = useState<PhoneLabBoundary | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const proofTrackRef = useRef<HTMLDivElement | null>(null);
  const surfacesRef = useRef<HTMLDivElement | null>(null);
  const methodPaperRef = useRef<HTMLDivElement | null>(null);
  const proofBrandSourceRef = useRef<HTMLDivElement | null>(null);
  const figure2Ref = useRef<PhoneSceneAdapterHandle | null>(null);
  const proofRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const methodFigure2Ref = useRef<PhoneTransitionAdapterHandle | null>(null);
  const figure2ProofRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const proofBrandRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const brandRootRef = useRef<HTMLElement | null>(null);
  const boundaryReadyRef = useRef(0);
  const boundaryReadyListenersRef = useRef(new Set<() => void>());
  const renderGradeAFrameRef = useRef<() => void>(() => undefined);
  const frameRef = useRef(0);
  const scenesReady = figure2Ready && proofReady;
  const methodBoundaryReady = Boolean(
    methodCopySource && figure2Ready && methodFigure2Ready
  );
  const figure2ProofBoundaryReady = scenesReady && figure2ProofReady;
  const proofBrandBoundaryReady = Boolean(
    proofReady && brandRoot && proofBrandReady
  );
  const runtimeReady = methodBoundaryReady && figure2ProofBoundaryReady;
  brandRootRef.current = brandRoot;
  boundaryReadyRef.current = (methodBoundaryReady ? 1 : 0)
    | (figure2ProofBoundaryReady ? 2 : 0)
    | (proofBrandBoundaryReady ? 4 : 0);

  const markFigure2Ready = useCallback(() => setFigure2Ready(true), []);
  const markProofReady = useCallback(() => setProofReady(true), []);
  const markMethodFigure2Ready = useCallback(
    () => setMethodFigure2Ready(true),
    []
  );
  const markFigure2ProofReady = useCallback(
    () => setFigure2ProofReady(true),
    []
  );
  const markProofBrandReady = useCallback(
    () => setProofBrandReady(true),
    []
  );

  const bindAdapter = useCallback(<Handle,>(
    target: { current: Handle | null },
    handle: Handle | null
  ) => {
    if (target.current === handle) return;
    target.current = handle;
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const bindFigure2 = useCallback(
    (handle: PhoneSceneAdapterHandle | null) => bindAdapter(figure2Ref, handle),
    [bindAdapter]
  );
  const bindProof = useCallback(
    (handle: PhoneSceneAdapterHandle | null) => bindAdapter(proofRef, handle),
    [bindAdapter]
  );
  const bindMethodFigure2 = useCallback(
    (handle: PhoneTransitionAdapterHandle | null) => (
      bindAdapter(methodFigure2Ref, handle)
    ),
    [bindAdapter]
  );
  const bindFigure2Proof = useCallback(
    (handle: PhoneTransitionAdapterHandle | null) => (
      bindAdapter(figure2ProofRef, handle)
    ),
    [bindAdapter]
  );
  const bindProofBrand = useCallback(
    (handle: PhoneTransitionAdapterHandle | null) => (
      bindAdapter(proofBrandRef, handle)
    ),
    [bindAdapter]
  );
  const bindBrandRoot = useCallback((nextRoot: HTMLElement | null) => {
    brandRootRef.current = nextRoot;
    setBrandRoot(nextRoot);
  }, []);
  const subscribeBoundaryReady = useCallback((listener: () => void) => {
    boundaryReadyListenersRef.current.add(listener);
    return () => boundaryReadyListenersRef.current.delete(listener);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const rail = railRef.current;
    const proofTrack = proofTrackRef.current;
    const surfaces = surfacesRef.current;
    if (!root || !rail || !proofTrack || !surfaces) return;
    const methodReading = document.getElementById('method');
    let runView: PhoneGradeARunView | null = null;
    const elementDocumentTop = (element: HTMLElement) => (
      window.scrollY + element.getBoundingClientRect().top
    );
    const brandBoundaryRoot = () => (
      brandRootRef.current
      ?? root.querySelector<HTMLElement>('[data-phone-continuation="brand-lab"]')
    );
    const boundaryPosition = (
      id: GradeAInkBoundaryId,
      direction: PhoneTransitionDirection
    ): number | null => {
      const stageHeight = Math.max(
        1,
        surfaces.clientHeight || window.innerHeight
      );
      if (id === 0) {
        const railTop = elementDocumentTop(rail);
        return direction === 1 ? railTop - stageHeight : railTop;
      }
      if (id === 1) {
        return elementDocumentTop(proofTrack)
          - direction * ACTIVE_EDGE_TOLERANCE_PX * 2;
      }
      const brandBoundary = brandBoundaryRoot();
      if (!brandBoundary) return null;
      const brandTop = elementDocumentTop(brandBoundary);
      return direction === 1 ? brandTop - stageHeight : brandTop;
    };

    const renderFrame = () => {
      frameRef.current = 0;
      if (!boundaryReadyRef.current) {
        root.dataset.phoneGradeAActive = 'false';
        surfaces.dataset.phoneGradeAActive = 'false';
        return;
      }
      const railRect = rail.getBoundingClientRect();
      const proofRect = proofTrack.getBoundingClientRect();
      const brandRect = brandBoundaryRoot()?.getBoundingClientRect();
      const stageHeight = Math.max(1, surfaces.clientHeight || window.innerHeight);
      const activeInk = runView;
      const railActive = railRect.top < stageHeight
        && railRect.bottom > 0;
      const proofActive = proofRect.top <= ACTIVE_EDGE_TOLERANCE_PX
        && proofRect.bottom >= stageHeight - ACTIVE_EDGE_TOLERANCE_PX;
      const proofBrandActive = Boolean(
        brandRect
        && brandRect.top < stageHeight - ACTIVE_EDGE_TOLERANCE_PX
        && brandRect.top > ACTIVE_EDGE_TOLERANCE_PX
        && brandRect.bottom > 0
      );
      const cursor = orchestrator.cursor();
      const stableGradeAHold = cursor.kind === 'hold'
        && (
          cursor.scene === 'method-top'
          || cursor.scene === 'figure2-animation'
          || cursor.scene === 'figure2-proof'
          || cursor.scene === 'brand'
        )
        ? cursor.scene
        : null;
      const active = Boolean((
        railActive && boundaryReadyRef.current & 1
      ) || (
        proofActive && boundaryReadyRef.current & 2
      ) || (
        proofBrandActive && boundaryReadyRef.current & 4
      ) || activeInk
        || stableGradeAHold === 'figure2-animation'
        || stableGradeAHold === 'figure2-proof');
      root.dataset.phoneGradeAActive = semanticBoolean(active);
      surfaces.dataset.phoneGradeAActive = semanticBoolean(active);
      if (methodReading) {
        const methodInk = activeInk?.id === 0;
        const methodInkProgress = stableGradeAHold
          ? stableGradeAHold === 'method-top' ? 0 : 1
          : methodInk
            ? activeInk.progress
            : 0;
        methodReading.dataset.phoneMethodFigure2InkActive = semanticBoolean(
          stableGradeAHold !== 'method-top'
          && (Boolean(stableGradeAHold) || railActive || methodInk)
        );
        methodReading.style.setProperty(
          '--phone-method-figure2-ink-progress',
          clamp(methodInkProgress).toFixed(4)
        );
      }
      const retainedArch = surfaces.querySelector<HTMLElement>(
        '[data-stage-retained-figure2-arch="true"]'
      );
      const setRetainedArchProgress = (
        revealProgress: number,
        figureProgress: number
      ) => {
        const frame = phoneGradeAArchFrame(revealProgress, figureProgress);
        retainedArch?.style.setProperty(
          '--phone-figure2-arch-opacity',
          frame.opacity.toFixed(4)
        );
        retainedArch?.style.setProperty(
          '--phone-figure2-arch-scale',
          frame.scale.toFixed(4)
        );
        retainedArch?.style.setProperty(
          '--phone-figure2-arch-blur',
          `${frame.blur.toFixed(2)}px`
        );
        if (retainedArch) {
          retainedArch.dataset.phoneFigure2ArchVisible = semanticBoolean(
            frame.opacity > 0.001
          );
          if (import.meta.env.DEV) {
            retainedArch.dataset.phoneFigure2ArchProgress = frame.motionProgress.toFixed(4);
          }
        }
      };

      const methodInk = activeInk?.id === 0;
      const figure2Ink = activeInk?.id === 1;
      // Once the Orchestrator has published a stable hold, sampled document
      // geometry is observational only. It must not replay an old rail branch
      // and hide the committed receiver after the atomic handoff.
      if (stableGradeAHold) {
        if (stableGradeAHold === 'method-top') {
          figure2Ref.current?.leave?.();
          setRetainedArchProgress(0, 0);
          methodFigure2Ref.current?.render(0);
          figure2ProofRef.current?.render(0);
          proofBrandRef.current?.render(0);
          proofRef.current?.update(0);
          proofRef.current?.leave?.();
          return;
        }
        if (stableGradeAHold === 'figure2-animation') {
          figure2Ref.current?.enter?.();
          setRetainedArchProgress(1, 0);
          methodFigure2Ref.current?.render(1);
          figure2ProofRef.current?.render(0);
          proofBrandRef.current?.render(0);
          proofRef.current?.update(0);
          proofRef.current?.leave?.();
          return;
        }
        if (stableGradeAHold === 'figure2-proof') {
          figure2Ref.current?.leave?.();
          setRetainedArchProgress(1, 1);
          methodFigure2Ref.current?.render(1);
          figure2ProofRef.current?.render(1);
          proofBrandRef.current?.render(0);
          proofRef.current?.update(1);
          proofRef.current?.enter?.();
          return;
        }
        figure2Ref.current?.leave?.();
        setRetainedArchProgress(1, 1);
        methodFigure2Ref.current?.render(1);
        figure2ProofRef.current?.render(1);
        proofBrandRef.current?.render(1);
        proofRef.current?.leave?.();
        return;
      }
      if (
        (railActive && boundaryReadyRef.current & 1)
        || methodInk
        || figure2Ink
      ) {
        figure2Ref.current?.enter?.();
        const handoff = methodInk
          ? activeInk.progress
          : figure2Ink ? 1 : reducedMotion
          ? phoneGradeAHandoffProgress(railRect.top, stageHeight)
          : phoneGradeABoundaryProgress(orchestrator.cursor(), 0);
        const figure = methodInk
          ? 0
          : figure2Ink
            ? FIGURE2_PROOF_SPLIT
              + (1 - FIGURE2_PROOF_SPLIT) * activeInk.progress
            : phoneGradeAFigureProgress(railRect.top, railRect.height);
        setRetainedArchProgress(handoff, figure);
        methodFigure2Ref.current?.render(handoff);
        if (figure2Ink) {
          figure2ProofRef.current?.render(activeInk.progress);
        } else {
          figure2Ref.current?.update(clamp(figure / FIGURE2_PROOF_SPLIT));
        }
        proofBrandRef.current?.render(0);
        proofRef.current?.update(0);
        if (figure2Ink) {
          proofRef.current?.enter?.();
          return;
        }
        return;
      }

      // Proof and Brand share the exact viewport edge. While the autonomous
      // boundary owns that edge, it must outrank Proof's terminal hold or the
      // render would return here for all 600ms and the ink would never paint.
      if (
        proofActive
        && Boolean(boundaryReadyRef.current & 2)
        && activeInk?.id !== 2
      ) {
        setRetainedArchProgress(1, 1);
        const proof = phoneGradeAProofProgress(
          proofRect.top,
          proofRect.height,
          stageHeight
        );
        methodFigure2Ref.current?.render(1);
        figure2ProofRef.current?.render(1);
        figure2Ref.current?.leave?.();
        proofBrandRef.current?.render(0);
        proofRef.current?.update(proof);
        proofRef.current?.enter?.();
        return;
      }

      if (
        (proofBrandActive || activeInk?.id === 2)
        && Boolean(boundaryReadyRef.current & 4)
        && brandRect
      ) {
        const handoff = activeInk?.id === 2
          ? activeInk.progress
          : reducedMotion
          ? phoneGradeAProofBrandProgress(brandRect.top, stageHeight)
          : phoneGradeABoundaryProgress(orchestrator.cursor(), 2);
        setRetainedArchProgress(1, 1);
        methodFigure2Ref.current?.render(1);
        figure2ProofRef.current?.render(1);
        figure2Ref.current?.leave?.();
        proofRef.current?.update(1);
        proofRef.current?.enter?.();
        proofBrandRef.current?.render(handoff);
        return;
      }

      if (
        boundaryReadyRef.current & 4
        && brandRect
        && brandRect.top <= ACTIVE_EDGE_TOLERANCE_PX
      ) {
        figure2Ref.current?.leave?.();
        if (phoneGradeABoundaryProgress(orchestrator.cursor(), 2) >= 1) {
          proofBrandRef.current?.render(1);
          proofRef.current?.leave?.();
        } else {
          proofBrandRef.current?.render(0);
          proofRef.current?.update(1);
          proofRef.current?.enter?.();
        }
      }

      if (railRect.top >= stageHeight) {
        figure2Ref.current?.leave?.();
        setRetainedArchProgress(0, 0);
        methodFigure2Ref.current?.render(0);
        figure2ProofRef.current?.render(0);
        proofBrandRef.current?.render(0);
        proofRef.current?.update(0);
      }
    };

    const runner = createPhoneGradeARunner({
      orchestrator,
      boundaries: GRADE_A_INK_BOUNDARIES.map((id) => ({
        id,
        ready: () => Boolean(boundaryReadyRef.current & 1 << id),
        subscribeReady: subscribeBoundaryReady,
        position: (direction: PhoneTransitionDirection) => (
          boundaryPosition(id, direction)
        ),
        ...(id === 1 ? {
          durationMs: FIGURE2_DISTANCE_EXPAND_SEGMENT.policy.playMs[1]
        } : {}),
        transition: () => id === 0
          ? methodFigure2Ref.current
          : id === 1 ? figure2ProofRef.current : proofBrandRef.current,
        ...(id < 2 ? {
          prepareReceiver: async (request) => {
            const figure2Receives = id === 0
              ? request.direction === 1
              : request.direction === -1;
            if (!figure2Receives) return;
            const prepare = figure2Ref.current?.prepareTargetPresentation;
            if (!prepare) {
              throw new Error('Figure2 receiver unavailable');
            }
            await prepare(request);
          }
        } : {}),
        from: () => id === 0
          ? methodCopySource
          : id === 1
            ? figure2Ref.current?.root() ?? null
            : proofBrandSourceRef.current,
        to: () => id === 0
          ? figure2Ref.current?.root() ?? null
          : id === 1 ? proofRef.current?.root() ?? null : brandBoundaryRoot()
      })),
      reducedMotion,
      timeoutMs: GRADE_A_PREPARE_TIMEOUT_MS,
      onRunView(next) {
        runView = next;
        renderFrame();
      }
    });

    const schedule = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(renderFrame);
    };
    renderGradeAFrameRef.current = schedule;
    renderFrame();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      runner.dispose();
      runView = null;
      renderGradeAFrameRef.current = () => undefined;
      if (methodReading) {
        delete methodReading.dataset.phoneMethodFigure2InkActive;
        methodReading.style.removeProperty('--phone-method-figure2-ink-progress');
      }
    };
  }, [
    methodCopySource,
    orchestrator,
    reducedMotion,
    subscribeBoundaryReady,
    stageHost
  ]);

  useLayoutEffect(() => {
    for (const listener of boundaryReadyListenersRef.current) listener();
    renderGradeAFrameRef.current();
  }, [
    adapterRevision,
    figure2ProofBoundaryReady,
    methodBoundaryReady,
    proofBrandBoundaryReady
  ]);

  const surfaces = (
    <div
      ref={surfacesRef}
      className="phone-grade-a__surfaces"
      data-phone-grade-a-active="false"
      data-testid="r2-stage"
    >
      <div
        ref={methodPaperRef}
        className="phone-grade-a__method-paper"
        data-phone-grade-a-method-paper="true"
        aria-hidden="true"
      />
      {Figure2 && (
        <Figure2
          ref={bindFigure2}
          active={false}
          reducedMotion={reducedMotion}
          onReady={markFigure2Ready}
        />
      )}
      <div
        ref={proofBrandSourceRef}
        className="phone-grade-a__proof-brand-source"
        data-phone-proof-brand-source="proof-and-arch"
      >
        {Proof && (
          <Proof
            ref={bindProof}
            active={runtimeReady}
            reducedMotion={reducedMotion}
            onReady={markProofReady}
          />
        )}
        <PhoneFigure2Arch />
      </div>
      {figure2Ready && methodCopySource && MethodFigure2 && (
        <MethodFigure2
          ref={bindMethodFigure2}
          host={surfacesRef.current}
          from={methodPaperRef.current}
          additionalFrom={methodCopySource}
          to={figure2Ref.current?.root() ?? null}
          reducedMotion={reducedMotion}
          onReady={markMethodFigure2Ready}
        />
      )}
      {scenesReady && Figure2Proof && (
        <Figure2Proof
          ref={bindFigure2Proof}
          host={surfacesRef.current}
          from={figure2Ref.current?.root() ?? null}
          to={proofRef.current?.root() ?? null}
          reducedMotion={reducedMotion}
          onReady={markFigure2ProofReady}
        />
      )}
      {proofReady && brandRoot && ProofBrand && (
        <ProofBrand
          ref={bindProofBrand}
          host={surfacesRef.current}
          from={proofBrandSourceRef.current}
          to={brandRoot}
          reducedMotion={reducedMotion}
          onReady={markProofBrandReady}
        />
      )}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="phone-grade-a"
      data-phone-grade-a-active="false"
    >
      <div
        id="figure2-animation"
        ref={railRef}
        className="phone-grade-a__figure-track"
        aria-hidden="true"
      />
      <div
        id="figure2-proof"
        ref={proofTrackRef}
        className="phone-grade-a__proof-track"
        aria-hidden="true"
      />
      <PhoneBrandLabContinuation
        reducedMotion={reducedMotion}
        stageHost={stageHost}
        onBrandRootChange={bindBrandRoot}
        onLabBoundaryChange={setLabBoundary}
      />
      <PhoneLabContactContinuation
        reducedMotion={reducedMotion}
        stageHost={stageHost}
        fromLabBoundary={true}
        labBoundary={labBoundary}
      />
      {stageHost ? createPortal(surfaces, stageHost) : null}
    </div>
  );
}

export default PhoneGradeAStory;
