import type {
  ForwardRefExoticComponent,
  RefAttributes
} from 'react';
import type {
  ScenePresentationAdapterHandle,
  TransitionPresentationAdapterHandle
} from '../../../story/presentation';

/**
 * Unit 5's public adapter contract.
 *
 * Scene-specific props remain grouped here, while IDs and modules are now
 * resolved by the shared phone loader/cache used by Unit4 and Unit7-A.
 */
export type Group45PhoneSceneId =
  | 'brand'
  | 'figure3-animation'
  | 'services'
  | 'ttg-animation'
  | 'lab';

export type Group45PhoneTransitionId =
  | 'brand-figure3'
  | 'figure3-services'
  | 'services-ttg'
  | 'ttg-lab';

export type Group45PhoneSceneProps = Readonly<{
  active: boolean;
  /** Document traversal direction; time-owned visuals replay symmetrically. */
  direction?: 1 | -1;
  /** Decode only the immediately upcoming visual; playback still waits for entry. */
  prewarm?: boolean;
  reducedMotion: boolean;
  onReady?: () => void;
  /** Lets the shell settle the affected bridge at its declared endpoint. */
  onMediaError?: (scene: Group45PhoneSceneId) => void;
  /** Canonical media progress drives adjacent copy/transition cues. */
  onProgress?: (
    scene: Group45PhoneSceneId,
    progress: number,
    direction: 1 | -1
  ) => void;
  /**
   * A time-owned visual reports its authoritative terminal endpoint once.
   * The shell may then reveal the next native-document receiver without
   * inventing a second full-screen hold.
   */
  onComplete?: (scene: Group45PhoneSceneId, direction: 1 | -1) => void;
}>;

export type Group45PhoneTransitionProps = Readonly<{
  host: HTMLElement | null;
  from: HTMLElement | null;
  to: HTMLElement | null;
  reducedMotion: boolean;
  /**
   * The focused Brand → Lab route uses one native document scroll owner.
   * Adapters retain their semantic endpoint contract without hiding document
   * chapters that are not physically stacked on a fixed stage.
   */
  documentFlow?: boolean;
  onReady?: () => void;
}>;

export type Group45PhoneSceneAdapterComponent = ForwardRefExoticComponent<
  Group45PhoneSceneProps & RefAttributes<ScenePresentationAdapterHandle>
>;

export type Group45PhoneTransitionAdapterComponent = ForwardRefExoticComponent<
  Group45PhoneTransitionProps & RefAttributes<TransitionPresentationAdapterHandle>
>;

export type Group45PhoneSceneAdapterModule = Readonly<{
  id: Group45PhoneSceneId;
  Component: Group45PhoneSceneAdapterComponent;
}>;

export type Group45PhoneTransitionAdapterModule = Readonly<{
  id: Group45PhoneTransitionId;
  Component: Group45PhoneTransitionAdapterComponent;
}>;

export const group45PhoneSceneIds = [
  'brand',
  'figure3-animation',
  'services',
  'ttg-animation',
  'lab'
] as const satisfies readonly Group45PhoneSceneId[];

export const group45PhoneTransitionIds = [
  'brand-figure3',
  'figure3-services',
  'services-ttg',
  'ttg-lab'
] as const satisfies readonly Group45PhoneTransitionId[];

export const group45PhoneAdapterIds = [
  ...group45PhoneSceneIds,
  ...group45PhoneTransitionIds
] as const;

export type Group45PhoneAdapterRegistration = Readonly<{
  id: Group45PhoneSceneId | Group45PhoneTransitionId;
  sourceModule: string;
  exportName: string;
}>;

/**
 * Registration data only: module-loaders.ts owns the matching literal dynamic
 * import branches and the one shared cache.
 */
export const group45PhoneAdapterRegistrations = [
  {
    id: 'brand',
    sourceModule: 'app/src/scenes/brand/phone/PhoneBrand',
    exportName: 'PhoneBrand'
  },
  {
    id: 'figure3-animation',
    sourceModule: 'app/src/scenes/figure3-animation/phone/PhoneFigure3',
    exportName: 'PhoneFigure3'
  },
  {
    id: 'services',
    sourceModule: 'app/src/scenes/services/phone/PhoneServices',
    exportName: 'PhoneServices'
  },
  {
    id: 'ttg-animation',
    sourceModule: 'app/src/scenes/ttg-animation/phone/PhoneTtg',
    exportName: 'PhoneTtg'
  },
  {
    id: 'lab',
    sourceModule: 'app/src/scenes/lab/phone/PhoneLab',
    exportName: 'PhoneLab'
  },
  {
    id: 'brand-figure3',
    sourceModule: 'app/src/transitions/brand-figure3/phone',
    exportName: 'PhoneBrandFigure3Transition'
  },
  {
    id: 'figure3-services',
    sourceModule: 'app/src/transitions/figure3-services/phone',
    exportName: 'PhoneFigure3ServicesTransition'
  },
  {
    id: 'services-ttg',
    sourceModule: 'app/src/transitions/services-ttg/phone',
    exportName: 'PhoneServicesTtgTransition'
  },
  {
    id: 'ttg-lab',
    sourceModule: 'app/src/transitions/ttg-lab/phone',
    exportName: 'PhoneTtgLabTransition'
  }
] as const satisfies readonly Group45PhoneAdapterRegistration[];

export const group45NextAdapterByScene: Readonly<Partial<Record<
  Group45PhoneSceneId,
  Readonly<{ scene: Group45PhoneSceneId; transition: Group45PhoneTransitionId }>
>>> = {
  brand: { scene: 'figure3-animation', transition: 'brand-figure3' },
  'figure3-animation': { scene: 'services', transition: 'figure3-services' },
  services: { scene: 'ttg-animation', transition: 'services-ttg' },
  'ttg-animation': { scene: 'lab', transition: 'ttg-lab' }
};

/**
 * Unit7-A integration contract:
 * - module-loaders.ts is the sole loader/cache;
 * - PhoneBrandLabContinuation mounts document roots after Proof and portals
 *   Figure3/TTG into PhoneStoryShell's existing stage host;
 * - group45NextAdapterByScene limits adjacent prewarm;
 * - Lab intentionally has no next entry because Lab → PH belongs to Unit6;
 * - the continuation exposes Lab's stable root/adapter boundary.
 */
