import { storyManifest } from '../../story/manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryManifest } from '../../story/types';

function hold(scene: SceneId): SpineHoldNode {
  const found = storyManifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === scene);
  if (!found) {
    throw new Error(`R4 back-half hold missing from manifest: ${scene}`);
  }
  return structuredClone(found);
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`R4 back-half segment missing from manifest: ${id}`);
  }
  return structuredClone(found);
}

function manifest(nodes: readonly SpineNode[]): StoryManifest {
  return {
    ...structuredClone(storyManifest),
    nodes
  };
}

export function createR4BackHalfManifest(): StoryManifest {
  return manifest([
    hold('services'),
    segment('services-ttg'),
    hold('ttg-animation'),
    segment('ttg-lab'),
    hold('lab'),
    segment('lab-ph'),
    hold('ph-animation'),
    segment('ph-education'),
    hold('education'),
    segment('education-crane'),
    hold('crane-animation'),
    segment('crane-contact'),
    hold('contact')
  ]);
}
