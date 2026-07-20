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
  loadPhoneTransitionAdapter,
  resolvedPhoneSceneAdapter,
  resolvedPhoneTransitionAdapter
} from './module-loaders';
import { markPhoneLoaderCompletedInDocument } from './phone-loader-lifecycle';
import type {
  PhoneHeroAdapterComponent,
  PhoneSceneAdapterModule,
  PhoneTransitionAdapterComponent,
  PhoneTransitionAdapterModule
} from './types';

type PhoneHeroAdapterModule = Omit<PhoneSceneAdapterModule, 'id' | 'Component'> & {
  id: 'hero';
  Component: PhoneHeroAdapterComponent;
};

type PhoneHeroPatternAdapterModule = Omit<
  PhoneTransitionAdapterModule,
  'id' | 'Component'
> & {
  id: 'hero-pattern';
  Component: PhoneTransitionAdapterComponent;
};

function asHeroAdapter(
  adapter: PhoneSceneAdapterModule | undefined
): PhoneHeroAdapterModule | undefined {
  return adapter?.id === 'hero'
    ? adapter as PhoneHeroAdapterModule
    : undefined;
}

function asHeroPatternAdapter(
  adapter: PhoneTransitionAdapterModule | undefined
): PhoneHeroPatternAdapterModule | undefined {
  return adapter?.id === 'hero-pattern' && adapter.Component
    ? adapter as PhoneHeroPatternAdapterModule
    : undefined;
}

export type PhoneInitialAdapterState = Readonly<{
  Hero: PhoneHeroAdapterComponent | undefined;
  HeroPatternTransition: PhoneTransitionAdapterComponent | undefined;
  ready: boolean;
  failed: boolean;
  staticFallback: boolean;
  markHeroReady(): void;
  markHeroPatternReady(): void;
  finishLoader(reason: StoryLoaderExitReason): void;
}>;

export function phoneInitialAdapterNeedsStaticFallback(
  reason: StoryLoaderExitReason | undefined,
  loaderHidden: boolean,
  failed: boolean
): boolean {
  return (reason !== undefined && reason !== 'ready') || (loaderHidden && failed);
}

export function phoneInitialAdaptersReady(
  heroReady: boolean,
  heroPatternReady: boolean
): boolean {
  return heroReady && heroPatternReady;
}

/**
 * Own the initial scene plus adjacent handoff load and Loader failure recovery.
 * Cached preloads are synchronous; direct imports retain the same recovery.
 */
export function usePhoneInitialAdapter(
  loaderHidden: boolean,
  setLoaderHidden: Dispatch<SetStateAction<boolean>>
): PhoneInitialAdapterState {
  const [heroAdapter, setHeroAdapter] = useState<PhoneHeroAdapterModule | undefined>(
    () => asHeroAdapter(resolvedPhoneSceneAdapter('hero'))
  );
  const [heroPatternAdapter, setHeroPatternAdapter] = useState<
    PhoneHeroPatternAdapterModule | undefined
  >(
    () => asHeroPatternAdapter(resolvedPhoneTransitionAdapter('hero-pattern'))
  );
  const [heroReady, setHeroReady] = useState(false);
  const [heroPatternReady, setHeroPatternReady] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  const [heroPatternFailed, setHeroPatternFailed] = useState(false);
  const [staticFallback, setStaticFallback] = useState(false);
  const failed = heroFailed || heroPatternFailed;
  const ready = phoneInitialAdaptersReady(heroReady, heroPatternReady);

  useEffect(() => {
    if (heroAdapter) return;
    let current = true;
    void loadPhoneSceneAdapter('hero').then(
      (next) => {
        if (current) setHeroAdapter(asHeroAdapter(next));
      },
      () => {
        if (current) setHeroFailed(true);
      }
    );
    return () => {
      current = false;
    };
  }, [heroAdapter]);

  useEffect(() => {
    if (heroPatternAdapter) return;
    let current = true;
    void loadPhoneTransitionAdapter('hero-pattern').then(
      (next) => {
        if (current) setHeroPatternAdapter(asHeroPatternAdapter(next));
      },
      () => {
        if (current) setHeroPatternFailed(true);
      }
    );
    return () => {
      current = false;
    };
  }, [heroPatternAdapter]);

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

  const markHeroReady = useCallback(() => setHeroReady(true), []);
  const markHeroPatternReady = useCallback(() => setHeroPatternReady(true), []);
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
    Hero: heroAdapter?.Component,
    HeroPatternTransition: heroPatternAdapter?.Component,
    ready,
    failed,
    staticFallback,
    markHeroReady,
    markHeroPatternReady,
    finishLoader
  };
}
