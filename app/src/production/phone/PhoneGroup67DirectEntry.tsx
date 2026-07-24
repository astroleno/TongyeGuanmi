import { lazy, Suspense } from 'react';
import type { PhoneCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import type { PhoneGroup67EntryPlan } from './phone-entry-plan';
import type { PhoneEdgeScene } from './phone-edge-surface';
import './PhoneGroup67DirectEntry.css';

const PhoneLabContactContinuation = lazy(() => (
  import('./PhoneLabContactContinuation').then((module) => ({
    default: module.PhoneLabContactContinuation
  }))
));

export type PhoneGroup67DirectEntryProps = Readonly<{
  plan: PhoneGroup67EntryPlan | undefined;
  reducedMotion: boolean;
  stageHost: HTMLElement | null;
  onCheckpoint(checkpoint: PhoneCheckpointId): void;
  onEdgeScene(scene: PhoneEdgeScene): void;
  onSceneChange(scene: SceneId): void;
}>;

export function PhoneGroup67DirectEntry({
  plan,
  reducedMotion,
  stageHost,
  onCheckpoint,
  onEdgeScene,
  onSceneChange
}: PhoneGroup67DirectEntryProps) {
  if (!plan) return null;
  return (
    <Suspense fallback={null}>
      <PhoneLabContactContinuation
        reducedMotion={reducedMotion}
        stageHost={stageHost}
        entryScene={plan.scene}
        fromLabBoundary={false}
        onCheckpoint={onCheckpoint}
        onEdgeScene={onEdgeScene}
        onSceneChange={onSceneChange}
      />
    </Suspense>
  );
}
