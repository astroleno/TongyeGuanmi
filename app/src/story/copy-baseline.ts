import { inventoryManifestSeed } from './manifest';
import type { SceneId } from './types';

export function fixtureStaticFallbackText(scene: SceneId): readonly string[] {
  return inventoryManifestSeed.copySections
    .filter((section) => section.canonicalScenes.includes(scene))
    .flatMap((section) => section.normalizedText);
}

export function assertFixtureStaticFallbackText(scene: SceneId): void {
  const text = fixtureStaticFallbackText(scene);
  if (text.length === 0) {
    throw new Error(`No copy baseline text found for ${scene}`);
  }
}
