import {
  useEffect,
  useState,
  type RefObject
} from 'react';
import type { SceneId } from '../../story/types';
import type { PhoneRouteScope } from './phone-route-scope';
import {
  createPhoneStoryRuntime,
  type PhoneStoryAuthority
} from './phone-story-runtime';

/** Thin React lifetime adapter around the single route-local runtime factory. */
export function usePhoneStoryOrchestratorRuntime({
  scope,
  initialScene,
  rootRef
}: Readonly<{
  scope: PhoneRouteScope;
  initialScene: SceneId;
  rootRef: RefObject<HTMLElement | null>;
}>): PhoneStoryAuthority {
  const [authority] = useState(() => createPhoneStoryRuntime({
    scope,
    initialScene,
    root: () => rootRef.current,
    scrollY: () => window.scrollY,
    scrollTo: (y) => window.scrollTo(0, y)
  }));

  useEffect(() => {
    authority.attach();
    return authority.dispose;
  }, [authority]);

  return authority;
}
