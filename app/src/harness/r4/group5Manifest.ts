import { storyManifest } from '../../story/manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryManifest } from '../../story/types';

export type R4Group5HarnessMode = 'group5' | 'services-ttg' | 'ttg-lab';

function hold(scene: SceneId): SpineHoldNode {
  const found = storyManifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === scene);
  if (!found) {
    throw new Error(`R4 group5 hold missing from manifest: ${scene}`);
  }
  return structuredClone(found);
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`R4 group5 segment missing from manifest: ${id}`);
  }
  return structuredClone(found);
}

function manifest(nodes: readonly SpineNode[]): StoryManifest {
  return {
    ...structuredClone(storyManifest),
    nodes
  };
}

export function createR4Group5Manifest(mode: R4Group5HarnessMode): StoryManifest {
  switch (mode) {
    case 'services-ttg':
      return manifest([
        hold('services'),
        segment('services-ttg'),
        hold('ttg-animation')
      ]);
    case 'ttg-lab':
      return manifest([
        hold('ttg-animation'),
        segment('ttg-lab'),
        hold('lab')
      ]);
    case 'group5':
      return manifest([
        hold('services'),
        segment('services-ttg'),
        hold('ttg-animation'),
        segment('ttg-lab'),
        hold('lab')
      ]);
  }
}
