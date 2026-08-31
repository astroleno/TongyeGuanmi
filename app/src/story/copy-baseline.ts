import copyReference from '../../../docs/react-refactor/inventory/copy-reference.json';
import type { SceneId } from './types';

export function fixtureCopySection(sectionId: string) {
  return copyReference.sections.find((section) => section.sectionId === sectionId);
}

export function fixtureStaticFallbackText(scene: SceneId): readonly string[] {
  return copyReference.sections
    .filter((section) => section.canonicalScenes.some((candidate) => candidate === scene))
    .flatMap((section) => section.normalizedText);
}

export function assertFixtureStaticFallbackText(scene: SceneId): void {
  const text = fixtureStaticFallbackText(scene);
  if (text.length === 0) {
    throw new Error(`No copy baseline text found for ${scene}`);
  }
}
