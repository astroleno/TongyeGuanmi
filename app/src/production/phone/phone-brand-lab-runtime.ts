import { canonicalSceneIds } from '../../story/canonical-spine';
import type { SceneId } from '../../story/types';
import type { PhoneRunId } from './phone-story-runs';
import type { PhoneStoryCursor } from './phone-story-state';

export type PhoneBrandLabVisualScene =
  | 'figure3-animation'
  | 'ttg-animation';

export type PhoneBrandLabCompositeFrame = Readonly<{
  entryProgress: number;
  mediaProgress: number;
}>;

function sceneIndex(scene: SceneId): number {
  return (canonicalSceneIds as readonly SceneId[]).indexOf(scene);
}

export function phoneBrandLabRunForVisual(
  scene: PhoneBrandLabVisualScene
): PhoneRunId {
  return scene === 'figure3-animation' ? 'brand-services' : 'services-lab';
}

export function phoneBrandLabCompositeFrame(
  cursor: PhoneStoryCursor,
  scene: PhoneBrandLabVisualScene
): PhoneBrandLabCompositeFrame {
  const run = phoneBrandLabRunForVisual(scene);
  if (cursor.kind === 'transition' && cursor.run === run) {
    return {
      entryProgress: cursor.legIndex === 0 ? cursor.progress : 1,
      mediaProgress: cursor.legIndex === 1 ? cursor.progress : 0
    };
  }
  const stableScene = cursor.kind === 'hold'
    ? cursor.scene
    : cursor.runSource;
  const target = scene === 'figure3-animation' ? 'services' : 'lab';
  const completed = sceneIndex(stableScene) >= sceneIndex(target);
  return {
    entryProgress: completed ? 1 : 0,
    mediaProgress: completed ? 1 : 0
  };
}
