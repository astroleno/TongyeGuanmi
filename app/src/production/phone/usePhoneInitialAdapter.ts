import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import type { StoryLoaderExitReason } from '../StoryLoader';
import {
  loadPhoneSceneAdapter,
  resolvedPhoneSceneAdapter
} from './module-loaders';
import { markPhoneLoaderCompletedInDocument } from './phone-loader-lifecycle';
import type {
  PhoneHeroAdapterComponent,
  PhoneSceneAdapterModule
} from './types';

type PhoneHeroAdapterModule = Omit<PhoneSceneAdapterModule, 'id' | 'Component'> & {
  id: 'hero';
  Component: PhoneHeroAdapterComponent;
};

function asHeroAdapter(
  adapter: PhoneSceneAdapterModule | undefined
): PhoneHeroAdapterModule | undefined {
  return adapter?.id === 'hero'
    ? adapter as PhoneHeroAdapterModule
    : undefined;
}

export type PhoneInitialAdapterState = Readonly<{
  Hero: PhoneHeroAdapterComponent | undefined;
  ready: boolean;
  failed: boolean;
  staticFallback: boolean;
  markReady(): void;
  finishLoader(reason: StoryLoaderExitReason): void;
}>;

export function phoneInitialAdapterNeedsStaticFallback(
  reason: StoryLoaderExitReason | undefined,
  loaderHidden: boolean,
  failed: boolean
): boolean {
  return (reason !== undefined && reason !== 'ready') || (loaderHidden && failed);
}

/**
 * Own the initial adapter load and Loader failure handoff outside the shell.
 * A cached preload is synchronous; direct imports retain the same recovery.
 */
export function usePhoneInitialAdapter(
  loaderHidden: boolean,
  setLoaderHidden: Dispatch<SetStateAction<boolean>>
): PhoneInitialAdapterState {
  const [adapter, setAdapter] = useState<PhoneHeroAdapterModule | undefined>(
    () => asHeroAdapter(resolvedPhoneSceneAdapter('hero'))
  );
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [staticFallback, setStaticFallback] = useState(false);

  useEffect(() => {
    if (adapter) return;
    let current = true;
    void loadPhoneSceneAdapter('hero').then(
      (next) => {
        if (current) setAdapter(asHeroAdapter(next));
      },
      () => {
        if (current) setFailed(true);
      }
    );
    return () => {
      current = false;
    };
  }, [adapter]);

  useEffect(() => {
    if (phoneInitialAdapterNeedsStaticFallback(undefined, loaderHidden, failed)) {
      setStaticFallback(true);
    }
  }, [failed, loaderHidden]);

  useEffect(() => {
    if (!staticFallback) return;
    const documentElement = document.documentElement;
    delete documentElement.dataset.portraitSpike;
    delete documentElement.dataset.portraitSpikeMotion;
    documentElement.dataset.phoneStoryFallback = 'static';
    return () => {
      delete documentElement.dataset.phoneStoryFallback;
    };
  }, [staticFallback]);

  const markReady = useCallback(() => setReady(true), []);
  const finishLoader = useCallback((reason: StoryLoaderExitReason) => {
    if (phoneInitialAdapterNeedsStaticFallback(reason, loaderHidden, failed)) {
      setStaticFallback(true);
      setLoaderHidden(true);
      return;
    }
    markPhoneLoaderCompletedInDocument();
    setLoaderHidden(true);
  }, [failed, loaderHidden, setLoaderHidden]);

  return {
    Hero: adapter?.Component,
    ready,
    failed,
    staticFallback,
    markReady,
    finishLoader
  };
}
