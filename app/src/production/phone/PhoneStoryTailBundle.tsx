import { useState } from 'react';
import type { SceneId } from '../../story/types';
import type { Group45PhoneSceneId } from './adapter-groups/group4-5';
import type { Group67PhoneSceneId } from './adapter-groups/group6-7';
import { PhoneBrandLabContinuation } from './PhoneBrandLabContinuation';
import {
  PhoneLabContactContinuation,
  type PhoneLabBoundary
} from './PhoneLabContactContinuation';
import { phoneContinuationGroupForScene } from './phone-entry-plan';
import type { PhonePresentationAdapterHandle } from './types';

export type PhoneStoryTailBundleProps = Readonly<{
  motionReduced: boolean;
  stageHost: HTMLElement | null;
  /** Non-authority hint that preloads the direct target's leaf closure. */
  directEntryScene?: SceneId | null;
  onBrandRootChange?: (root: HTMLElement | null) => void;
  onBrandPresentationChange?: (
    handle: PhonePresentationAdapterHandle | null
  ) => void;
}>;

/** Formal route tail: one lazy boundary for the reversible Group 4–7 graph. */
export function PhoneStoryTailBundle({
  motionReduced,
  stageHost,
  directEntryScene = null,
  onBrandRootChange,
  onBrandPresentationChange
}: PhoneStoryTailBundleProps) {
  const [labBoundary, setLabBoundary] = useState<PhoneLabBoundary | null>(null);
  const continuationGroup = directEntryScene
    ? phoneContinuationGroupForScene(directEntryScene)
    : null;
  const group45EntryScene = continuationGroup === 'group45'
    ? directEntryScene as Group45PhoneSceneId
    : undefined;
  const group67EntryScene = continuationGroup === 'group67'
    ? directEntryScene as Group67PhoneSceneId
    : undefined;
  return (
    <>
      <PhoneBrandLabContinuation
        reducedMotion={motionReduced}
        stageHost={stageHost}
        {...(group45EntryScene ? { entryScene: group45EntryScene } : {})}
        {...(onBrandRootChange ? { onBrandRootChange } : {})}
        {...(onBrandPresentationChange ? { onBrandPresentationChange } : {})}
        onLabBoundaryChange={setLabBoundary}
      />
      <PhoneLabContactContinuation
        reducedMotion={motionReduced}
        stageHost={stageHost}
        {...(group67EntryScene ? { entryScene: group67EntryScene } : {})}
        fromLabBoundary={true}
        labBoundary={labBoundary}
      />
    </>
  );
}
