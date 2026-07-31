import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalSceneIds,
  canonicalSegments
} from '../../story/canonical-spine';
import { storyManifest } from '../../story/manifest';
import {
  PHONE_FINAL_EVIDENCE_KINDS,
  PHONE_PREPARED_EVIDENCE_KINDS
} from './protocol';
import {
  phoneAdjacentTarget,
  phoneDeadlinePolicy,
  phoneDirectEntryClosure,
  phoneEntryForLocation,
  phoneManifest,
  phoneManifestIntegrity,
  phoneMediaActivationPolicy,
  phoneSceneById,
  phoneSegmentBetween,
  phoneSegmentClosure,
  phoneWarmEntryClosure,
  phoneWarmEntryPolicy
} from './manifest';

const source = readFileSync(new URL('./manifest.ts', import.meta.url), 'utf8');

const scenes = [
  ['hero', 'hero-entered', '#07110e', 'front', [1, 1, 2, 1], 'D-single-media'],
  ['pattern', 'pattern-complete', '#8f7f61', 'front', [0, 0, 0, 0], 'D-static'],
  ['star-map', 'star-map-reading', '#06100d', 'front', [0, 0, 1, 0], 'D-static'],
  ['aod-animation', 'aod-stage', '#ede4d2', 'front', [1, 1, 1, 1], 'D-single-media'],
  ['method-top', 'method-intro', '#ede4d2', 'native', [0, 0, 0, 0], 'D-static'],
  ['figure2-animation', 'figure2-stage', '#e2dac9', 'grade-a', [1, 1, 1, 1], 'D-single-media'],
  ['figure2-proof', 'figure2-proof-opening', '#ede4d2', 'grade-a', [0, 0, 0, 0], 'D-static'],
  ['brand', 'brand-reading', '#ede4d2', 'native', [0, 0, 0, 0], 'D-static'],
  ['figure3-animation', 'figure3-stage', '#ede4d2', 'group45', [1, 1, 1, 0], 'D-single-media'],
  ['services', 'services-reading', '#ede4d2', 'native', [0, 0, 0, 0], 'D-static'],
  ['ttg-animation', 'ttg-stage', '#080d10', 'group45', [1, 1, 0, 0], 'D-single-media'],
  ['lab', 'lab-stable', '#ede4d2', 'native', [0, 0, 0, 0], 'D-static'],
  ['ph-animation', 'ph-stage', '#9889a5', 'group67', [1, 1, 1, 1], 'D-single-media'],
  ['education', 'education-reading', '#ede4d2', 'native', [0, 0, 0, 0], 'D-static'],
  ['crane-animation', 'crane-stage', '#ede4d2', 'group67', [2, 2, 2, 2], 'D-multi-media'],
  ['contact', 'contact-stable', '#ede4d2', 'native', [0, 0, 0, 0], 'D-static']
] as const;

const sceneDetails = {
  hero: {
    additional: [
      'media:hero-back',
      'media:hero-middle',
      'media:hero-figure-poster',
      'media:hero-figure-packed',
      'compositor:hero-packed'
    ],
    surfaces: [
      'hero-back-image',
      'hero-middle-image',
      'hero-figure-poster',
      'hero-figure-video',
      'hero-figure-canvas',
      'hero-intro-ink'
    ],
    selectors: ['#portrait-spike-home']
  },
  pattern: {
    additional: ['media:pattern-background'],
    surfaces: ['pattern-image'],
    selectors: ['#portrait-spike-pattern-title']
  },
  'star-map': {
    additional: ['media:star-map-source'],
    surfaces: ['star-map-canvas'],
    selectors: ['#portrait-spike-star-title']
  },
  'aod-animation': {
    additional: ['media:aod-figure-packed', 'compositor:aod-packed'],
    surfaces: ['aod-figure-video', 'aod-figure-canvas'],
    selectors: ['[data-aod-figure-canvas]']
  },
  'method-top': {
    additional: [],
    surfaces: ['method-root'],
    selectors: [
      '#method #portrait-spike-method-title',
      '#method .portrait-scroll-spike__method-bridge-content p'
    ]
  },
  'figure2-animation': {
    additional: [
      'media:figure2-pair-poster',
      'media:figure2-foreground-arch',
      'media:figure2-pair-packed',
      'compositor:figure2-packed'
    ],
    surfaces: [
      'figure2-pair-video',
      'figure2-pair-canvas',
      'figure2-foreground-arch'
    ],
    selectors: [
      '[data-r4-scene="figure2-animation"] [data-figure2-packed-alpha-canvas]'
    ]
  },
  'figure2-proof': {
    additional: [],
    surfaces: ['figure2-proof-root'],
    selectors: ['#figure2-proof-opening .r4-proof-opening__title']
  },
  brand: {
    additional: [],
    surfaces: ['brand-root'],
    selectors: ['#phone-brand-title', '.phone-brand__definition p']
  },
  'figure3-animation': {
    additional: ['media:figure3-motion', 'compositor:figure3-paper'],
    surfaces: ['figure3-video', 'figure3-paper-canvas'],
    selectors: [
      '[data-phone-scene="figure3-animation"] [data-phone-figure3-paper-canvas]'
    ]
  },
  services: {
    additional: [],
    surfaces: ['services-root'],
    selectors: ['#phone-services-title', '.phone-services__hero > p:last-child']
  },
  'ttg-animation': {
    additional: ['media:ttg-figure-motion'],
    surfaces: ['ttg-figure-video'],
    selectors: ['[data-r4-scene="ttg-animation"] [data-ttg-figure-video]']
  },
  lab: {
    additional: [],
    surfaces: ['lab-root'],
    selectors: [
      '#phone-lab-title',
      '.phone-lab__hero > p:not(.phone-lab__eyebrow)'
    ]
  },
  'ph-animation': {
    additional: ['media:ph-figure-packed', 'compositor:ph-packed'],
    surfaces: ['ph-figure-video', 'ph-figure-canvas'],
    selectors: [
      '[data-r4-scene="ph-animation"] [data-phone-packed-alpha-canvas="ph-figure"]'
    ]
  },
  education: {
    additional: [],
    surfaces: ['education-root'],
    selectors: [
      '#education [data-r4-scene="education"] .r4-education__vertical h2',
      '#education .r4-education__lead p'
    ]
  },
  'crane-animation': {
    additional: [
      'media:crane-figure-packed',
      'media:crane-flock-packed',
      'compositor:crane-figure-packed',
      'compositor:crane-flock-packed'
    ],
    surfaces: [
      'crane-figure-video',
      'crane-figure-canvas',
      'crane-flock-video',
      'crane-flock-canvas'
    ],
    selectors: [
      '[data-r4-scene="crane-animation"] [data-phone-packed-alpha-canvas="crane-figure"]',
      '[data-phone-packed-alpha-canvas="crane-flock"]'
    ]
  },
  contact: {
    additional: [],
    surfaces: ['contact-root'],
    selectors: [
      '#contact [data-r4-scene="contact"] h2',
      '#contact [data-r4-scene="contact"] p'
    ]
  }
} as const;

const segments = [
  ['hero-pattern', 'hero', 'pattern', 'above-both', 'fx:hero-pattern', 'R-standard', [1, 1, 3, 2], 'D-single-media'],
  ['pattern-star-map', 'pattern', 'star-map', 'above-both', 'fx:pattern-star-map', 'R-standard', [0, 0, 2, 1], 'D-static'],
  ['star-map-aod', 'star-map', 'aod-animation', 'above-both', 'fx:star-map-aod', 'R-standard', [1, 1, 3, 2], 'D-single-media'],
  ['aod-method-top', 'aod-animation', 'method-top', 'between', 'between:aod-method-top', 'R-standard', [1, 1, 1, 1], 'D-single-media'],
  ['method-bottom-figure2', 'method-top', 'figure2-animation', 'above-both', 'fx:method-bottom-figure2', 'R-standard', [1, 1, 2, 2], 'D-single-media'],
  ['figure2-distance-expand', 'figure2-animation', 'figure2-proof', 'above-both', 'fx:figure2-distance-expand', 'R-standard', [1, 1, 4, 2], 'D-single-media'],
  ['figure2-proof-brand', 'figure2-proof', 'brand', 'above-both', 'fx:figure2-proof-brand', 'R-standard', [0, 0, 1, 1], 'D-static'],
  ['brand-figure3', 'brand', 'figure3-animation', 'above-both', 'fx:brand-figure3', 'R-standard', [1, 1, 2, 1], 'D-single-media'],
  ['figure3-services', 'figure3-animation', 'services', 'between', 'between:figure3-services', 'R-pair', [1, 1, 1, 0], 'D-single-media'],
  ['services-ttg', 'services', 'ttg-animation', 'above-both', 'fx:services-ttg', 'R-standard', [1, 1, 1, 1], 'D-single-media'],
  ['ttg-lab', 'ttg-animation', 'lab', 'between', 'between:ttg-lab', 'R-pair', [1, 1, 0, 0], 'D-single-media'],
  ['lab-ph', 'lab', 'ph-animation', 'above-both', 'fx:lab-ph', 'R-standard', [1, 1, 2, 2], 'D-single-media'],
  ['ph-education', 'ph-animation', 'education', 'between', 'between:ph-education', 'R-pair', [1, 1, 1, 1], 'D-single-media'],
  ['education-crane', 'education', 'crane-animation', 'above-both', 'fx:education-crane', 'R-standard', [2, 2, 3, 3], 'D-multi-media'],
  ['crane-contact', 'crane-animation', 'contact', 'between', 'between:crane-contact', 'R-pair', [2, 2, 2, 2], 'D-multi-media']
] as const;

function budget(values: readonly number[]) {
  return {
    videos: values[0],
    activeDecoders: values[1],
    canvases: values[2],
    webglContexts: values[3]
  };
}

function dependencies(scene: keyof typeof sceneDetails) {
  return [`scene:${scene}`, `root:${scene}`, ...sceneDetails[scene].additional];
}

function mounts(role: 'source' | 'receiver', scene: keyof typeof sceneDetails) {
  return [
    `${role}:root:${scene}`,
    ...sceneDetails[scene].surfaces.map((surface) => `${role}:${surface}`)
  ];
}

function prewarm(scene: keyof typeof sceneDetails) {
  return dependencies(scene).filter((dependency) => (
    dependency.startsWith('scene:') || dependency.startsWith('media:')
  ));
}

describe('canonical phone manifest', () => {
  it('declares exactly the canonical 16 holds in order with every proof field', () => {
    expect(phoneManifest.scenes.map((scene) => scene.id)).toEqual(canonicalSceneIds);
    expect(new Set(phoneManifest.scenes.map((scene) => scene.id))).toHaveLength(16);
    expect(phoneManifest.scenes.map((scene) => [
      scene.id,
      scene.checkpoint,
      scene.edgeSurface,
      scene.plane,
      [
        scene.directEntry.closure.resourceBudget.videos,
        scene.directEntry.closure.resourceBudget.activeDecoders,
        scene.directEntry.closure.resourceBudget.canvases,
        scene.directEntry.closure.resourceBudget.webglContexts
      ],
      scene.directEntry.deadlineProfile
    ])).toEqual(scenes);
    for (const scene of phoneManifest.scenes) {
      const expected = sceneDetails[scene.id];
      expect(scene.dependencies).toEqual(dependencies(scene.id));
      expect(scene.surfaces).toEqual(expected.surfaces);
      expect(scene.content.selectors).toEqual(expected.selectors);
      expect(scene.navigationId).toBe(scene.id);
      expect(scene.landing).toBeDefined();
      expect(scene.frame).toBeDefined();
      expect(scene.reducedMotion.proof).toBe('full-visible-quorum');
    }
  });

  it('expands all 16 direct entries exactly and never loads earlier scenes', () => {
    for (const [scene, , , , values] of scenes) {
      const closure = phoneDirectEntryClosure(scene);
      expect(closure.load).toEqual(dependencies(scene));
      expect(closure.mount).toEqual(mounts('receiver', scene));
      expect(closure.prewarm).toEqual([]);
      expect(closure.retainUntil).toBe('loader-through-prepared');
      expect(closure.retireAfter).toBe('loader-after-visible-stable');
      expect(closure.resourceBudget).toEqual(budget(values));
      expect(
        closure.load.filter((dependency) => dependency.startsWith('scene:'))
      ).toEqual([`scene:${scene}`]);
      expect(closure.exposeReceiverAfter.every((kind) => (
        PHONE_PREPARED_EVIDENCE_KINDS.includes(kind)
      ))).toBe(true);
    }
  });

  it('declares exactly 15 canonical segments and expands all 30 direction closures', () => {
    expect(phoneManifest.segments.map((segment) => ({
      id: segment.id,
      from: segment.source,
      to: segment.target
    }))).toEqual(canonicalSegments);
    expect(new Set(phoneManifest.segments.map((segment) => segment.id))).toHaveLength(15);

    for (const [
      id,
      sourceScene,
      targetScene,
      placement,
      effect,
      retirement,
      values,
      deadline
    ] of segments) {
      const segment = phoneManifest.segments.find((entry) => entry.id === id);
      expect(segment?.effectPlacement).toBe(placement);
      for (const [direction, sourceId, targetId] of [
        ['forward', sourceScene, targetScene],
        ['reverse', targetScene, sourceScene]
      ] as const) {
        const leg = segment?.[direction];
        expect(leg?.source).toBe(sourceId);
        expect(leg?.target).toBe(targetId);
        expect(leg?.effectSurface).toBe(effect);
        expect(leg?.deadlineProfile).toBe(deadline);
        expect(leg?.closure.load).toEqual([
          ...dependencies(sourceId),
          `transition:${id}`,
          ...dependencies(targetId)
        ]);
        expect(leg?.closure.mount).toEqual([
          ...mounts('source', sourceId),
          `effect:${effect}`,
          ...mounts('receiver', targetId)
        ]);
        expect(leg?.closure.prewarm).toEqual(prewarm(targetId));
        expect(leg?.closure.resourceBudget).toEqual(budget(values));
        expect(leg?.closure.retireAfter).toBe(
          retirement === 'R-pair'
            ? 'pair-exit-or-route-dispose'
            : 'target-stable-rollback-closed'
        );
        expect(leg?.terminalEvidence.required).toEqual(
          PHONE_FINAL_EVIDENCE_KINDS
        );
        expect(leg?.terminalEvidence.retirementProof).toBe(retirement);
        expect(phoneSegmentClosure(id, direction)).toBe(leg?.closure);
      }
    }
  });

  it('references canonical story timing/policy objects rather than copied values', () => {
    const canonicalNodes = new Map(
      storyManifest.nodes
        .filter((node) => node.kind === 'segment')
        .map((node) => [node.id, node])
    );
    for (const segment of phoneManifest.segments) {
      const canonical = canonicalNodes.get(segment.id);
      expect(segment.timing.manifestSegmentId).toBe(segment.id);
      expect(segment.timing.policy).toBe(canonical?.policy);
      expect(segment.timing.virtualDuration).toBe(canonical?.virtualDuration);
      expect(segment.timing.namedExports.every((name) => (
        /^[A-Z][A-Z0-9_]+$/.test(name)
      ))).toBe(true);
    }
  });

  it('keeps prepare, terminal, rollback, input, deadline, and activation policies explicit', () => {
    for (const segment of phoneManifest.segments) {
      expect(segment.rollback.kind).toBe('source-reproof');
      for (const leg of [segment.forward, segment.reverse]) {
        expect(leg.preparePolicy.receiverMount).toBe('inert');
        expect(leg.preparePolicy.receiverExposure).toBe('atomic-candidate-plane');
        expect(leg.inputBoundary.claim).toBe('one-fresh-physical-epoch');
        expect(phoneDeadlinePolicy(leg.deadlineProfile)).toEqual(
          leg.deadlinePolicy
        );
        expect(phoneMediaActivationPolicy(segment.id)).toEqual(
          leg.mediaActivation
        );
        expect(leg.closure.exposeReceiverAfter.some((kind) => (
          PHONE_FINAL_EVIDENCE_KINDS.includes(kind as never)
        ))).toBe(false);
      }
    }
  });

  it('implements lookup, adjacency, warm-entry union, aliases, and integrity once', () => {
    expect(phoneSceneById('hero').checkpoint).toBe('hero-entered');
    expect(phoneSegmentBetween('hero', 'pattern')?.id).toBe('hero-pattern');
    expect(phoneSegmentBetween('pattern', 'hero')?.id).toBe('hero-pattern');
    expect(phoneAdjacentTarget('hero', 'forward')).toBe('pattern');
    expect(phoneAdjacentTarget('hero', 'reverse')).toBeNull();
    expect(phoneAdjacentTarget('contact', 'forward')).toBeNull();
    expect(phoneAdjacentTarget('contact', 'reverse')).toBe('crane-animation');

    expect(phoneEntryForLocation('/', '')).toMatchObject({
      sceneId: 'hero',
      canonicalHash: '#home'
    });
    expect(phoneEntryForLocation('/', '#belief').sceneId).toBe('star-map');
    expect(phoneEntryForLocation('/', '#figure2-proof-cards')).toMatchObject({
      sceneId: 'figure2-proof',
      landingAlias: 'cards'
    });
    expect(phoneEntryForLocation('/brand-lab', '').sceneId).toBe('brand');
    expect(phoneEntryForLocation('/', '#unknown').sceneId).toBe('hero');

    const warm = phoneWarmEntryClosure('hero', 'crane-animation');
    expect(warm.load).toEqual(dependencies('crane-animation'));
    expect(warm.mount).toEqual([
      ...mounts('source', 'hero'),
      ...mounts('receiver', 'crane-animation')
    ]);
    expect(warm.resourceBudget).toEqual({
      videos: 3,
      activeDecoders: 2,
      canvases: 4,
      webglContexts: 3
    });
    expect(phoneWarmEntryPolicy('hero', 'crane-animation')).toMatchObject({
      mode: 'entry',
      closure: warm,
      deadlineProfile: 'D-multi-media',
      retirement: {
        success: 'target-stable-rollback-closed',
        failure: 'source-reproof-after-failure',
        stableCommit: 'preserve-object-identity',
        commitSequence: 'unchanged'
      }
    });
    expect(phoneWarmEntryPolicy('crane-animation', 'pattern').deadlineProfile)
      .toBe('D-multi-media');
    expect(phoneWarmEntryPolicy('pattern', 'contact').deadlineProfile)
      .toBe('D-static');
    expect(() => phoneWarmEntryClosure('hero', 'hero')).toThrow(
      'same-scene'
    );
    expect(phoneManifestIntegrity()).toEqual([]);
  });

  it('contains no React, CSS, DOM, dynamic import, mutable state, or runtime import', () => {
    expect(source).not.toMatch(/\bfrom\s+['"]react['"]/);
    expect(source).not.toMatch(/\.css['"]/);
    expect(source).not.toMatch(
      /\b(?:HTMLElement|HTMLCanvasElement|window|document|navigator)\b/
    );
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/from\s+['"].*(?:runtime|machine|scenes|transitions)/);
    expect(source).not.toMatch(/\b(?:let|var)\s+/);
    expect(source.split(/\r?\n/).filter((line) => line.trim()).length)
      .toBeLessThanOrEqual(550);
  });
});
