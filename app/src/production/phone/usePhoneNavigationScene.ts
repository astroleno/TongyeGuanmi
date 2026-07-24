import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import type { SceneId } from '../../story/types';
import { hashForScene, sceneFromHash } from '../navigation';
import { markPhoneLoaderResumeHash } from './phone-loader-lifecycle';

export function usePhoneNavigationScene(
  fallbackScene: SceneId
): readonly [SceneId, Dispatch<SetStateAction<SceneId>>] {
  const [scene, setScene] = useState<SceneId>(() => (
    (typeof window === 'undefined'
      ? undefined
      : sceneFromHash(window.location.hash))
    ?? fallbackScene
  ));

  useEffect(() => {
    markPhoneLoaderResumeHash(hashForScene(scene));
  }, [scene]);

  return [scene, setScene] as const;
}
