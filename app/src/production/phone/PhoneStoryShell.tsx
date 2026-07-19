import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from 'react';
import type { SceneId } from '../../story/types';
import { StoryLoader } from '../StoryLoader';
import { hashForScene } from '../navigation';
import { PhoneStageRail } from './PhoneStageRail';
import {
  attachPhoneLoaderVisibilityLifecycle,
  markPhoneLoaderCompletedInDocument,
  phoneLoaderCompletedInDocument
} from './phone-loader-lifecycle';
import {
  loadPhoneSceneAdapter,
  loadPhoneTransitionAdapter,
  loadedPhoneAdapters
} from './module-loaders';
import { applyPhoneStageGeometry, phoneStageGeometry, readPhoneViewport } from './phone-viewport';
import type {
  PhoneAodAdapterComponent,
  PhoneAodAdapterHandle,
  PhoneSceneAdapterComponent,
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterId,
  PhoneSceneAdapterModule,
  PhoneTransitionAdapterId,
  PhoneTransitionAdapterModule,
  PhoneTransitionAdapterHandle
} from './types';
import { refreshPhoneScrollStage, usePhoneStageRuntime } from './usePhoneStageRuntime';
import type { PhoneHeroAdapterHandle } from './scenes/PhoneHero';
import './PhoneStoryShell.css';

const StoryNav = lazy(() => import('../StoryNav').then(({ StoryNav: Component }) => ({ default: Component })));
const PHONE_MENU_ITEMS = [
  { label: '首页', hash: '#home', scene: 'hero' },
  { label: '方法', hash: '#method', scene: 'method-top' }
] as const satisfies readonly { label: string; hash: string; scene: SceneId }[];

export type PhoneStoryShellProps = Readonly<{
  /** Kept through the migration as the physical-device comparison route. */
  validationMode?: 'v16';
}>;

type SceneAdapterMap = Partial<Record<PhoneSceneAdapterId, PhoneSceneAdapterModule>>;
type TransitionAdapterMap = Partial<Record<PhoneTransitionAdapterId, PhoneTransitionAdapterModule>>;

function reducedPhoneMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('portrait-spike-motion') === 'reduce'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function asSceneRef<T extends PhoneSceneAdapterHandle>(ref: RefObject<T | null>): RefObject<PhoneSceneAdapterHandle | null> {
  return ref as RefObject<PhoneSceneAdapterHandle | null>;
}

export function PhoneStoryShell({ validationMode }: PhoneStoryShellProps = {}) {
  const reducedMotionRef = useRef(reducedPhoneMotion());
  const loaderAlreadyCompletedRef = useRef(phoneLoaderCompletedInDocument());
  const [reducedMotion, setReducedMotion] = useState(reducedMotionRef.current);
  const [loaderHidden, setLoaderHidden] = useState(loaderAlreadyCompletedRef.current);
  const [sceneAdapters, setSceneAdapters] = useState<SceneAdapterMap>({});
  const [transitionAdapters, setTransitionAdapters] = useState<TransitionAdapterMap>({});
  const [adapterRevision, setAdapterRevision] = useState(0);
  const [heroReady, setHeroReady] = useState(false);
  const [navigationScene, setNavigationScene] = useState<SceneId>('hero');
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<PhoneHeroAdapterHandle | null>(null);
  const patternRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const starMapRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const aodRef = useRef<PhoneAodAdapterHandle | null>(null);
  const methodRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const heroPatternRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const patternStarMapRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const starMapAodRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const scenePendingRef = useRef(new Map<PhoneSceneAdapterId, Promise<PhoneSceneAdapterModule>>());
  const transitionPendingRef = useRef(new Map<PhoneTransitionAdapterId, Promise<PhoneTransitionAdapterModule>>());

  const ensureScene = useCallback((id: PhoneSceneAdapterId) => {
    const existing = sceneAdapters[id];
    if (existing) return Promise.resolve(existing);
    const pending = scenePendingRef.current.get(id);
    if (pending) return pending;
    const promise = loadPhoneSceneAdapter(id).then((adapter) => {
      setSceneAdapters((current) => current[id] ? current : { ...current, [id]: adapter });
      setAdapterRevision((revision) => revision + 1);
      scenePendingRef.current.delete(id);
      return adapter;
    }).catch((error) => {
      scenePendingRef.current.delete(id);
      throw error;
    });
    scenePendingRef.current.set(id, promise);
    return promise;
  }, [sceneAdapters]);

  const ensureTransition = useCallback((id: PhoneTransitionAdapterId) => {
    const existing = transitionAdapters[id];
    if (existing) return Promise.resolve(existing);
    const pending = transitionPendingRef.current.get(id);
    if (pending) return pending;
    const promise = loadPhoneTransitionAdapter(id).then((adapter) => {
      setTransitionAdapters((current) => current[id] ? current : { ...current, [id]: adapter });
      setAdapterRevision((revision) => revision + 1);
      transitionPendingRef.current.delete(id);
      return adapter;
    }).catch((error) => {
      transitionPendingRef.current.delete(id);
      throw error;
    });
    transitionPendingRef.current.set(id, promise);
    return promise;
  }, [transitionAdapters]);

  useEffect(() => {
    void Promise.all([ensureScene('hero'), ensureScene('pattern'), ensureTransition('hero-pattern')]);
  }, [ensureScene, ensureTransition]);

  useEffect(() => attachPhoneLoaderVisibilityLifecycle(), []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(reducedPhoneMotion());
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const documentElement = document.documentElement;
    documentElement.dataset.phoneStoryShell = 'true';
    delete documentElement.dataset.storyHydrated;
    document.getElementById('story-loader-static')?.remove();
    let timer: number | undefined;
    let lastWidth = 0;
    const synchronize = (forceRefresh = false) => {
      const geometry = phoneStageGeometry(readPhoneViewport());
      applyPhoneStageGeometry(root, geometry);
      const widthChanged = Math.abs(geometry.width - lastWidth) > 1;
      lastWidth = geometry.width;
      if (forceRefresh || widthChanged) {
        window.dispatchEvent(new Event('phone-story-geometry'));
      }
    };
    const schedule = (forceRefresh = false) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => synchronize(forceRefresh), 140);
    };
    synchronize(true);
    const onResize = () => schedule();
    const onOrientationChange = () => schedule(true);
    window.visualViewport?.addEventListener('resize', onResize);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientationChange);
    const onGeometry = () => window.requestAnimationFrame(() => {
      // ScrollTrigger is intentionally isolated in the stage runtime. A
      // custom event keeps toolbar-only geometry changes from resetting it.
      refreshPhoneScrollStage();
    });
    window.addEventListener('phone-story-geometry', onGeometry);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('phone-story-geometry', onGeometry);
      root.style.removeProperty('--phone-live-height');
      root.style.removeProperty('--phone-live-width');
      root.style.removeProperty('--phone-stage-rail-height');
      delete root.dataset.phoneViewport;
      delete root.dataset.phoneOrientation;
      delete documentElement.dataset.phoneStoryShell;
    };
  }, []);

  const mapAodToMethod = useCallback((progress: number) => (
    transitionAdapters['aod-method-top']?.methodProgress?.(progress) ?? (progress >= 1 ? 1 : 0)
  ), [transitionAdapters]);

  const onCheckpoint = useCallback((checkpoint: string) => {
    if (checkpoint === 'hero-to-pattern') {
      void Promise.all([ensureScene('pattern'), ensureTransition('hero-pattern')]);
      setNavigationScene('hero');
    } else if (checkpoint === 'pattern-complete' || checkpoint === 'pattern-to-star-map') {
      void Promise.all([ensureScene('star-map'), ensureTransition('pattern-star-map')]);
      setNavigationScene('pattern');
    } else if (checkpoint === 'star-map-reading' || checkpoint === 'star-map-to-aod') {
      void Promise.all([ensureScene('aod-animation'), ensureTransition('star-map-aod'), ensureScene('method-top'), ensureTransition('aod-method-top')]);
      setNavigationScene('star-map');
    } else if (checkpoint === 'aod-stage' || checkpoint === 'aod-autoplay' || checkpoint === 'aod-to-method') {
      setNavigationScene('aod-animation');
    } else if (checkpoint === 'method-intro') {
      setNavigationScene('method-top');
    } else {
      setNavigationScene('hero');
    }
  }, [ensureScene, ensureTransition]);

  const runtime = usePhoneStageRuntime({
    rootRef,
    railRef,
    stageRef,
    sceneRefs: {
      hero: asSceneRef(heroRef),
      pattern: asSceneRef(patternRef),
      'star-map': asSceneRef(starMapRef),
      'aod-animation': aodRef as RefObject<PhoneSceneAdapterHandle | null>
    },
    aodRef,
    methodRef,
    transitionRefs: {
      heroPattern: heroPatternRef,
      patternStarMap: patternStarMapRef,
      starMapAod: starMapAodRef
    },
    enabled: loaderHidden && Boolean(sceneAdapters.hero),
    reducedMotion,
    adapterRevision,
    mapAodToMethod,
    onCheckpoint
  });

  useEffect(() => {
    if (!loaderHidden || !heroReady) return;
    if (loaderAlreadyCompletedRef.current || reducedMotion) heroRef.current?.completeEntrance?.();
    else heroRef.current?.startEntrance?.();
  }, [heroReady, loaderHidden, reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.phoneLoaderReady = String(loaderHidden);
    return () => { delete root.dataset.phoneLoaderReady; };
  }, [loaderHidden]);

  useEffect(() => {
    if (!loaderHidden || navigationScene === 'hero' || navigationScene === 'pattern') setMenuOpen(false);
  }, [loaderHidden, navigationScene]);

  useEffect(() => {
    if (runtime.aodRun === 'complete') setNavigationScene('method-top');
  }, [runtime.aodRun]);

  const navigate = useCallback((scene: SceneId) => {
    setMenuOpen(false);
    if (scene === 'hero') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      return;
    }
    if (scene === 'method-top' || scene === 'method-bottom') {
      document.getElementById('method')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // The Unit 0–3 shell deliberately exposes no unmounted back-half targets.
    // Keep this guard defensive if a caller supplies one programmatically.
    window.history.replaceState({ scene }, '', hashForScene(scene));
  }, []);

  const markHeroReady = useCallback(() => setHeroReady(true), []);
  const Hero = sceneAdapters.hero?.Component as PhoneSceneAdapterComponent | undefined;
  const Pattern = sceneAdapters.pattern?.Component as PhoneSceneAdapterComponent | undefined;
  const StarMap = sceneAdapters['star-map']?.Component as PhoneSceneAdapterComponent | undefined;
  const Aod = sceneAdapters['aod-animation']?.Component as PhoneAodAdapterComponent | undefined;
  const Method = sceneAdapters['method-top']?.Component as PhoneSceneAdapterComponent | undefined;
  const HeroPattern = transitionAdapters['hero-pattern']?.Component;
  const PatternStarMap = transitionAdapters['pattern-star-map']?.Component;
  const StarMapAod = transitionAdapters['star-map-aod']?.Component;
  const navigationVisible = loaderHidden && navigationScene !== 'hero' && navigationScene !== 'pattern';

  useEffect(() => {
    const api = {
      snapshot: () => ({
        checkpoint: rootRef.current?.dataset.phoneCheckpoint,
        stageActive: runtime.stageActive,
        aodRun: runtime.aodRun,
        adapters: loadedPhoneAdapters()
      })
    };
    window.__phoneStory = api;
    return () => {
      if (window.__phoneStory === api) delete window.__phoneStory;
    };
  }, [runtime.aodRun, runtime.stageActive]);

  return (
    <main
      ref={rootRef}
      className="phone-story-shell"
      data-phone-story-shell="true"
      data-phone-validation-mode={validationMode}
      data-phone-motion={reducedMotion ? 'reduce' : 'force'}
      data-phone-checkpoint={loaderHidden ? undefined : 'loader'}
    >
      {!loaderHidden && (
        <StoryLoader
          mode={reducedMotion ? 'reduced' : 'cold-hero'}
          ready={heroReady}
          failed={false}
          onHidden={() => {
            markPhoneLoaderCompletedInDocument();
            setLoaderHidden(true);
          }}
        />
      )}
      <PhoneStageRail railRef={railRef} stageRef={stageRef} stageActive={runtime.stageActive}>
        {Hero && <Hero ref={heroRef} active={false} reducedMotion={reducedMotion} onReady={markHeroReady} />}
        {Pattern && <Pattern ref={patternRef} active={false} reducedMotion={reducedMotion} />}
        {StarMap && <StarMap ref={starMapRef} active={false} reducedMotion={reducedMotion} />}
        {Aod && <Aod ref={aodRef} active={false} reducedMotion={reducedMotion} onAodProgress={runtime.onAodProgress} onAodComplete={runtime.onAodComplete} />}
        {HeroPattern && <HeroPattern ref={heroPatternRef} host={stageRef.current} from={heroRef.current?.root() ?? null} to={patternRef.current?.root() ?? null} reducedMotion={reducedMotion} />}
        {PatternStarMap && <PatternStarMap ref={patternStarMapRef} host={stageRef.current} from={patternRef.current?.root() ?? null} to={starMapRef.current?.root() ?? null} reducedMotion={reducedMotion} />}
        {StarMapAod && <StarMapAod ref={starMapAodRef} host={stageRef.current} from={starMapRef.current?.root() ?? null} to={aodRef.current?.root() ?? null} reducedMotion={reducedMotion} />}
      </PhoneStageRail>
      {Method && <Method ref={methodRef} active={true} reducedMotion={reducedMotion} />}
      <Suspense fallback={null}>
        <StoryNav
          currentScene={navigationScene}
          visible={navigationVisible}
          menuOpen={menuOpen}
          menuItems={PHONE_MENU_ITEMS}
          showCta={false}
          onToggleMenu={() => setMenuOpen((open) => !open)}
          onNavigate={navigate}
        />
      </Suspense>
    </main>
  );
}

declare global {
  interface Window {
    __phoneStory?: {
      snapshot(): Readonly<{
        checkpoint?: string | undefined;
        stageActive: boolean;
        aodRun: string;
        adapters: ReturnType<typeof loadedPhoneAdapters>;
      }>;
    };
  }
}

export default PhoneStoryShell;
