import {
  useEffect,
  useLayoutEffect,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import type { PhoneCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import {
  attachPhoneLoaderVisibilityLifecycle,
  phoneLoaderCompletedInDocument
} from './phone-loader-lifecycle';
import {
  phoneStoryEntryPlanFromHash,
  type PhoneContinuationEntryPlan,
  type PhoneStoryEntryPlan
} from './phone-entry-plan';
import type { PhoneEdgeScene } from './phone-edge-surface';
import type { PhoneStoryRuntimePort } from './phone-story-orchestrator';
import { phoneEntryPlan } from './phone-story-runs';
import { refreshPhoneScrollStage } from './usePhoneStageRuntime';

export type PhoneStoryEntryState = Readonly<{
  directEntryPlan: PhoneStoryEntryPlan | undefined;
  continuationEntryPlan: PhoneContinuationEntryPlan | undefined;
  directStoryEntry: boolean;
  directContinuationEntry: boolean;
  loaderHidden: boolean;
  setLoaderHidden: Dispatch<SetStateAction<boolean>>;
  initialScene: SceneId;
  initialCheckpoint: PhoneCheckpointId;
  initialEdgeScene: PhoneEdgeScene;
}>;

export function usePhoneStoryEntry(): PhoneStoryEntryState {
  const [directEntryPlan] = useState(() => (
    phoneStoryEntryPlanFromHash(
      typeof window === 'undefined' ? '' : window.location.hash
    )
  ));
  const continuationEntryPlan = directEntryPlan?.continuation;
  const directStoryEntry = directEntryPlan !== undefined;
  const directContinuationEntry = continuationEntryPlan !== undefined;
  const [loaderHidden, setLoaderHidden] = useState(
    () => directStoryEntry || phoneLoaderCompletedInDocument()
  );
  return {
    directEntryPlan,
    continuationEntryPlan,
    directStoryEntry,
    directContinuationEntry,
    loaderHidden,
    setLoaderHidden,
    initialScene: directEntryPlan?.scene ?? 'hero',
    initialCheckpoint: directEntryPlan?.checkpoint
      ?? (loaderHidden ? 'hero-entered' : 'loader'),
    initialEdgeScene: directEntryPlan?.edgeScene ?? 'hero'
  };
}

export function usePhoneStoryEntryLifecycle(
  entry: PhoneStoryEntryState,
  orchestrator: PhoneStoryRuntimePort
): void {
  const {
    directEntryPlan,
    directStoryEntry,
    loaderHidden
  } = entry;

  // This runs before the factory's passive attach effect. Direct entry therefore
  // enters the immutable transaction state before the route can project a
  // target stable hold, while the factory remains the sole listener owner.
  useLayoutEffect(() => {
    if (!directEntryPlan) return;
    const snapshot = orchestrator.getSnapshot();
    const plan = phoneEntryPlan(directEntryPlan.scene);
    const fallbackScene = snapshot.status === 'stable'
      ? snapshot.scene
      : snapshot.projection.semanticScene;
    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: snapshot.authorityId,
      target: directEntryPlan.scene,
      source: 'initial',
      fallbackScene,
      cinematic: plan.kind === 'cinematic'
        ? { run: plan.run, direction: plan.direction, legIndex: plan.legIndex }
        : null
    });
  }, [directEntryPlan, orchestrator]);

  useEffect(() => {
    if (directStoryEntry) return;
    return attachPhoneLoaderVisibilityLifecycle();
  }, [directStoryEntry]);

  useEffect(() => {
    const documentElement = document.documentElement;
    documentElement.dataset.portraitSpikeLoader = loaderHidden
      ? 'ready'
      : 'active';
    if (directEntryPlan) {
      document.getElementById('story-loader-static')?.remove();
    } else {
      if (loaderHidden) {
        const snapshot = orchestrator.getSnapshot();
        orchestrator.dispatch({
          type: 'BOOTSTRAP_REQUESTED',
          authorityId: snapshot.authorityId,
          target: 'hero',
          fallbackScene: 'hero',
          cinematic: null
        });
      }
      else window.scrollTo(0, 0);
    }
    const refreshFrame = loaderHidden
      ? window.requestAnimationFrame(refreshPhoneScrollStage)
      : 0;
    return () => {
      if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
      delete documentElement.dataset.portraitSpikeLoader;
    };
  }, [
    directEntryPlan,
    loaderHidden,
    orchestrator
  ]);
}
