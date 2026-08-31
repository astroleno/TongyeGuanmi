import { describe, expect, it } from 'vitest';
import { storyManifest, validateStoryManifest } from './manifest';
import {
  HERO_PATTERN_TOTAL_MS,
  PATTERN_COLLAPSE_MS,
  PATTERN_COLLAPSE_STOP,
  PATTERN_STAR_MAP_INK_MS,
  PATTERN_TOTAL_MS,
  TERMINAL_DWELL_MS
} from './timings';
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

  it('rejects duplicate stagedSnap stops', () => {
    const manifest = mutableManifest();
    const index = manifest.nodes.findIndex(
      (node) => node.kind === 'segment' && node.policy.kind === 'stagedSnap'
    );
    const segment = manifest.nodes[index];
    if (segment?.kind !== 'segment' || segment.policy.kind !== 'stagedSnap') {
      throw new Error('test fixture missing staged segment');
    }
    const duplicate = segment.policy.stops[0] ?? 0.5;
    manifest.nodes[index] = {
      ...segment,
      policy: { ...segment.policy, stops: [duplicate, duplicate] }
    };

    expect(() => validateStoryManifest(manifest)).toThrow(/strictly increasing/);
  });

  it('rejects missing, unknown, and negative staged boundary contracts', () => {
    const source = mutableManifest();
    const index = source.nodes.findIndex(
      (node) => node.kind === 'segment' && node.policy.kind === 'stagedSnap'
    );
    const segment = source.nodes[index];
    if (segment?.kind !== 'segment' || segment.policy.kind !== 'stagedSnap') {
      throw new Error('test fixture missing staged segment');
    }

    const missing = mutableManifest();
    missing.nodes[index] = { ...segment, policy: { ...segment.policy, advance: [] } };
    expect(() => validateStoryManifest(missing)).toThrow(/advance must match stops length/);

    const unknown = mutableManifest();
    unknown.nodes[index] = {
      ...segment,
      policy: {
        ...segment.policy,
        advance: [{ kind: 'automatic' } as never, ...segment.policy.advance.slice(1)]
      }
    };
    expect(() => validateStoryManifest(unknown)).toThrow(/unknown kind/);

    const negative = mutableManifest();
    negative.nodes[index] = {
      ...segment,
      policy: {
        ...segment.policy,
        advance: [{ kind: 'delay', ms: -1 }, ...segment.policy.advance.slice(1)]
      }
    };
    expect(() => validateStoryManifest(negative)).toThrow(/non-negative/);
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
        forward: {
          mode: segment.id === 'aod-method-top' ? 'timeline' : 'play',
          required: true
        },
        reverse: { mode: 'timeline', required: true },
        readyMilestones: ['targetReady', 'mediaReady']
      });
      expect(segment.mediaPlayback?.[0]?.media.length).toBeGreaterThan(0);
    }
  });

  it('gates the bidirectional Figure2 video before staged distance playback can start', () => {
    const segment = storyManifest.nodes.find(
      (node) => node.kind === 'segment' && node.id === 'figure2-distance-expand'
    );

    expect(segment).toMatchObject({
      kind: 'segment',
      buildTimeoutMs: 8000,
      policy: {
        kind: 'stagedSnap',
        advance: [{ kind: 'delay', ms: TERMINAL_DWELL_MS }]
      },
      requiredMilestones: ['targetReady', 'mediaReady', 'buildReady', 'timelineReady'],
      mediaPlayback: [
        {
          id: 'figure2-pair',
          media: ['figure2-pair-motion'],
          forward: {
            mode: 'play',
            required: true,
            media: ['figure2-pair-motion']
          },
          reverse: {
            mode: 'play',
            required: true,
            media: ['figure2-pair-motion']
          },
          readyMilestones: ['targetReady', 'mediaReady'],
          terminalFallbackScene: 'figure2-proof',
          preparingTimeoutMs: 8000
        }
      ]
    });
  });

  it('gates every incoming animation hold on its declared CDN media', () => {
    const expected = new Map([
      ['star-map-aod', ['aod-figure-motion']],
      ['method-bottom-figure2', ['figure2-pair-motion']],
      ['brand-figure3', ['figure3-motion']],
      ['services-ttg', ['ttg-figure-motion']],
      ['lab-ph', ['ph-figure-motion']],
      ['education-crane', ['crane-figure-motion', 'crane-flock-motion']]
    ]);

    for (const [id, media] of expected) {
      const segment = storyManifest.nodes.find(
        (node) => node.kind === 'segment' && node.id === id
      );
      expect(segment, id).toMatchObject({
        kind: 'segment',
        buildTimeoutMs: 8000,
        requiredMilestones: ['targetReady', 'mediaReady', 'buildReady'],
        mediaPlayback: [
          expect.objectContaining({
            media,
            forward: expect.objectContaining({ mode: 'timeline', required: true }),
            preparingTimeoutMs: 8000
          })
        ]
      });
    }
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

  it('models Method as one continuous reading hold before Figure2', () => {
    const methodNodes = storyManifest.nodes.filter((node) =>
      node.kind === 'hold'
        ? node.scene === 'method-top'
        : node.id === 'method-bottom-figure2'
    );

    expect(methodNodes).toEqual([
      expect.objectContaining({
        kind: 'hold',
        scene: 'method-top',
        reading: true,
        freshInput: true
      }),
      expect.objectContaining({
        kind: 'segment',
        id: 'method-bottom-figure2',
        from: 'method-top',
        to: 'figure2-animation',
        buildTimeoutMs: 8000,
        requiredMilestones: ['targetReady', 'mediaReady', 'buildReady'],
        mediaPlayback: [
          expect.objectContaining({
            id: 'method-bottom-figure2',
            media: ['figure2-pair-motion'],
            forward: { mode: 'timeline', required: true },
            reverse: { mode: 'timeline', required: true },
            terminalFallbackScene: 'figure2-animation',
            preparingTimeoutMs: 8000
          })
        ]
      })
    ]);
  });

  it('models Proof as one compound reading hold with no internal Director segments', () => {
    const proofNodes = storyManifest.nodes.filter((node) =>
      node.kind === 'hold'
        ? String(node.scene).startsWith('figure2-proof')
        : String(node.id).startsWith('figure2-proof')
    );

    expect(proofNodes).toEqual([
      expect.objectContaining({
        kind: 'hold',
        scene: 'figure2-proof',
        reading: true
      }),
      expect.objectContaining({
        kind: 'segment',
        id: 'figure2-proof-brand',
        from: 'figure2-proof',
        to: 'brand'
      })
    ]);
    expect(storyManifest.nodes.some((node) =>
      node.kind === 'segment'
      && ['figure2-proof-opening-cards', 'figure2-proof-cards-closing'].includes(node.id)
    )).toBe(false);
  });

  it('holds TTG and PH terminal media for one second before their disappear legs', () => {
    const byId = new Map(
      storyManifest.nodes.flatMap((node) => node.kind === 'segment' ? [[node.id, node] as const] : [])
    );

    expect(byId.get('ttg-lab')).toMatchObject({
      policy: {
        kind: 'stagedSnap',
        stops: [2500 / 3100],
        playMs: [2500, 600],
        advance: [{ kind: 'delay', ms: TERMINAL_DWELL_MS }]
      },
      virtualDuration: 3100,
      visual: {
        type: 'disappear',
        media: ['ttg-figure-motion']
      },
      mediaPlayback: [{
        forward: {
          mode: 'play',
          required: true,
          media: ['ttg-figure-motion']
        },
        reverse: {
          mode: 'timeline',
          required: true,
          media: ['ttg-figure-motion']
        }
      }]
    });
    expect(byId.get('ph-education')).toMatchObject({
      policy: {
        kind: 'stagedSnap',
        stops: [1520 / 2120],
        playMs: [1520, 600],
        advance: [{ kind: 'delay', ms: TERMINAL_DWELL_MS }]
      },
      virtualDuration: 2120,
      visual: {
        type: 'disappear',
        media: ['ph-figure-motion']
      },
      mediaPlayback: [{
        forward: { mode: 'play', required: true },
        reverse: { mode: 'timeline', required: true }
      }]
    });
    expect(byId.get('crane-contact')).toMatchObject({
      virtualDuration: 3000,
      copyCue: { targetScene: 'contact', atProgress: 0.8 },
      mediaPlayback: [{ reverse: { mode: 'timeline', required: true } }]
    });
  });

  it('settles Figure3 to Services in one 2600ms snap with an 80% copy cue', () => {
    const segment = storyManifest.nodes.find((node) => node.kind === 'segment' && node.id === 'figure3-services');

    expect(segment).toMatchObject({
      policy: { kind: 'snap' },
      virtualDuration: 2600,
      copyCue: { targetScene: 'services', atProgress: 0.8 }
    });
  });

  it('separates Hero motion from the following full Ink reveal in one run', () => {
    const segment = storyManifest.nodes.find((node) => node.kind === 'segment' && node.id === 'hero-pattern');

    expect(segment).toMatchObject({
      kind: 'segment',
      buildTimeoutMs: 8000,
      policy: {
        kind: 'snap'
      },
      virtualDuration: HERO_PATTERN_TOTAL_MS
    });
  });

  it('models Pattern collapse and copy as one gesture checkpoint before Star Map Ink', () => {
    const segment = storyManifest.nodes.find(
      (node) => node.kind === 'segment' && node.id === 'pattern-star-map'
    );

    expect(segment).toMatchObject({
      kind: 'segment',
      policy: {
        kind: 'stagedSnap',
        stops: [PATTERN_COLLAPSE_STOP],
        playMs: [PATTERN_COLLAPSE_MS, PATTERN_STAR_MAP_INK_MS],
        advance: [{ kind: 'gesture' }]
      },
      virtualDuration: PATTERN_TOTAL_MS
    });
  });

  it('marks every semantic animation hold as a fresh-input boundary', () => {
    for (const scene of [
      'aod-animation',
      'figure2-animation',
      'figure3-animation',
      'ttg-animation',
      'ph-animation',
      'crane-animation'
    ] as const) {
      expect(storyManifest.nodes.find((node) => node.kind === 'hold' && node.scene === scene)).toMatchObject({
        kind: 'hold',
        scene,
        freshInput: true
      });
    }
  });

  it('allows only ink and disappear transition kinds', () => {
    const kinds = storyManifest.nodes.flatMap((node) => node.kind === 'segment' && node.visual
      ? [node.visual.type]
      : []);

    expect(new Set(kinds)).toEqual(new Set(['ink', 'disappear']));
  });

  it('retains every animation scene as a canonical semantic hold', () => {
    const holds = new Set(storyManifest.nodes.flatMap((node) => node.kind === 'hold' ? [node.scene] : []));

    for (const scene of [
      'aod-animation',
      'figure2-animation',
      'figure3-animation',
      'ttg-animation',
      'ph-animation',
      'crane-animation'
    ] as const) {
      expect(holds.has(scene), `${scene} must remain a semantic hold`).toBe(true);
    }
  });

  it('rejects disappear media segments without mediaPlayback seed', () => {
    const manifest = mutableManifest();
    const index = manifest.nodes.findIndex((node) =>
      node.kind === 'segment' && node.visual?.type === 'disappear' && Boolean(node.visual.media?.length)
    );
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

  it('rejects a frame-lock direction that is not required media ownership', () => {
    const manifest = mutableManifest();
    const index = manifest.nodes.findIndex(
      (node) => node.kind === 'segment' && node.mediaPlayback?.length
    );
    const segment = manifest.nodes[index];
    if (segment?.kind !== 'segment' || !segment.mediaPlayback?.[0]) {
      throw new Error('test fixture missing mediaPlayback segment');
    }
    manifest.nodes[index] = {
      ...segment,
      mediaPlayback: [{
        ...segment.mediaPlayback[0],
        forward: { ...segment.mediaPlayback[0].forward, mode: 'frame-lock', required: false }
      }]
    };

    expect(() => validateStoryManifest(manifest)).toThrow(/frame-lock direction must be required/);
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
