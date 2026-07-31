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
  phoneStoryEntrySceneFromHash
} from './phone-entry-plan';
import type { PhoneEdgeScene } from './phone-story/presentation';
import type { PhoneStoryRuntimePort } from './phone-story/runtime';
import { phoneStablePresentationTuple } from './phone-story/presentation';
import {
  requestPhoneRuntimeBootstrap,
  requestPhoneRuntimeDirectEntry
} from './phone-story/runtime';
import { refreshPhoneScrollStage } from './usePhoneStageRuntime';

/**
 * A direct hash never starts as a fake target hold. The sole bootstrap hold
 * remains Hero until the visual plane opens and the machine admits the target
 * through its own transaction.
 */
export const PHONE_STORY_BOOTSTRAP_SCENE = 'hero' as const;

export type PhoneStoryEntryState = Readonly<{
  entryScene: SceneId | null;
  directStoryEntry: boolean;
  loaderHidden: boolean;
  setLoaderHidden: Dispatch<SetStateAction<boolean>>;
  initialScene: SceneId;
  initialCheckpoint: PhoneCheckpointId;
  initialEdgeScene: PhoneEdgeScene;
}>;

export function usePhoneStoryEntry(): PhoneStoryEntryState {
  const [entryScene] = useState(() => {
    const hash = typeof window === 'undefined' ? '' : window.location.hash;
    return phoneStoryEntrySceneFromHash(hash);
  });
  const [entryCheckpoint, entryEdgeScene] = entryScene
    ? phoneStablePresentationTuple(entryScene)
    : [null, null] as const;
  const directStoryEntry = entryScene !== null;
  const [loaderHidden, setLoaderHidden] = useState(
    () => directStoryEntry || phoneLoaderCompletedInDocument()
  );
  return {
    entryScene,
    directStoryEntry,
    loaderHidden,
    setLoaderHidden,
    initialScene: PHONE_STORY_BOOTSTRAP_SCENE,
    initialCheckpoint: entryCheckpoint
      ?? (loaderHidden ? 'hero-entered' : 'loader'),
    initialEdgeScene: entryEdgeScene ?? 'hero'
  };
}

/**
 * A leaf may mount behind the startup loader, but its transaction cannot be
 * admitted until that visual plane is actually released. This keeps loader
 * sequencing outside playback while preserving the runner as the sole
 * admission owner.
 */
export function phoneDirectEntryAdmissionScene(
  entryScene: SceneId | null,
  directAdmissionOpen: boolean
): SceneId | null {
  return directAdmissionOpen ? entryScene : null;
}

export function usePhoneStoryEntryLifecycle(
  entryScene: SceneId | null,
  loaderHidden: boolean,
  orchestrator: PhoneStoryRuntimePort,
  directAdmissionOpen = true
): void {
  // This runs before the factory's passive attach effect. Direct entry therefore
  // enters the immutable transaction state before the route can project a
  // target stable hold, while the factory remains the sole listener owner.
  useLayoutEffect(() => {
    const admissionScene = phoneDirectEntryAdmissionScene(
      entryScene,
      directAdmissionOpen
    );
    if (!admissionScene) return;
    requestPhoneRuntimeDirectEntry(orchestrator, admissionScene, 'initial');
  }, [directAdmissionOpen, entryScene, orchestrator]);

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
        requestPhoneRuntimeBootstrap(orchestrator);
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
