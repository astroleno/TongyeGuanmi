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
      const reverse = segment.id === 'crane-contact'
        ? { mode: 'timeline', required: true }
        : { mode: 'static-fallback', required: false };
      expect(segment.mediaPlayback?.[0]).toMatchObject({
        forward: { mode: 'timeline', required: true },
        reverse,
        readyMilestones: ['targetReady', 'mediaReady']
      });
      expect(segment.mediaPlayback?.[0]?.media.length).toBeGreaterThan(0);
    }
  });

  it('gates both Figure2 videos before the staged distance playback can start', () => {
    const segment = storyManifest.nodes.find(
      (node) => node.kind === 'segment' && node.id === 'figure2-distance-expand'
    );

    expect(segment).toMatchObject({
      kind: 'segment',
      requiredMilestones: ['targetReady', 'mediaReady', 'buildReady', 'timelineReady'],
      mediaPlayback: [
        {
          id: 'figure2-pair',
          media: ['figure2-left-alpha', 'figure2-right-alpha'],
          forward: { mode: 'play', required: true },
          reverse: { mode: 'timeline', required: true },
          readyMilestones: ['targetReady', 'mediaReady'],
          terminalFallbackScene: 'figure2-proof-opening',
          preparingTimeoutMs: 4000
        }
      ]
    });
  });

  it('uses one top-down Ink reveal for Lab to PH', () => {
    const segment = storyManifest.nodes.find((node) => node.kind === 'segment' && node.id === 'lab-ph');

    expect(segment).toMatchObject({
      kind: 'segment',
      visual: { type: 'ink', ink: 'horizontal', direction: 'top-to-bottom' }
    });
  });

  it('marks every long copy hold as a native reading scene', () => {
    const readingByScene = new Map(
      storyManifest.nodes.flatMap((node) => node.kind === 'hold' ? [[node.scene, node.reading] as const] : [])
    );

    expect(readingByScene.get('services')).toBe(true);
    expect(readingByScene.get('lab')).toBe(true);
    expect(readingByScene.get('education')).toBe(true);
  });

  it('models Method as one native reading hold without a scene-to-scene handoff', () => {
    const methodNodes = storyManifest.nodes.filter((node) =>
      node.kind === 'hold'
        ? node.scene === 'method-top' || node.scene === 'method-bottom'
        : node.id === 'method-bottom-figure2'
    );

    expect(methodNodes).toEqual([
      expect.objectContaining({
        kind: 'hold',
        scene: 'method-top',
        reading: true
      }),
      expect.objectContaining({
        kind: 'segment',
        id: 'method-bottom-figure2',
        from: 'method-top',
        to: 'figure2-animation'
      })
    ]);
    expect(storyManifest.nodes.some((node) =>
      node.kind === 'segment' && String(node.id) === 'method-top-method-bottom'
    )).toBe(false);
  });

  it('separates TTG and PH media playback from their following Ink handoffs', () => {
    const byId = new Map(
      storyManifest.nodes.flatMap((node) => node.kind === 'segment' ? [[node.id, node] as const] : [])
    );

    expect(byId.get('ttg-lab')).toMatchObject({
      policy: { kind: 'stagedSnap', stops: [0.676], playMs: [2500, 1200] },
      virtualDuration: 3700,
      mediaPlayback: [{
        forward: {
          mode: 'play',
          required: true,
          media: ['ttg_figure-alpha-scrub']
        },
        reverse: {
          mode: 'play',
          required: true,
          media: ['ttg_figure-alpha-scrub-reverse']
        }
      }]
    });
    expect(byId.get('ph-education')).toMatchObject({
      policy: { kind: 'stagedSnap', stops: [1520 / 2720], playMs: [1520, 1200] },
      virtualDuration: 2720,
      mediaPlayback: [{ reverse: { mode: 'timeline', required: true } }]
    });
    expect(byId.get('crane-contact')).toMatchObject({
      virtualDuration: 3000,
      copyCue: { targetScene: 'contact', atProgress: 0.8 },
      mediaPlayback: [{ reverse: { mode: 'timeline', required: true } }]
    });
  });

  it('settles Figure3 to Services in one 2000ms snap with an 80% copy cue', () => {
    const segment = storyManifest.nodes.find((node) => node.kind === 'segment' && node.id === 'figure3-services');

    expect(segment).toMatchObject({
      policy: { kind: 'snap' },
      virtualDuration: 2000,
      copyCue: { targetScene: 'services', atProgress: 0.8 }
    });
  });

  it('models Hero to Pattern as one live-scene reveal', () => {
    const segment = storyManifest.nodes.find((node) => node.kind === 'segment' && node.id === 'hero-pattern');

    expect(segment).toMatchObject({
      kind: 'segment',
      policy: {
        kind: 'snap'
      },
      virtualDuration: 2200
    });
  });

  it('models Pattern collapse and radial Star Map entry as separate input phases', () => {
    const segment = storyManifest.nodes.find(
      (node) => node.kind === 'segment' && node.id === 'pattern-star-map'
    );

    expect(segment).toMatchObject({
      kind: 'segment',
      policy: {
        kind: 'stagedSnap',
        stops: [0.5],
        playMs: [1800, 1800]
      },
      virtualDuration: 3600
    });
  });

  it('marks the figure2 animation hold as a fresh-input boundary', () => {
    const hold = storyManifest.nodes.find((node) => node.kind === 'hold' && node.scene === 'figure2-animation');

    expect(hold).toMatchObject({
      kind: 'hold',
      scene: 'figure2-animation',
      freshInput: true
    });
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

  it('rejects required media playback without a mediaReady segment milestone', () => {
    const manifest = mutableManifest();
    const index = manifest.nodes.findIndex(
      (node) => node.kind === 'segment' && node.id === 'figure2-distance-expand'
    );
    const segment = manifest.nodes[index];
    if (segment?.kind !== 'segment') {
      throw new Error('test fixture missing Figure2 media segment');
    }
    manifest.nodes[index] = {
      ...segment,
      requiredMilestones: (segment.requiredMilestones ?? []).filter((key) => key !== 'mediaReady')
    };

    expect(() => validateStoryManifest(manifest)).toThrow(/mediaReady requiredMilestone/);
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
