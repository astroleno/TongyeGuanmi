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
  GradeACheckpointId,
  PhoneCheckpointId
} from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import type { PhoneEdgeScene } from './phone-edge-surface';

export type PhoneStageSceneId = 'hero' | 'pattern' | 'star-map' | 'aod-animation';
export type PhoneStagePinMode = 'native-fixed' | 'transform';
export type PhoneSceneAdapterId =
  | PhoneStageSceneId
  | 'method-top'
  | 'figure2-animation'
  | 'figure2-proof';
export type PhoneTransitionAdapterId =
  | 'hero-pattern'
  | 'pattern-star-map'
  | 'star-map-aod'
  | 'aod-method-top'
  | 'method-bottom-figure2'
  | 'figure2-distance-expand'
  | 'figure2-proof-brand';

export type PhoneSceneAdapterHandle = ScenePresentationAdapterHandle;

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
  startAutoplay(direction: 1 | -1): void;
  resetAutoplay(): void;
};

export type PhoneSceneAdapterProps = Readonly<{
  active: boolean;
  reducedMotion: boolean;
  onReady?: () => void;
  onAodProgress?: (progress: number, direction: 1 | -1) => void;
  onAodComplete?: (direction: 1 | -1) => void;
}>;

export type PhoneHeroAdapterProps = PhoneSceneAdapterProps & Readonly<{
  motionDriver: PhoneMotionDriver;
}>;

export type PhonePatternAdapterProps = PhoneSceneAdapterProps & Readonly<{
  motionDriver: PhoneMotionDriver;
}>;

export type PhoneMethodAdapterProps = PhonePatternAdapterProps & Readonly<{
  stageHost: HTMLElement | null;
  stagePinMode: PhoneStagePinMode;
  onGradeACheckpoint?: (checkpoint: GradeACheckpointId) => void;
  onGradeASceneChange?: (scene: SceneId) => void;
  onGradeAEdgeScene?: (scene: PhoneEdgeScene) => void;
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

export type PhoneTransitionAdapterHandle = TransitionPresentationAdapterHandle;

export type PhoneTransitionAdapterProps = Readonly<{
  host: HTMLElement | null;
  from: HTMLElement | null;
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
