import {
  useCallback,
  useEffect,
  useState
} from 'react';
import type { SceneId } from '../../story/types';
import { hashForScene } from '../navigation';
import { usePhoneNavigationScene } from './usePhoneNavigationScene';

export function usePhoneStoryNavigationRuntime(
  initialScene: SceneId,
  loaderHidden: boolean
) {
  const [scene, setScene] = usePhoneNavigationScene(initialScene);
  const [menuOpen, setMenuOpen] = useState(false);
  const visible = loaderHidden && scene !== 'hero' && scene !== 'pattern';
  useEffect(() => {
    if (!visible) setMenuOpen(false);
  }, [visible]);
  const navigate = useCallback((target: SceneId) => {
    setMenuOpen(false);
    if (target === 'hero') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      return;
    }
    if (target === 'method-top' || target === 'method-bottom') {
      document.getElementById('method')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      return;
    }
    window.location.assign(`/${hashForScene(target)}`);
  }, []);
  return {
    scene,
    setScene,
    visible,
    menuOpen,
    setMenuOpen,
    navigate
  };
}
