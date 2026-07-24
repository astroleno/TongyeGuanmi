import type {
  Group67CheckpointId
} from '../../story/semantic-checkpoints';
import { sceneFromHash } from '../navigation';
import {
  group67PhoneSceneIds,
  type Group67PhoneSceneId
} from './adapter-groups/group6-7';
import type { PhoneEdgeScene } from './phone-edge-surface';

const GROUP67_SCENES = new Set<Group67PhoneSceneId>(group67PhoneSceneIds);

export type PhoneGroup67EntryPlan = Readonly<{
  scene: Group67PhoneSceneId;
  edgeScene: Group67PhoneEdgeScene;
  checkpoint: Group67CheckpointId;
}>;

type Group67PhoneEdgeScene = Extract<
  PhoneEdgeScene,
  'ph' | 'education' | 'crane' | 'contact'
>;

export function phoneGroup67SceneFromHash(
  hash: string
): Group67PhoneSceneId | undefined {
  const scene = sceneFromHash(hash);
  return scene && GROUP67_SCENES.has(scene as Group67PhoneSceneId)
    ? scene as Group67PhoneSceneId
    : undefined;
}

export function phoneGroup67EntryFromHash(
  hash: string
): Group67PhoneSceneId {
  return phoneGroup67SceneFromHash(hash) ?? 'ph-animation';
}

export function phoneGroup67EdgeScene(
  scene: Group67PhoneSceneId
): Group67PhoneEdgeScene;
export function phoneGroup67EdgeScene(scene: 'lab'): 'lab';
export function phoneGroup67EdgeScene(
  scene: 'lab' | Group67PhoneSceneId
): PhoneEdgeScene;
export function phoneGroup67EdgeScene(
  scene: 'lab' | Group67PhoneSceneId
): PhoneEdgeScene {
  if (scene === 'ph-animation') return 'ph';
  if (scene === 'crane-animation') return 'crane';
  return scene;
}

export function phoneGroup67CheckpointForScene(
  scene: Group67PhoneSceneId
): Group67CheckpointId {
  switch (scene) {
    case 'ph-animation':
      return 'ph-stage';
    case 'education':
      return 'education-reading';
    case 'crane-animation':
      return 'crane-stage';
    case 'contact':
      return 'contact-stable';
  }
}

export function phoneGroup67EntryPlanFromHash(
  hash: string
): PhoneGroup67EntryPlan | undefined {
  const scene = phoneGroup67SceneFromHash(hash);
  if (!scene) return undefined;
  return {
    scene,
    edgeScene: phoneGroup67EdgeScene(scene),
    checkpoint: phoneGroup67CheckpointForScene(scene)
  };
}
