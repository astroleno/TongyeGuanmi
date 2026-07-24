import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import type { StoryLoaderExitReason } from '../StoryLoader';
import {
  loadPhoneLoaderAdapter,
  loadPhoneSceneAdapter,
  loadPhoneTransitionAdapter,
  resolvedPhoneLoaderAdapter,
  resolvedPhoneSceneAdapter,
  resolvedPhoneTransitionAdapter
} from './module-loaders';
import { markPhoneLoaderCompletedInDocument } from './phone-loader-lifecycle';
import type {
  PhoneAodAdapterComponent,
  PhoneHeroAdapterComponent,
  PhoneLoaderAdapterComponent,
  PhoneMethodAdapterComponent,
  PhonePatternAdapterComponent,
  PhoneStarMapAdapterComponent,
  PhoneTransitionAdapterComponent
} from './types';

type FrontHalfModules = Readonly<{
  Loader: PhoneLoaderAdapterComponent | undefined;
  Hero: PhoneHeroAdapterComponent | undefined;
  Pattern: PhonePatternAdapterComponent | undefined;
  StarMap: PhoneStarMapAdapterComponent | undefined;
  Aod: PhoneAodAdapterComponent | undefined;
  aodAlphaStartProgress: number | undefined;
  aodAlphaEndProgress: number | undefined;
  MethodTop: PhoneMethodAdapterComponent | undefined;
  HeroPatternTransition: PhoneTransitionAdapterComponent | undefined;
  PatternStarMapTransition: PhoneTransitionAdapterComponent | undefined;
  StarMapAodTransition: PhoneTransitionAdapterComponent | undefined;
  mapAodToMethod: ((progress: number) => number) | undefined;
}>;

function resolvedFrontHalfModules(): FrontHalfModules {
  const hero = resolvedPhoneSceneAdapter('hero');
  const pattern = resolvedPhoneSceneAdapter('pattern');
  const starMap = resolvedPhoneSceneAdapter('star-map');
  const aod = resolvedPhoneSceneAdapter('aod-animation');
  const methodTop = resolvedPhoneSceneAdapter('method-top');
  const heroPattern = resolvedPhoneTransitionAdapter('hero-pattern');
  const patternStarMap = resolvedPhoneTransitionAdapter('pattern-star-map');
  const starMapAod = resolvedPhoneTransitionAdapter('star-map-aod');
  const aodMethodTop = resolvedPhoneTransitionAdapter('aod-method-top');
  return {
    Loader: resolvedPhoneLoaderAdapter()?.Component,
    Hero: hero?.Component as PhoneHeroAdapterComponent | undefined,
    Pattern: pattern?.Component as PhonePatternAdapterComponent | undefined,
    StarMap: starMap?.Component as PhoneStarMapAdapterComponent | undefined,
    Aod: aod?.Component as PhoneAodAdapterComponent | undefined,
    aodAlphaStartProgress: aod?.aodAlphaStartProgress,
    aodAlphaEndProgress: aod?.aodAlphaEndProgress,
    MethodTop: methodTop?.Component as PhoneMethodAdapterComponent | undefined,
    HeroPatternTransition: heroPattern?.Component,
    PatternStarMapTransition: patternStarMap?.Component,
    StarMapAodTransition: starMapAod?.Component,
    mapAodToMethod: aodMethodTop?.methodProgress
  };
}

function frontHalfModulesReady(modules: FrontHalfModules): boolean {
  return Boolean(
    modules.Loader
    && modules.Hero
    && modules.Pattern
    && modules.StarMap
    && modules.Aod
    && modules.aodAlphaStartProgress !== undefined
    && modules.aodAlphaEndProgress !== undefined
    && modules.MethodTop
    && modules.HeroPatternTransition
    && modules.PatternStarMapTransition
    && modules.StarMapAodTransition
    && modules.mapAodToMethod
  );
}

export function phoneFrontHalfInitialVisualsReady(
  heroReady: boolean,
  heroPatternReady: boolean,
  patternReady: boolean
): boolean {
  return heroReady && heroPatternReady && patternReady;
}

export function phoneFrontHalfNeedsStaticFallback(
  reason: StoryLoaderExitReason | undefined,
  loaderHidden: boolean,
  failed: boolean
): boolean {
  return (reason !== undefined && reason !== 'ready') || (loaderHidden && failed);
}

export type PhoneFrontHalfAdapterState = FrontHalfModules & Readonly<{
  modulesReady: boolean;
  ready: boolean;
  failed: boolean;
  staticFallback: boolean;
  markHeroReady(): void;
  markHeroPatternReady(): void;
  markPatternReady(): void;
  finishLoader(reason: StoryLoaderExitReason): void;
}>;

/**
 * Loads the complete frozen Loading → Method adapter group. Only the same
 * initial visual gates as Route B (Hero, Hero→Pattern, Pattern) hold Loader;
 * later scene media continues preparing behind that unchanged sequence.
 */
export function usePhoneFrontHalfAdapters(
  loaderHidden: boolean,
  setLoaderHidden: Dispatch<SetStateAction<boolean>>,
  enabled = true
): PhoneFrontHalfAdapterState {
  const [modules, setModules] = useState<FrontHalfModules>(
    resolvedFrontHalfModules
  );
  const [failed, setFailed] = useState(false);
  const [heroReady, setHeroReady] = useState(false);
  const [heroPatternReady, setHeroPatternReady] = useState(false);
  const [patternReady, setPatternReady] = useState(false);
  const [staticFallback, setStaticFallback] = useState(false);
  const modulesReady = !enabled || frontHalfModulesReady(modules);
  const ready = !enabled || (
    modulesReady && phoneFrontHalfInitialVisualsReady(
      heroReady,
      heroPatternReady,
      patternReady
    )
  );

  useEffect(() => {
    if (!enabled || modulesReady) return;
    let current = true;
    const loads = [
      loadPhoneLoaderAdapter(),
      ...(['hero', 'pattern', 'star-map', 'aod-animation', 'method-top'] as const)
        .map(loadPhoneSceneAdapter),
      ...(['hero-pattern', 'pattern-star-map', 'star-map-aod', 'aod-method-top'] as const)
        .map(loadPhoneTransitionAdapter)
    ];
    void Promise.allSettled(loads).then((results) => {
      if (!current) return;
      setModules(resolvedFrontHalfModules());
      if (results.some(({ status }) => status === 'rejected')) {
        setFailed(true);
      }
    });
    return () => {
      current = false;
    };
  }, [enabled, modulesReady]);

  useEffect(() => {
    if (!enabled) return;
    if (phoneFrontHalfNeedsStaticFallback(undefined, loaderHidden, failed)) {
      setStaticFallback(true);
    }
  }, [enabled, failed, loaderHidden]);

  useEffect(() => {
    if (!enabled || !staticFallback) return;
    const documentElement = document.documentElement;
    document.getElementById('story-loader-static')?.remove();
    delete documentElement.dataset.portraitSpike;
    delete documentElement.dataset.portraitSpikeMotion;
    documentElement.dataset.phoneStoryFallback = 'static';
    return () => {
      delete documentElement.dataset.phoneStoryFallback;
    };
  }, [enabled, staticFallback]);

  const markHeroReady = useCallback(() => setHeroReady(true), []);
  const markHeroPatternReady = useCallback(() => setHeroPatternReady(true), []);
  const markPatternReady = useCallback(() => setPatternReady(true), []);
  const finishLoader = useCallback((reason: StoryLoaderExitReason) => {
    if (phoneFrontHalfNeedsStaticFallback(reason, loaderHidden, failed)) {
      setStaticFallback(true);
      setLoaderHidden(true);
      return;
    }
    markPhoneLoaderCompletedInDocument();
    setLoaderHidden(true);
  }, [failed, loaderHidden, setLoaderHidden]);

  return {
    ...modules,
    modulesReady,
    ready,
    failed,
    staticFallback,
    markHeroReady,
    markHeroPatternReady,
    markPatternReady,
    finishLoader
  };
}
