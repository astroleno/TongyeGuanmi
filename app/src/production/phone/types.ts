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
  PhoneBoundaryGeometryOwner
} from './phone-boundary-geometry';
import type { PhoneExecutionIdentity } from './phone-story-state';

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

export type PhoneSceneAdapterHandle = ScenePresentationAdapterHandle;

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
  startAutoplay(
    direction: 1 | -1,
    identity: PhoneExecutionIdentity
  ): Promise<PhoneAodStartResult>;
  resetAutoplay(): void;
};

export type PhoneSceneAdapterProps = Readonly<{
  active: boolean;
  reducedMotion: boolean;
  onReady?: () => void;
  onAodProgress?: (
    progress: number,
    direction: 1 | -1,
    identity: PhoneExecutionIdentity
  ) => void;
  onAodComplete?: (
    direction: 1 | -1,
    identity: PhoneExecutionIdentity
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
  begin(request: PhoneCinematicRequest): void;
  commitEndpoint(endpoint: 0 | 1): void;
  releaseEndpoint(): void;
};

/** Immutable execution identity captured at cinematic adapter start. */
export type PhoneCinematicRequest = Readonly<{
  identity: PhoneExecutionIdentity;
  geometryOwner?: PhoneBoundaryGeometryOwner;
}>;

export type PhoneTransitionAdapterProps = Readonly<{
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
