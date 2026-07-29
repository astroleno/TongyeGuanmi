import type { PhoneCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId, SegmentId } from '../../story/types';
import type { PhoneEdgeScene } from './phone-edge-surface';
import {
  phoneScenePresentationTuple,
  phoneSegmentPresentationTuple,
  type PhoneLandingResolverId,
  type PhonePresentationCommitState,
  type PhoneStageOwner,
  type PhoneSurfaceId
} from './phone-presentation-contract';
import type { PhoneStoryCursor } from './phone-story-state';

export type {
  PhoneLandingResolverId,
  PhonePresentationCommitState,
  PhoneStageOwner,
  PhoneSurfaceId
} from './phone-presentation-contract';

export type PhonePresentationProjection = Readonly<{
  /** Monotonic reducer revision for the accepted surface/coverage tuple. */
  revision: number;
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

/** @deprecated Evidence records live in phone-presentation-evidence.ts. */
export type PhonePresentationEvidence = Readonly<
  Partial<PhonePresentationProjection>
>;

/** Primitive transport for the shared presentation module's lazy consumers. */
export type PhoneStableProjectionTuple = readonly [
  checkpoint: PhoneCheckpointId,
  edge: PhoneEdgeScene,
  stageOwner: PhoneStageOwner,
  stageScene: SceneId | null,
  surface: PhoneSurfaceId,
  landingResolver: PhoneLandingResolverId
];

export type PhoneStoryPresentationTuple = readonly [
  scene: SceneId,
  checkpoint: PhoneCheckpointId,
  edge: PhoneEdgeScene,
  stageOwner: PhoneStageOwner,
  stageScene: SceneId | null,
  sourceSurface: PhoneSurfaceId | null,
  receiverSurface: PhoneSurfaceId,
  landingResolver: PhoneLandingResolverId
];

/**
 * Cross-chunk transition transport. Array slots are stable through Vite's
 * independent property mangling; a raw cursor object is not.
 */
export type PhoneTransitionPresentationInput = readonly [
  from: SceneId,
  to: SceneId,
  segment: SegmentId,
  direction: 1 | -1,
  progress: number
];

type StablePresentation = readonly [PhoneCheckpointId, PhoneEdgeScene];

export function phoneStablePresentation(
  scene: SceneId
): Required<Pick<PhonePresentationProjection, 'scene' | 'checkpoint' | 'edge'>> {
  const [checkpoint, edge] = phoneStablePresentationTuple(scene);
  return { scene, checkpoint, edge };
}

/** Primitive bridge for independently minified direct-entry modules. */
export function phoneStablePresentationTuple(
  scene: SceneId
): StablePresentation {
  const contract = phoneScenePresentationTuple(scene);
  return [contract[0], contract[1]];
}

export function phoneStableProjectionTuple(
  scene: SceneId
): PhoneStableProjectionTuple {
  const contract = phoneScenePresentationTuple(scene);
  return [
    contract[0],
    contract[1],
    contract[2],
    contract[3],
    contract[4],
    contract[5]
  ];
}

export function phoneStableProjection(
  scene: SceneId,
  commitState: Extract<PhonePresentationCommitState, 'candidate' | 'stable'> = 'stable'
): PhonePresentationProjection {
  const contract = phoneScenePresentationTuple(scene);
  return {
    revision: 0,
    scene,
    checkpoint: contract[0],
    edge: contract[1],
    commitState,
    semanticScene: scene,
    navigationScene: scene,
    stageOwner: contract[2],
    stageScene: contract[3],
    sourceSurface: null,
    receiverSurface: contract[4],
    coverageSurface: contract[4],
    landingResolver: contract[5]
  };
}

export function phoneStoryPresentationTuple(
  cursor: PhoneStoryCursor
): PhoneStoryPresentationTuple {
  if (cursor.kind === 'hold') {
    const contract = phoneScenePresentationTuple(cursor.scene);
    return [
      cursor.scene,
      contract[0],
      contract[1],
      contract[2],
      contract[3],
      null,
      contract[4],
      contract[5]
    ];
  }
  return phoneTransitionPresentationTuple([
    cursor.from,
    cursor.to,
    cursor.segment,
    cursor.direction,
    cursor.progress
  ]);
}

/**
 * The reducer calls this instead of passing a named cursor object into the
 * shared presentation chunk. This protects `segment` from cross-chunk
 * property mangling and keeps the contract runtime transport positional.
 */
export function phoneTransitionPresentationTuple(
  [from, to, segmentId, direction, progress]: PhoneTransitionPresentationInput
): PhoneStoryPresentationTuple {
  const semanticScene = progress > 0.001 ? to : from;
  const edgeScene = direction === 1
    ? progress === 1 ? to : from
    : progress === 0 ? from : to;
  const sceneContract = phoneScenePresentationTuple(semanticScene);
  const edgeContract = phoneScenePresentationTuple(edgeScene);
  const segment = phoneSegmentPresentationTuple(segmentId);
  return [
    semanticScene,
    segmentId === 'aod-method-top' && progress <= 0.001
      ? 'aod-autoplay'
      : segment[0],
    edgeContract[1],
    sceneContract[2],
    sceneContract[3],
    segment[4],
    segment[5],
    sceneContract[5]
  ];
}

export function phoneStoryPresentation(
  cursor: PhoneStoryCursor
): PhonePresentationProjection {
  const [
    scene,
    checkpoint,
    edge,
    stageOwner,
    stageScene,
    sourceSurface,
    receiverSurface,
    landingResolver
  ] = phoneStoryPresentationTuple(cursor);
  const coverageSurface = cursor.kind === 'hold'
    ? receiverSurface
    : cursor.direction === 1 ? sourceSurface! : receiverSurface;
  return {
    revision: 0,
    scene,
    checkpoint,
    edge,
    commitState: cursor.kind === 'hold' ? 'stable' : 'transition',
    semanticScene: scene,
    navigationScene: scene,
    stageOwner,
    stageScene,
    sourceSurface,
    receiverSurface,
    coverageSurface,
    landingResolver
  };
}
