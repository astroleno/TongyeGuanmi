import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore
} from 'react';
import type { SceneId } from '../../story/types';
import { hashForScene } from '../navigation';
import type { PhoneStoryRuntimePort } from './phone-story-orchestrator';

/** Navigation has only menu UI state; its canonical scene is a snapshot selector. */
export function usePhoneStoryNavigationRuntime(
  port: PhoneStoryRuntimePort,
  loaderHidden: boolean
) {
  const snapshot = useSyncExternalStore(
    (notify) => {
      const lease = port.subscribe(notify);
      return () => lease.dispose();
    },
    port.getSnapshot,
    port.getSnapshot
  );
  const scene = snapshot.projection.navigationScene;
  const [menuOpen, setMenuOpen] = useState(false);
  const visible = loaderHidden && scene !== 'hero' && scene !== 'pattern';
  useEffect(() => {
    if (!visible) setMenuOpen(false);
  }, [visible]);
  const navigate = useCallback((target: SceneId, source: 'hash' | 'menu' | 'history' = 'menu') => {
    setMenuOpen(false);
    if (source === 'menu') {
      window.history.pushState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${hashForScene(target)}`
      );
    }
    port.dispatch({
      type: 'NAVIGATE_REQUESTED',
      authorityId: port.getSnapshot().authorityId,
      scene: target,
      source
    });
  }, [port]);
  return { snapshot, scene, visible, menuOpen, setMenuOpen, navigate };
}
