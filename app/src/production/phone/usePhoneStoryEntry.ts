import {
  useEffect,
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
  phoneGroup67EntryPlanFromHash,
  type PhoneGroup67EntryPlan
} from './phone-entry-plan';
import type { PhoneEdgeScene } from './phone-edge-surface';
import { refreshPhoneScrollStage } from './usePhoneStageRuntime';

export type PhoneStoryEntryState = Readonly<{
  group67EntryPlan: PhoneGroup67EntryPlan | undefined;
  directGroup67Entry: boolean;
  loaderHidden: boolean;
  setLoaderHidden: Dispatch<SetStateAction<boolean>>;
  initialScene: SceneId;
  initialCheckpoint: PhoneCheckpointId;
  initialEdgeScene: PhoneEdgeScene;
}>;

export function usePhoneStoryEntry(): PhoneStoryEntryState {
  const [group67EntryPlan] = useState(() => (
    phoneGroup67EntryPlanFromHash(
      typeof window === 'undefined' ? '' : window.location.hash
    )
  ));
  const directGroup67Entry = group67EntryPlan !== undefined;
  const [loaderHidden, setLoaderHidden] = useState(
    () => directGroup67Entry || phoneLoaderCompletedInDocument()
  );
  return {
    group67EntryPlan,
    directGroup67Entry,
    loaderHidden,
    setLoaderHidden,
    initialScene: group67EntryPlan?.scene ?? 'hero',
    initialCheckpoint: group67EntryPlan?.checkpoint
      ?? (loaderHidden ? 'hero-entered' : 'loader'),
    initialEdgeScene: group67EntryPlan?.edgeScene ?? 'hero'
  };
}

export function usePhoneStoryEntryLifecycle(
  entry: PhoneStoryEntryState,
  publishCheckpoint: (checkpoint: PhoneCheckpointId) => void,
  publishEdgeScene: (scene: PhoneEdgeScene) => void
): void {
  const {
    directGroup67Entry,
    group67EntryPlan,
    loaderHidden
  } = entry;

  useEffect(() => {
    if (directGroup67Entry) return;
    return attachPhoneLoaderVisibilityLifecycle();
  }, [directGroup67Entry]);

  useEffect(() => {
    const documentElement = document.documentElement;
    documentElement.dataset.portraitSpikeLoader = loaderHidden
      ? 'ready'
      : 'active';
    if (group67EntryPlan) {
      document.getElementById('story-loader-static')?.remove();
      publishCheckpoint(group67EntryPlan.checkpoint);
      publishEdgeScene(group67EntryPlan.edgeScene);
    } else {
      publishCheckpoint(loaderHidden ? 'hero-entered' : 'loader');
      if (!loaderHidden) window.scrollTo(0, 0);
    }
    const refreshFrame = loaderHidden
      ? window.requestAnimationFrame(refreshPhoneScrollStage)
      : 0;
    return () => {
      if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
      delete documentElement.dataset.portraitSpikeLoader;
    };
  }, [
    group67EntryPlan,
    loaderHidden,
    publishCheckpoint,
    publishEdgeScene
  ]);
}
