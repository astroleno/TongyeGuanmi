import { storyManifest } from '../../story/manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryManifest } from '../../story/types';

export type R4Group4HarnessMode = 'group4' | 'brand-figure3' | 'figure3-services';

function hold(scene: SceneId): SpineHoldNode {
  const found = storyManifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === scene);
  if (!found) {
    throw new Error(`R4 group4 hold missing from manifest: ${scene}`);
  }
  return structuredClone(found);
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`R4 group4 segment missing from manifest: ${id}`);
  }
  return structuredClone(found);
}

function manifest(nodes: readonly SpineNode[]): StoryManifest {
  return {
    ...structuredClone(storyManifest),
    nodes
  };
}

export function createR4Group4Manifest(mode: R4Group4HarnessMode): StoryManifest {
  switch (mode) {
    case 'brand-figure3':
      return manifest([
        hold('brand'),
        segment('brand-figure3'),
        hold('figure3-animation')
      ]);
    case 'figure3-services':
      return manifest([
        hold('figure3-animation'),
        segment('figure3-services'),
        hold('services')
      ]);
    case 'group4':
      return manifest([
        hold('brand'),
        segment('brand-figure3'),
        hold('figure3-animation'),
        segment('figure3-services'),
        hold('services')
      ]);
  }
}
