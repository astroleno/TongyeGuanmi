import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore
} from 'react';
import type { SceneId } from '../../story/types';
import { hashForScene, sceneFromHash } from '../navigation';
import type { PhoneStoryRuntimePort } from './phone-story-orchestrator';
import {
  requestPhoneRuntimeNavigation,
  selectPhoneCinematicSnapshot
} from './phone-story-runtime';

/** Navigation has only menu UI state; its canonical scene is a snapshot selector. */
export function usePhoneStoryNavigationRuntime(
  port: PhoneStoryRuntimePort,
  loaderHidden: boolean,
  resolveLocationTarget: (hash: string) => SceneId | undefined = sceneFromHash
) {
  const snapshot = useSyncExternalStore(
    (notify) => {
      const lease = port.subscribe(notify);
      return () => lease.dispose();
    },
    port.getSnapshot,
    port.getSnapshot
  );
  const cinematicSnapshot = useMemo(
    () => selectPhoneCinematicSnapshot(snapshot),
    [snapshot]
  );
  const scene = cinematicSnapshot[12];
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
    requestPhoneRuntimeNavigation(port, target, source);
  }, [port]);
  useEffect(() => {
    const navigateFromLocation = (source: 'hash' | 'history') => {
      const target = resolveLocationTarget(window.location.hash);
      if (target) navigate(target, source);
    };
    const onHashChange = () => navigateFromLocation('hash');
    const onPopState = () => navigateFromLocation('history');
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onPopState);
    };
  }, [navigate, resolveLocationTarget]);
  return {
    cinematicSnapshot,
    visible,
    menuOpen,
    setMenuOpen,
    navigate
  };
}
