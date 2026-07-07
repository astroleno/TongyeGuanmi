import { storyManifest } from '../../story/manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryManifest } from '../../story/types';

export type R4Group1HarnessMode = 'group1' | 'hero-pattern' | 'pattern-star-map';

function hold(scene: SceneId): SpineHoldNode {
  const found = storyManifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === scene);
  if (!found) {
    throw new Error(`R4 group1 hold missing from manifest: ${scene}`);
  }
  return structuredClone(found);
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`R4 group1 segment missing from manifest: ${id}`);
  }
  const cloned = structuredClone(found);
  if (id === 'hero-pattern' || id === 'pattern-star-map') {
    return {
      ...cloned,
      policy: { kind: 'scrub', snapAfterIdleMs: 160 }
    };
  }
  return cloned;
}

function manifest(nodes: readonly SpineNode[]): StoryManifest {
  return {
    ...structuredClone(storyManifest),
    nodes
  };
}

export function createR4Group1Manifest(mode: R4Group1HarnessMode): StoryManifest {
  switch (mode) {
    case 'hero-pattern':
      return manifest([
        hold('hero'),
        segment('hero-pattern'),
        hold('pattern')
      ]);
    case 'pattern-star-map':
      return manifest([
        hold('pattern'),
        segment('pattern-star-map'),
        hold('star-map')
      ]);
    case 'group1':
      return manifest([
        hold('hero'),
        segment('hero-pattern'),
        hold('pattern'),
        segment('pattern-star-map'),
        hold('star-map')
      ]);
  }
}
