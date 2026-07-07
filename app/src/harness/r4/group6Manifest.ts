import { storyManifest } from '../../story/manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryManifest } from '../../story/types';

export type R4Group6HarnessMode = 'group6' | 'lab-ph' | 'ph-education';

function hold(scene: SceneId): SpineHoldNode {
  const found = storyManifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === scene);
  if (!found) {
    throw new Error(`R4 group6 hold missing from manifest: ${scene}`);
  }
  return structuredClone(found);
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`R4 group6 segment missing from manifest: ${id}`);
  }
  return structuredClone(found);
}

function manifest(nodes: readonly SpineNode[]): StoryManifest {
  return {
    ...structuredClone(storyManifest),
    nodes
  };
}

export function createR4Group6Manifest(mode: R4Group6HarnessMode): StoryManifest {
  switch (mode) {
    case 'lab-ph':
      return manifest([
        hold('lab'),
        segment('lab-ph'),
        hold('ph-animation')
      ]);
    case 'ph-education':
      return manifest([
        hold('ph-animation'),
        segment('ph-education'),
        hold('education')
      ]);
    case 'group6':
      return manifest([
        hold('lab'),
        segment('lab-ph'),
        hold('ph-animation'),
        segment('ph-education'),
        hold('education')
      ]);
  }
}
