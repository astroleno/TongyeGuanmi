import { storyManifest } from '../story/manifest';
import type {
  Direction,
  SceneId,
  SegmentId,
  SpineSegmentNode,
  StoryManifest
} from '../story/types';

export const recoveryTimeouts = {
  targetReadyMs: 1200,
  mediaReadyMs: 1800,
  buildReadyMs: 1200
} as const;

export type BootRecoveryPlan = {
  scope: 'boot';
  status: 'fallback';
  fallbackScene: SceneId;
  reason: 'boot-failed';
  error?: Error;
};

export type SegmentRecoveryReason =
  | 'prepare-timeout'
  | 'build-timeout'
  | 'playback-failed'
  | 'segment-aborted';

export type SegmentRecoveryPlan = {
  scope: 'segment';
  status: 'recovering' | 'failed';
  committedScene: SceneId;
  segment: SegmentId;
  direction: Direction;
  endpoint: SceneId;
  reason: SegmentRecoveryReason;
  error?: Error;
};

export type RecoveryPlan = BootRecoveryPlan | SegmentRecoveryPlan;

export function firstStaticFallbackScene(manifest: StoryManifest = storyManifest): SceneId {
  const fallback = manifest.nodes.find((node) => node.kind === 'hold' && node.staticFallback);
  if (fallback?.kind !== 'hold') {
    throw new Error('Manifest must include a static fallback hold');
  }
  return fallback.scene;
}

export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export function createBootRecoveryPlan(
  error?: unknown,
  manifest: StoryManifest = storyManifest
): BootRecoveryPlan {
  const normalized = error === undefined ? undefined : toError(error);
  return {
    scope: 'boot',
    status: 'fallback',
    fallbackScene: firstStaticFallbackScene(manifest),
    reason: 'boot-failed',
    ...(normalized ? { error: normalized } : {})
  };
}

export function createSegmentRecoveryPlan(
  reason: SegmentRecoveryReason,
  committedScene: SceneId,
  segment: SpineSegmentNode,
  direction: Direction,
  error?: unknown
): SegmentRecoveryPlan {
  const normalized = error === undefined ? undefined : toError(error);
  return {
    scope: 'segment',
    status: 'recovering',
    committedScene,
    segment: segment.id,
    direction,
    endpoint: committedScene,
    reason,
    ...(normalized ? { error: normalized } : {})
  };
}
