import {
  useEffect,
  useRef,
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
  const lifecycleEpoch = useRef(0);

  useEffect(() => {
    const epoch = ++lifecycleEpoch.current;
    authority.attach();
    return () => {
      /*
       * React development StrictMode probes effects by cleanup/recreate in
       * one turn. Defer terminal disposal to a microtask so the recreated
       * route lifetime retains its route-local authority, while a real
       * unmount still disposes before a later browser task can use it.
       */
      void Promise.resolve().then(() => {
        if (lifecycleEpoch.current === epoch) authority.dispose();
      });
    };
  }, [authority]);

  return authority;
}
