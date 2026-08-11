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
  phoneManifestFetchDeadlineMs,
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
  ['hero', 'hero-entered', '#040807', 'front', [1, 1, 2, 1], 'D-single-media'],
  ['pattern', 'pattern-complete', '#8f7f61', 'front', [0, 0, 0, 0], 'D-static'],
  ['star-map', 'star-map-reading', '#06100d', 'front', [0, 0, 1, 0], 'D-static'],
  ['aod-animation', 'aod-stage', '#ede4d2', 'front', [1, 1, 1, 1], 'D-single-media'],
  ['method-top', 'method-intro', '#ede4d2', 'native', [0, 0, 0, 0], 'D-static'],
  ['figure2-animation', 'figure2-stage', '#e2dac9', 'grade-a', [1, 1, 1, 1], 'D-single-media'],
  ['figure2-proof', 'figure2-proof-opening', '#ede4d2', 'native', [0, 0, 0, 0], 'D-static'],
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
    selectors: ['[data-portrait-pattern-bloom]']
  },
  'star-map': {
    additional: ['media:star-map-source'],
    surfaces: ['star-map-source', 'star-map-canvas'],
    selectors: ['#portrait-spike-star-title']
  },
  'aod-animation': {
    additional: [
      'media:aod-figure-poster',
      'media:aod-figure-packed',
      'compositor:aod-packed'
    ],
    surfaces: ['aod-figure-video', 'aod-figure-poster', 'aod-figure-canvas'],
    selectors: ['[data-phone-aod-figure-poster]']
  },
  'method-top': {
    additional: [],
    surfaces: ['method-root'],
    selectors: ['#method']
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
      'figure2-pair-poster',
      'figure2-pair-canvas',
      'figure2-foreground-arch'
    ],
    selectors: [
      '[data-r4-scene="figure2-animation"] [data-phone-figure2-poster]'
    ]
  },
  'figure2-proof': {
    additional: ['media:figure2-foreground-arch'],
    surfaces: ['figure2-proof-root', 'figure2-foreground-arch'],
    selectors: ['#figure2-proof-opening .r4-proof-opening__title']
  },
  brand: {
    additional: [],
    surfaces: ['brand-root'],
    selectors: ['.phone-brand__definition:first-of-type h2', '.phone-brand__definition:first-of-type p']
  },
  'figure3-animation': {
    additional: ['media:figure3-motion', 'compositor:figure3-paper', 'media:figure3-initial-poster'],
    surfaces: [
      'figure3-video', 'figure3-paper-canvas', 'figure3-initial-poster',
      'figure3-initial-composite'
    ],
    selectors: [
      '[data-phone-scene="figure3-animation"] [data-phone-figure3-initial-composite]'
    ]
  },
  services: {
    additional: [],
    surfaces: ['services-root'],
    selectors: ['.phone-services__hero h2', '.phone-services__hero > p']
  },
  'ttg-animation': {
    additional: ['media:ttg-figure-motion'],
    surfaces: ['ttg-figure-video'],
    selectors: ['[data-r4-scene="ttg-animation"] [data-ttg-figure-video]']
  },
  lab: {
    additional: [],
    surfaces: ['lab-root'],
    selectors: ['.phone-lab__hero h2', '.phone-lab__hero > p:first-of-type']
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
    selectors: ['.r4-education__lead h2', '.r4-education__lead p']
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
    selectors: ['.r4-contact__content h2', '.r4-contact__content p']
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
  ['brand-figure3', 'brand', 'figure3-animation', 'between', 'fx:brand-figure3', 'R-standard', [1, 1, 2, 1], 'D-single-media'],
  ['figure3-services', 'figure3-animation', 'services', 'between', 'between:figure3-services', 'R-pair', [1, 1, 1, 0], 'D-single-media'],
  ['services-ttg', 'services', 'ttg-animation', 'above-both', 'fx:services-ttg', 'R-standard', [1, 1, 1, 1], 'D-single-media'],
  ['ttg-lab', 'ttg-animation', 'lab', 'between', 'between:ttg-lab', 'R-pair', [1, 1, 0, 0], 'D-single-media'],
  ['lab-ph', 'lab', 'ph-animation', 'above-both', 'fx:lab-ph', 'R-standard', [1, 1, 2, 2], 'D-single-media'],
  ['ph-education', 'ph-animation', 'education', 'between', 'between:ph-education', 'R-pair', [1, 1, 1, 1], 'D-single-media'],
  ['education-crane', 'education', 'crane-animation', 'above-both', 'fx:education-crane', 'R-standard', [2, 2, 3, 3], 'D-multi-media'],
  ['crane-contact', 'crane-animation', 'contact', 'between', 'between:crane-contact', 'R-pair', [2, 2, 2, 2], 'D-multi-media']
] as const;

const deadlineLedger = {
  'D-static': {
    moduleLoad: 8000,
    mediaPrepare: 0,
    firstFrame: 1500,
    planeApply: 1500,
    scrollConfirm: 1500,
    rollback: 4000
  },
  'D-single-media': {
    moduleLoad: 8000,
    mediaPrepare: 8000,
    firstFrame: 3000,
    planeApply: 1500,
    scrollConfirm: 1500,
    rollback: 5000
  },
  'D-multi-media': {
    moduleLoad: 10000,
    mediaPrepare: 10000,
    firstFrame: 4000,
    planeApply: 1500,
    scrollConfirm: 1500,
    rollback: 6000
  }
} as const;

const preparedEvidenceLedger = [
  'module-loaded',
  'root-connected',
  'image-decoded',
  'video-decoded',
  'canvas-drawn',
  'static-ready',
  'layout-measurable',
  'resource-budget-valid'
] as const;

const finalEvidenceLedger = [
  'plane-acknowledged',
  'content-visible',
  'frame-visible',
  'coverage-visible',
  'landing-confirmed',
  'scroll-confirmed'
] as const;

const sceneProofLedger = {
  hero: {
    landing: { kind: 'front-corridor', anchor: '#portrait-spike-home' },
    frame: {
      kind: 'decoded-or-static-post-paint',
      surfaceIds: ['hero-figure-canvas', 'hero-figure-poster']
    },
    prepared: 'canvas-drawn'
  },
  pattern: {
    landing: { kind: 'authored-boundary', anchor: '[data-portrait-pattern-bloom]' },
    frame: {
      kind: 'image-decode-composite-paint',
      surfaceIds: ['pattern-image']
    },
    prepared: 'image-decoded'
  },
  'star-map': {
    landing: { kind: 'authored-boundary', anchor: '#portrait-spike-star-title' },
    frame: {
      kind: 'image-decode-composite-paint',
      surfaceIds: ['star-map-source', 'star-map-canvas']
    },
    prepared: ['image-decoded', 'canvas-drawn']
  },
  'aod-animation': {
    landing: { kind: 'semantic-edge', anchor: 'aod-semantic-edge' },
    frame: {
      kind: 'image-decode-composite-paint',
      surfaceIds: ['aod-figure-poster']
    },
    prepared: 'image-decoded'
  },
  'method-top': {
    landing: { kind: 'authored-boundary', anchor: '#method' },
    frame: { kind: 'content-post-paint', surfaceIds: ['method-root'] },
    prepared: 'static-ready'
  },
  'figure2-animation': {
    landing: {
      kind: 'authored-boundary',
      anchor: '[data-r4-scene="figure2-animation"]'
    },
    frame: {
      kind: 'image-decode-composite-paint',
      surfaceIds: ['figure2-pair-poster', 'figure2-foreground-arch']
    },
    prepared: 'image-decoded'
  },
  'figure2-proof': {
    landing: {
      kind: 'authored-boundary',
      anchor: '#figure2-proof-opening'
    },
    frame: {
      kind: 'content-post-paint',
      surfaceIds: ['figure2-proof-root', 'figure2-foreground-arch']
    },
    prepared: 'static-ready'
  },
  brand: {
    landing: { kind: 'authored-boundary', anchor: '#brand' },
    frame: { kind: 'content-post-paint', surfaceIds: ['brand-root'] },
    prepared: 'static-ready'
  },
  'figure3-animation': {
    landing: {
      kind: 'persistent-compositor',
      anchor: '[data-phone-scene="figure3-animation"]'
    },
    frame: {
      kind: 'canvas-or-static-post-paint',
      surfaceIds: ['figure3-initial-composite']
    },
    prepared: 'image-decoded'
  },
  services: {
    landing: { kind: 'authored-boundary', anchor: '#services' },
    frame: { kind: 'content-post-paint', surfaceIds: ['services-root'] },
    prepared: 'static-ready'
  },
  'ttg-animation': {
    landing: {
      kind: 'persistent-compositor',
      anchor: '[data-r4-scene="ttg-animation"]'
    },
    frame: {
      kind: 'decoded-composited-frame',
      surfaceIds: ['ttg-figure-video']
    },
    prepared: 'video-decoded'
  },
  lab: {
    landing: { kind: 'authored-boundary', anchor: '#lab' },
    frame: { kind: 'content-post-paint', surfaceIds: ['lab-root'] },
    prepared: 'static-ready'
  },
  'ph-animation': {
    landing: {
      kind: 'persistent-compositor',
      anchor: '[data-r4-scene="ph-animation"]'
    },
    frame: {
      kind: 'packed-canvas-draw',
      surfaceIds: ['ph-figure-canvas']
    },
    prepared: 'canvas-drawn'
  },
  education: {
    landing: { kind: 'authored-boundary', anchor: '#education' },
    frame: { kind: 'content-post-paint', surfaceIds: ['education-root'] },
    prepared: 'static-ready'
  },
  'crane-animation': {
    landing: {
      kind: 'persistent-compositor',
      anchor: '[data-r4-scene="crane-animation"]'
    },
    frame: {
      kind: 'packed-canvas-draw',
      surfaceIds: ['crane-figure-canvas', 'crane-flock-canvas']
    },
    prepared: 'canvas-drawn'
  },
  contact: {
    landing: { kind: 'authored-boundary', anchor: '#contact' },
    frame: { kind: 'content-post-paint', surfaceIds: ['contact-root'] },
    prepared: 'static-ready'
  }
} as const;

const directEntryHashLedger = {
  hero: { canonicalHash: '#home', aliases: ['#top', '#home'] },
  pattern: { canonicalHash: '#pattern', aliases: [] },
  'star-map': { canonicalHash: '#star-map', aliases: ['#belief'] },
  'aod-animation': { canonicalHash: '#aod-animation', aliases: [] },
  'method-top': { canonicalHash: '#method', aliases: ['#method'] },
  'figure2-animation': { canonicalHash: '#figure2-animation', aliases: [] },
  'figure2-proof': {
    canonicalHash: '#figure2-proof',
    aliases: [
      '#figure2-proof-opening',
      '#figure2-proof-cards',
      '#figure2-proof-closing'
    ]
  },
  brand: { canonicalHash: '#brand', aliases: ['#brand'] },
  'figure3-animation': { canonicalHash: '#figure3-animation', aliases: [] },
  services: { canonicalHash: '#services', aliases: ['#services'] },
  'ttg-animation': { canonicalHash: '#ttg-animation', aliases: [] },
  lab: { canonicalHash: '#lab', aliases: ['#lab'] },
  'ph-animation': { canonicalHash: '#ph-animation', aliases: [] },
  education: { canonicalHash: '#education', aliases: ['#education'] },
  'crane-animation': { canonicalHash: '#crane-animation', aliases: [] },
  contact: { canonicalHash: '#contact', aliases: ['#contact'] }
} as const;

const timingExportLedger = {
  'hero-pattern': [
    'HERO_PATTERN_MOTION_MS',
    'HERO_PATTERN_INK_MS',
    'HERO_PATTERN_TOTAL_MS'
  ],
  'pattern-star-map': [
    'PATTERN_COLLAPSE_MS',
    'PATTERN_STAR_MAP_INK_MS',
    'PATTERN_TOTAL_MS',
    'PATTERN_COLLAPSE_STOP'
  ],
  'star-map-aod': [],
  'aod-method-top': [],
  'method-bottom-figure2': [],
  'figure2-distance-expand': ['TERMINAL_DWELL_MS'],
  'figure2-proof-brand': [],
  'brand-figure3': [],
  'figure3-services': ['FIGURE3_SERVICES_DURATION_MS'],
  'services-ttg': [],
  'ttg-lab': [
    'TTG_PLAYBACK_MS',
    'INTRA_CHAPTER_DISSOLVE_MS',
    'TERMINAL_DWELL_MS'
  ],
  'lab-ph': [],
  'ph-education': [
    'PH_PLAYBACK_MS',
    'INTRA_CHAPTER_DISSOLVE_MS',
    'TERMINAL_DWELL_MS'
  ],
  'education-crane': [],
  'crane-contact': ['CRANE_CONTACT_DURATION_MS']
} as const;

const preparePolicyLedger = {
  sourceCover: 'source-or-loader-through-prepared',
  receiverMount: 'inert',
  prewarm: 'module-and-immutable-metadata-only',
  receiverExposure: 'atomic-candidate-plane'
} as const;

const reducedMotionLedger = {
  sampling: 'terminal-static',
  proof: 'full-visible-quorum',
  closure: 'unchanged'
} as const;

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

function preparedQuorum(scene: keyof typeof sceneDetails) {
  const visualProof = scene === 'star-map'
    ? ['image-decoded', 'canvas-drawn'] as const
    : [sceneProofLedger[scene].prepared];
  return [
    'module-loaded',
    'root-connected',
    ...visualProof,
    ...(scene === 'figure2-proof' ? ['image-decoded'] : []),
    'layout-measurable',
    'resource-budget-valid'
  ];
}

function inactiveActivation() {
  return {
    mode: 'none',
    prewarmMayActivate: false,
    requiresPhysicalCredit: false,
    directEntry: 'none',
    rejection: 'not-applicable'
  } as const;
}

function activeActivation() {
  return {
    mode: 'gesture-or-muted-autoplay',
    prewarmMayActivate: false,
    requiresPhysicalCredit: true,
    directEntry: 'muted-plays-inline-then-covered-cta',
    rejection: 'await-accessible-physical-gesture'
  } as const;
}

function directActivation(scene: keyof typeof sceneDetails, values: readonly number[]) {
  return values[0] === 0
    || scene === 'aod-animation'
    ? inactiveActivation()
    : activeActivation();
}

const activeClockSegments = new Set([
  'hero-pattern',
  'aod-method-top',
  'figure2-distance-expand',
  'figure3-services',
  'services-ttg',
  'ttg-lab',
  'lab-ph',
  'ph-education',
  'education-crane',
  'crane-contact'
]);

function segmentActivation(
  id: typeof segments[number][0],
  _direction: 'forward' | 'reverse'
) {
  void _direction;
  // The selected media clock owner activates in both directions. Projection
  // swaps canonical source/target ownership for the reverse leg.
  return activeClockSegments.has(id) || id === 'brand-figure3'
    ? activeActivation() : inactiveActivation();
}

function expectedScene(entry: typeof scenes[number]) {
  const [id, checkpoint, edgeSurface, plane, values, deadlineProfile] = entry;
  const details = sceneDetails[id];
  const proof = sceneProofLedger[id];
  const hashes = directEntryHashLedger[id];
  return {
    id,
    checkpoint,
    edgeSurface,
    plane,
    landing: proof.landing,
    content: { mode: 'all-visible', selectors: details.selectors },
    frame: proof.frame,
    navigationId: id,
    reducedMotion: reducedMotionLedger,
    dependencies: dependencies(id),
    surfaces: details.surfaces,
    directEntry: {
      ...hashes,
      closure: {
        load: dependencies(id),
        mount: mounts('receiver', id),
        prewarm: [],
        retainUntil: 'loader-through-prepared',
        exposeReceiverAfter: preparedQuorum(id),
        retireAfter: 'loader-after-visible-stable',
        resourceBudget: budget(values)
      },
      preparePolicy: preparePolicyLedger,
      terminalEvidence: {
        required: finalEvidenceLedger,
        retirementProof: 'loader-after-stable'
      },
      deadlineProfile,
      deadlinePolicy: deadlineLedger[deadlineProfile],
      mediaActivation: directActivation(id, values)
    }
  };
}

function canonicalSegment(id: typeof segments[number][0]) {
  const segment = storyManifest.nodes.find((node) => (
    node.kind === 'segment' && node.id === id
  ));
  if (!segment || segment.kind !== 'segment') {
    throw new Error(`Missing canonical test ledger segment ${id}`);
  }
  return segment;
}

function expectedSegmentLeg(
  entry: typeof segments[number],
  direction: 'forward' | 'reverse'
) {
  const [
    id,
    canonicalSource,
    canonicalTarget,
    ,
    effectSurface,
    retirement,
    values,
    deadlineProfile
  ] = entry;
  const sourceId = direction === 'forward' ? canonicalSource : canonicalTarget;
  const targetId = direction === 'forward' ? canonicalTarget : canonicalSource;
  return {
    direction,
    source: sourceId,
    target: targetId,
    effectSurface,
    closure: {
      load: [
        ...dependencies(sourceId),
        `transition:${id}`,
        ...dependencies(targetId)
      ],
      mount: [
        ...mounts('source', sourceId),
        `effect:${effectSurface}`,
        ...mounts('receiver', targetId)
      ],
      prewarm: [`transition:${id}`, ...prewarm(targetId)],
      retainUntil: 'source-through-prepared',
      exposeReceiverAfter: preparedQuorum(targetId),
      retireAfter: retirement === 'R-pair'
        ? 'pair-exit-or-route-dispose'
        : 'target-stable-rollback-closed',
      resourceBudget: budget(values)
    },
    preparePolicy: preparePolicyLedger,
    terminalEvidence: {
      required: finalEvidenceLedger,
      retirementProof: retirement
    },
    inputBoundary: {
      claim: 'one-fresh-physical-epoch',
      arrivingTail: 'reject-until-fresh',
      release: 'stable-or-rollback',
      canonicalPolicy: canonicalSegment(id).policy
    },
    deadlineProfile,
    deadlinePolicy: deadlineLedger[deadlineProfile],
    mediaActivation: segmentActivation(id, direction)
  };
}

function expectedSegment(entry: typeof segments[number]) {
  const [
    id,
    sourceScene,
    targetScene,
    effectPlacement,
    ,
    ,
    ,
    deadlineProfile
  ] = entry;
  const canonical = canonicalSegment(id);
  return {
    id,
    source: sourceScene,
    target: targetScene,
    timing: {
      manifestSegmentId: id,
      policy: canonical.policy,
      virtualDuration: canonical.virtualDuration,
      namedExports: timingExportLedger[id]
    },
    effectPlacement,
    forward: expectedSegmentLeg(entry, 'forward'),
    reverse: expectedSegmentLeg(entry, 'reverse'),
    rollback: {
      kind: 'source-reproof',
      stableCommit: 'preserve-object-identity',
      commitSequence: 'unchanged',
      sourceProof: 'replace-after-full-quorum',
      failureRetirement: 'never-before-source-reproof',
      deadlinePolicy: deadlineLedger[deadlineProfile]
    }
  };
}

describe('canonical phone manifest', () => {
  it('deep-compares the independent Appendix E ledger for 16 entries and 30 legs', () => {
    expect(phoneManifestFetchDeadlineMs).toBe(3000);
    expect(PHONE_PREPARED_EVIDENCE_KINDS).toStrictEqual(preparedEvidenceLedger);
    expect(PHONE_FINAL_EVIDENCE_KINDS).toStrictEqual(finalEvidenceLedger);
    expect({
      'D-static': phoneDeadlinePolicy('D-static'),
      'D-single-media': phoneDeadlinePolicy('D-single-media'),
      'D-multi-media': phoneDeadlinePolicy('D-multi-media')
    }).toStrictEqual(deadlineLedger);
    expect(phoneManifest.scenes).toStrictEqual(scenes.map(expectedScene));
    expect(phoneManifest.segments).toStrictEqual(segments.map(expectedSegment));
  });

  it('freezes owned scene, closure, budget, deadline, and warm-entry records', () => {
    const scene = phoneSceneById('hero');
    const segment = phoneSegmentBetween('hero', 'pattern');
    if (!segment) throw new Error('Missing hero-pattern test segment');
    const warmClosure = phoneWarmEntryClosure('hero', 'crane-animation');
    const warmPolicy = phoneWarmEntryPolicy('hero', 'crane-animation');
    const ownedRecords = [
      phoneManifest,
      phoneManifest.scenes,
      phoneManifest.segments,
      scene,
      scene.landing,
      scene.content,
      scene.content.selectors,
      scene.frame,
      scene.frame.surfaceIds,
      scene.dependencies,
      scene.surfaces,
      scene.directEntry,
      scene.directEntry.aliases,
      scene.directEntry.closure,
      scene.directEntry.closure.load,
      scene.directEntry.closure.mount,
      scene.directEntry.closure.exposeReceiverAfter,
      scene.directEntry.closure.resourceBudget,
      scene.directEntry.deadlinePolicy,
      segment,
      segment.forward,
      segment.forward.closure,
      segment.forward.closure.resourceBudget,
      segment.rollback,
      warmClosure,
      warmClosure.load,
      warmClosure.mount,
      warmClosure.resourceBudget,
      warmPolicy,
      warmPolicy.retirement
    ];
    expect(ownedRecords.every(Object.isFrozen)).toBe(true);
  });

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

  it('scopes static direct-entry exceptions to AOD and Figure3, not Figure2', () => {
    expect(phoneSceneById('aod-animation').directEntry.mediaActivation).toMatchObject({
      mode: 'none', directEntry: 'none', requiresPhysicalCredit: false
    });
    expect(phoneSceneById('figure2-animation').directEntry.mediaActivation).toMatchObject({
      mode: 'gesture-or-muted-autoplay',
      directEntry: 'muted-plays-inline-then-covered-cta',
      requiresPhysicalCredit: true
    });
    expect(phoneSceneById('figure3-animation').directEntry.mediaActivation).toMatchObject({
      mode: 'gesture-or-muted-autoplay',
      directEntry: 'muted-plays-inline-then-covered-cta', requiresPhysicalCredit: true
    });
  });

  it('binds the shared Figure2 arch to both direct-entry frame quorums', () => {
    for (const id of ['figure2-animation', 'figure2-proof'] as const) {
      const scene = phoneSceneById(id);
      expect(scene.surfaces).toContain('figure2-foreground-arch');
      expect(scene.frame.surfaceIds).toContain('figure2-foreground-arch');
      expect(scene.directEntry.closure.load).toContain('media:figure2-foreground-arch');
    }
    expect(phoneSceneById('figure2-proof').directEntry.closure.exposeReceiverAfter)
      .toContain('image-decoded');
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
        expect(leg?.closure.prewarm).toEqual([`transition:${id}`, ...prewarm(targetId)]);
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
        expect(phoneMediaActivationPolicy(segment.id, leg.direction)).toEqual(
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
      .toBeLessThanOrEqual(750);
  });
});
