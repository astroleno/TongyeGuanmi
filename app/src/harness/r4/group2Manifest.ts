import { storyManifest } from '../../story/manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryManifest } from '../../story/types';

export type R4Group2HarnessMode = 'group2' | 'method-top-method-bottom' | 'method-bottom-figure2';

function hold(scene: SceneId): SpineHoldNode {
  const found = storyManifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === scene);
  if (!found) {
    throw new Error(`R4 group2 hold missing from manifest: ${scene}`);
  }
  return structuredClone(found);
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`R4 group2 segment missing from manifest: ${id}`);
  }
  return structuredClone(found);
}

function manifest(nodes: readonly SpineNode[]): StoryManifest {
  return {
    ...structuredClone(storyManifest),
    nodes
  };
}

export function createR4Group2Manifest(mode: R4Group2HarnessMode): StoryManifest {
  switch (mode) {
    case 'method-top-method-bottom':
      return manifest([
        hold('method-top'),
        segment('method-top-method-bottom'),
        hold('method-bottom')
      ]);
    case 'method-bottom-figure2':
      return manifest([
        hold('method-bottom'),
        segment('method-bottom-figure2'),
        hold('figure2-animation')
      ]);
    case 'group2':
      return manifest([
        hold('method-top'),
        segment('method-top-method-bottom'),
        hold('method-bottom'),
        segment('method-bottom-figure2'),
        hold('figure2-animation')
      ]);
  }
}
