import type { Direction, SceneId, SpineSegmentNode, StoryManifest } from '../../story/types';

function holdIndex(manifest: StoryManifest, scene: SceneId): number {
  const index = manifest.nodes.findIndex((node) => node.kind === 'hold' && node.scene === scene);
  if (index < 0) {
    throw new Error(`R4 harness hold missing from manifest: ${scene}`);
  }
  return index;
}

function inputLegs(segment: SpineSegmentNode): number {
  return segment.policy.kind === 'stagedSnap' ? segment.policy.playMs.length : 1;
}

export function adjacentHoldScene(
  manifest: StoryManifest,
  scene: SceneId,
  direction: Direction
): SceneId | undefined {
  const start = holdIndex(manifest, scene);
  for (let index = start + direction; index >= 0 && index < manifest.nodes.length; index += direction) {
    const node = manifest.nodes[index];
    if (node?.kind === 'hold') {
      return node.scene;
    }
  }
  return undefined;
}

export function inputBudgetBetweenScenes(
  manifest: StoryManifest,
  from: SceneId,
  to: SceneId
): number {
  const fromIndex = holdIndex(manifest, from);
  const toIndex = holdIndex(manifest, to);
  if (fromIndex === toIndex) {
    return 0;
  }

  const direction: Direction = toIndex > fromIndex ? 1 : -1;
  let inputs = 0;
  for (let index = fromIndex + direction; index !== toIndex; index += direction) {
    const node = manifest.nodes[index];
    if (node?.kind === 'segment') {
      inputs += inputLegs(node);
    }
  }
  return inputs;
}
