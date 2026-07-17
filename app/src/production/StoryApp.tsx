import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';
import { createDirectorRuntime } from '../runtime/director.actor';
import { canUseDOM } from '../runtime/browser-guard';
import {
  findMediaElementByKey,
  prepareTimeoutForManifest,
  waitForRequiredMediaReady
} from '../runtime/media-ready';
import { Stage } from '../stage/Stage';
import { LayerStore } from '../stage/LayerStore';
import { createLayerWindow, type LayerWindowSnapshot } from '../stage/LayerWindow';
import { hiddenVisibility, holdVisibility } from '../pilot/visibility';
import { positionReadingAtEdge, readingScrollport } from '../stage/reading';
import { storyManifest } from '../story/manifest';
import { HandleRegistry } from '../story/registry';
import type {
  DirectorSeekSource,
  HeroIntroMode,
  LayerVisibilityState,
  SceneId,
  SceneModule,
  SegmentId
} from '../story/types';
import {
  StoryLoader,
  type StoryLoaderExitReason,
  type StoryLoaderMode,
  type StoryLoaderStatus
} from './StoryLoader';
import {
  loadSceneModule,
  loadTransitionModule,
  loadedProductionModules
} from './module-loaders';
import {
  figure2ProofPanelFromHash,
  hashForScene,
  sceneFromHash,
  sceneLabel
} from './navigation';
import { positionCurrentProofHistoryAlias, positionProofAlias } from './proof-alias-navigation';
import { scheduleAdjacentPrewarm } from './adjacent-prewarm';
import { unlockStoryMedia } from './mobile-media-unlock';
import { loadInputController, prewarmInputController } from './input-controller-loader';
import { MobileLandscapeGate, useMobileLandscapeEntry } from './MobileLandscapeGate';
import type { MobileLandscapeEntryState } from './mobile-landscape-entry';

const StoryNav = lazy(() => import('./StoryNav').then(({ StoryNav: Component }) => ({ default: Component })));

type LifecycleMetrics = {
  mounted: number;
  disposed: number;
  releasedCanvases: number;
  releasedVideos: number;
};

export type StoryAppSnapshot = {
  phase: string;
  current: SceneId;
  layerWindow: LayerWindowSnapshot;
  virtualProgress: number;
  visibleLayers: number;
  interactableLayers: number;
  mountedLayers: number;
  canvases: number;
  webglCanvases: number;
  videos: number;
  playingVideos: number;
  loadedScenes: readonly SceneId[];
  loadedTransitions: readonly SegmentId[];
  lifecycle: LifecycleMetrics;
  reducedMotion: boolean;
  loaderMode: StoryLoaderMode;
  loaderStatus: StoryLoaderStatus;
  heroIntroMode: HeroIntroMode;
  presentationReady: boolean;
  mobileLandscapeState: MobileLandscapeEntryState;
  experienceInteractive: boolean;
  recovery?: {
    scope: 'boot' | 'segment';
    status: 'fallback' | 'recovering' | 'failed';
    segment?: SegmentId;
    direction?: 1 | -1;
    endpoint?: SceneId;
  };
  lastError?: string;
};

export type StoryAppApi = {
  navigate(scene: SceneId, source?: DirectorSeekSource): Promise<void>;
  snapshot(): StoryAppSnapshot;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function memberScenes(window: LayerWindowSnapshot): SceneId[] {
  return [window.prev, window.current, window.next, ...window.retiring]
    .filter((scene): scene is SceneId => Boolean(scene));
}

function holdVisibilityForWindow(window: LayerWindowSnapshot): Partial<Record<SceneId, LayerVisibilityState>> {
  const visibility = Object.fromEntries(
    memberScenes(window).map((scene) => [scene, hiddenVisibility()])
  ) as Partial<Record<SceneId, LayerVisibilityState>>;
  visibility[window.current] = holdVisibility(true);
  return visibility;
}

function detectReducedMotion(): boolean {
  return canUseDOM() && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function initialScene(): SceneId {
  return canUseDOM() ? sceneFromHash(window.location.hash) ?? 'hero' : 'hero';
}

function segmentCopyCueScene(
  segmentId: SegmentId | undefined,
  visibility: Readonly<Partial<Record<SceneId, LayerVisibilityState>>>
): SceneId | undefined {
  if (!segmentId) {
    return undefined;
  }
  const segment = storyManifest.nodes.find((node) => node.kind === 'segment' && node.id === segmentId);
  const target = segment?.kind === 'segment' ? segment.copyCue?.targetScene : undefined;
  return target && (visibility[target]?.opacity ?? 0) > 0.001 ? target : undefined;
}

function focusSceneHeading(scene: SceneId): void {
  window.requestAnimationFrame(() => {
    const layer = document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`);
    const heading = layer?.querySelector<HTMLElement>('h1, h2, [role="heading"]');
    if (!heading) {
      return;
    }
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  });
}

export function StoryApp() {
  const initialSceneRef = useRef<SceneId>(initialScene());
  const initialReducedMotionRef = useRef(detectReducedMotion());
  const registry = useMemo(() => new HandleRegistry(), []);
  const layerStore = useMemo(
    () => new LayerStore(holdVisibilityForWindow(createLayerWindow(initialSceneRef.current))),
    []
  );
  const [modules, setModules] = useState<Partial<Record<SceneId, SceneModule>>>({});
  const modulesRef = useRef(modules);
  const ensureSceneRef = useRef<((scene: SceneId) => Promise<SceneModule>) | undefined>(undefined);
  const lifecycleRef = useRef<LifecycleMetrics>({
    mounted: 0,
    disposed: 0,
    releasedCanvases: 0,
    releasedVideos: 0
  });
  const lastCommittedSceneRef = useRef<SceneId | undefined>(undefined);
  const lastFocusedSceneRef = useRef<SceneId | undefined>(undefined);
  const appliedReadingEntryTokenRef = useRef<number | undefined>(undefined);
  const pendingHistorySceneRef = useRef<SceneId | undefined>(undefined);
  const navigationRequestRef = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotionRef.current);
  const [bootError, setBootError] = useState<string>();
  const [bootFailed, setBootFailed] = useState(false);
  const [loaderStatus, setLoaderStatus] = useState<StoryLoaderStatus>('running');
  const [loaderExitReason, setLoaderExitReason] = useState<StoryLoaderExitReason>();
  const [heroIntroMode, setHeroIntroMode] = useState<HeroIntroMode>(
    initialSceneRef.current === 'hero' && !initialReducedMotionRef.current ? 'waiting' : 'endpoint'
  );
  const [presentationReady, setPresentationReady] = useState(false);
  const loaderHiddenReasonRef = useRef<StoryLoaderExitReason | undefined>(undefined);
  const mobileLandscape = useMobileLandscapeEntry();
  const landscapeGateStarted = mobileLandscape.started;
  const startMobileLandscapeExperience = () => {
    unlockStoryMedia();
    mobileLandscape.start();
  };
  const experienceInteractive = presentationReady
    && landscapeGateStarted
    && mobileLandscape.landscapeCurrentlyAllowed
    && !bootFailed;

  const runtime = useMemo(() => createDirectorRuntime({
    actorEpoch: 'production-story',
    autoStart: false,
    initialScene: initialSceneRef.current,
    manifest: storyManifest,
    prepareTimeoutMs: prepareTimeoutForManifest(storyManifest),
    stage: layerStore,
    transitions: {},
    transitionLoader: loadTransitionModule,
    useSyntheticTransitions: false,
    prefersReducedMotion: detectReducedMotion,
    readyGate: {
      waitForTargetReady: async ({ targetScene, segment, direction }) => {
        await ensureSceneRef.current?.(targetScene);
        const timeoutMs = segment.buildTimeoutMs ?? storyManifest.defaults.buildTimeoutMs;
        const startedAt = Date.now();
        while (!registry.isTargetReady(targetScene)) {
          if (Date.now() - startedAt >= timeoutMs) {
            throw new Error(`targetReady timed out for ${targetScene}`);
          }
          await wait(16);
        }
        const targetLayer = layerStore.getLayer(targetScene)?.element
          ?? document.querySelector<HTMLElement>(`[data-stage-layer="${targetScene}"]`);
        if (readingScrollport(targetLayer)) {
          positionReadingAtEdge(targetLayer, direction === 1 ? 'top' : 'bottom');
        }
      },
      waitForMediaReady: ({ segment, prepareToken, direction }) =>
        waitForRequiredMediaReady({
          segment,
          prepareToken,
          direction,
          registry,
          getMediaElement: (key) => findMediaElementByKey(layerStore.boundElements(), key)
        }),
      beginBuild: ({ segment, prepareToken, prepareRunId }) => {
        registry.beginBuildGate(segment.id, { prepareToken, runId: prepareRunId });
      },
      reportBuildReady: ({ segment, prepareToken, prepareRunId }) =>
        registry.reportBuildReady(segment.id, { prepareToken, runId: prepareRunId }).accepted
    },
    ringBufferSize: 480
  }), [layerStore, registry]);

  const runtimeSnapshot = useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);
  const layerSnapshot = useSyncExternalStore(layerStore.subscribe, layerStore.getSnapshot, layerStore.getSnapshot);
  const currentScene = runtimeSnapshot.context.layerWindow.current;
  const loaderMode: StoryLoaderMode = reducedMotion
    ? 'reduced'
    : initialSceneRef.current === 'hero'
      ? 'cold-hero'
      : 'direct';
  const loaderReady = runtimeSnapshot.state === 'hold' && !bootFailed;

  const handleHeroIntroComplete = useCallback(() => {
    setHeroIntroMode('complete');
    setPresentationReady(true);
  }, []);

  const handleLoaderHidden = useCallback((reason: StoryLoaderExitReason) => {
    if (loaderHiddenReasonRef.current) {
      return;
    }
    loaderHiddenReasonRef.current = reason;
    // StoryLoader marks its own `hidden` state and invokes this callback in
    // the same timer turn. Mirror that terminal state before publishing
    // presentation readiness so snapshots cannot expose an interactive story
    // while still reporting the previous `exiting` loader status.
    setLoaderStatus('hidden');
    setLoaderExitReason(reason);
    if (reason === 'error' || bootFailed) {
      setHeroIntroMode('endpoint');
      return;
    }
    if (runtime.getState().state !== 'hold') {
      return;
    }
    if (initialSceneRef.current === 'hero' && !reducedMotion && reason === 'ready') {
      setHeroIntroMode('running');
      return;
    }
    setHeroIntroMode('endpoint');
    setPresentationReady(true);
  }, [bootFailed, reducedMotion, runtime]);

  const presentationByScene = useMemo(() => ({
    hero: {
      heroIntroMode,
      reducedMotion,
      onHeroIntroComplete: handleHeroIntroComplete
    }
  }), [handleHeroIntroComplete, heroIntroMode, reducedMotion]);

  const ensureScene = useCallback(async (scene: SceneId) => {
    const existing = modulesRef.current[scene];
    if (existing) {
      return existing;
    }
    const module = await loadSceneModule(scene);
    registry.registerScene(module);
    await registry.startPreload(scene, module.preload);
    if (!modulesRef.current[scene]) {
      const next = { ...modulesRef.current, [scene]: module };
      modulesRef.current = next;
      setModules(next);
    }
    return module;
  }, [registry]);
  ensureSceneRef.current = ensureScene;

  const ensureWindow = useCallback(async (window: LayerWindowSnapshot) => {
    await Promise.all(memberScenes(window).map(ensureScene));
  }, [ensureScene]);

  const navigate = useCallback(async (
    scene: SceneId,
    source: DirectorSeekSource = 'menu',
    historyMode: 'push' | 'none' = 'push'
  ) => {
    if (!experienceInteractive) {
      return;
    }
    const request = ++navigationRequestRef.current;
    try {
      await ensureWindow(createLayerWindow(scene));
    } catch (error: unknown) {
      if (request === navigationRequestRef.current) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        setBootError(`Unable to load ${scene}: ${normalized.message}`);
      }
      return;
    }
    if (request !== navigationRequestRef.current) {
      return;
    }
    setBootError(undefined);
    if (historyMode === 'push') {
      window.history.pushState({ scene }, '', hashForScene(scene));
    }
    runtime.send({ type: 'SEEK', label: sceneLabel(scene), source });
    setMenuOpen(false);
  }, [ensureWindow, experienceInteractive, runtime]);

  useEffect(() => {
    runtime.start();
    let cancelled = false;
    const bootWindow = runtime.getState().context.layerWindow;
    void ensureScene(bootWindow.current)
      .then(async () => {
        while (!cancelled && !registry.isTargetReady(bootWindow.current)) {
          await wait(16);
        }
        if (!cancelled) {
          setBootFailed(false);
          runtime.send({ type: 'BOOT_READY' });
        }
      })
      .catch((error: unknown) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        setBootFailed(true);
        setBootError(normalized.message);
        runtime.send({ type: 'BOOT_FAILED', error: normalized });
      });

    return () => {
      cancelled = true;
      runtime.stop();
    };
  }, [ensureScene, registry, runtime]);

  useEffect(() => {
    const snapshot = runtimeSnapshot;
    void ensureWindow(snapshot.context.layerWindow).catch((error: unknown) => {
      const normalized = error instanceof Error ? error : new Error(String(error));
      setBootError(normalized.message);
      runtime.send({ type: 'BOOT_FAILED', error: normalized });
    });
    if (snapshot.state !== 'hold' || snapshot.context.cursor.status !== 'hold') {
      return;
    }
    const scene = snapshot.context.cursor.scene;
    layerStore.replaceVisibility(holdVisibilityForWindow(snapshot.context.layerWindow));
    if (bootFailed) {
      delete document.documentElement.dataset.storyHydrated;
    } else {
      document.documentElement.dataset.storyHydrated = 'true';
    }
    if (lastCommittedSceneRef.current !== scene) {
      lastCommittedSceneRef.current = scene;
      const location = scene === 'hero' && window.location.hash === ''
        ? `${window.location.pathname}${window.location.search}`
        : hashForScene(scene);
      window.history.replaceState({ scene }, '', location);
    }
    const sceneIndex = storyManifest.nodes.findIndex(
      (node) => node.kind === 'hold' && node.scene === scene
    );
    const next = storyManifest.nodes[sceneIndex + 1];
    if (next?.kind === 'segment') {
      const modulePromise = loadTransitionModule(next.id);
      void modulePromise.catch(() => undefined);
      if (experienceInteractive) {
        return scheduleAdjacentPrewarm(async () => {
          const module = await modulePromise;
          // Holds mount their DOM before SegmentPlayer has any reason to make
          // layer handles. Resolving those passive handles here gives idle
          // warmup the live endpoints without changing their visibility or
          // acquiring a transition run.
          const from = layerStore.ensureLayer(next.from, 'current');
          const to = layerStore.ensureLayer(next.to, 'next');
          if (!from.element || !to.element) {
            return;
          }
          await module.prewarm?.({
            segment: next,
            stage: layerStore,
            from,
            to,
            direction: 1,
            prefersReducedMotion: reducedMotion
          });
        });
      }
    }
  }, [ensureWindow, experienceInteractive, layerStore, reducedMotion, runtime, runtimeSnapshot]);

  useEffect(() => {
    if (
      loaderStatus !== 'hidden'
      || loaderExitReason !== 'safety'
      || runtimeSnapshot.state !== 'hold'
      || bootFailed
      || presentationReady
    ) {
      return;
    }
    setHeroIntroMode('endpoint');
    setPresentationReady(true);
  }, [bootFailed, loaderExitReason, loaderStatus, presentationReady, runtimeSnapshot.state]);

  useEffect(() => {
    if (
      !experienceInteractive
      || runtimeSnapshot.state !== 'hold'
      || runtimeSnapshot.context.cursor.status !== 'hold'
      || lastFocusedSceneRef.current === currentScene
    ) {
      return;
    }
    lastFocusedSceneRef.current = currentScene;
    focusSceneHeading(currentScene);
  }, [currentScene, experienceInteractive, runtimeSnapshot]);

  useLayoutEffect(() => {
    if (runtimeSnapshot.state !== 'hold' || runtimeSnapshot.context.cursor.status !== 'hold') {
      return;
    }
    const entry = runtimeSnapshot.context.holdEntry;
    const scene = runtimeSnapshot.context.cursor.scene;
    if (
      entry.scene !== scene
      || appliedReadingEntryTokenRef.current === entry.token
    ) {
      return;
    }
    const layer = layerStore.getLayer(scene)?.element
      ?? document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`);
    if (!readingScrollport(layer)) {
      appliedReadingEntryTokenRef.current = entry.token;
      return;
    }
    const proofPanel = scene === 'figure2-proof'
      ? figure2ProofPanelFromHash(window.location.hash)
      : undefined;
    const mountedEdge = proofPanel
      ? positionProofAlias(layer, proofPanel)
      : (positionReadingAtEdge(layer, entry.edge), entry.edge);
    appliedReadingEntryTokenRef.current = entry.token;
    window.dispatchEvent(mountedEdge
      ? new CustomEvent('story-reading-entry', {
          detail: { ...entry, edge: mountedEdge }
        })
      : new Event('story-reading-entry'));
  }, [layerStore, runtimeSnapshot]);

  useEffect(() => {
    if (bootFailed || experienceInteractive) {
      return;
    }
    // Fetch during the Loader or the phone landscape gate. The separate
    // interaction effect below remains the sole place that attaches listeners.
    prewarmInputController();
  }, [bootFailed, experienceInteractive]);

  useEffect(() => {
    if (!experienceInteractive) {
      return;
    }
    let active = true;
    let detach: (() => void) | undefined;
    void loadInputController().then(({ attachStoryInput }) => {
      if (!active) {
        return;
      }
      detach = attachStoryInput({
        runtime,
        getCurrentScene: () => runtime.getState().context.layerWindow.current,
        getLayerElement: (scene) => layerStore.getLayer(scene)?.element
          ?? document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`)
      });
    }).catch((error: unknown) => {
      if (active) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        setBootError(`Unable to attach story input: ${normalized.message}`);
      }
    });
    return () => {
      active = false;
      detach?.();
    };
  }, [experienceInteractive, layerStore, runtime]);

  useEffect(() => {
    const onHistoryNavigation = () => {
      const scene = sceneFromHash(window.location.hash);
      if (!scene || pendingHistorySceneRef.current === scene) {
        return;
      }
      const current = runtime.getState();
      if (current.state === 'hold' && current.context.layerWindow.current === scene) {
        const layer = layerStore.getLayer(scene)?.element
          ?? document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`);
        const alias = positionCurrentProofHistoryAlias(layer, scene, window.location.hash);
        if (alias) {
          const entry = current.context.holdEntry;
          window.dispatchEvent(alias.edge
            ? new CustomEvent('story-reading-entry', {
                detail: { ...entry, edge: alias.edge, source: 'history' }
              })
            : new Event('story-reading-entry'));
        }
        return;
      }
      pendingHistorySceneRef.current = scene;
      void navigate(scene, 'history', 'none').finally(() => {
        if (pendingHistorySceneRef.current === scene) {
          pendingHistorySceneRef.current = undefined;
        }
      });
    };
    window.addEventListener('popstate', onHistoryNavigation);
    window.addEventListener('hashchange', onHistoryNavigation);
    return () => {
      window.removeEventListener('popstate', onHistoryNavigation);
      window.removeEventListener('hashchange', onHistoryNavigation);
    };
  }, [layerStore, navigate, runtime]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const copyCueScene = segmentCopyCueScene(
    runtimeSnapshot.context.activeSegment ?? runtimeSnapshot.context.settlingSegment,
    layerSnapshot.visibilityByScene
  );

  const readSnapshot = useCallback((): StoryAppSnapshot => {
    const layers = [...document.querySelectorAll<HTMLElement>('[data-stage-layer]')];
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-stage-layer] canvas')];
    const videos = [...document.querySelectorAll<HTMLVideoElement>('[data-stage-layer] video')];
    const loaded = loadedProductionModules();
    const context = runtime.getState().context;
    const recovery = context.recovery;
    const lastError = context.lastError ?? (bootError ? new Error(bootError) : undefined);
    return {
      phase: String(runtime.getState().state),
      current: runtime.getState().context.layerWindow.current,
      layerWindow: runtime.getState().context.layerWindow,
      virtualProgress: runtime.getState().virtualProgress,
      visibleLayers: layers.filter((layer) => layer.dataset.visible === 'true').length,
      interactableLayers: layers.filter((layer) => layer.dataset.interactable === 'true').length,
      mountedLayers: layers.length,
      canvases: canvases.length,
      webglCanvases: canvases.filter((canvas) => canvas.matches('[data-r4-ink-renderer-status], [data-aod-ink-canvas]')).length,
      videos: videos.length,
      playingVideos: videos.filter((video) => !video.paused).length,
      loadedScenes: loaded.scenes,
      loadedTransitions: loaded.transitions,
      lifecycle: { ...lifecycleRef.current },
      reducedMotion: detectReducedMotion(),
      loaderMode,
      loaderStatus,
      heroIntroMode,
      presentationReady,
      mobileLandscapeState: mobileLandscape.state,
      experienceInteractive,
      ...(recovery
        ? {
            recovery: {
              scope: recovery.scope,
              status: recovery.status,
              ...(recovery.scope === 'segment'
                ? {
                    segment: recovery.segment,
                    direction: recovery.direction,
                    endpoint: recovery.endpoint
                  }
                : {})
            }
          }
        : {}),
      ...(lastError ? { lastError: lastError.message } : {})
    };
  }, [
    bootError,
    experienceInteractive,
    heroIntroMode,
    loaderMode,
    loaderStatus,
    mobileLandscape.state,
    presentationReady,
    runtime
  ]);

  const handleLayerElement = useCallback((scene: SceneId, element: HTMLElement | null) => {
    layerStore.bindElement(scene, element);
  }, [layerStore]);

  const handleSceneMount = useCallback(() => {
    lifecycleRef.current.mounted += 1;
  }, []);

  const handleSceneDispose = useCallback((_scene: SceneId, resources: { canvases: number; videos: number }) => {
    lifecycleRef.current.disposed += 1;
    lifecycleRef.current.releasedCanvases += resources.canvases;
    lifecycleRef.current.releasedVideos += resources.videos;
  }, []);

  useEffect(() => {
    const api: StoryAppApi = {
      navigate: (scene, source = 'menu') => navigate(scene, source),
      snapshot: readSnapshot
    };
    window.__story = runtime;
    window.__storyApp = api;
    return () => {
      if (window.__story === runtime) {
        delete window.__story;
      }
      if (window.__storyApp === api) {
        delete window.__storyApp;
      }
    };
  }, [navigate, readSnapshot, runtime]);

  const navigationSegment = runtimeSnapshot.context.activeSegment
    ?? runtimeSnapshot.context.pendingSegment
    ?? runtimeSnapshot.context.settlingSegment;
  const navigationDirection = runtimeSnapshot.context.activeDirection
    ?? runtimeSnapshot.context.pendingDirection
    ?? (runtimeSnapshot.context.settlingTarget === 'star-map' ? 1 : undefined)
    ?? (runtimeSnapshot.context.settlingTarget === 'pattern' ? -1 : undefined);
  const navVisible = experienceInteractive
    && navigationSegment !== 'hero-pattern'
    && (navigationSegment === 'pattern-star-map'
      ? runtimeSnapshot.state !== 'preparing' && navigationDirection === 1
      : currentScene !== 'hero' && currentScene !== 'pattern');

  useEffect(() => {
    if (!navVisible) {
      setMenuOpen(false);
    }
  }, [navVisible]);

  return (
    <div
      className="story-app"
      data-production-story-app="true"
      data-phase={String(runtimeSnapshot.state)}
      data-reduced-motion={String(reducedMotion)}
      data-loader-status={loaderStatus}
      data-hero-intro={heroIntroMode}
      data-presentation-ready={String(presentationReady)}
      data-mobile-landscape-state={mobileLandscape.state}
      data-experience-interactive={String(experienceInteractive)}
      data-recovery-scope={runtimeSnapshot.context.recovery?.scope}
      data-recovery-status={runtimeSnapshot.context.recovery?.status}
      data-recovery-segment={runtimeSnapshot.context.recovery?.scope === 'segment'
        ? runtimeSnapshot.context.recovery.segment
        : undefined}
      data-recovery-direction={runtimeSnapshot.context.recovery?.scope === 'segment'
        ? runtimeSnapshot.context.recovery.direction
        : undefined}
    >
      <StoryLoader
        mode={loaderMode}
        ready={loaderReady}
        failed={bootFailed}
        release={landscapeGateStarted}
        onStatusChange={setLoaderStatus}
        onHidden={handleLoaderHidden}
      />
      <MobileLandscapeGate state={mobileLandscape.state} onStart={startMobileLandscapeExperience} />
      <Stage
        window={runtimeSnapshot.context.layerWindow}
        modules={modules}
        registry={registry}
        visibilityByScene={layerSnapshot.visibilityByScene}
        copyCueScene={copyCueScene}
        presentationByScene={presentationByScene}
        interactive={experienceInteractive}
        onLayerElement={handleLayerElement}
        onSceneMount={handleSceneMount}
        onSceneDispose={handleSceneDispose}
      />

      <Suspense fallback={null}>
        <StoryNav
          currentScene={currentScene}
          visible={navVisible}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((open) => !open)}
          onNavigate={(scene) => void navigate(scene)}
        />
      </Suspense>

      <p className="story-status" aria-live="polite">
        {bootError
          ? `媒体恢复：${bootError}`
          : runtimeSnapshot.context.recovery?.scope === 'segment'
            ? runtimeSnapshot.context.recovery.status === 'failed'
              ? `${currentScene} · 局部恢复失败，可重试`
              : `${currentScene} · 正在恢复相邻场景`
            : `${currentScene} · ${String(runtimeSnapshot.state)}`}
      </p>
    </div>
  );
}

declare global {
  interface Window {
    __story?: ReturnType<typeof createDirectorRuntime>;
    __storyApp?: StoryAppApi;
  }
}
