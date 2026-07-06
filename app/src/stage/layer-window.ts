import { storyManifest } from '../story/manifest';
import type { SceneId, StoryManifest } from '../story/types';

export type LayerWindowSnapshot = {
  prev?: SceneId;
  current: SceneId;
  next?: SceneId;
  retiring: readonly SceneId[];
};

function holdScenes(manifest: StoryManifest): SceneId[] {
  return manifest.nodes.flatMap((node) => (node.kind === 'hold' ? [node.scene] : []));
}

function sceneAt(scenes: readonly SceneId[], index: number): SceneId | undefined {
  return index >= 0 && index < scenes.length ? scenes[index] : undefined;
}

export function createLayerWindow(current: SceneId, manifest: StoryManifest = storyManifest): LayerWindowSnapshot {
  const scenes = holdScenes(manifest);
  const index = scenes.indexOf(current);
  if (index === -1) {
    throw new Error(`Cannot create LayerWindow for unknown scene: ${current}`);
  }

  const prev = sceneAt(scenes, index - 1);
  const next = sceneAt(scenes, index + 1);
  return {
    current,
    retiring: [],
    ...(prev ? { prev } : {}),
    ...(next ? { next } : {})
  };
}

export function advanceLayerWindow(
  snapshot: LayerWindowSnapshot,
  current: SceneId,
  manifest: StoryManifest = storyManifest
): LayerWindowSnapshot {
  const next = createLayerWindow(current, manifest);
  const oldMembers = new Set([snapshot.prev, snapshot.current, snapshot.next].filter(Boolean));
  const newMembers = new Set([next.prev, next.current, next.next].filter(Boolean));
  const retiring = [...oldMembers].filter((scene): scene is SceneId => Boolean(scene) && !newMembers.has(scene));
  return {
    ...next,
    retiring
  };
}

export function fallbackLayerWindow(manifest: StoryManifest = storyManifest): LayerWindowSnapshot {
  const fallback = manifest.nodes.find((node) => node.kind === 'hold' && node.staticFallback);
  if (fallback?.kind !== 'hold') {
    throw new Error('Manifest does not include a static fallback hold');
  }
  return createLayerWindow(fallback.scene, manifest);
}
