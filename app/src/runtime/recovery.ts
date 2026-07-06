import { storyManifest } from '../story/manifest';
import type { SceneId, StoryManifest } from '../story/types';

export const recoveryTimeouts = {
  targetReadyMs: 1200,
  mediaReadyMs: 1800,
  buildReadyMs: 1200
} as const;

export type RecoveryPlan = {
  fallbackScene: SceneId;
  reason: 'boot-failed' | 'prepare-timeout' | 'build-timeout' | 'playback-failed' | 'jump-to-end-failed';
  error?: Error;
};

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

export function createRecoveryPlan(
  reason: RecoveryPlan['reason'],
  error?: unknown,
  manifest: StoryManifest = storyManifest
): RecoveryPlan {
  const normalized = error === undefined ? undefined : toError(error);
  return {
    fallbackScene: firstStaticFallbackScene(manifest),
    reason,
    ...(normalized ? { error: normalized } : {})
  };
}
