import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type {
  ScenePresentationAdapterHandle,
  TransitionPresentationAdapterHandle
} from '../../story/presentation';
import type { FrontHalfCheckpointId } from '../../story/semantic-checkpoints';

export type PhoneStageSceneId = 'hero' | 'pattern' | 'star-map' | 'aod-animation';
export type PhoneSceneAdapterId = PhoneStageSceneId | 'method-top';
export type PhoneTransitionAdapterId =
  | 'hero-pattern'
  | 'pattern-star-map'
  | 'star-map-aod'
  | 'aod-method-top';

export type PhoneSceneAdapterHandle = ScenePresentationAdapterHandle;

export type PhoneHeroMotionDriver = Readonly<{
  set(target: HTMLElement, vars: Readonly<Record<string, string | number>>): void;
  quickTo(
    target: HTMLElement,
    property: 'x' | 'y',
    vars: Readonly<{ duration: number; ease: string }>
  ): (value: number) => void;
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
  motionDriver: PhoneHeroMotionDriver;
}>;

export type PhoneSceneAdapterComponent = ForwardRefExoticComponent<
  PhoneSceneAdapterProps & RefAttributes<PhoneSceneAdapterHandle>
>;

export type PhoneHeroAdapterComponent = ForwardRefExoticComponent<
  PhoneHeroAdapterProps & RefAttributes<PhoneHeroAdapterHandle>
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

export type PhoneSceneAdapterModule = Readonly<{
  id: PhoneSceneAdapterId;
  Component: PhoneSceneAdapterComponent | PhoneAodAdapterComponent;
}>;

export type PhoneTransitionAdapterModule = Readonly<{
  id: PhoneTransitionAdapterId;
  Component?: PhoneTransitionAdapterComponent;
  methodProgress?(aodProgress: number): number;
}>;

export type PhoneSemanticState = Readonly<{
  checkpoint: FrontHalfCheckpointId;
  direction: 1 | -1 | 0;
}>;
