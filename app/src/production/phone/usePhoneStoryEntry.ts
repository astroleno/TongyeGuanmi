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
  phoneContinuationGroupForScene,
  phoneStoryEntrySceneFromHash,
  type PhoneContinuationEntryTuple
} from './phone-entry-plan';
import type { PhoneEdgeScene } from './phone-edge-surface';
import type { PhoneStoryRuntimePort } from './phone-story-orchestrator';
import { phoneStablePresentationTuple } from './phone-story-presentation';
import { requestPhoneRuntimeDirectEntry } from './phone-story-runtime';
import { refreshPhoneScrollStage } from './usePhoneStageRuntime';

export type PhoneStoryEntryState = Readonly<{
  entryScene: SceneId | null;
  continuationEntry: PhoneContinuationEntryTuple | undefined;
  directStoryEntry: boolean;
  directContinuationEntry: boolean;
  loaderHidden: boolean;
  setLoaderHidden: Dispatch<SetStateAction<boolean>>;
  initialScene: SceneId;
  initialCheckpoint: PhoneCheckpointId;
  initialEdgeScene: PhoneEdgeScene;
}>;

export function usePhoneStoryEntry(): PhoneStoryEntryState {
  const [entry] = useState(() => (
    (() => {
      const hash = typeof window === 'undefined' ? '' : window.location.hash;
      const scene = phoneStoryEntrySceneFromHash(hash);
      return [
        scene,
        scene ? phoneContinuationGroupForScene(scene) : null
      ] as const;
    })()
  ));
  const [entryScene, continuationGroup] = entry;
  const [entryCheckpoint, entryEdgeScene] = entryScene
    ? phoneStablePresentationTuple(entryScene)
    : [null, null] as const;
  const continuationEntry: PhoneContinuationEntryTuple | undefined =
    continuationGroup === null ? undefined
      : [continuationGroup, entryScene!] as PhoneContinuationEntryTuple;
  const directStoryEntry = entryScene !== null;
  const directContinuationEntry = continuationEntry !== undefined;
  const [loaderHidden, setLoaderHidden] = useState(
    () => directStoryEntry || phoneLoaderCompletedInDocument()
  );
  return {
    entryScene,
    continuationEntry,
    directStoryEntry,
    directContinuationEntry,
    loaderHidden,
    setLoaderHidden,
    initialScene: entryScene ?? 'hero',
    initialCheckpoint: entryCheckpoint
      ?? (loaderHidden ? 'hero-entered' : 'loader'),
    initialEdgeScene: entryEdgeScene ?? 'hero'
  };
}

export function usePhoneStoryEntryLifecycle(
  entryScene: SceneId | null,
  loaderHidden: boolean,
  orchestrator: PhoneStoryRuntimePort
): void {
  // This runs before the factory's passive attach effect. Direct entry therefore
  // enters the immutable transaction state before the route can project a
  // target stable hold, while the factory remains the sole listener owner.
  useLayoutEffect(() => {
    if (!entryScene) return;
    requestPhoneRuntimeDirectEntry(orchestrator, entryScene, 'initial');
  }, [entryScene, orchestrator]);

  useEffect(() => {
    if (entryScene) return;
    return attachPhoneLoaderVisibilityLifecycle();
  }, [entryScene]);

  useEffect(() => {
    const documentElement = document.documentElement;
    documentElement.dataset.portraitSpikeLoader = loaderHidden
      ? 'ready'
      : 'active';
    if (entryScene) {
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
    entryScene,
    loaderHidden,
    orchestrator
  ]);
}
