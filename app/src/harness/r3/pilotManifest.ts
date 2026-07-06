import { storyManifest } from '../../story/manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryManifest } from '../../story/types';

export type PilotHarnessMode = 'pilot' | 'aod-animation' | 'star-map-aod' | 'aod-method-top';

function hold(scene: SceneId): SpineHoldNode {
  const found = storyManifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === scene);
  if (!found) {
    throw new Error(`R3 pilot hold missing from manifest: ${scene}`);
  }
  return structuredClone(found);
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`R3 pilot segment missing from manifest: ${id}`);
  }
  return structuredClone(found);
}

function manifest(nodes: readonly SpineNode[]): StoryManifest {
  return {
    ...structuredClone(storyManifest),
    nodes
  };
}

export function createR3PilotManifest(mode: PilotHarnessMode): StoryManifest {
  switch (mode) {
    case 'pilot':
      return manifest([
        hold('star-map'),
        segment('star-map-aod'),
        hold('aod-animation'),
        segment('aod-method-top'),
        hold('method-top')
      ]);
    case 'aod-animation':
    case 'aod-method-top':
      return manifest([
        hold('aod-animation'),
        segment('aod-method-top'),
        hold('method-top')
      ]);
    case 'star-map-aod':
      return manifest([
        hold('star-map'),
        segment('star-map-aod'),
        hold('aod-animation')
      ]);
  }
}
