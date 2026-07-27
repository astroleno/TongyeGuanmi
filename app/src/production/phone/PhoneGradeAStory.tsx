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
  createPhoneGradeARunner
} from './phone-grade-a-runtime';
import type {
  PhoneTransitionDirection
} from './phone-transition-coordinator';
import type { PhoneLandingReason } from './phone-scroll-corridor-registry';
import {
  usePhoneStoryOrchestrator,
  usePhoneStorySnapshot
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

/**
 * Figure2 has distinct entry and completed endpoint markers. A reverse from
 * Proof (and a forward rollback from that handoff) must retain the completed
 * Figure2 endpoint so the first stable snapshot does not jump back to zero.
 */
export function phoneGradeAFigure2LandingBoundary(
  reason: PhoneLandingReason,
  direction: PhoneTransitionDirection
): 0 | 1 {
  return (reason === 'reverse' && direction === -1)
    || (reason === 'rollback' && direction === 1)
    ? 1
    : 0;
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

function surfaceIsProjected(
  sourceSurface: string | null,
  receiverSurface: string,
  id: string
): boolean {
  return sourceSurface === id || receiverSurface === id;
}

export function PhoneGradeAStory({
  reducedMotion,
  stageHost,
  methodCopySource = null
}: PhoneGradeAStoryProps) {
  const orchestrator = usePhoneStoryOrchestrator();
  const snapshot = usePhoneStorySnapshot();
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
  const scenesReady = figure2Ready && proofReady;
  const methodBoundaryReady = Boolean(
    methodCopySource && figure2Ready && methodFigure2Ready
  );
  const figure2ProofBoundaryReady = scenesReady && figure2ProofReady;
  const proofBrandBoundaryReady = Boolean(
    proofReady && brandRoot && proofBrandReady
  );
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

  /*
   * Grade A supplies authored geometry and adapter capabilities only. The
   * document sampler chooses this corridor from the current authority
   * snapshot; no component-owned scroll handler can publish a scene or frame.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    const rail = railRef.current;
    const proofTrack = proofTrackRef.current;
    const surfaces = surfacesRef.current;
    if (!root || !rail || !proofTrack || !surfaces) return;
    const elementDocumentTop = (element: HTMLElement) => (
      window.scrollY + element.getBoundingClientRect().top
    );
    const brandBoundaryRoot = () => (
      brandRootRef.current
      ?? root.querySelector<HTMLElement>('[data-phone-continuation="brand-lab"]')
    );
    const stageHeight = (fallback: number) => Math.max(
      1,
      surfaces.clientHeight || fallback || window.innerHeight
    );
    const boundaryPosition = (
      id: GradeAInkBoundaryId,
      direction: PhoneTransitionDirection
    ): number | null => {
      const height = stageHeight(window.innerHeight);
      if (id === 0) {
        const railTop = elementDocumentTop(rail);
        return direction === 1 ? railTop - height : railTop;
      }
      if (id === 1) {
        return elementDocumentTop(proofTrack)
          - direction * ACTIVE_EDGE_TOLERANCE_PX * 2;
      }
      const brandBoundary = brandBoundaryRoot();
      if (!brandBoundary) return null;
      const brandTop = elementDocumentTop(brandBoundary);
      return direction === 1 ? brandTop - height : brandTop;
    };
    const surfaceLeases = [
      orchestrator.registerSurface({
        id: 'grade-a:figure2',
        scene: 'figure2-animation',
        kind: 'fixed',
        root: () => figure2Ref.current?.root() ?? null,
        coverageRoot: () => figure2Ref.current?.root() ?? null,
        presented: () => true
      }),
      orchestrator.registerSurface({
        id: 'grade-a:proof',
        scene: 'figure2-proof',
        kind: 'fixed',
        root: () => proofRef.current?.root() ?? null,
        coverageRoot: () => proofRef.current?.root() ?? null,
        presented: () => true
      })
    ];
    const corridorLease = orchestrator.registerScrollCorridor({
      id: 'method-grade-a',
      scenes: ['method-top', 'figure2-animation', 'figure2-proof'],
      sample(viewport) {
        const current = orchestrator.getSnapshot();
        const delta = viewport.actualY - current.scroll.actualY;
        const direction = delta > .5 ? 1 : delta < -.5 ? -1 : 0;
        if (current.status === 'transaction') {
          return { actualY: viewport.actualY, direction };
        }
        const height = stageHeight(viewport.viewportHeight);
        const semanticScene = current.projection.semanticScene;
        if (semanticScene === 'method-top') {
          return {
            actualY: viewport.actualY,
            scene: 'method-top',
            progress: phoneGradeAHandoffProgress(
              rail.getBoundingClientRect().top,
              height
            ),
            direction
          };
        }
        if (semanticScene === 'figure2-animation') {
          return {
            actualY: viewport.actualY,
            scene: 'figure2-animation',
            progress: phoneGradeAFigureProgress(
              rail.getBoundingClientRect().top,
              rail.getBoundingClientRect().height
            ),
            direction
          };
        }
        if (semanticScene === 'figure2-proof') {
          return {
            actualY: viewport.actualY,
            scene: 'figure2-proof',
            progress: phoneGradeAProofProgress(
              proofTrack.getBoundingClientRect().top,
              proofTrack.getBoundingClientRect().height,
              height
            ),
            direction
          };
        }
        return { actualY: viewport.actualY, direction };
      },
      boundary(run, direction) {
        if (run === 'method-figure2') return boundaryPosition(0, direction);
        if (run === 'figure2-proof') return boundaryPosition(1, direction);
        if (run === 'proof-brand') return boundaryPosition(2, direction);
        return null;
      },
      landing(scene, reason, direction) {
        if (scene === 'method-top') {
          const method = document.getElementById('method');
          return method ? elementDocumentTop(method) : null;
        }
        if (scene === 'figure2-animation') {
          return boundaryPosition(
            phoneGradeAFigure2LandingBoundary(reason, direction),
            direction
          );
        }
        if (scene === 'figure2-proof') {
          return boundaryPosition(1, direction);
        }
        return null;
      }
    });
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
          ? document.getElementById('method')
          : id === 1
            ? figure2Ref.current?.root() ?? null
            : proofBrandSourceRef.current,
        to: () => id === 0
          ? figure2Ref.current?.root() ?? null
          : id === 1 ? proofRef.current?.root() ?? null : brandBoundaryRoot()
      })),
      reducedMotion,
      timeoutMs: GRADE_A_PREPARE_TIMEOUT_MS
    });
    return () => {
      for (const lease of surfaceLeases) lease.dispose();
      corridorLease.dispose();
      runner.dispose();
      const method = document.getElementById('method');
      method?.style.removeProperty('--phone-method-figure2-ink-progress');
    };
  }, [
    methodCopySource,
    orchestrator,
    reducedMotion,
    stageHost,
    subscribeBoundaryReady
  ]);

  /*
   * Adapter refs and lazy receivers are capabilities rather than presentation
   * state. Their arrival only resumes the authority-owned session and asks
   * the projector to reapply the current snapshot's role plan.
   */
  useLayoutEffect(() => {
    for (const listener of boundaryReadyListenersRef.current) listener();
    orchestrator.syncDiagnostics();
  }, [
    adapterRevision,
    figure2ProofBoundaryReady,
    methodBoundaryReady,
    orchestrator,
    proofBrandBoundaryReady
  ]);

  /*
   * Snapshot -> adapter rendering bridge. Geometry contributes only to the
   * current corridor sample above; stable and transaction frames always read
   * the same immutable authority snapshot.
   */
  useLayoutEffect(() => {
    const surfaces = surfacesRef.current;
    const method = document.getElementById('method');
    if (!surfaces) return;
    const retainedArch = surfaces.querySelector<HTMLElement>(
      '[data-stage-retained-figure2-arch="true"]'
    );
    const methodPaper = methodPaperRef.current;
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
        frame.blur.toFixed(2) + 'px'
      );
      if (retainedArch) {
        retainedArch.dataset.phoneFigure2ArchVisible = semanticBoolean(
          frame.opacity > 0.001
        );
        if (import.meta.env.DEV) {
          retainedArch.dataset.phoneFigure2ArchProgress =
            frame.motionProgress.toFixed(4);
        }
      }
    };
    const setMethodInkProgress = (progress: number) => {
      method?.style.setProperty(
        '--phone-method-figure2-ink-progress',
        clamp(progress).toFixed(4)
      );
    };
    const renderStableMethod = () => {
      methodPaper?.style.setProperty('visibility', 'hidden');
      setMethodInkProgress(0);
      figure2Ref.current?.leave?.();
      proofRef.current?.leave?.();
      methodFigure2Ref.current?.render(0);
      figure2ProofRef.current?.render(0);
      proofBrandRef.current?.render(0);
      proofRef.current?.update(0);
      setRetainedArchProgress(0, 0);
    };
    const renderStableFigure2 = () => {
      const figureProgress = snapshot.scroll.corridor === 'method-grade-a'
        ? snapshot.scroll.progress
        : 0;
      methodPaper?.style.setProperty('visibility', 'hidden');
      setMethodInkProgress(1);
      figure2Ref.current?.enter?.();
      figure2Ref.current?.update(
        clamp(figureProgress / FIGURE2_PROOF_SPLIT)
      );
      proofRef.current?.leave?.();
      methodFigure2Ref.current?.render(1);
      figure2ProofRef.current?.render(0);
      proofBrandRef.current?.render(0);
      proofRef.current?.update(0);
      setRetainedArchProgress(1, figureProgress);
    };
    const renderStableProof = () => {
      const proofProgress = snapshot.scroll.corridor === 'method-grade-a'
        ? snapshot.scroll.progress
        : 0;
      methodPaper?.style.setProperty('visibility', 'hidden');
      setMethodInkProgress(1);
      figure2Ref.current?.leave?.();
      methodFigure2Ref.current?.render(1);
      figure2ProofRef.current?.render(1);
      proofBrandRef.current?.render(0);
      proofRef.current?.update(proofProgress);
      proofRef.current?.enter?.();
      setRetainedArchProgress(1, 1);
    };
    const renderStableBrand = () => {
      methodPaper?.style.setProperty('visibility', 'hidden');
      setMethodInkProgress(1);
      figure2Ref.current?.leave?.();
      proofRef.current?.leave?.();
      methodFigure2Ref.current?.render(1);
      figure2ProofRef.current?.render(1);
      proofBrandRef.current?.render(1);
      proofRef.current?.update(1);
      setRetainedArchProgress(1, 1);
    };

    if (snapshot.status === 'transaction') {
      const { operation, phase } = snapshot.session;
      const sourceProgress = operation.direction === 1 ? 0 : 1;
      const progress = phase.startsWith('rollback-')
        ? sourceProgress
        : snapshot.session.progress;
      switch (operation.run) {
        case 'method-figure2':
          setMethodInkProgress(progress);
          figure2Ref.current?.enter?.();
          figure2Ref.current?.update(0);
          proofRef.current?.leave?.();
          methodFigure2Ref.current?.render(progress);
          figure2ProofRef.current?.render(0);
          proofBrandRef.current?.render(0);
          proofRef.current?.update(0);
          setRetainedArchProgress(progress, 0);
          return;
        case 'figure2-proof':
          methodPaper?.style.setProperty('visibility', 'hidden');
          setMethodInkProgress(1);
          figure2Ref.current?.enter?.();
          figure2Ref.current?.update(1);
          proofRef.current?.enter?.();
          methodFigure2Ref.current?.render(1);
          figure2ProofRef.current?.render(progress);
          proofBrandRef.current?.render(0);
          proofRef.current?.update(progress);
          setRetainedArchProgress(
            1,
            FIGURE2_PROOF_SPLIT
              + (1 - FIGURE2_PROOF_SPLIT) * progress
          );
          return;
        case 'proof-brand':
          methodPaper?.style.setProperty('visibility', 'hidden');
          setMethodInkProgress(1);
          figure2Ref.current?.leave?.();
          proofRef.current?.enter?.();
          methodFigure2Ref.current?.render(1);
          figure2ProofRef.current?.render(1);
          proofBrandRef.current?.render(progress);
          proofRef.current?.update(1);
          setRetainedArchProgress(1, 1);
          return;
        default:
          return;
      }
    }

    switch (snapshot.projection.semanticScene) {
      case 'method-top':
        renderStableMethod();
        return;
      case 'figure2-animation':
        renderStableFigure2();
        return;
      case 'figure2-proof':
        renderStableProof();
        return;
      case 'brand':
        renderStableBrand();
        return;
      default:
        return;
    }
  }, [adapterRevision, snapshot]);

  const figure2Active = surfaceIsProjected(
    snapshot.projection.sourceSurface,
    snapshot.projection.receiverSurface,
    'grade-a:figure2'
  );
  const proofActive = surfaceIsProjected(
    snapshot.projection.sourceSurface,
    snapshot.projection.receiverSurface,
    'grade-a:proof'
  );
  const surfaces = (
    <div
      ref={surfacesRef}
      className="phone-grade-a__surfaces"
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
          active={figure2Active}
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
            active={proofActive}
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
    <div ref={rootRef} className="phone-grade-a">
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
