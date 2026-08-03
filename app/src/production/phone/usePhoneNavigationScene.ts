import {
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import type { SceneId } from '../../story/types';
import { sceneFromHash } from '../navigation';

export function usePhoneNavigationScene(
  fallbackScene: SceneId
): readonly [SceneId, Dispatch<SetStateAction<SceneId>>] {
  const [scene, setScene] = useState<SceneId>(() => (
    (typeof window === 'undefined'
      ? undefined
      : sceneFromHash(window.location.hash))
    ?? fallbackScene
  ));

  return [scene, setScene] as const;
}
