import type {
  ComponentType,
  ForwardRefExoticComponent,
  RefAttributes
} from 'react';
import type {
  StoryLoaderExitReason,
  StoryLoaderMode
} from '../StoryLoader';
import type {
  ScenePresentationAdapterHandle,
  TransitionPresentationAdapterHandle
} from '../../story/presentation';
import type {
  PhoneCheckpointId
} from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import type {
  Group45PhoneSceneId,
  Group45PhoneTransitionId
} from './adapter-groups/group4-5';
import type {
  Group67PhoneSceneId,
  Group67PhoneTransitionId
} from './adapter-groups/group6-7';
import type { PhoneAodStartResult } from './aod-autoplay';
import type {
  PhoneAodExecution,
  PhoneExecutionToken,
  PhoneRenderedPresentationFrame,
  PresentationToken
} from './phone-story/runtime';
import type { PhoneFailureReason } from './phone-story/machine';

export type PhoneStageSceneId = 'hero' | 'pattern' | 'star-map' | 'aod-animation';
export type PhoneSceneAdapterId =
  | PhoneStageSceneId
  | 'method-top'
  | 'figure2-animation'
  | 'figure2-proof'
  | Group45PhoneSceneId
  | Group67PhoneSceneId;
export type PhoneTransitionAdapterId =
  | 'hero-pattern'
  | 'pattern-star-map'
  | 'star-map-aod'
  | 'aod-method-top'
  | 'method-bottom-figure2'
  | 'figure2-distance-expand'
  | 'figure2-proof-brand'
  | Group45PhoneTransitionId
  | Group67PhoneTransitionId;

/**
 * Token-bound bridge exposed to phone leaves.  The route runtime supplies the
 * token; a leaf calls `report` only from its real renderer frame callback.
 */
export type PhonePresentationAdapterHandle = Readonly<{
  presentPresentation(
    token: PresentationToken,
    report: (frame: PhoneRenderedPresentationFrame) => void,
    /** Runtime registration always supplies this; direct callers may omit it. */
    fail?: (reason: PhoneFailureReason) => void
  ): void;
  disposePresentation?(token: PresentationToken): void;
}>;

export type PhoneSceneAdapterHandle = ScenePresentationAdapterHandle
  & Partial<PhonePresentationAdapterHandle>;

/**
 * A narrow runtime-only view used when a cinematic executor injects its
 * immutable identity at media start. Public scene handles remain the shared
 * presentation lifecycle contract.
 */
export type PhoneCinematicSceneAdapterHandle = Omit<
  ScenePresentationAdapterHandle,
  'enter' | 'reverse'
> & {
  enter?(request?: PhoneCinematicRequest): void;
  reverse?(request?: PhoneCinematicRequest): void;
};

export type PhoneMotionDriver = Readonly<{
  set(target: HTMLElement, vars: Readonly<Record<string, string | number>>): void;
  quickTo(
    target: HTMLElement,
    property: 'x' | 'y',
    vars: Readonly<{ duration: number; ease: string }>
  ): (value: number) => void;
  revealReadingSteps(target: HTMLOListElement): () => void;
}>;

export type PhoneHeroAdapterHandle = PhoneSceneAdapterHandle & {
  startEntrance(): void;
  completeEntrance(): void;
  cancelEntrance(): void;
  unlockFromGesture(): void;
};

export type PhoneAodAdapterHandle = PhoneSceneAdapterHandle & {
  startAutoplay(execution: PhoneAodExecution): Promise<PhoneAodStartResult>;
  /** The runner releases visual playback only after it accepted first proof. */
  releaseAutoplayAdmission(execution: PhoneAodExecution): void;
  resetAutoplay(): void;
};

export type PhoneSceneAdapterProps = Readonly<{
  active: boolean;
  reducedMotion: boolean;
  onReady?: () => void;
  onAodProgress?: (
    progress: number,
    execution: PhoneAodExecution
  ) => void;
  onAodComplete?: (
    execution: PhoneAodExecution
  ) => void;
  /** Exact token-bound packed-canvas frame for the active AOD execution. */
  onAodFrame?: (
    frame: PhoneRenderedPresentationFrame,
    execution: PhoneAodExecution
  ) => void;
  /** Leaf-only failure fact; the runner decides rollback. */
  onAodFailure?: (
    execution: PhoneAodExecution,
    reason: import('./phone-story/runtime').PhoneAodFailureReason
  ) => void;
}>;

export type PhoneHeroAdapterProps = PhoneSceneAdapterProps & Readonly<{
  motionDriver: PhoneMotionDriver;
}>;

export type PhonePatternAdapterProps = PhoneSceneAdapterProps & Readonly<{
  motionDriver: PhoneMotionDriver;
}>;

export type PhoneMethodAdapterProps = PhonePatternAdapterProps & Readonly<{
  stageHost: HTMLElement | null;
  /** Leaf-loading intent only; the runtime remains the direct-entry writer. */
  directEntryScene?: SceneId | null;
}>;

export type PhoneSceneAdapterComponent = ForwardRefExoticComponent<
  PhoneSceneAdapterProps & RefAttributes<PhoneSceneAdapterHandle>
>;

export type PhoneHeroAdapterComponent = ForwardRefExoticComponent<
  PhoneHeroAdapterProps & RefAttributes<PhoneHeroAdapterHandle>
>;

export type PhonePatternAdapterComponent = ForwardRefExoticComponent<
  PhonePatternAdapterProps & RefAttributes<PhoneSceneAdapterHandle>
>;

export type PhoneStarMapAdapterComponent = PhonePatternAdapterComponent;
export type PhoneMethodAdapterComponent = ForwardRefExoticComponent<
  PhoneMethodAdapterProps & RefAttributes<PhoneSceneAdapterHandle>
>;

export type PhoneAodAdapterComponent = ForwardRefExoticComponent<
  PhoneSceneAdapterProps & RefAttributes<PhoneAodAdapterHandle>
>;

export type PhoneTransitionAdapterHandle = TransitionPresentationAdapterHandle & {
  begin(
    request: PhoneCinematicRequest,
    onPresentedFrame?: PhonePresentedFrameReporter
  ): void;
  /** Renders one physical in-between frame before the reducer leaves prepare. */
  prepareFirstFrame?(direction: 1 | -1): void;
  commitEndpoint(endpoint: 0 | 1): void;
  releaseEndpoint(): void;
};

/** A renderer may carry its raw immutable frame; legacy adapters report void. */
export type PhonePresentedFrameReporter = (
  frame?: PhoneRenderedPresentationFrame
) => void;

/** Immutable positional execution token captured at cinematic adapter start. */
export type PhoneCinematicRequest = PhoneExecutionToken;

export type PhoneTransitionAdapterProps = Readonly<{
  /** The content-plane host for source/receiver and between-endpoint effects. */
  host: HTMLElement | null;
  from: HTMLElement | null;
  /**
   * Optional second source surface concealed by the same authored contour.
   * Method uses this for its document copy while the fixed paper plate remains
   * the canonical transition source.
   */
  additionalFrom?: HTMLElement | null;
  to: HTMLElement | null;
  reducedMotion: boolean;
  onReady?: () => void;
}>;

export type PhoneTransitionAdapterComponent = ForwardRefExoticComponent<
  PhoneTransitionAdapterProps & RefAttributes<PhoneTransitionAdapterHandle>
>;

export type PhoneLoaderAdapterProps = Readonly<{
  mode: StoryLoaderMode;
  ready: boolean;
  failed: boolean;
  startedAt?: number | undefined;
  onHidden(reason: StoryLoaderExitReason): void;
}>;

export type PhoneLoaderAdapterComponent = ComponentType<PhoneLoaderAdapterProps>;

export type PhoneLoaderAdapterModule = Readonly<{
  id: 'loader';
  Component: PhoneLoaderAdapterComponent;
}>;

export type PhoneSceneAdapterModule = Readonly<{
  id: PhoneSceneAdapterId;
  Component:
    | PhoneSceneAdapterComponent
    | PhoneAodAdapterComponent
    | PhoneStarMapAdapterComponent
    | PhoneMethodAdapterComponent;
  aodAlphaStartProgress?: number;
  aodAlphaEndProgress?: number;
}>;

export type PhoneTransitionAdapterModule = Readonly<{
  id: PhoneTransitionAdapterId;
  Component?: PhoneTransitionAdapterComponent;
  methodProgress?(aodProgress: number): number;
}>;

export type PhoneSemanticState = Readonly<{
  checkpoint: PhoneCheckpointId;
  direction: 1 | -1 | 0;
}>;
