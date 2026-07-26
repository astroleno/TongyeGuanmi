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
  phoneStoryEntryPlanFromHash,
  phoneStoryEntryTarget,
  type PhoneContinuationEntryPlan,
  type PhoneStoryEntryPlan
} from './phone-entry-plan';
import {
  createPhoneDirectEntryPositioner
} from './phone-direct-entry-position';
import type { PhoneEdgeScene } from './phone-edge-surface';
import type { PhoneStoryOrchestrator } from './phone-story-orchestrator';
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
  orchestrator: PhoneStoryOrchestrator
): void {
  const {
    directEntryPlan,
    directStoryEntry,
    loaderHidden
  } = entry;

  useEffect(() => {
    if (directStoryEntry) return;
    return attachPhoneLoaderVisibilityLifecycle();
  }, [directStoryEntry]);

  useEffect(() => {
    const documentElement = document.documentElement;
    let disposePositioner: (() => void) | undefined;
    documentElement.dataset.portraitSpikeLoader = loaderHidden
      ? 'ready'
      : 'active';
    if (directEntryPlan) {
      document.getElementById('story-loader-static')?.remove();
      disposePositioner = createPhoneDirectEntryPositioner({
        target: () => phoneStoryEntryTarget(directEntryPlan.scene),
        targetOffset: (target) => directEntryPlan.proofPanelIndex === undefined
          ? 0
          : directEntryPlan.proofPanelIndex
            * Math.max(0, target.getBoundingClientRect().height - window.innerHeight)
            / 2,
        scrollY: () => window.scrollY,
        scrollTo: (y) => window.scrollTo(0, y),
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (frame) => window.cancelAnimationFrame(frame),
        onReady: () => orchestrator.activateDirectEntry()
      }).dispose;
    } else {
      if (loaderHidden) orchestrator.reconcileHold('hero');
      else window.scrollTo(0, 0);
    }
    const refreshFrame = loaderHidden
      ? window.requestAnimationFrame(refreshPhoneScrollStage)
      : 0;
    return () => {
      disposePositioner?.();
      if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
      delete documentElement.dataset.portraitSpikeLoader;
    };
  }, [
    directEntryPlan,
    loaderHidden,
    orchestrator
  ]);
}
