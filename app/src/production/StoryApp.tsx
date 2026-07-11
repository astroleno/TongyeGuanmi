import {
  useCallback,
  useEffect,
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
import { storyManifest } from '../story/manifest';
import { HandleRegistry } from '../story/registry';
import type {
  DirectorSeekSource,
  LayerVisibilityState,
  SceneId,
  SceneModule,
  SegmentId
} from '../story/types';
import { attachStoryInput } from './input-controller';
import {
  loadSceneModule,
  loadTransitionModule,
  loadedProductionModules
} from './module-loaders';
import {
  hashForScene,
  publicMenuItems,
  sceneFromHash,
  sceneLabel
} from './navigation';

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
  const pendingHistorySceneRef = useRef<SceneId | undefined>(undefined);
  const navigationRequestRef = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(detectReducedMotion);
  const [bootError, setBootError] = useState<string>();

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
      waitForTargetReady: async ({ targetScene, segment }) => {
        await ensureSceneRef.current?.(targetScene);
        const timeoutMs = segment.buildTimeoutMs ?? storyManifest.defaults.buildTimeoutMs;
        const startedAt = Date.now();
        while (!registry.isTargetReady(targetScene)) {
          if (Date.now() - startedAt >= timeoutMs) {
            throw new Error(`targetReady timed out for ${targetScene}`);
          }
          await wait(16);
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
  }, [ensureWindow, runtime]);

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
          runtime.send({ type: 'BOOT_READY' });
        }
      })
      .catch((error: unknown) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
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
    document.documentElement.dataset.storyHydrated = 'true';
    if (lastCommittedSceneRef.current !== scene) {
      lastCommittedSceneRef.current = scene;
      const location = scene === 'hero' && window.location.hash === ''
        ? `${window.location.pathname}${window.location.search}`
        : hashForScene(scene);
      window.history.replaceState({ scene }, '', location);
      focusSceneHeading(scene);
    }
    const sceneIndex = storyManifest.nodes.findIndex(
      (node) => node.kind === 'hold' && node.scene === scene
    );
    const next = storyManifest.nodes[sceneIndex + 1];
    if (next?.kind === 'segment') {
      void loadTransitionModule(next.id).catch(() => undefined);
    }
  }, [ensureWindow, layerStore, runtime, runtimeSnapshot]);

  useEffect(() => attachStoryInput({
    runtime,
    getCurrentScene: () => runtime.getState().context.layerWindow.current,
    getLayerElement: (scene) => layerStore.getLayer(scene)?.element
      ?? document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`)
  }), [layerStore, runtime]);

  useEffect(() => {
    const onHistoryNavigation = () => {
      const scene = sceneFromHash(window.location.hash);
      if (!scene || pendingHistorySceneRef.current === scene) {
        return;
      }
      const current = runtime.getState();
      if (current.state === 'hold' && current.context.layerWindow.current === scene) {
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
  }, [navigate, runtime]);

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
  const currentScene = runtimeSnapshot.context.layerWindow.current;

  const readSnapshot = useCallback((): StoryAppSnapshot => {
    const layers = [...document.querySelectorAll<HTMLElement>('[data-stage-layer]')];
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-stage-layer] canvas')];
    const videos = [...document.querySelectorAll<HTMLVideoElement>('[data-stage-layer] video')];
    const loaded = loadedProductionModules();
    const lastError = runtime.getState().context.lastError ?? (bootError ? new Error(bootError) : undefined);
    return {
      phase: String(runtime.getState().state),
      current: runtime.getState().context.layerWindow.current,
      layerWindow: runtime.getState().context.layerWindow,
      virtualProgress: runtime.getState().virtualProgress,
      visibleLayers: layers.filter((layer) => layer.dataset.visible === 'true').length,
      interactableLayers: layers.filter((layer) => layer.dataset.interactable === 'true').length,
      mountedLayers: layers.length,
      canvases: canvases.length,
      webglCanvases: canvases.filter((canvas) => canvas.matches('[data-r4-ink-renderer], [data-aod-ink-canvas]')).length,
      videos: videos.length,
      playingVideos: videos.filter((video) => !video.paused).length,
      loadedScenes: loaded.scenes,
      loadedTransitions: loaded.transitions,
      lifecycle: { ...lifecycleRef.current },
      reducedMotion: detectReducedMotion(),
      ...(lastError ? { lastError: lastError.message } : {})
    };
  }, [bootError, runtime]);

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

  return (
    <div
      className="story-app"
      data-production-story-app="true"
      data-phase={String(runtimeSnapshot.state)}
      data-reduced-motion={String(reducedMotion)}
    >
      <Stage
        window={runtimeSnapshot.context.layerWindow}
        modules={modules}
        registry={registry}
        visibilityByScene={layerSnapshot.visibilityByScene}
        copyCueScene={copyCueScene}
        onLayerElement={handleLayerElement}
        onSceneMount={handleSceneMount}
        onSceneDispose={handleSceneDispose}
      />

      <header className="story-nav" data-menu-open={String(menuOpen)}>
        <a
          className="story-nav__brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            void navigate('hero');
          }}
        >
          同野观幂
        </a>
        <button
          className="story-nav__toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="story-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          菜单
        </button>
        <nav id="story-menu" className="story-nav__menu" aria-label="章节导航">
          {publicMenuItems.map((item) => (
            <a
              key={item.hash}
              href={item.hash}
              aria-current={currentScene === item.scene ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                void navigate(item.scene);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <div
        className="story-progress"
        role="progressbar"
        aria-label="故事进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(runtimeSnapshot.virtualProgress * 100)}
      >
        <span style={{ transform: `scaleX(${runtimeSnapshot.virtualProgress})` }} />
      </div>
      <p className="story-status" aria-live="polite">
        {bootError ? `媒体恢复：${bootError}` : `${currentScene} · ${String(runtimeSnapshot.state)}`}
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
