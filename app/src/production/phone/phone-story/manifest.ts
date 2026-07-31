import {
  canonicalSceneIds,
  canonicalSegments
} from '../../../story/canonical-spine';
import type { PhoneCheckpointId } from '../../../story/semantic-checkpoints';
import type { SceneId, SegmentId } from '../../../story/types';
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

/** The terminal proof kind is declared with the scene, never inferred from DOM. */
export function phoneScenePresentationProofKind(
  sceneId: SceneId
): Extract<
  PhonePresentationProofKind,
  'dom-reading' | 'static-poster' | 'packed-canvas-frame'
> {
  switch (phoneScenePresentationTuple(sceneId)[6]) {
    case 'reading':
      return 'dom-reading';
    case 'static':
    case 'static-visual':
      return 'static-poster';
    case 'visual':
      return 'packed-canvas-frame';
  }
}

/**
 * A direct route normally keeps the scene's declared terminal proof kind.
 * Education is the one native leaf that has completed the exact post-paint
 * static binding: its direct candidate must use that same leaf contract rather
 * than fall back to the generic reading-frame scheduler.
 */
export function phoneDirectEntryPresentationProofKind(
  sceneId: SceneId
): Extract<
  PhonePresentationProofKind,
  'dom-reading' | 'static-poster' | 'packed-canvas-frame'
> {
  return sceneId === 'education'
    ? 'static-poster'
    : phoneScenePresentationProofKind(sceneId);
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
