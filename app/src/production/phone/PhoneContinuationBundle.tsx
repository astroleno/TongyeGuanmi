import { useState } from 'react';
import { PhoneBrandLabContinuation } from './PhoneBrandLabContinuation';
import { PhoneLabContactContinuation, type PhoneLabBoundary } from './PhoneLabContactContinuation';
import type { PhoneContinuationEntryTuple } from './phone-entry-plan';

export type PhoneContinuationBundleProps = Readonly<{
  plan: PhoneContinuationEntryTuple;
  motionReduced: boolean;
  stageHost: HTMLElement | null;
}>;

/**
 * One lazy continuation boundary keeps the Group 4–7 executor contract in a
 * single production minification unit while preserving shell-level laziness.
 */
export function PhoneContinuationBundle({
  plan,
  motionReduced,
  stageHost
}: PhoneContinuationBundleProps) {
  const [labBoundary, setLabBoundary] = useState<PhoneLabBoundary | null>(null);
  const group67EntryScene = plan[0] === 'group67' ? plan[1] : undefined;
  return (
    <>
      <PhoneBrandLabContinuation
        reducedMotion={motionReduced}
        stageHost={stageHost}
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

export type PhoneBrandLabBundleProps = Readonly<{
  motionReduced: boolean;
  stageHost: HTMLElement | null;
  validationMode?: string | undefined;
}>;

export function PhoneBrandLabBundle({
  motionReduced,
  stageHost,
  validationMode
}: PhoneBrandLabBundleProps) {
  return (
    <PhoneBrandLabContinuation
      reducedMotion={motionReduced}
      stageHost={stageHost}
      validationMode={validationMode}
    />
  );
}
