import { storyManifest } from '../../story/manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryManifest } from '../../story/types';

export type R4Group3HarnessMode =
  | 'group3'
  | 'figure2-distance-expand'
  | 'figure2-proof-brand';

function hold(scene: SceneId): SpineHoldNode {
  const found = storyManifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === scene);
  if (!found) {
    throw new Error(`R4 group3 hold missing from manifest: ${scene}`);
  }
  return structuredClone(found);
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`R4 group3 segment missing from manifest: ${id}`);
  }
  return structuredClone(found);
}

function manifest(nodes: readonly SpineNode[]): StoryManifest {
  return {
    ...structuredClone(storyManifest),
    nodes
  };
}

export function createR4Group3Manifest(mode: R4Group3HarnessMode): StoryManifest {
  switch (mode) {
    case 'figure2-distance-expand':
      return manifest([
        hold('figure2-animation'),
        segment('figure2-distance-expand'),
        hold('figure2-proof')
      ]);
    case 'figure2-proof-brand':
      return manifest([
        hold('figure2-proof'),
        segment('figure2-proof-brand'),
        hold('brand')
      ]);
    case 'group3':
      return manifest([
        hold('figure2-animation'),
        segment('figure2-distance-expand'),
        hold('figure2-proof'),
        segment('figure2-proof-brand'),
        hold('brand')
      ]);
  }
}
