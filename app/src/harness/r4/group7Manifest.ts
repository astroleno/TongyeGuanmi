import { storyManifest } from '../../story/manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryManifest } from '../../story/types';

export type R4Group7HarnessMode = 'group7' | 'education-crane' | 'crane-contact';

function hold(scene: SceneId): SpineHoldNode {
  const found = storyManifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === scene);
  if (!found) {
    throw new Error(`R4 group7 hold missing from manifest: ${scene}`);
  }
  return structuredClone(found);
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`R4 group7 segment missing from manifest: ${id}`);
  }
  return structuredClone(found);
}

function manifest(nodes: readonly SpineNode[]): StoryManifest {
  return {
    ...structuredClone(storyManifest),
    nodes
  };
}

export function createR4Group7Manifest(mode: R4Group7HarnessMode): StoryManifest {
  switch (mode) {
    case 'education-crane':
      return manifest([
        hold('education'),
        segment('education-crane'),
        hold('crane-animation')
      ]);
    case 'crane-contact':
      return manifest([
        hold('crane-animation'),
        segment('crane-contact'),
        hold('contact')
      ]);
    case 'group7':
      return manifest([
        hold('education'),
        segment('education-crane'),
        hold('crane-animation'),
        segment('crane-contact'),
        hold('contact')
      ]);
  }
}
