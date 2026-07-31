import type {
  Group45CheckpointId,
  Group67CheckpointId,
  PhoneCheckpointId
} from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import {
  figure2ProofPanelFromHash,
  sceneFromHash
} from '../navigation';
import {
  group45PhoneSceneIds,
  type Group45PhoneSceneId
} from './adapter-groups/group4-5';
import {
  group67PhoneSceneIds,
  type Group67PhoneSceneId
} from './adapter-groups/group6-7';
import type { PhoneEdgeScene } from './phone-story/presentation';
import { phoneStablePresentationTuple } from './phone-story/presentation';

const GROUP67_SCENES = new Set<Group67PhoneSceneId>(group67PhoneSceneIds);
const GROUP45_SCENES = new Set<Group45PhoneSceneId>(group45PhoneSceneIds);

export type PhoneGroup45EntryPlan = Readonly<{
  group: 'group45';
  scene: Group45PhoneSceneId;
  edgeScene: PhoneEdgeScene;
  checkpoint: Group45CheckpointId;
}>;

export type PhoneGroup67EntryPlan = Readonly<{
  group?: 'group67';
  scene: Group67PhoneSceneId;
  edgeScene: Group67PhoneEdgeScene;
  checkpoint: Group67CheckpointId;
}>;

export type PhoneContinuationEntryPlan =
  | PhoneGroup45EntryPlan
  | (PhoneGroup67EntryPlan & Readonly<{ group: 'group67' }>);

/** Positional route bridge for the independently minified continuation chunk. */
export type PhoneContinuationEntryTuple =
  | readonly ['group45', Group45PhoneSceneId]
  | readonly ['group67', Group67PhoneSceneId];

export type PhoneStoryEntryPlan = Readonly<{
  scene: SceneId;
  edgeScene: PhoneEdgeScene;
  checkpoint: PhoneCheckpointId;
  continuation?: PhoneContinuationEntryPlan;
  proofPanelIndex?: 0 | 1 | 2;
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
  return phoneStablePresentationTuple(scene)[1];
}

export function phoneGroup67CheckpointForScene(
  scene: Group67PhoneSceneId
): Group67CheckpointId {
  return phoneStablePresentationTuple(scene)[0] as Group67CheckpointId;
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

function phoneGroup45SceneFromHash(
  hash: string
): Group45PhoneSceneId | undefined {
  const scene = sceneFromHash(hash);
  return scene && GROUP45_SCENES.has(scene as Group45PhoneSceneId)
    ? scene as Group45PhoneSceneId
    : undefined;
}

export function phoneGroup45EntryPresentation(
  scene: Group45PhoneSceneId
): Readonly<{
  edgeScene: PhoneEdgeScene;
  checkpoint: Group45CheckpointId;
}> {
  const [checkpoint, edge] = phoneStablePresentationTuple(scene);
  return { edgeScene: edge, checkpoint: checkpoint as Group45CheckpointId };
}

export function phoneContinuationEntryPlanFromHash(
  hash: string
): PhoneContinuationEntryPlan | undefined {
  const group45Scene = phoneGroup45SceneFromHash(hash);
  if (group45Scene) {
    return {
      group: 'group45',
      scene: group45Scene,
      ...phoneGroup45EntryPresentation(group45Scene)
    };
  }
  const group67 = phoneGroup67EntryPlanFromHash(hash);
  return group67 ? { ...group67, group: 'group67' } : undefined;
}

const GRADE_A_DIRECT_SCENES = new Set<SceneId>([
  'method-top',
  'figure2-animation',
  'figure2-proof'
]);

export function phoneStoryEntrySceneFromHash(
  hash: string
): SceneId | null {
  const scene = sceneFromHash(hash);
  if (!scene) return null;
  return GROUP45_SCENES.has(scene as Group45PhoneSceneId)
    || GROUP67_SCENES.has(scene as Group67PhoneSceneId)
    || GRADE_A_DIRECT_SCENES.has(scene)
    ? scene
    : null;
}

export function phoneContinuationGroupForScene(
  scene: SceneId
): 'group45' | 'group67' | null {
  if (GROUP45_SCENES.has(scene as Group45PhoneSceneId)) return 'group45';
  if (GROUP67_SCENES.has(scene as Group67PhoneSceneId)) return 'group67';
  return null;
}

export function phoneStoryProofPanelIndexFromHash(
  hash: string
): 0 | 1 | 2 | null {
  const proofPanel = figure2ProofPanelFromHash(hash);
  return proofPanel === 'opening' ? 0
    : proofPanel === 'cards' ? 1
      : proofPanel === 'closing' ? 2 : null;
}

export function phoneStoryEntryPlanFromHash(
  hash: string
): PhoneStoryEntryPlan | undefined {
  const continuation = phoneContinuationEntryPlanFromHash(hash);
  if (continuation) return { ...continuation, continuation };
  const scene = sceneFromHash(hash);
  if (!scene || !GRADE_A_DIRECT_SCENES.has(scene)) return undefined;
  const [checkpoint, edge] = phoneStablePresentationTuple(scene);
  const proofPanel = figure2ProofPanelFromHash(hash);
  return {
    scene,
    edgeScene: edge,
    checkpoint,
    ...(proofPanel ? {
      proofPanelIndex: proofPanel === 'opening' ? 0
        : proofPanel === 'cards' ? 1 : 2
    } : {})
  };
}

export function phoneStoryEntryTargetId(scene: SceneId): string {
  return scene === 'method-top' ? 'method' : scene;
}

export function phoneStoryEntryTarget(
  scene: SceneId,
  scope: Pick<Document, 'querySelector'> = document
): HTMLElement | null {
  return scope.querySelector<HTMLElement>(
    `.portrait-scroll-spike #${phoneStoryEntryTargetId(scene)}`
  );
}
