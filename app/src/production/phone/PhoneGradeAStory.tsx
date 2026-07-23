import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import type { PhoneCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import {
  figure2ProofPanelFromHash,
  sceneFromHash
} from '../navigation';
import { usePhoneGradeAAdapters } from './usePhoneGradeAAdapters';
import type { PhoneEdgeScene } from './phone-edge-surface';
import { PHONE_INK_ENDPOINT_EPSILON } from './phone-ink';
import {
  registerPhoneTransitionBoundary,
  runPhoneTimedTransition,
  type PhoneTransitionDirection,
  type PhoneTransitionSession
} from './phone-transition-coordinator';
import type {
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import {
  PhoneBrandLabContinuation,
  phoneGroup45SceneFromHash
} from './PhoneBrandLabContinuation';
import { PhoneFigure2Arch } from './scenes/PhoneFigure2Arch';
import './PhoneGradeAStory.css';

const FIGURE2_PROOF_SPLIT = 0.72;
const ACTIVE_EDGE_TOLERANCE_PX = 1;
const GRADE_A_INK_BOUNDARIES = [0, 1, 2] as const;
type GradeAInkBoundaryId = typeof GRADE_A_INK_BOUNDARIES[number];
type GradeAInkRun = {
  id: GradeAInkBoundaryId;
  progress: number;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneGradeAHandoffProgress(
  railTop: number,
  stageHeight: number
): number {
  return clamp((stageHeight - railTop) / Math.max(1, stageHeight));
}

/**
 * The Method → Figure2 field reveals from the bottom edge. Keep the Method
 * fallback until that same edge is actually owned by the visible ink field;
 * on reverse, retain Figure2 until the field reaches its Method endpoint.
 */
export function phoneGradeAMethodFigure2EdgeScene(
  handoffProgress: number,
  reducedMotion = false
): Extract<PhoneEdgeScene, 'method' | 'figure2'> {
  if (reducedMotion) return 'figure2';
  return clamp(handoffProgress) > PHONE_INK_ENDPOINT_EPSILON
    ? 'figure2'
    : 'method';
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

export function phoneGradeAProofPanelOffset(
  panelIndex: number,
  trackHeight: number,
  stageHeight: number
): number {
  const clampedIndex = Math.min(2, Math.max(0, panelIndex));
  return clampedIndex * Math.max(0, trackHeight - stageHeight) / 2;
}

export function phoneGradeAProofBrandProgress(
  brandTop: number,
  stageHeight: number
): number {
  return clamp((stageHeight - brandTop) / Math.max(1, stageHeight));
}

export function phoneGradeAProofBrandEdgeScene(
  progress: number
): Extract<PhoneEdgeScene, 'proof' | 'brand'> {
  return clamp(progress) > PHONE_INK_ENDPOINT_EPSILON ? 'brand' : 'proof';
}

export type PhoneGradeAStoryProps = Readonly<{
  reducedMotion: boolean;
  stageHost: HTMLElement | null;
  onCheckpoint?: (checkpoint: PhoneCheckpointId) => void;
  onSceneChange?: (scene: SceneId) => void;
  onEdgeScene?: (scene: PhoneEdgeScene) => void;
}>;

export function PhoneGradeAStory({
  reducedMotion,
  stageHost,
  onCheckpoint,
  onSceneChange,
  onEdgeScene
}: PhoneGradeAStoryProps) {
  const adapters = usePhoneGradeAAdapters();
  const {
    Figure2,
    Proof,
    MethodFigure2,
    Figure2Proof,
    ProofBrand
  } = adapters;
  const [, setAdapterRevision] = useState(0);
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
  const frameRef = useRef(0);
  const checkpointRef = useRef<PhoneCheckpointId | undefined>(undefined);
  const sceneRef = useRef<SceneId>('method-top');
  const edgeSceneRef = useRef<PhoneEdgeScene>('method');
  const deepLinkHandledRef = useRef(false);
  const scenesReady = adapters.ready && figure2Ready && proofReady;
  const transitionsReady = scenesReady
    && methodFigure2Ready
    && figure2ProofReady
    && proofBrandReady;
  const runtimeReady = transitionsReady;
  const continuationTarget = typeof window === 'undefined'
    ? undefined
    : phoneGroup45SceneFromHash(window.location.hash);

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

  const publish = useCallback((checkpoint: PhoneCheckpointId, scene: SceneId) => {
    const root = rootRef.current;
    if (root) root.dataset.phoneGradeACheckpoint = checkpoint;
    if (checkpointRef.current !== checkpoint) {
      checkpointRef.current = checkpoint;
    }
    // The downstream continuation shares this publisher. Re-assert Grade A's
    // current checkpoint when reverse scroll returns ownership, even when its
    // own local checkpoint did not change while Brand was active.
    onCheckpoint?.(checkpoint);
    if (sceneRef.current !== scene) {
      sceneRef.current = scene;
      onSceneChange?.(scene);
    }
  }, [onCheckpoint, onSceneChange]);
  const publishEdgeScene = useCallback((scene: PhoneEdgeScene) => {
    const root = rootRef.current;
    if (root) root.dataset.phoneGradeAEdgeScene = scene;
    if (edgeSceneRef.current === scene) return;
    edgeSceneRef.current = scene;
    onEdgeScene?.(scene);
  }, [onEdgeScene]);

  useLayoutEffect(() => {
    if (!runtimeReady) return;
    const root = rootRef.current;
    const rail = railRef.current;
    const proofTrack = proofTrackRef.current;
    const surfaces = surfacesRef.current;
    if (!root || !rail || !proofTrack || !surfaces) return;
    const methodReading = document.getElementById('method');
    const storyRoot = root.closest<HTMLElement>('main.portrait-scroll-spike');
    const completedInk = new Set<GradeAInkBoundaryId>();
    let inkRun: GradeAInkRun | null = null;
    let cancelInkRun: (() => void) | undefined;

    const renderFrame = () => {
      frameRef.current = 0;
      const railRect = rail.getBoundingClientRect();
      const proofRect = proofTrack.getBoundingClientRect();
      const brandRect = brandRoot?.getBoundingClientRect();
      const methodRect = methodReading?.getBoundingClientRect();
      const stageHeight = Math.max(1, surfaces.clientHeight || window.innerHeight);
      const activeInk = inkRun;
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
      const active = railActive
        || proofActive
        || proofBrandActive
        || Boolean(activeInk);
      root.dataset.phoneGradeAActive = String(active);
      surfaces.dataset.phoneGradeAActive = String(active);
      if (methodReading) {
        methodReading.dataset.phoneMethodFigure2InkActive = String(
          railActive || activeInk?.id === 0
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
          retainedArch.dataset.phoneFigure2ArchVisible = String(frame.opacity > 0.001);
          retainedArch.dataset.phoneFigure2ArchProgress = frame.motionProgress.toFixed(4);
        }
      };

      const methodInk = activeInk?.id === 0;
      const figure2Ink = activeInk?.id === 1;
      if (railActive || methodInk || figure2Ink) {
        figure2Ref.current?.enter?.();
        const handoff = methodInk
          ? activeInk.progress
          : figure2Ink ? 1 : reducedMotion
          ? phoneGradeAHandoffProgress(railRect.top, stageHeight)
          : completedInk.has(0) ? 1 : 0;
        const figure = methodInk
          ? 0
          : figure2Ink
            ? FIGURE2_PROOF_SPLIT
              + (1 - FIGURE2_PROOF_SPLIT) * activeInk.progress
            : phoneGradeAFigureProgress(railRect.top, railRect.height);
        setRetainedArchProgress(handoff, figure);
        methodFigure2Ref.current?.render(handoff);
        figure2ProofRef.current?.render(figure);
        proofBrandRef.current?.render(0);
        proofRef.current?.update(0);
        if (figure2Ink) {
          proofRef.current?.enter?.();
          publishEdgeScene(
            activeInk.progress > PHONE_INK_ENDPOINT_EPSILON
              ? 'proof'
              : 'figure2'
          );
          publish('figure2-to-proof', 'figure2-animation');
          return;
        }
        publishEdgeScene(phoneGradeAMethodFigure2EdgeScene(
          handoff,
          reducedMotion
        ));
        if (handoff < 0.999) {
          publish('method-to-figure2', 'method-top');
        } else if (figure < FIGURE2_PROOF_SPLIT) {
          publish('figure2-stage', 'figure2-animation');
        } else {
          publish('figure2-to-proof', 'figure2-animation');
        }
        return;
      }

      // Proof and Brand share the exact viewport edge. While the autonomous
      // boundary owns that edge, it must outrank Proof's terminal hold or the
      // render would return here for all 600ms and the ink would never paint.
      if (proofActive && activeInk?.id !== 2) {
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
        publishEdgeScene('proof');
        if (proof < 0.25) {
          publish('figure2-proof-opening', 'figure2-proof');
        } else if (proof < 0.75) {
          publish('figure2-proof-cards', 'figure2-proof');
        } else {
          publish('figure2-proof-closing', 'figure2-proof');
        }
        return;
      }

      if (
        (proofBrandActive || activeInk?.id === 2)
        && brandRect
      ) {
        const handoff = activeInk?.id === 2
          ? activeInk.progress
          : reducedMotion
          ? phoneGradeAProofBrandProgress(brandRect.top, stageHeight)
          : completedInk.has(2) ? 1 : 0;
        setRetainedArchProgress(1, 1);
        methodFigure2Ref.current?.render(1);
        figure2ProofRef.current?.render(1);
        figure2Ref.current?.leave?.();
        proofRef.current?.update(1);
        proofRef.current?.enter?.();
        proofBrandRef.current?.render(handoff);
        publishEdgeScene(phoneGradeAProofBrandEdgeScene(handoff));
        publish('proof-to-brand', 'brand');
        return;
      }

      if (brandRect && brandRect.top <= ACTIVE_EDGE_TOLERANCE_PX) {
        figure2Ref.current?.leave?.();
        proofBrandRef.current?.render(1);
        proofRef.current?.leave?.();
      }

      if (railRect.top >= stageHeight) {
        figure2Ref.current?.leave?.();
        setRetainedArchProgress(0, 0);
        methodFigure2Ref.current?.render(0);
        figure2ProofRef.current?.render(0);
        proofBrandRef.current?.render(0);
        proofRef.current?.update(0);
        if (
          storyRoot?.dataset.portraitStageActive !== 'true'
          && (methodRect?.top ?? Number.POSITIVE_INFINITY) <= stageHeight
        ) {
          publishEdgeScene('method');
          if (sceneRef.current !== 'method-top') {
            sceneRef.current = 'method-top';
            onSceneChange?.('method-top');
          }
        }
      }
    };

    const transitionOwner = storyRoot ?? root;
    const elementDocumentTop = (element: HTMLElement) => (
      window.scrollY + element.getBoundingClientRect().top
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
      if (!brandRoot) return null;
      const brandTop = elementDocumentTop(brandRoot);
      return direction === 1 ? brandTop - stageHeight : brandTop;
    };
    const scrollY = window.scrollY;
    for (const id of GRADE_A_INK_BOUNDARIES) {
      const downstream = boundaryPosition(id, -1);
      if (
        downstream !== null
        && scrollY >= downstream - ACTIVE_EDGE_TOLERANCE_PX
      ) completedInk.add(id);
    }
    const startInkRun = (
      id: GradeAInkBoundaryId,
      direction: PhoneTransitionDirection,
      session: PhoneTransitionSession
    ) => {
      if (inkRun) return false;
      const transition = id === 0
        ? methodFigure2Ref.current
        : id === 1
          ? figure2ProofRef.current
          : proofBrandRef.current;
      if (!transition) return false;
      if (direction === 1) transition.enter?.();
      else transition.reverse?.();
      inkRun = {
        id,
        progress: direction === 1 ? 0 : 1
      };
      cancelInkRun = runPhoneTimedTransition(
        session,
        direction,
        (progress) => {
          if (inkRun?.id !== id) return;
          inkRun.progress = progress;
          renderFrame();
        },
        () => {
          if (direction === 1) completedInk.add(id);
          else completedInk.delete(id);
          inkRun = null;
          const landing = boundaryPosition(id, direction === 1 ? -1 : 1);
          session.complete(landing ?? window.scrollY);
          renderFrame();
        }
      );
      return true;
    };
    const gradeAInkRegistrations = reducedMotion
      ? []
      : GRADE_A_INK_BOUNDARIES.map((id) => registerPhoneTransitionBoundary(
          transitionOwner,
          {
            position: (direction) => boundaryPosition(id, direction),
            canStart: (direction) => (
              !inkRun
              && (direction === 1
                ? !completedInk.has(id)
                : completedInk.has(id))
            ),
            start: (direction, session) => startInkRun(id, direction, session)
          }
        ));

    const schedule = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(renderFrame);
    };
    renderFrame();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      cancelInkRun?.();
      inkRun = null;
      for (const registration of gradeAInkRegistrations) {
        registration.dispose();
      }
      if (methodReading) {
        delete methodReading.dataset.phoneMethodFigure2InkActive;
      }
    };
  }, [
    brandRoot,
    onSceneChange,
    publish,
    publishEdgeScene,
    reducedMotion,
    runtimeReady,
    stageHost
  ]);

  useEffect(() => {
    if (!runtimeReady || deepLinkHandledRef.current) return;
    const scene = sceneFromHash(window.location.hash);
    if (scene !== 'figure2-animation' && scene !== 'figure2-proof') return;
    let frame = 0;
    let observer: MutationObserver | undefined;
    const positionDeepLink = () => {
      if (document.documentElement.dataset.portraitSpikeLoader !== 'ready') {
        return false;
      }
      deepLinkHandledRef.current = true;
      let attempts = 0;
      let settledFrames = 0;
      const settlePosition = () => {
        const rail = railRef.current;
        const proofTrack = proofTrackRef.current;
        const surfaces = surfacesRef.current;
        if (!rail || !proofTrack || !surfaces) return;
        const stageHeight = Math.max(1, surfaces.clientHeight || window.innerHeight);
        let offset = rail.getBoundingClientRect().top;
        if (scene !== 'figure2-animation') {
          const panel = figure2ProofPanelFromHash(window.location.hash) ?? 'opening';
          const panelIndex = panel === 'opening' ? 0 : panel === 'cards' ? 1 : 2;
          const proofRangeOffset = phoneGradeAProofPanelOffset(
            panelIndex,
            proofTrack.getBoundingClientRect().height,
            stageHeight
          );
          offset = proofTrack.getBoundingClientRect().top + proofRangeOffset;
        }
        if (Math.abs(offset) > ACTIVE_EDGE_TOLERANCE_PX) {
          settledFrames = 0;
          window.scrollTo({ top: window.scrollY + offset });
        } else {
          settledFrames += 1;
        }
        attempts += 1;
        if (attempts < 12 && settledFrames < 3) {
          frame = window.requestAnimationFrame(settlePosition);
        }
      };
      frame = window.requestAnimationFrame(settlePosition);
      return true;
    };
    if (!positionDeepLink()) {
      observer = new MutationObserver(() => {
        if (positionDeepLink()) observer?.disconnect();
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-portrait-spike-loader']
      });
    }
    return () => {
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [runtimeReady]);

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
      {scenesReady && MethodFigure2 && (
        <MethodFigure2
          ref={bindMethodFigure2}
          host={surfacesRef.current}
          from={methodPaperRef.current}
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
      {scenesReady && brandRoot && ProofBrand && (
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
      data-phone-grade-a-modules-ready={String(adapters.ready)}
      data-phone-grade-a-scenes-ready={String(scenesReady)}
      data-phone-grade-a-ready={String(runtimeReady)}
      data-phone-grade-a-failed={String(adapters.failed)}
    >
      <div ref={railRef} className="phone-grade-a__figure-track" aria-hidden="true" />
      <div ref={proofTrackRef} className="phone-grade-a__proof-track" aria-hidden="true" />
      <PhoneBrandLabContinuation
        reducedMotion={reducedMotion}
        stageHost={stageHost}
        {...(continuationTarget
          ? { navigationTarget: continuationTarget }
          : {})}
        onBrandRootChange={setBrandRoot}
        {...(onCheckpoint ? { onCheckpoint } : {})}
        {...(onEdgeScene ? { onEdgeScene } : {})}
        {...(onSceneChange ? { onSceneChange } : {})}
      />
      {stageHost ? createPortal(surfaces, stageHost) : null}
    </div>
  );
}

export default PhoneGradeAStory;
