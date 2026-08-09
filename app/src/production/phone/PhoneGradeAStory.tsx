import {
  useCallback,
  lazy,
  useLayoutEffect,
  useMemo,
  useRef,
  Suspense,
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
  usePhoneStoryRuntimePort,
  usePhoneStorySnapshot
} from './PhoneStoryRuntimeContext';
import {
  phoneRuntimePresentationTokenKey,
  registerPhoneRuntimeSampledScrollCorridor,
  registerPhoneRuntimeSurface,
  selectPhoneCinematicSnapshot,
  syncPhoneRuntimeDiagnostics,
  type PhoneCinematicSnapshot
} from './phone-story/runtime';
import type { SceneId } from '../../story/types';
import type {
  PhonePresentationAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import { PhoneFigure2Arch } from './scenes/PhoneFigure2Arch';
import './PhoneGradeAStory.css';

const PhoneStoryTailBundle = lazy(() => (
  import('./PhoneStoryTailBundle').then((module) => ({
    default: module.PhoneStoryTailBundle
  }))
));

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
  return phoneGradeAFigure2LandingMode(reason, direction) === 'completed-edge'
    ? 1
    : 0;
}

/**
 * An entering Figure2 hold must land on the mounted Figure2 corridor origin,
 * not on the upstream point that started the Method boundary transaction.
 * The completed edge remains necessary only when returning from Proof.
 */
export function phoneGradeAFigure2LandingMode(
  reason: PhoneLandingReason,
  direction: PhoneTransitionDirection
): 'rendered-origin' | 'completed-edge' {
  return (reason === 'reverse' && direction === -1)
    || (reason === 'rollback' && direction === 1)
    ? 'completed-edge'
    : 'rendered-origin';
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

export function phoneGradeAArchMounted(
  snapshot: PhoneCinematicSnapshot
): boolean {
  const scene = snapshot[0];
  const run = snapshot[6];
  const status = snapshot[11];
  return status === 'transaction'
    ? run === 'method-figure2'
      || run === 'figure2-proof'
      || run === 'proof-brand'
    : scene === 'figure2-animation' || scene === 'figure2-proof';
}

export function phoneGradeAProofProgress(
  trackTop: number,
  trackHeight: number,
  stageHeight: number
): number {
  return clamp(-trackTop / Math.max(1, trackHeight - stageHeight));
}

/**
 * The Ink timeline owns the Figure2 → Proof transition endpoint.  Once it
 * reaches target verification, the target surface must instead expose its
 * canonical opening frame so the token-bound proof can be observed before
 * document scrolling becomes the owner again.
 */
export function phoneGradeAProofTransitionProgress(
  phase: string | null | undefined,
  sessionProgress: number | null | undefined
): number {
  return phase === 'preparing' || phase === 'animating'
    ? clamp(sessionProgress ?? 0)
    : 0;
}

/**
 * Proof → Brand normally retains the closing Proof panel. In the inverse
 * Brand → Proof terminal verification, the candidate Proof surface instead
 * needs its opening panel in the viewport before the token-bound proof can
 * be accepted. Rollback still belongs to Brand and retains the closing panel.
 */
export function phoneGradeAProofBrandTransitionProgress(
  phase: string | null | undefined,
  direction: PhoneTransitionDirection
): 0 | 1 {
  return direction === -1 && (
    phase === 'verifying-target'
    || phase === 'releasing-layout'
    || phase === 'measuring-landing'
    || phase === 'aligning-scroll'
    || phase === 'verifying-stable'
  )
    ? 0
    : 1;
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
  /** Direct-entry leaf preload only; it cannot publish runtime state. */
  directEntryScene?: SceneId | null;
  methodCopySource?: HTMLElement | null;
  /** Direct parent leaf for reverse reduced admission; not a global registry. */
  methodPresentation?: PhonePresentationAdapterHandle | null;
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
  directEntryScene = null,
  methodCopySource = null,
  methodPresentation = null
}: PhoneGradeAStoryProps) {
  const orchestrator = usePhoneStoryRuntimePort();
  const storySnapshot = usePhoneStorySnapshot();
  const cinematicSnapshot = useMemo(
    () => selectPhoneCinematicSnapshot(storySnapshot),
    [storySnapshot]
  );
  const archMounted = phoneGradeAArchMounted(cinematicSnapshot);
  const [
    semanticScene,
    sourceSurface,
    receiverSurface,
    ,
    ,
    ,
    run,
    direction,
    ,
    phase,
    sessionProgress,
    status,
    ,
    ,
    ,
    scrollCorridor,
    scrollProgress
  ] = cinematicSnapshot;
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
  const archReadyRef = useRef(false);
  const brandRootRef = useRef<HTMLElement | null>(null);
  const brandPresentationRef = useRef<PhonePresentationAdapterHandle | null>(null);
  const boundaryReadyRef = useRef(0);
  const boundaryReadyListenersRef = useRef(new Set<() => void>());
  const scenesReady = figure2Ready && proofReady;
  const methodBoundaryReady = Boolean(
    methodCopySource && figure2Ready && methodFigure2Ready
    && (!reducedMotion || methodPresentation)
  );
  const figure2ProofBoundaryReady = scenesReady && figure2ProofReady;
  const proofBrandBoundaryReady = Boolean(
    proofReady
      && brandRoot
      && (reducedMotion ? brandPresentationRef.current : proofBrandReady)
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
  const bindBrandPresentation = useCallback((
    handle: PhonePresentationAdapterHandle | null
  ) => {
    if (brandPresentationRef.current === handle) return;
    brandPresentationRef.current = handle;
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const subscribeBoundaryReady = useCallback((listener: () => void) => {
    boundaryReadyListenersRef.current.add(listener);
    return () => boundaryReadyListenersRef.current.delete(listener);
  }, []);
  const markArchReady = useCallback(() => {
    if (!archMounted) return;
    archReadyRef.current = true;
    for (const listener of boundaryReadyListenersRef.current) listener();
    syncPhoneRuntimeDiagnostics(orchestrator);
  }, [archMounted, orchestrator]);
  if (!archMounted) archReadyRef.current = false;

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
    if (!root || !rail || !proofTrack || !surfaces || !stageHost) return;
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
    const brandLandingPosition = () => {
      const brand = brandBoundaryRoot();
      return brand ? elementDocumentTop(brand) : null;
    };
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
      const brandTop = brandLandingPosition();
      if (brandTop === null) return null;
      return direction === 1 ? brandTop - height : brandTop;
    };
    const figure2LandingPosition = (
      reason: PhoneLandingReason,
      direction: PhoneTransitionDirection
    ): number | null => {
      if (phoneGradeAFigure2LandingMode(reason, direction) === 'completed-edge') {
        return boundaryPosition(1, direction);
      }
      // This is measured from the mounted document corridor immediately before
      // the runtime requests its landing. It is the first visible Figure2
      // origin, whereas boundary 0 is only the upstream Method trigger.
      return elementDocumentTop(rail);
    };
    const surfaceLeases = [
      registerPhoneRuntimeSurface(
        orchestrator,
        'grade-a:figure2',
        'figure2-animation',
        'fixed',
        () => figure2Ref.current?.root() ?? null,
        () => stageHost,
        (request) => {
          const prepare = figure2Ref.current?.prepareTargetPresentation;
          if (!prepare) {
            throw new Error('Figure2 direct-entry receiver unavailable');
          }
          return prepare({
            progress: 0,
            direction: 1,
            runId: `${request.sessionId}:${request.generation}:direct`,
            presentationToken: request.token,
            signal: request.signal,
            directEntry: true
          });
        },
        {
          present(token, report) {
            figure2Ref.current?.presentPresentation?.(token, report);
          },
          dispose(token) {
            figure2Ref.current?.disposePresentation?.(token);
          }
        },
        (token) => {
          const marker = figure2Ref.current?.root()
            ?.querySelector<HTMLElement>(
              '.r4-figure2__media-stack--combined'
            )?.dataset.figure2StaticPoster;
          return marker === phoneRuntimePresentationTokenKey(token);
        }
      ),
      registerPhoneRuntimeSurface(
        orchestrator,
        'grade-a:proof',
        'figure2-proof',
        'fixed',
        () => proofRef.current?.root() ?? null,
        () => stageHost,
        undefined,
        {
          present(token, report) {
            proofRef.current?.presentPresentation?.(token, report);
          },
          dispose(token) {
            proofRef.current?.disposePresentation?.(token);
          }
        },
        (token) => (
          proofRef.current?.root()?.dataset.figure2ProofStaticPoster
            === phoneRuntimePresentationTokenKey(token)
        )
      )
    ];
    const corridorLease = registerPhoneRuntimeSampledScrollCorridor(
      orchestrator,
      'method-grade-a',
      ['method-top', 'figure2-animation', 'figure2-proof'],
      (actualY, _viewportWidth, viewportHeight) => {
        const current = selectPhoneCinematicSnapshot(
          orchestrator.getSnapshot()
        );
        const delta = actualY - current[14];
        const direction = delta > .5 ? 1 : delta < -.5 ? -1 : 0;
        if (current[11] === 'transaction') {
          return [actualY, null, null, direction, null];
        }
        const height = stageHeight(viewportHeight);
        const sampledScene = current[0];
        if (sampledScene === 'method-top') {
          return [
            actualY,
            'method-top',
            null,
            direction,
            phoneGradeAHandoffProgress(rail.getBoundingClientRect().top, height)
          ];
        }
        if (sampledScene === 'figure2-animation') {
          return [
            actualY,
            'figure2-animation',
            null,
            direction,
            phoneGradeAFigureProgress(
              rail.getBoundingClientRect().top,
              rail.getBoundingClientRect().height
            )
          ];
        }
        if (sampledScene === 'figure2-proof') {
          return [
            actualY,
            'figure2-proof',
            null,
            direction,
            phoneGradeAProofProgress(
              proofTrack.getBoundingClientRect().top,
              proofTrack.getBoundingClientRect().height,
              height
            )
          ];
        }
        return [actualY, null, null, direction, null];
      },
      (run, direction) => {
        // Direct Method entries do not mount the front fixed-stage corridor.
        // The Method leaf still owns the physical reverse boundary, so expose
        // that authored document coordinate from the Grade-A corridor instead
        // of letting the engine fall back to pass-native with no boundary.
        if (run === 'aod-method' && direction === -1) {
          const method = document.getElementById('method');
          return method ? elementDocumentTop(method) : null;
        }
        if (run === 'method-figure2') return boundaryPosition(0, direction);
        if (run === 'figure2-proof') return boundaryPosition(1, direction);
        if (run === 'proof-brand') return boundaryPosition(2, direction);
        return null;
      },
      (scene, reason, direction) => {
        if (scene === 'method-top') {
          const method = document.getElementById('method');
          return method ? elementDocumentTop(method) : null;
        }
        if (scene === 'figure2-animation') {
          return figure2LandingPosition(reason, direction);
        }
        if (scene === 'figure2-proof') {
          return boundaryPosition(1, direction);
        }
        if (scene === 'brand') {
          return brandLandingPosition();
        }
        return null;
      }
    );
    const runner = createPhoneGradeARunner({
      orchestrator,
      boundaries: GRADE_A_INK_BOUNDARIES.map((id) => ({
        id,
        ready: () => Boolean(boundaryReadyRef.current & 1 << id)
          && (id !== 2 || archReadyRef.current),
        subscribeReady: subscribeBoundaryReady,
        position: (direction: PhoneTransitionDirection) => (
          boundaryPosition(id, direction)
        ),
        ...(id === 0 ? {
          reducedTargetPosition: (direction: PhoneTransitionDirection) => {
            if (direction === 1) return boundaryPosition(0, direction);
            const method = document.getElementById('method');
            return method ? elementDocumentTop(method) : null;
          },
          reducedStaticSubject: (direction: PhoneTransitionDirection) => (
            direction === 1 ? 'grade-a:figure2' : 'native:method'
          ),
          reducedStaticTarget: (direction: PhoneTransitionDirection) => {
            if (direction === -1) return methodPresentation;
            const figure2 = figure2Ref.current;
            return figure2?.presentPresentation
              ? figure2 as PhonePresentationAdapterHandle
              : null;
          }
        } : id === 1 ? {
          reducedTargetPosition: (direction: PhoneTransitionDirection) => (
            boundaryPosition(1, direction)
          ),
          reducedStaticSubject: (direction: PhoneTransitionDirection) => (
            direction === 1 ? 'grade-a:proof' : 'grade-a:figure2'
          ),
          reducedStaticTarget: (direction: PhoneTransitionDirection) => {
            const target = direction === 1
              ? proofRef.current
              : figure2Ref.current;
            return target?.presentPresentation
              ? target as PhonePresentationAdapterHandle
              : null;
          }
        } : id === 2 ? {
          reducedTargetPosition: (direction: PhoneTransitionDirection) => (
            direction === 1
              ? brandLandingPosition()
              : boundaryPosition(1, direction)
          ),
          reducedStaticSubject: (direction: PhoneTransitionDirection) => (
            direction === 1 ? 'native:brand' : 'grade-a:proof'
          ),
          reducedStaticTarget: (direction: PhoneTransitionDirection) => {
            const target = direction === 1
              ? brandPresentationRef.current
              : proofRef.current;
            return target?.presentPresentation
              ? target as PhonePresentationAdapterHandle
              : null;
          }
        } : {}),
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
    methodPresentation,
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
    syncPhoneRuntimeDiagnostics(orchestrator);
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
      proofRef.current?.leave?.();
      methodFigure2Ref.current?.render(0);
      figure2ProofRef.current?.render(0);
      proofBrandRef.current?.render(0);
      proofRef.current?.update(0);
      setRetainedArchProgress(0, 0);
    };
    const renderStableFigure2 = () => {
      const figureProgress = scrollCorridor === 'method-grade-a'
        ? scrollProgress
        : 0;
      methodPaper?.style.setProperty('visibility', 'hidden');
      setMethodInkProgress(1);
      proofRef.current?.leave?.();
      methodFigure2Ref.current?.render(1);
      figure2ProofRef.current?.render(0);
      proofBrandRef.current?.render(0);
      proofRef.current?.update(0);
      setRetainedArchProgress(1, figureProgress);
    };
    const renderStableProof = () => {
      const proofProgress = scrollCorridor === 'method-grade-a'
        ? scrollProgress
        : 0;
      methodPaper?.style.setProperty('visibility', 'hidden');
      setMethodInkProgress(1);
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
      proofRef.current?.leave?.();
      methodFigure2Ref.current?.render(1);
      figure2ProofRef.current?.render(1);
      proofBrandRef.current?.render(1);
      proofRef.current?.update(1);
    };

    if (status === 'transaction') {
      const sourceProgress = direction === 1 ? 0 : 1;
      const progress = phase?.startsWith('rollback-')
        ? sourceProgress
        : sessionProgress ?? 0;
      switch (run) {
        case 'method-figure2':
          if (reducedMotion) {
            const endpoint = phase?.startsWith('rollback-')
              ? sourceProgress
              : direction === 1 ? 1 : 0;
            methodPaper?.style.setProperty('visibility', 'hidden');
            setMethodInkProgress(endpoint);
            setRetainedArchProgress(endpoint, 0);
            return;
          }
          setMethodInkProgress(progress);
          setRetainedArchProgress(progress, 0);
          return;
        case 'figure2-proof':
          if (reducedMotion) {
            const rollback = phase?.startsWith('rollback-') === true;
            const targetIsProof = direction === 1 ? !rollback : rollback;
            methodPaper?.style.setProperty('visibility', 'hidden');
            setMethodInkProgress(1);
            if (targetIsProof) {
              setRetainedArchProgress(1, 1);
            } else {
              setRetainedArchProgress(1, 0);
            }
            return;
          }
          methodPaper?.style.setProperty('visibility', 'hidden');
          setMethodInkProgress(1);
          setRetainedArchProgress(
            1,
            FIGURE2_PROOF_SPLIT
              + (1 - FIGURE2_PROOF_SPLIT) * progress
          );
          return;
        case 'proof-brand':
          if (reducedMotion) {
            methodPaper?.style.setProperty('visibility', 'hidden');
            setMethodInkProgress(1);
            setRetainedArchProgress(1, 1);
            return;
          }
          methodPaper?.style.setProperty('visibility', 'hidden');
          setMethodInkProgress(1);
          setRetainedArchProgress(1, 1);
          return;
        default:
          return;
      }
    }

    switch (semanticScene) {
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
  }, [adapterRevision, cinematicSnapshot, reducedMotion]);

  // Grade-A packed media is a local Figure2↔Proof lease. A downstream stable
  // scene must not keep the last source surface alive merely because the
  // projector retains its structural role while the next lazy group mounts.
  // Target preparation/presentation can still acquire the surface while the
  // semantic scene is changing; once the commit lands, the leaf hard-retires
  // its decoder/context and Group 6/7 can claim their two owners.
  const gradeAActiveScene = semanticScene === 'method-top'
    || semanticScene === 'figure2-animation'
    || semanticScene === 'figure2-proof';
  const figure2Active = gradeAActiveScene && surfaceIsProjected(
    sourceSurface,
    receiverSurface,
    'grade-a:figure2'
  );
  const proofActive = gradeAActiveScene && surfaceIsProjected(
    sourceSurface,
    receiverSurface,
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
        <PhoneFigure2Arch
          mounted={archMounted}
          onReady={markArchReady}
        />
      </div>
      {figure2Ready && methodCopySource && MethodFigure2 && (
        <MethodFigure2
          ref={bindMethodFigure2}
          host={stageHost}
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
          host={stageHost}
          from={figure2Ref.current?.root() ?? null}
          to={proofRef.current?.root() ?? null}
          reducedMotion={reducedMotion}
          onReady={markFigure2ProofReady}
        />
      )}
      {proofReady && brandRoot && ProofBrand && (
        <ProofBrand
          ref={bindProofBrand}
          host={stageHost}
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
      <Suspense fallback={null}>
        <PhoneStoryTailBundle
          motionReduced={reducedMotion}
          stageHost={stageHost}
          directEntryScene={directEntryScene}
          onBrandRootChange={bindBrandRoot}
          onBrandPresentationChange={bindBrandPresentation}
        />
      </Suspense>
      {stageHost ? createPortal(surfaces, stageHost) : null}
    </div>
  );
}

export default PhoneGradeAStory;
