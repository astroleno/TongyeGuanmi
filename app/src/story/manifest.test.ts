import { describe, expect, it } from 'vitest';
import { storyManifest, validateStoryManifest } from './manifest';
import type { SceneId, SpineNode, StoryManifest } from './types';

type MutableManifest = Omit<StoryManifest, 'nodes'> & {
  nodes: SpineNode[];
};

function mutableManifest(): MutableManifest {
  return structuredClone(storyManifest) as MutableManifest;
}

describe('story manifest contract', () => {
  it('accepts the R0 manifest seed', () => {
    expect(() => validateStoryManifest(storyManifest)).not.toThrow();
  });

  it('rejects illegal hold/segment ordering', () => {
    const manifest = mutableManifest();
    const secondHold = manifest.nodes[2];
    if (!secondHold) {
      throw new Error('test fixture missing second hold');
    }
    manifest.nodes[1] = secondHold;

    expect(() => validateStoryManifest(manifest)).toThrow(/must be segment/);
  });

  it('rejects non-contiguous segment from/to values', () => {
    const manifest = mutableManifest();
    const segment = manifest.nodes[1];
    if (segment?.kind !== 'segment') {
      throw new Error('test fixture missing first segment');
    }
    manifest.nodes[1] = { ...segment, from: 'brand' };

    expect(() => validateStoryManifest(manifest)).toThrow(/neighboring holds/);
  });

  it('rejects illegal stagedSnap stops', () => {
    const manifest = mutableManifest();
    const index = manifest.nodes.findIndex(
      (node) => node.kind === 'segment' && node.policy.kind === 'stagedSnap'
    );
    const segment = manifest.nodes[index];
    if (segment?.kind !== 'segment' || segment.policy.kind !== 'stagedSnap') {
      throw new Error('test fixture missing staged segment');
    }
    manifest.nodes[index] = {
      ...segment,
      policy: { ...segment.policy, stops: [0.9, 0.7] }
    };

    expect(() => validateStoryManifest(manifest)).toThrow(/stagedSnap stops/);
  });

  it('rejects missing copyCue targets', () => {
    const manifest = mutableManifest();
    const index = manifest.nodes.findIndex((node) => node.kind === 'segment' && Boolean(node.copyCue));
    const segment = manifest.nodes[index];
    if (segment?.kind !== 'segment' || !segment.copyCue) {
      throw new Error('test fixture missing copyCue segment');
    }
    manifest.nodes[index] = {
      ...segment,
      copyCue: { ...segment.copyCue, targetScene: 'missing-scene' as SceneId }
    };

    expect(() => validateStoryManifest(manifest)).toThrow(/copyCue targetScene/);
  });

  it('seeds mediaPlayback for R3/R4 media segments', () => {
    const mediaSegments = storyManifest.nodes.flatMap((node) =>
      node.kind === 'segment' && ['aod-method-top', 'figure3-services', 'crane-contact'].includes(node.id)
        ? [node]
        : []
    );

    expect(mediaSegments.map((node) => node.id)).toEqual([
      'aod-method-top',
      'figure3-services',
      'crane-contact'
    ]);
    for (const segment of mediaSegments) {
      expect(segment.mediaPlayback?.[0]).toMatchObject({
        forward: { mode: 'play', required: true },
        reverse: { mode: 'static-fallback', required: false },
        readyMilestones: ['targetReady', 'mediaReady']
      });
      expect(segment.mediaPlayback?.[0]?.media.length).toBeGreaterThan(0);
    }
  });

  it('rejects media visual segments without mediaPlayback seed', () => {
    const manifest = mutableManifest();
    const index = manifest.nodes.findIndex((node) => node.kind === 'segment' && node.visual?.type === 'media');
    const segment = manifest.nodes[index];
    if (segment?.kind !== 'segment') {
      throw new Error('test fixture missing media segment');
    }
    const withoutMediaPlayback = { ...segment };
    delete withoutMediaPlayback.mediaPlayback;
    manifest.nodes[index] = withoutMediaPlayback;

    expect(() => validateStoryManifest(manifest)).toThrow(/mediaPlayback seed/);
  });

  it('rejects mediaPlayback terminal fallback scenes outside the manifest', () => {
    const manifest = mutableManifest();
    const index = manifest.nodes.findIndex((node) => node.kind === 'segment' && Boolean(node.mediaPlayback?.length));
    const segment = manifest.nodes[index];
    if (segment?.kind !== 'segment' || !segment.mediaPlayback?.[0]) {
      throw new Error('test fixture missing mediaPlayback segment');
    }
    manifest.nodes[index] = {
      ...segment,
      mediaPlayback: [
        {
          ...segment.mediaPlayback[0],
          terminalFallbackScene: 'missing-scene' as SceneId
        }
      ]
    };

    expect(() => validateStoryManifest(manifest)).toThrow(/terminalFallbackScene/);
  });

  it('rejects interruptible segments absent from the R-1 candidate list', () => {
    const manifest = mutableManifest();
    const index = manifest.nodes.findIndex((node) => node.kind === 'segment' && node.policy.kind === 'snap');
    const segment = manifest.nodes[index];
    if (segment?.kind !== 'segment' || segment.policy.kind !== 'snap') {
      throw new Error('test fixture missing snap segment');
    }
    manifest.nodes[index] = {
      ...segment,
      policy: { ...segment.policy, interruptible: true }
    };

    expect(() => validateStoryManifest(manifest, [])).toThrow(/interruptible/);
  });

  it('rejects manifests without static fallback holds', () => {
    const manifest = mutableManifest();
    manifest.nodes = manifest.nodes.map((node) => {
      if (node.kind === 'hold') {
        return { ...node, staticFallback: false };
      }
      return node;
    });

    expect(() => validateStoryManifest(manifest)).toThrow(/staticFallback/);
  });

  it('rejects missing build timeout defaults', () => {
    const manifest = mutableManifest();
    manifest.defaults.buildTimeoutMs = 0;

    expect(() => validateStoryManifest(manifest)).toThrow(/buildTimeoutMs/);
  });
});
