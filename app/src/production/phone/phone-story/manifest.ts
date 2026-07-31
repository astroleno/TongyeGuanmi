import {
  canonicalSceneIds,
  canonicalSegments
} from '../../../story/canonical-spine';
import type { PhoneCheckpointId } from '../../../story/semantic-checkpoints';
import type { SceneId, SegmentId } from '../../../story/types';
import {
  phoneRunLegTuple,
  type PhoneRunId
} from '../phone-story-runs';
import type { PhoneEdgeScene } from './presentation';

export type CanonicalPhoneSceneId = (typeof canonicalSceneIds)[number];
export type CanonicalPhoneSegmentId = (typeof canonicalSegments)[number]['id'];

export type PhonePresentationCommitState =
  | 'transition'
  | 'candidate'
  | 'stable';

export type PhoneStageOwner =
  | 'front'
  | 'grade-a'
  | 'group45'
  | 'group67'
  | 'native';

export type PhoneSurfaceId = string;

export type PhoneLandingResolverId =
  | 'front-corridor'
  | 'aod-semantic-edge'
  | 'authored-boundary'
  | 'preserve-composite'
  | 'native-reading';

/** Evidence names are intentionally transport-safe strings for lazy chunks. */
export type PhonePresentationEvidenceKind =
  | 'dom-reading'
  | 'static-poster'
  | 'native-video-frame'
  | 'packed-canvas-frame'
  | 'coverage'
  | 'effect-frame'
  | 'direct-entry';

/** Kinds that can identify one real, token-bound rendered presentation. */
export type PhonePresentationProofKind = Exclude<
  PhonePresentationEvidenceKind,
  'coverage' | 'direct-entry'
>;

export type PhonePresentationEvidencePolicy = 'fail-open' | 'fail-closed';

export type PhoneEvidenceRequirement = Readonly<{
  kind: PhonePresentationEvidenceKind;
  subject: PhoneSurfaceId;
}>;

export type PhoneSceneContentProbe = Readonly<{
  kind: 'reading' | 'static' | 'static-visual' | 'visual';
  textSelectors: readonly string[];
  frameSelectors: readonly string[];
}>;

export type PhoneScenePresentationContract = Readonly<{
  scene: CanonicalPhoneSceneId;
  checkpoint: PhoneCheckpointId;
  edge: PhoneEdgeScene;
  stageOwner: PhoneStageOwner;
  stageScene: SceneId | null;
  receiverSurface: PhoneSurfaceId;
  coverageSurface: PhoneSurfaceId;
  landingResolver: PhoneLandingResolverId;
  contentProbe: PhoneSceneContentProbe;
}>;

export type PhoneSegmentEffectPlacement =
  | 'above-both'
  | 'between';

export type PhoneSegmentPresentationContract = Readonly<{
  id: CanonicalPhoneSegmentId;
  checkpoint: PhoneCheckpointId;
  from: SceneId;
  to: SceneId;
  sourceSurface: PhoneSurfaceId;
  receiverSurface: PhoneSurfaceId;
  effectHost: PhoneSurfaceId;
  effectPlacement: PhoneSegmentEffectPlacement;
  firstFrame: PhoneEvidenceRequirement;
  forward: Readonly<{ policy: 'fail-closed' }>;
  reverse: Readonly<{ policy: 'fail-closed' }>;
}>;

/** A run always declares both physical normal and reduced proof paths. */
export type PhoneAdmissionMode = 'normal' | 'reduced';

/** The only components permitted to originate a presentation frame. */
export type PhoneAdmissionProofProducer =
  | 'effect-leaf'
  | 'media-leaf'
  | 'static-leaf'
  | 'dom-post-paint';

export type PhoneAdmissionEffectRole = PhoneSegmentEffectPlacement | 'none';

export type PhoneAdmissionStrategy = Readonly<{
  producer: PhoneAdmissionProofProducer;
  kind: PhonePresentationProofKind;
  subject: PhoneSurfaceId;
  targetScene: SceneId;
  landingResolver: PhoneLandingResolverId;
  effectRole: PhoneAdmissionEffectRole;
  requiresLeafAdapter: boolean;
}>;

/**
 * Positional strategy transport protects this cross-chunk contract from
 * property mangling. Runners consume this tuple; object views are test/tooling
 * only.
 */
export type PhoneAdmissionStrategyTuple = readonly [
  producer: PhoneAdmissionProofProducer,
  kind: PhonePresentationProofKind,
  subject: PhoneSurfaceId,
  targetScene: SceneId,
  landingResolver: PhoneLandingResolverId,
  effectRole: PhoneAdmissionEffectRole,
  requiresLeafAdapter: boolean
];

/**
 * Runtime manifest transport. Slots avoid sharing a property-mangled contract
 * object between independently minified lazy phone chunks.
 */
export type PhoneScenePresentationTuple = readonly [
  checkpoint: PhoneCheckpointId,
  edge: PhoneEdgeScene,
  stageOwner: PhoneStageOwner,
  stageScene: SceneId | null,
  receiverSurface: PhoneSurfaceId,
  landingResolver: PhoneLandingResolverId,
  contentProbeKind: PhoneSceneContentProbe['kind'],
  contentSelectors: readonly string[]
];

export type PhoneSegmentPresentationTuple = readonly [
  checkpoint: PhoneCheckpointId,
  id: CanonicalPhoneSegmentId,
  from: SceneId,
  to: SceneId,
  sourceSurface: PhoneSurfaceId,
  receiverSurface: PhoneSurfaceId,
  effectHost: PhoneSurfaceId,
  effectPlacement: PhoneSegmentEffectPlacement,
  firstFrameKind: Extract<
    PhonePresentationEvidenceKind,
    'effect-frame' | 'packed-canvas-frame'
  >,
  firstFrameSubject: PhoneSurfaceId
];

const owners = ['front', 'grade-a', 'group45', 'group67', 'native'] as const;
const resolvers = [
  'front-corridor',
  'aod-semantic-edge',
  'authored-boundary',
  'preserve-composite',
  'native-reading'
] as const;
const effectHosts = [
  'front:ink',
  'grade-a:ink',
  'group45:effect',
  'group67:effect'
] as const;
const effectPlacements = ['above-both', 'between'] as const;

type OwnerCode = 0 | 1 | 2 | 3 | 4;
type ResolverCode = 0 | 1 | 2 | 3 | 4;
type SceneRow = readonly [
  PhoneCheckpointId,
  PhoneEdgeScene,
  OwnerCode,
  string,
  ResolverCode,
  PhoneSceneContentProbe['kind'],
  readonly string[]
];
type SegmentRow = readonly [
  PhoneCheckpointId,
  0 | 1 | 2 | 3 | 4,
  0 | 1
];

/**
 * Ordered rows follow canonicalSceneIds. Textual holds keep an authored DOM
 * probe. Dynamic visual holds deliberately expose no selector: only the
 * leaf's real renderer callback may produce their PresentationProof. A
 * static visual may expose a token-bound post-paint marker, but that marker
 * is only physical evidence after its leaf supplies the matching raw frame.
 */
const sceneRows = [
  ['hero-entered', 'hero', 0, 'hero', 0, 'static', ['#portrait-spike-home']],
  ['pattern-complete', 'pattern', 0, 'pattern', 0, 'static', ['#portrait-spike-pattern-title']],
  ['star-map-reading', 'star', 0, 'star-map', 0, 'static', ['#portrait-spike-star-title']],
  ['aod-stage', 'aod', 0, 'aod', 1, 'static-visual', ['[data-aod-reveal-surface][data-aod-static-poster]']],
  ['method-intro', 'method', 4, 'method', 2, 'reading', ['#portrait-spike-method-title', '.portrait-scroll-spike__method-bridge-content > p']],
  ['figure2-stage', 'figure2', 1, 'figure2', 2, 'visual', []],
  ['figure2-proof-opening', 'proof', 1, 'proof', 2, 'reading', ['#figure2-proof-opening .r4-proof-opening__title']],
  ['brand-reading', 'brand', 4, 'brand', 2, 'static', ['#phone-brand-title', '.phone-brand__definition > p']],
  ['figure3-stage', 'figure3', 2, 'figure3', 3, 'visual', []],
  ['services-reading', 'services', 4, 'services', 4, 'reading', ['#phone-services-title', '.phone-services__hero > p']],
  ['ttg-stage', 'ttg', 2, 'ttg', 3, 'visual', []],
  ['lab-stable', 'lab', 4, 'lab', 4, 'reading', ['#phone-lab-title', '.phone-lab__hero > p:not(.phone-lab__eyebrow)']],
  ['ph-stage', 'ph', 3, 'ph', 3, 'visual', []],
  ['education-reading', 'education', 4, 'education', 4, 'reading', ['.r4-education__vertical h2', '.r4-education__lead p']],
  ['crane-stage', 'crane', 3, 'crane', 3, 'visual', []],
  ['contact-stable', 'contact', 4, 'contact', 4, 'static', ['.r4-contact h2', '.r4-contact__content > p']]
] as const satisfies readonly SceneRow[] & Readonly<{
  length: typeof canonicalSceneIds['length'];
}>;

/** Ordered rows follow canonicalSegments and name their effect host/placement. */
const segmentRows = [
  ['hero-to-pattern', 0, 0],
  ['pattern-to-star-map', 0, 0],
  ['star-map-to-aod', 0, 0],
  ['aod-to-method', 4, 1],
  ['method-to-figure2', 1, 0],
  ['figure2-to-proof', 1, 0],
  ['proof-to-brand', 1, 0],
  ['brand-to-figure3', 2, 0],
  ['figure3-to-services', 4, 1],
  ['services-to-ttg', 2, 0],
  ['ttg-to-lab', 4, 1],
  ['lab-to-ph', 3, 0],
  ['ph-to-education', 4, 1],
  ['education-to-crane', 3, 0],
  ['crane-to-contact', 4, 1]
] as const satisfies readonly SegmentRow[] & Readonly<{
  length: typeof canonicalSegments['length'];
}>;

type SegmentAdmissionRow = readonly [
  forwardNormal: PhoneAdmissionStrategyTuple,
  forwardReduced: PhoneAdmissionStrategyTuple,
  reverseNormal: PhoneAdmissionStrategyTuple,
  reverseReduced: PhoneAdmissionStrategyTuple
];

type PhoneDirectionalReducedAdmission = readonly [
  forward: PhoneAdmissionStrategyTuple,
  reverse: PhoneAdmissionStrategyTuple
];

type PhoneRunReducedAdmissionRows = Readonly<{
  'aod-method': readonly [PhoneDirectionalReducedAdmission];
  'method-figure2': readonly [PhoneDirectionalReducedAdmission];
  'figure2-proof': readonly [PhoneDirectionalReducedAdmission];
  'proof-brand': readonly [PhoneDirectionalReducedAdmission];
  'brand-services': readonly [
    PhoneDirectionalReducedAdmission,
    PhoneDirectionalReducedAdmission
  ];
  'services-lab': readonly [
    PhoneDirectionalReducedAdmission,
    PhoneDirectionalReducedAdmission
  ];
  'lab-education': readonly [
    PhoneDirectionalReducedAdmission,
    PhoneDirectionalReducedAdmission
  ];
  'education-contact': readonly [
    PhoneDirectionalReducedAdmission,
    PhoneDirectionalReducedAdmission
  ];
}>;

const admission = (
  producer: PhoneAdmissionProofProducer,
  kind: PhonePresentationProofKind,
  subject: PhoneSurfaceId,
  targetScene: SceneId,
  landingResolver: PhoneLandingResolverId,
  effectRole: PhoneAdmissionEffectRole,
  requiresLeafAdapter: boolean
): PhoneAdmissionStrategyTuple => [
  producer,
  kind,
  subject,
  targetScene,
  landingResolver,
  effectRole,
  requiresLeafAdapter
];

const segmentAdmission = (
  forwardNormal: PhoneAdmissionStrategyTuple,
  forwardReduced: PhoneAdmissionStrategyTuple,
  reverseNormal: PhoneAdmissionStrategyTuple,
  reverseReduced: PhoneAdmissionStrategyTuple
): SegmentAdmissionRow => [
  forwardNormal,
  forwardReduced,
  reverseNormal,
  reverseReduced
];

const directionalReduced = (
  forward: PhoneAdmissionStrategyTuple,
  reverse: PhoneAdmissionStrategyTuple
): PhoneDirectionalReducedAdmission => [forward, reverse];

/**
 * This is intentionally a full Record rather than an inferred list. Omitting
 * a canonical segment is a TypeScript error, rather than an opt-in fallback at
 * runtime. Normal entries describe the physical first frame for that segment;
 * reduced entries describe its static target when the segment is addressed
 * directly. Composite run entries below may intentionally select their final
 * native endpoint for a multi-leg reduced transaction.
 */
const segmentAdmissionRows = {
  'hero-pattern': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'front:ink', 'pattern', 'front-corridor', 'above-both', true),
    admission('static-leaf', 'static-poster', 'front:pattern', 'pattern', 'front-corridor', 'none', true),
    admission('effect-leaf', 'effect-frame', 'front:ink', 'hero', 'front-corridor', 'above-both', true),
    admission('static-leaf', 'static-poster', 'front:hero', 'hero', 'front-corridor', 'none', true)
  ),
  'pattern-star-map': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'front:ink', 'star-map', 'front-corridor', 'above-both', true),
    admission('static-leaf', 'static-poster', 'front:star-map', 'star-map', 'front-corridor', 'none', true),
    admission('effect-leaf', 'effect-frame', 'front:ink', 'pattern', 'front-corridor', 'above-both', true),
    admission('static-leaf', 'static-poster', 'front:pattern', 'pattern', 'front-corridor', 'none', true)
  ),
  'star-map-aod': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'front:ink', 'aod-animation', 'front-corridor', 'above-both', true),
    admission('static-leaf', 'static-poster', 'front:aod', 'aod-animation', 'front-corridor', 'none', true),
    admission('effect-leaf', 'effect-frame', 'front:ink', 'star-map', 'front-corridor', 'above-both', true),
    admission('static-leaf', 'static-poster', 'front:star-map', 'star-map', 'front-corridor', 'none', true)
  ),
  'aod-method-top': segmentAdmission(
    admission('media-leaf', 'packed-canvas-frame', 'front:aod', 'method-top', 'aod-semantic-edge', 'none', true),
    admission('static-leaf', 'static-poster', 'native:method', 'method-top', 'aod-semantic-edge', 'none', true),
    admission('media-leaf', 'packed-canvas-frame', 'front:aod', 'aod-animation', 'aod-semantic-edge', 'none', true),
    admission('static-leaf', 'static-poster', 'front:aod', 'aod-animation', 'aod-semantic-edge', 'none', true)
  ),
  'method-bottom-figure2': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'grade-a:ink', 'figure2-animation', 'authored-boundary', 'above-both', true),
    admission('static-leaf', 'static-poster', 'grade-a:figure2', 'figure2-animation', 'authored-boundary', 'none', true),
    admission('effect-leaf', 'effect-frame', 'grade-a:ink', 'method-top', 'authored-boundary', 'above-both', true),
    admission('static-leaf', 'static-poster', 'native:method', 'method-top', 'authored-boundary', 'none', true)
  ),
  'figure2-distance-expand': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'grade-a:ink', 'figure2-proof', 'authored-boundary', 'above-both', true),
    admission('static-leaf', 'static-poster', 'grade-a:proof', 'figure2-proof', 'authored-boundary', 'none', true),
    admission('effect-leaf', 'effect-frame', 'grade-a:ink', 'figure2-animation', 'authored-boundary', 'above-both', true),
    admission('static-leaf', 'static-poster', 'grade-a:figure2', 'figure2-animation', 'authored-boundary', 'none', true)
  ),
  'figure2-proof-brand': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'grade-a:ink', 'brand', 'authored-boundary', 'above-both', true),
    admission('static-leaf', 'static-poster', 'native:brand', 'brand', 'authored-boundary', 'none', true),
    admission('effect-leaf', 'effect-frame', 'grade-a:ink', 'figure2-proof', 'authored-boundary', 'above-both', true),
    admission('static-leaf', 'static-poster', 'grade-a:proof', 'figure2-proof', 'authored-boundary', 'none', true)
  ),
  'brand-figure3': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'group45:effect', 'figure3-animation', 'preserve-composite', 'above-both', true),
    admission('static-leaf', 'static-poster', 'group45:figure3', 'figure3-animation', 'preserve-composite', 'none', true),
    admission('effect-leaf', 'effect-frame', 'group45:effect', 'brand', 'preserve-composite', 'above-both', true),
    admission('static-leaf', 'static-poster', 'native:brand', 'brand', 'preserve-composite', 'none', true)
  ),
  'figure3-services': segmentAdmission(
    admission('media-leaf', 'packed-canvas-frame', 'group45:figure3', 'services', 'preserve-composite', 'none', true),
    admission('static-leaf', 'static-poster', 'native:services', 'services', 'native-reading', 'none', true),
    admission('media-leaf', 'packed-canvas-frame', 'group45:figure3', 'figure3-animation', 'preserve-composite', 'none', true),
    admission('static-leaf', 'static-poster', 'group45:figure3', 'figure3-animation', 'preserve-composite', 'none', true)
  ),
  'services-ttg': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'group45:effect', 'ttg-animation', 'preserve-composite', 'above-both', true),
    admission('static-leaf', 'static-poster', 'group45:ttg', 'ttg-animation', 'preserve-composite', 'none', true),
    admission('effect-leaf', 'effect-frame', 'group45:effect', 'services', 'preserve-composite', 'above-both', true),
    admission('static-leaf', 'static-poster', 'native:services', 'services', 'native-reading', 'none', true)
  ),
  'ttg-lab': segmentAdmission(
    admission('media-leaf', 'packed-canvas-frame', 'group45:ttg', 'lab', 'preserve-composite', 'none', true),
    admission('static-leaf', 'static-poster', 'native:lab', 'lab', 'native-reading', 'none', true),
    admission('media-leaf', 'packed-canvas-frame', 'group45:ttg', 'ttg-animation', 'preserve-composite', 'none', true),
    admission('static-leaf', 'static-poster', 'group45:ttg', 'ttg-animation', 'preserve-composite', 'none', true)
  ),
  'lab-ph': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'group67:effect', 'ph-animation', 'preserve-composite', 'above-both', true),
    admission('static-leaf', 'static-poster', 'group67:ph', 'ph-animation', 'preserve-composite', 'none', true),
    admission('effect-leaf', 'effect-frame', 'group67:effect', 'lab', 'preserve-composite', 'above-both', true),
    admission('static-leaf', 'static-poster', 'native:lab', 'lab', 'native-reading', 'none', true)
  ),
  'ph-education': segmentAdmission(
    admission('media-leaf', 'packed-canvas-frame', 'group67:ph', 'education', 'preserve-composite', 'none', true),
    admission('static-leaf', 'static-poster', 'native:education', 'education', 'native-reading', 'none', true),
    admission('media-leaf', 'packed-canvas-frame', 'group67:ph', 'ph-animation', 'preserve-composite', 'none', true),
    admission('static-leaf', 'static-poster', 'group67:ph', 'ph-animation', 'preserve-composite', 'none', true)
  ),
  'education-crane': segmentAdmission(
    admission('effect-leaf', 'effect-frame', 'group67:effect', 'crane-animation', 'preserve-composite', 'above-both', true),
    admission('static-leaf', 'static-poster', 'group67:crane', 'crane-animation', 'preserve-composite', 'none', true),
    admission('effect-leaf', 'effect-frame', 'group67:effect', 'education', 'preserve-composite', 'above-both', true),
    admission('static-leaf', 'static-poster', 'native:education', 'education', 'native-reading', 'none', true)
  ),
  'crane-contact': segmentAdmission(
    admission('media-leaf', 'packed-canvas-frame', 'group67:crane', 'contact', 'preserve-composite', 'none', true),
    admission('static-leaf', 'static-poster', 'native:contact', 'contact', 'native-reading', 'none', true),
    admission('media-leaf', 'packed-canvas-frame', 'group67:crane', 'crane-animation', 'preserve-composite', 'none', true),
    admission('static-leaf', 'static-poster', 'group67:crane', 'crane-animation', 'preserve-composite', 'none', true)
  )
} as const satisfies Readonly<Record<CanonicalPhoneSegmentId, SegmentAdmissionRow>>;

/**
 * Multi-leg reduced transactions intentionally settle the run endpoint after
 * their first candidate proof. Repeat the explicit strategy for every leg so
 * an unavailable leg can never inherit a compatibility path.
 */
const runReducedAdmissionRows = {
  'aod-method': [directionalReduced(
    admission('static-leaf', 'static-poster', 'native:method', 'method-top', 'aod-semantic-edge', 'none', true),
    admission('static-leaf', 'static-poster', 'front:aod', 'aod-animation', 'aod-semantic-edge', 'none', true)
  )],
  'method-figure2': [directionalReduced(
    admission('static-leaf', 'static-poster', 'grade-a:figure2', 'figure2-animation', 'authored-boundary', 'none', true),
    admission('static-leaf', 'static-poster', 'native:method', 'method-top', 'authored-boundary', 'none', true)
  )],
  'figure2-proof': [directionalReduced(
    admission('static-leaf', 'static-poster', 'grade-a:proof', 'figure2-proof', 'authored-boundary', 'none', true),
    admission('static-leaf', 'static-poster', 'grade-a:figure2', 'figure2-animation', 'authored-boundary', 'none', true)
  )],
  'proof-brand': [directionalReduced(
    admission('static-leaf', 'static-poster', 'native:brand', 'brand', 'authored-boundary', 'none', true),
    admission('static-leaf', 'static-poster', 'grade-a:proof', 'figure2-proof', 'authored-boundary', 'none', true)
  )],
  'brand-services': [
    directionalReduced(
      admission('static-leaf', 'static-poster', 'native:services', 'services', 'native-reading', 'none', true),
      admission('static-leaf', 'static-poster', 'native:brand', 'brand', 'authored-boundary', 'none', true)
    ),
    directionalReduced(
      admission('static-leaf', 'static-poster', 'native:services', 'services', 'native-reading', 'none', true),
      admission('static-leaf', 'static-poster', 'native:brand', 'brand', 'authored-boundary', 'none', true)
    )
  ],
  'services-lab': [
    directionalReduced(
      admission('static-leaf', 'static-poster', 'native:lab', 'lab', 'native-reading', 'none', true),
      admission('static-leaf', 'static-poster', 'native:services', 'services', 'native-reading', 'none', true)
    ),
    directionalReduced(
      admission('static-leaf', 'static-poster', 'native:lab', 'lab', 'native-reading', 'none', true),
      admission('static-leaf', 'static-poster', 'native:services', 'services', 'native-reading', 'none', true)
    )
  ],
  'lab-education': [
    directionalReduced(
      admission('static-leaf', 'static-poster', 'native:education', 'education', 'native-reading', 'none', true),
      admission('static-leaf', 'static-poster', 'native:lab', 'lab', 'native-reading', 'none', true)
    ),
    directionalReduced(
      admission('static-leaf', 'static-poster', 'native:education', 'education', 'native-reading', 'none', true),
      admission('static-leaf', 'static-poster', 'native:lab', 'lab', 'native-reading', 'none', true)
    )
  ],
  'education-contact': [
    directionalReduced(
      admission('static-leaf', 'static-poster', 'native:contact', 'contact', 'native-reading', 'none', true),
      admission('static-leaf', 'static-poster', 'native:education', 'education', 'native-reading', 'none', true)
    ),
    directionalReduced(
      admission('static-leaf', 'static-poster', 'native:contact', 'contact', 'native-reading', 'none', true),
      admission('static-leaf', 'static-poster', 'native:education', 'education', 'native-reading', 'none', true)
    )
  ]
} as const satisfies PhoneRunReducedAdmissionRows;

/** Direct entry is a declared target admission, never an inferred scene case. */
const directEntryAdmissionRows = {
  hero: admission('static-leaf', 'static-poster', 'front:hero', 'hero', 'front-corridor', 'none', true),
  pattern: admission('static-leaf', 'static-poster', 'front:pattern', 'pattern', 'front-corridor', 'none', true),
  'star-map': admission('static-leaf', 'static-poster', 'front:star-map', 'star-map', 'front-corridor', 'none', true),
  'aod-animation': admission('static-leaf', 'static-poster', 'front:aod', 'aod-animation', 'aod-semantic-edge', 'none', true),
  'method-top': admission('dom-post-paint', 'dom-reading', 'native:method', 'method-top', 'authored-boundary', 'none', false),
  'figure2-animation': admission('media-leaf', 'packed-canvas-frame', 'grade-a:figure2', 'figure2-animation', 'authored-boundary', 'none', true),
  'figure2-proof': admission('dom-post-paint', 'dom-reading', 'grade-a:proof', 'figure2-proof', 'authored-boundary', 'none', false),
  brand: admission('static-leaf', 'static-poster', 'native:brand', 'brand', 'authored-boundary', 'none', true),
  'figure3-animation': admission('media-leaf', 'packed-canvas-frame', 'group45:figure3', 'figure3-animation', 'preserve-composite', 'none', true),
  services: admission('dom-post-paint', 'dom-reading', 'native:services', 'services', 'native-reading', 'none', false),
  'ttg-animation': admission('media-leaf', 'packed-canvas-frame', 'group45:ttg', 'ttg-animation', 'preserve-composite', 'none', true),
  lab: admission('dom-post-paint', 'dom-reading', 'native:lab', 'lab', 'native-reading', 'none', false),
  'ph-animation': admission('media-leaf', 'packed-canvas-frame', 'group67:ph', 'ph-animation', 'preserve-composite', 'none', true),
  education: admission('static-leaf', 'static-poster', 'native:education', 'education', 'native-reading', 'none', true),
  'crane-animation': admission('media-leaf', 'packed-canvas-frame', 'group67:crane', 'crane-animation', 'preserve-composite', 'none', true),
  contact: admission('static-leaf', 'static-poster', 'native:contact', 'contact', 'native-reading', 'none', true)
} as const satisfies Readonly<Record<CanonicalPhoneSceneId, PhoneAdmissionStrategyTuple>>;

type SceneRowLookup = readonly [
  canonical: CanonicalPhoneSceneId,
  row: SceneRow,
  checkpointOverride: PhoneCheckpointId | undefined
];

function sceneRowFor(sceneId: SceneId): SceneRowLookup {
  const index = (canonicalSceneIds as readonly SceneId[]).indexOf(sceneId);
  if (index >= 0) {
    return [canonicalSceneIds[index]!, sceneRows[index]!, undefined];
  }
  switch (sceneId) {
    case 'method-bottom':
      return ['method-top', sceneRows[4], 'method-to-figure2'];
    case 'figure2-proof-opening':
      return ['figure2-proof', sceneRows[6], 'figure2-proof-opening'];
    case 'figure2-proof-cards':
      return ['figure2-proof', sceneRows[6], 'figure2-proof-cards'];
    case 'figure2-proof-closing':
      return ['figure2-proof', sceneRows[6], 'figure2-proof-closing'];
    default:
      throw new Error(`Unknown phone scene presentation contract: ${sceneId}`);
  }
}

function segmentRowFor(
  segmentId: SegmentId
): readonly [(typeof canonicalSegments)[number], SegmentRow] {
  const index = (canonicalSegments as readonly { id: SegmentId }[])
    .findIndex((segment) => segment.id === segmentId);
  if (index >= 0) return [canonicalSegments[index]!, segmentRows[index]!];
  switch (segmentId) {
    case 'method-top-method-bottom':
      return [canonicalSegments[4], segmentRows[4]];
    case 'figure2-proof-opening-cards':
    case 'figure2-proof-cards-closing':
      return [canonicalSegments[5], segmentRows[5]];
    default:
      throw new Error(`Unknown phone segment presentation contract: ${segmentId}`);
  }
}

function admissionStrategy(
  tuple: PhoneAdmissionStrategyTuple
): PhoneAdmissionStrategy {
  return {
    producer: tuple[0],
    kind: tuple[1],
    subject: tuple[2],
    targetScene: tuple[3],
    landingResolver: tuple[4],
    effectRole: tuple[5],
    requiresLeafAdapter: tuple[6]
  };
}

/**
 * Canonical segment admission is total over direction and motion mode. A
 * caller never receives an undefined value that it could treat as a legacy
 * compatibility strategy.
 */
export function phoneSegmentAdmissionTuple(
  segmentId: SegmentId,
  direction: 1 | -1,
  mode: PhoneAdmissionMode
): PhoneAdmissionStrategyTuple {
  const [definition] = segmentRowFor(segmentId);
  const row = segmentAdmissionRows[definition.id];
  return row[
    direction === 1
      ? mode === 'normal' ? 0 : 1
      : mode === 'normal' ? 2 : 3
  ];
}

export function phoneSegmentAdmissionStrategy(
  segmentId: SegmentId,
  direction: 1 | -1,
  mode: PhoneAdmissionMode
): PhoneAdmissionStrategy {
  return admissionStrategy(phoneSegmentAdmissionTuple(segmentId, direction, mode));
}

/**
 * A run leg's normal strategy is its canonical segment strategy. Reduced
 * multi-leg runs instead declare their terminal target per leg above, so the
 * skipped visual leg can never fall into a synthesized settle branch.
 */
export function phoneRunLegAdmissionTuple(
  runId: PhoneRunId,
  legIndex: number,
  direction: 1 | -1,
  mode: PhoneAdmissionMode
): PhoneAdmissionStrategyTuple | null {
  const leg = phoneRunLegTuple(runId, legIndex);
  if (!leg) return null;
  if (mode === 'normal') {
    return phoneSegmentAdmissionTuple(leg[0], direction, mode);
  }
  return runReducedAdmissionRows[runId][legIndex]?.[direction === 1 ? 0 : 1] ?? null;
}

export function phoneRunLegAdmissionStrategy(
  runId: PhoneRunId,
  legIndex: number,
  direction: 1 | -1,
  mode: PhoneAdmissionMode
): PhoneAdmissionStrategy | null {
  const tuple = phoneRunLegAdmissionTuple(runId, legIndex, direction, mode);
  return tuple ? admissionStrategy(tuple) : null;
}

export function phoneDirectEntryAdmissionTuple(
  sceneId: SceneId
): PhoneAdmissionStrategyTuple {
  const [canonical] = sceneRowFor(sceneId);
  return directEntryAdmissionRows[canonical];
}

export function phoneDirectEntryAdmissionStrategy(
  sceneId: SceneId
): PhoneAdmissionStrategy {
  return admissionStrategy(phoneDirectEntryAdmissionTuple(sceneId));
}

export function phoneScenePresentationTuple(
  sceneId: SceneId
): PhoneScenePresentationTuple {
  const [canonical, row, checkpointOverride] = sceneRowFor(sceneId);
  const stageOwner = owners[row[2]]!;
  const receiverSurface = `${stageOwner}:${row[3]}`;
  return [
    checkpointOverride ?? row[0],
    row[1],
    stageOwner,
    stageOwner === 'native' ? null : canonical,
    receiverSurface,
    resolvers[row[4]]!,
    row[5],
    row[6]
  ];
}

type PhoneTerminalPresentationProofKind = Extract<
  PhonePresentationProofKind,
  'dom-reading' | 'static-poster' | 'packed-canvas-frame'
>;

function terminalAdmissionProofKind(sceneId: SceneId): PhoneTerminalPresentationProofKind {
  return phoneDirectEntryAdmissionTuple(sceneId)[1] as PhoneTerminalPresentationProofKind;
}

/**
 * Normal, reduced, and direct terminal verification share the immutable
 * manifest admission strategy. Content probes describe visibility only; they
 * may not silently select a different proof transport for a native leaf.
 */
export function phoneScenePresentationProofKind(
  sceneId: SceneId
): PhoneTerminalPresentationProofKind {
  return terminalAdmissionProofKind(sceneId);
}

export function phoneSegmentPresentationTuple(
  segmentId: SegmentId
): PhoneSegmentPresentationTuple {
  const [definition, row] = segmentRowFor(segmentId);
  const sourceSurface = phoneScenePresentationTuple(definition.from)[4];
  const receiverSurface = phoneScenePresentationTuple(definition.to)[4];
  const effectHost = row[1] === 4
    ? sourceSurface
    : effectHosts[row[1]]!;
  const mediaHandoff = row[2] === 1;
  return [
    row[0],
    definition.id,
    definition.from,
    definition.to,
    sourceSurface,
    receiverSurface,
    effectHost,
    effectPlacements[row[2]]!,
    mediaHandoff ? 'packed-canvas-frame' : 'effect-frame',
    mediaHandoff ? sourceSurface : effectHost
  ];
}

/**
 * Maps a physical surface frame to the semantic edge its immutable token
 * proves. A terminal scene frame keeps its own edge; a source frame that
 * opens a declared transition carries the receiving edge required by that
 * segment's first-frame contract.
 */
export function phoneSurfaceRenderedProofEdge(
  sceneId: SceneId,
  surface: PhoneSurfaceId,
  kind: PhonePresentationProofKind,
  preferTransitionTarget = false
): PhoneEdgeScene | null {
  const sourceTransitionEdge = () => {
    for (const { id } of canonicalSegments) {
      const segment = phoneSegmentPresentationTuple(id);
      if (segment[2] === sceneId
        && segment[4] === surface
        && segment[8] === kind
        && segment[9] === surface
      ) return phoneScenePresentationTuple(segment[3])[1];
    }
    return null;
  };
  if (preferTransitionTarget) {
    const edge = sourceTransitionEdge();
    if (edge) return edge;
  }
  if (kind === phoneScenePresentationProofKind(sceneId)) {
    return phoneScenePresentationTuple(sceneId)[1];
  }
  return sourceTransitionEdge();
}

/**
 * Rich test/tooling views stay behind functions. Production consumes the
 * positional bridge above so lazy chunks never exchange raw contract objects.
 */
const emptySelectors: readonly string[] = [];
const closedPolicy = { policy: 'fail-closed' } as const;

export function phoneScenePresentationContract(
  sceneId: SceneId
): PhoneScenePresentationContract {
  const [
    checkpoint,
    edge,
    stageOwner,
    stageScene,
    receiverSurface,
    landingResolver,
    kind,
    selectors
  ] = phoneScenePresentationTuple(sceneId);
  return {
    scene: (stageScene ?? sceneId) as CanonicalPhoneSceneId,
    checkpoint,
    edge,
    stageOwner,
    stageScene,
    receiverSurface,
    coverageSurface: receiverSurface,
    landingResolver,
    contentProbe: {
      kind,
      textSelectors: kind === 'visual' || kind === 'static-visual'
        ? emptySelectors
        : selectors,
      frameSelectors: kind === 'visual' || kind === 'static-visual'
        ? selectors
        : emptySelectors
    }
  };
}

export function phoneSegmentPresentationContract(
  segmentId: SegmentId
): PhoneSegmentPresentationContract {
  const [
    checkpoint,
    id,
    from,
    to,
    sourceSurface,
    receiverSurface,
    effectHost,
    effectPlacement,
    kind,
    subject
  ] = phoneSegmentPresentationTuple(segmentId);
  return {
    id,
    checkpoint,
    from,
    to,
    sourceSurface,
    receiverSurface,
    effectHost,
    effectPlacement,
    firstFrame: { kind, subject },
    forward: closedPolicy,
    reverse: closedPolicy
  };
}
