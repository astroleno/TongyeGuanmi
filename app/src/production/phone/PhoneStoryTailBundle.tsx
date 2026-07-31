import { useState } from 'react';
import { PhoneBrandLabContinuation } from './PhoneBrandLabContinuation';
import {
  PhoneLabContactContinuation,
  type PhoneLabBoundary
} from './PhoneLabContactContinuation';
import type { PhonePresentationAdapterHandle } from './types';

export type PhoneStoryTailBundleProps = Readonly<{
  motionReduced: boolean;
  stageHost: HTMLElement | null;
  onBrandRootChange?: (root: HTMLElement | null) => void;
  onBrandPresentationChange?: (
    handle: PhonePresentationAdapterHandle | null
  ) => void;
}>;

/** Formal route tail: one lazy boundary for the reversible Group 4–7 graph. */
export function PhoneStoryTailBundle({
  motionReduced,
  stageHost,
  onBrandRootChange,
  onBrandPresentationChange
}: PhoneStoryTailBundleProps) {
  const [labBoundary, setLabBoundary] = useState<PhoneLabBoundary | null>(null);
  return (
    <>
      <PhoneBrandLabContinuation
        reducedMotion={motionReduced}
        stageHost={stageHost}
        {...(onBrandRootChange ? { onBrandRootChange } : {})}
        {...(onBrandPresentationChange ? { onBrandPresentationChange } : {})}
        onLabBoundaryChange={setLabBoundary}
      />
      <PhoneLabContactContinuation
        reducedMotion={motionReduced}
        stageHost={stageHost}
        fromLabBoundary={true}
        labBoundary={labBoundary}
      />
    </>
  );
}
