import { canonicalSceneIds } from '../../story/canonical-spine';
import type { PhoneCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId, SegmentId } from '../../story/types';
import type { PhoneEdgeScene } from './phone-edge-surface';
import type { PhoneStoryCursor } from './phone-story-state';

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

export type PhonePresentationProjection = Readonly<{
  /** Legacy publication name retained until the projector migration. */
  scene: SceneId;
  checkpoint: PhoneCheckpointId;
  edge: PhoneEdgeScene;
  commitState: PhonePresentationCommitState;
  semanticScene: SceneId;
  navigationScene: SceneId;
  stageOwner: PhoneStageOwner;
  stageScene: SceneId | null;
  sourceSurface: PhoneSurfaceId | null;
  receiverSurface: PhoneSurfaceId;
  coverageSurface: PhoneSurfaceId;
  landingResolver: PhoneLandingResolverId;
}>;

export type PhonePresentationEvidence = Readonly<
  Partial<PhonePresentationProjection>
>;

type StablePresentation = readonly [PhoneCheckpointId, PhoneEdgeScene];
type CanonicalPhoneScene = (typeof canonicalSceneIds)[number];

// This compact tuple table is intentionally exhaustive for all canonical
// scenes. The remaining projection fields are deterministic functions of the
// canonical edge and therefore cannot drift independently per scene.
const stablePresentation = {
  hero: ['hero-entered', 'hero'],
  pattern: ['pattern-complete', 'pattern'],
  'star-map': ['star-map-reading', 'star'],
  'aod-animation': ['aod-stage', 'aod'],
  'method-top': ['method-intro', 'method'],
  'figure2-animation': ['figure2-stage', 'figure2'],
  'figure2-proof': ['figure2-proof-opening', 'proof'],
  brand: ['brand-reading', 'brand'],
  'figure3-animation': ['figure3-stage', 'figure3'],
  services: ['services-reading', 'services'],
  'ttg-animation': ['ttg-stage', 'ttg'],
  lab: ['lab-stable', 'lab'],
  'ph-animation': ['ph-stage', 'ph'],
  education: ['education-reading', 'education'],
  'crane-animation': ['crane-stage', 'crane'],
  contact: ['contact-stable', 'contact'],
  'method-bottom': ['method-to-figure2', 'method'],
  'figure2-proof-opening': ['figure2-proof-opening', 'proof'],
  'figure2-proof-cards': ['figure2-proof-cards', 'proof'],
  'figure2-proof-closing': ['figure2-proof-closing', 'proof']
} as const satisfies Readonly<
  Record<CanonicalPhoneScene, StablePresentation>
  & Record<SceneId, StablePresentation>
>;

const segmentCheckpoint: Readonly<Record<SegmentId, PhoneCheckpointId>> = {
  'hero-pattern': 'hero-to-pattern',
  'pattern-star-map': 'pattern-to-star-map',
  'star-map-aod': 'star-map-to-aod',
  'aod-method-top': 'aod-to-method',
  'method-top-method-bottom': 'method-to-figure2',
  'method-bottom-figure2': 'method-to-figure2',
  'figure2-distance-expand': 'figure2-to-proof',
  'figure2-proof-opening-cards': 'figure2-proof-cards',
  'figure2-proof-cards-closing': 'figure2-proof-closing',
  'figure2-proof-brand': 'proof-to-brand',
  'brand-figure3': 'brand-to-figure3',
  'figure3-services': 'figure3-to-services',
  'services-ttg': 'services-to-ttg',
  'ttg-lab': 'ttg-to-lab',
  'lab-ph': 'lab-to-ph',
  'ph-education': 'ph-to-education',
  'education-crane': 'education-to-crane',
  'crane-contact': 'crane-to-contact'
};

function ownerFor(edge: PhoneEdgeScene): PhoneStageOwner {
  if (edge === 'hero' || edge === 'pattern' || edge === 'star' || edge === 'aod') {
    return 'front';
  }
  if (edge === 'figure2' || edge === 'proof') return 'grade-a';
  if (edge === 'figure3' || edge === 'ttg') return 'group45';
  if (edge === 'ph' || edge === 'crane') return 'group67';
  return 'native';
}

function projectionDetails(scene: SceneId): Readonly<{
  checkpoint: PhoneCheckpointId;
  edge: PhoneEdgeScene;
  stageOwner: PhoneStageOwner;
  stageScene: SceneId | null;
  surface: PhoneSurfaceId;
  landingResolver: PhoneLandingResolverId;
}> {
  const [checkpoint, edge] = stablePresentation[scene];
  const stageOwner = ownerFor(edge);
  const stageScene = stageOwner === 'native'
    ? null
    : edge === 'proof' ? 'figure2-proof' : scene;
  const surfaceToken = edge === 'star' ? 'star-map' : edge;
  const landingResolver = stageOwner === 'front'
    ? edge === 'aod' ? 'aod-semantic-edge' : 'front-corridor'
    : stageOwner === 'grade-a' || scene === 'brand'
      ? 'authored-boundary'
      : stageOwner === 'group45' || stageOwner === 'group67'
        || scene === 'services' || scene === 'lab' || scene === 'education'
        ? 'preserve-composite'
        : 'native-reading';
  return {
    checkpoint,
    edge,
    stageOwner,
    stageScene,
    surface: `${stageOwner}:${surfaceToken}`,
    landingResolver
  };
}

export function phoneStablePresentation(
  scene: SceneId
): Required<Pick<PhonePresentationProjection, 'scene' | 'checkpoint' | 'edge'>> {
  const { checkpoint, edge } = projectionDetails(scene);
  return { scene, checkpoint, edge };
}

export function phoneStableProjection(
  scene: SceneId,
  commitState: Extract<PhonePresentationCommitState, 'candidate' | 'stable'> = 'stable'
): PhonePresentationProjection {
  const details = projectionDetails(scene);
  return {
    scene,
    checkpoint: details.checkpoint,
    edge: details.edge,
    commitState,
    semanticScene: scene,
    navigationScene: scene,
    stageOwner: details.stageOwner,
    stageScene: details.stageScene,
    sourceSurface: null,
    receiverSurface: details.surface,
    coverageSurface: details.surface,
    landingResolver: details.landingResolver
  };
}

export function phoneStoryPresentation(
  cursor: PhoneStoryCursor
): PhonePresentationProjection {
  if (cursor.kind === 'hold') return phoneStableProjection(cursor.scene);
  const scene = cursor.progress > 0.001 ? cursor.to : cursor.from;
  const edgeScene = cursor.direction === 1
    ? cursor.progress === 1 ? cursor.to : cursor.from
    : cursor.progress === 0 ? cursor.from : cursor.to;
  const visible = phoneStableProjection(scene, 'candidate');
  const source = projectionDetails(cursor.from).surface;
  const receiver = projectionDetails(cursor.to).surface;
  return {
    ...visible,
    checkpoint: cursor.segment === 'aod-method-top' && cursor.progress <= 0.001
      ? 'aod-autoplay'
      : segmentCheckpoint[cursor.segment],
    edge: projectionDetails(edgeScene).edge,
    commitState: 'transition',
    sourceSurface: source,
    receiverSurface: receiver,
    coverageSurface: cursor.direction === 1 ? source : receiver
  };
}
