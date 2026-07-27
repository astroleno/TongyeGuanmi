import { lazy, Suspense } from 'react';
import type {
  PhoneContinuationEntryTuple
} from './phone-entry-plan';
import './PhoneGroup67DirectEntry.css';

const PhoneContinuationBundle = lazy(() => (
  import('./PhoneContinuationBundle').then((module) => ({
    default: module.PhoneContinuationBundle
  }))
));

export type PhoneGroup67DirectEntryProps = Readonly<{
  plan: PhoneContinuationEntryTuple | undefined;
  reducedMotion: boolean;
  stageHost: HTMLElement | null;
}>;

export function PhoneGroup67DirectEntry({
  plan,
  reducedMotion,
  stageHost
}: PhoneGroup67DirectEntryProps) {
  if (!plan) return null;
  return (
    <Suspense fallback={null}>
      <PhoneContinuationBundle
        plan={plan}
        motionReduced={reducedMotion}
        stageHost={stageHost}
      />
    </Suspense>
  );
}
