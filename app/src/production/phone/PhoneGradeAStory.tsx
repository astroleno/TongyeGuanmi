import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import type { GradeACheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import {
  figure2ProofPanelFromHash,
  sceneFromHash
} from '../navigation';
import { usePhoneGradeAAdapters } from './usePhoneGradeAAdapters';
import type {
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import './PhoneGradeAStory.css';

const FIGURE2_PROOF_SPLIT = 0.72;
const ACTIVE_EDGE_TOLERANCE_PX = 1;

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
  return clamp(-railTop / Math.max(1, railHeight));
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

export type PhoneGradeAStoryProps = Readonly<{
  reducedMotion: boolean;
  onCheckpoint?: (checkpoint: GradeACheckpointId) => void;
  onSceneChange?: (scene: SceneId) => void;
}>;

export function PhoneGradeAStory({
  reducedMotion,
  onCheckpoint,
  onSceneChange
}: PhoneGradeAStoryProps) {
  const adapters = usePhoneGradeAAdapters();
  const {
    Figure2,
    Proof,
    MethodFigure2,
    Figure2Proof
  } = adapters;
  const [, setAdapterRevision] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const proofTrackRef = useRef<HTMLDivElement | null>(null);
  const surfacesRef = useRef<HTMLDivElement | null>(null);
  const figure2Ref = useRef<PhoneSceneAdapterHandle | null>(null);
  const proofRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const methodFigure2Ref = useRef<PhoneTransitionAdapterHandle | null>(null);
  const figure2ProofRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const frameRef = useRef(0);
  const checkpointRef = useRef<GradeACheckpointId | undefined>(undefined);
  const sceneRef = useRef<SceneId>('method-top');
  const deepLinkHandledRef = useRef(false);

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

  const publish = useCallback((checkpoint: GradeACheckpointId, scene: SceneId) => {
    const root = rootRef.current;
    if (root) root.dataset.phoneGradeACheckpoint = checkpoint;
    if (checkpointRef.current !== checkpoint) {
      checkpointRef.current = checkpoint;
      onCheckpoint?.(checkpoint);
    }
    if (sceneRef.current !== scene) {
      sceneRef.current = scene;
      onSceneChange?.(scene);
    }
  }, [onCheckpoint, onSceneChange]);

  useLayoutEffect(() => {
    if (!adapters.ready) return;
    const root = rootRef.current;
    const rail = railRef.current;
    const proofTrack = proofTrackRef.current;
    const surfaces = surfacesRef.current;
    if (!root || !rail || !proofTrack || !surfaces) return;

    const renderFrame = () => {
      frameRef.current = 0;
      const railRect = rail.getBoundingClientRect();
      const proofRect = proofTrack.getBoundingClientRect();
      const stageHeight = Math.max(1, surfaces.clientHeight || window.innerHeight);
      const railActive = railRect.top < stageHeight && railRect.bottom > 0;
      const proofActive = proofRect.top <= ACTIVE_EDGE_TOLERANCE_PX
        && proofRect.bottom >= stageHeight - ACTIVE_EDGE_TOLERANCE_PX;
      const active = railActive || proofActive;
      root.dataset.phoneGradeAActive = String(active);

      if (railActive) {
        const handoff = phoneGradeAHandoffProgress(railRect.top, stageHeight);
        const figure = phoneGradeAFigureProgress(railRect.top, railRect.height);
        methodFigure2Ref.current?.render(handoff);
        figure2ProofRef.current?.render(figure);
        proofRef.current?.update(0);
        if (handoff < 0.999) {
          publish('method-to-figure2', 'method-top');
        } else if (figure < FIGURE2_PROOF_SPLIT) {
          publish('figure2-stage', 'figure2-animation');
        } else {
          publish('figure2-to-proof', 'figure2-animation');
        }
        return;
      }

      if (proofActive) {
        const proof = phoneGradeAProofProgress(
          proofRect.top,
          proofRect.height,
          stageHeight
        );
        methodFigure2Ref.current?.render(1);
        figure2ProofRef.current?.render(1);
        proofRef.current?.update(proof);
        proofRef.current?.enter?.();
        if (proof < 0.25) {
          publish('figure2-proof-opening', 'figure2-proof');
        } else if (proof < 0.75) {
          publish('figure2-proof-cards', 'figure2-proof');
        } else {
          publish('figure2-proof-closing', 'figure2-proof');
        }
        return;
      }

      if (railRect.top >= stageHeight) {
        methodFigure2Ref.current?.render(0);
        figure2ProofRef.current?.render(0);
        proofRef.current?.update(0);
        if (sceneRef.current !== 'method-top') {
          sceneRef.current = 'method-top';
          onSceneChange?.('method-top');
        }
      }
    };

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
    };
  }, [adapters.ready, onSceneChange, publish]);

  useEffect(() => {
    if (!adapters.ready || deepLinkHandledRef.current) return;
    const scene = sceneFromHash(window.location.hash);
    if (scene !== 'figure2-animation' && scene !== 'figure2-proof') return;
    let frame = 0;
    let observer: MutationObserver | undefined;
    const positionDeepLink = () => {
      if (document.documentElement.dataset.portraitSpikeLoader !== 'ready') {
        return false;
      }
      deepLinkHandledRef.current = true;
      frame = window.requestAnimationFrame(() => {
        const rail = railRef.current;
        const proofTrack = proofTrackRef.current;
        const surfaces = surfacesRef.current;
        if (!rail || !proofTrack || !surfaces) return;
        const stageHeight = Math.max(1, surfaces.clientHeight || window.innerHeight);
        const base = window.scrollY;
        if (scene === 'figure2-animation') {
          window.scrollTo({ top: base + rail.getBoundingClientRect().top });
          return;
        }
        const panel = figure2ProofPanelFromHash(window.location.hash) ?? 'opening';
        const panelIndex = panel === 'opening' ? 0 : panel === 'cards' ? 1 : 2;
        const proofRangeOffset = phoneGradeAProofPanelOffset(
          panelIndex,
          proofTrack.getBoundingClientRect().height,
          stageHeight
        );
        window.scrollTo({
          top: base + proofTrack.getBoundingClientRect().top + proofRangeOffset
        });
      });
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
  }, [adapters.ready]);

  return (
    <div
      ref={rootRef}
      className="phone-grade-a"
      data-phone-grade-a-active="false"
      data-phone-grade-a-ready={String(adapters.ready)}
      data-phone-grade-a-failed={String(adapters.failed)}
    >
      <div ref={railRef} className="phone-grade-a__figure-track" aria-hidden="true" />
      <div ref={proofTrackRef} className="phone-grade-a__proof-track" aria-hidden="true" />
      <div
        ref={surfacesRef}
        className="phone-grade-a__surfaces"
        data-testid="r2-stage"
      >
        {Figure2 && (
          <Figure2
            ref={bindFigure2}
            active={adapters.ready}
            reducedMotion={reducedMotion}
          />
        )}
        {Proof && (
          <Proof
            ref={bindProof}
            active={adapters.ready}
            reducedMotion={reducedMotion}
          />
        )}
        {MethodFigure2 && (
          <MethodFigure2
            ref={bindMethodFigure2}
            host={surfacesRef.current}
            from={null}
            to={figure2Ref.current?.root() ?? null}
            reducedMotion={reducedMotion}
          />
        )}
        {Figure2Proof && (
          <Figure2Proof
            ref={bindFigure2Proof}
            host={surfacesRef.current}
            from={figure2Ref.current?.root() ?? null}
            to={proofRef.current?.root() ?? null}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
    </div>
  );
}

export default PhoneGradeAStory;
