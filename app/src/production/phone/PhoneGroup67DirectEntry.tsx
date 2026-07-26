import { lazy, Suspense, useState } from 'react';
import type {
  PhoneContinuationEntryPlan
} from './phone-entry-plan';
import type { PhoneLabBoundary } from './PhoneLabContactContinuation';
import './PhoneGroup67DirectEntry.css';

const PhoneBrandLabContinuation = lazy(() => (
  import('./PhoneBrandLabContinuation').then((module) => ({
    default: module.PhoneBrandLabContinuation
  }))
));
const PhoneLabContactContinuation = lazy(() => (
  import('./PhoneLabContactContinuation').then((module) => ({
    default: module.PhoneLabContactContinuation
  }))
));

export type PhoneGroup67DirectEntryProps = Readonly<{
  plan: PhoneContinuationEntryPlan | undefined;
  reducedMotion: boolean;
  stageHost: HTMLElement | null;
}>;

export function PhoneGroup67DirectEntry({
  plan,
  reducedMotion,
  stageHost
}: PhoneGroup67DirectEntryProps) {
  const [labBoundary, setLabBoundary] = useState<PhoneLabBoundary | null>(null);
  if (!plan) return null;
  const group45 = plan.group === 'group45';
  return (
    <Suspense fallback={null}>
      <PhoneBrandLabContinuation
        reducedMotion={reducedMotion}
        stageHost={stageHost}
        entryScene={group45 ? plan.scene : 'lab'}
        onLabBoundaryChange={setLabBoundary}
      />
      <PhoneLabContactContinuation
        reducedMotion={reducedMotion}
        stageHost={stageHost}
        {...(!group45 ? { entryScene: plan.scene } : {})}
        fromLabBoundary={true}
        labBoundary={labBoundary}
      />
    </Suspense>
  );
}
