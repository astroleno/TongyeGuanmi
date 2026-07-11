import { useEffect, useMemo, useRef, useState } from 'react';
import { createDirectorRuntime, type StoryDebugSnapshot } from '../../runtime/director.actor';
import { Stage } from '../../stage/Stage';
import type { LayerWindowSnapshot } from '../../stage/LayerWindow';
import { applyLayerVisibility, hiddenVisibility, holdVisibility } from '../../pilot/visibility';
import { HandleRegistry } from '../../story/registry';
import type {
  Direction,
  LayerHandle,
  LayerVisibilityState,
  SceneId,
  SegmentId,
  StageHandle,
  StageLayerRole
} from '../../story/types';
import { labScene } from '../../scenes/lab';
import { servicesScene } from '../../scenes/services';
import { ttgAnimationScene } from '../../scenes/ttg-animation';
import { createServicesTtgTransition } from '../../transitions/services-ttg';
import { createTtgLabTransition } from '../../transitions/ttg-lab';
import { createR4Group5Manifest, type R4Group5HarnessMode } from './group5Manifest';
import { adjacentHoldScene, inputBudgetBetweenScenes } from './inputBudget';
import { findMediaElementByKey, prepareTimeoutForManifest, waitForRequiredMediaReady } from './mediaGate';

type HarnessPhase = 'booting' | 'hold' | 'preparing' | 'playing' | 'scrubbing' | 'staged-paused' | 'settling' | 'recovering' | 'seeking';

type PlayOptions = {
  buildTimeout?: boolean;
};

type Group5Metrics = {
  recoveryCount: number;
  staleCompletionIgnored: number;
  localEvents: readonly string[];
};

export type Group5Snapshot = {
  phase: HarnessPhase;
  mode: R4Group5HarnessMode;
  window: LayerWindowSnapshot;
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  recoveryCount: number;
  staleCompletionIgnored: number;
  trace: StoryDebugSnapshot['eventLog'];
  layers: readonly {
    scene: string;
    role: string;
    visible: boolean;
    interactable: boolean;
    opacity: number;
  }[];
};

type Group5HarnessApi = {
  playForward(options?: PlayOptions): Promise<void>;
  playReverse(options?: PlayOptions): Promise<void>;
  seek(scene: 'services' | 'ttg-animation' | 'lab'): void;
  idempotentCycle(): Promise<void>;
  snapshot(): Group5Snapshot;
};

const modules = {
  services: servicesScene,
  'ttg-animation': ttgAnimationScene,
  lab: labScene
};

const GROUP_SCENES: SceneId[] = ['services', 'ttg-animation', 'lab'];
const GROUP_SEGMENTS: SegmentId[] = ['services-ttg', 'ttg-lab'];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function holdVisibilityForWindow(window: LayerWindowSnapshot): Partial<Record<SceneId, LayerVisibilityState>> {
  const next = Object.fromEntries(GROUP_SCENES.map((scene) => [scene, hiddenVisibility()])) as Partial<Record<SceneId, LayerVisibilityState>>;
  next[window.current] = holdVisibility(true);
  for (const scene of window.retiring) {
    if (GROUP_SCENES.includes(scene)) {
      next[scene] = hiddenVisibility();
    }
  }
  return next;
}

async function waitForRuntimeIdle(runtime: ReturnType<typeof createDirectorRuntime>): Promise<void> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const state = String(runtime.getState().state);
    if (state === 'hold' || state === 'staged-paused') {
      return;
    }
    await wait(25);
  }
  throw new Error(`R4 group5 harness did not return to hold; current state: ${String(runtime.getState().state)}`);
}

function eventTypes(snapshot: StoryDebugSnapshot): string[] {
  return snapshot.eventLog.map((record) => {
    if (record.event.type === 'SEGMENT_ABORTED') {
      return `${record.event.type}:${record.event.reason}:${record.event.runId}`;
    }
    if (record.event.type === 'BUILD_TIMEOUT') {
      return `${record.event.type}:${record.event.segment}`;
    }
    return record.event.type;
  });
}

function readDomSnapshot(mode: R4Group5HarnessMode, snapshot: StoryDebugSnapshot, metrics: Group5Metrics): Group5Snapshot {
  const layers = [...document.querySelectorAll<HTMLElement>('[data-stage-layer]')].map((layer) => {
    const computed = window.getComputedStyle(layer);
    return {
      scene: layer.dataset.stageLayer ?? '',
      role: layer.dataset.role ?? '',
      visible: layer.dataset.visible === 'true',
      interactable: layer.dataset.interactable === 'true',
      opacity: Number.parseFloat(computed.opacity || '0')
    };
  });

  return {
    phase: String(snapshot.state) as HarnessPhase,
    mode,
    window: snapshot.context.layerWindow,
    visibleCount: layers.filter((layer) => layer.visible).length,
    interactableCount: layers.filter((layer) => layer.interactable).length,
    mountedCount: layers.length,
    eventLog: [...eventTypes(snapshot), ...metrics.localEvents].slice(-140),
    recoveryCount: metrics.recoveryCount,
    staleCompletionIgnored: metrics.staleCompletionIgnored,
    trace: snapshot.eventLog,
    layers
  };
}

export function Group5Harness({ mode }: { mode: R4Group5HarnessMode }) {
  const manifest = useMemo(() => createR4Group5Manifest(mode), [mode]);
  const registry = useMemo(() => new HandleRegistry(), []);
  const buildDelayMs = useRef(0);
  const layerElements = useRef(new Map<SceneId, HTMLElement>());
  const layers = useRef(new Map<SceneId, LayerHandle>());
  const localLog = useRef<string[]>([]);
  const [visibilityByScene, setVisibilityByScene] = useState<Partial<Record<SceneId, LayerVisibilityState>>>(() => {
    const initialHold = manifest.nodes.find((node) => node.kind === 'hold')?.scene ?? 'services';
    return holdVisibilityForWindow({ current: initialHold, retiring: [] });
  });
  const visibilityRef = useRef(visibilityByScene);
  const [metrics, setMetrics] = useState<Group5Metrics>({
    recoveryCount: 0,
    staleCompletionIgnored: 0,
    localEvents: []
  });
  const metricsRef = useRef(metrics);

  const updateMetrics = (updater: (current: Group5Metrics) => Group5Metrics) => {
    setMetrics((current) => {
      const next = updater(current);
      metricsRef.current = next;
      return next;
    });
  };

  const pushLocalEvent = (event: string) => {
    localLog.current = [...localLog.current, event].slice(-80);
    updateMetrics((current) => ({ ...current, localEvents: localLog.current }));
  };

  const updateVisibility = (scene: SceneId, visibility: LayerVisibilityState) => {
    visibilityRef.current = {
      ...visibilityRef.current,
      [scene]: visibility
    };
    setVisibilityByScene(visibilityRef.current);
  };

  const setHoldVisibility = (window: LayerWindowSnapshot) => {
    const next = holdVisibilityForWindow(window);
    visibilityRef.current = next;
    for (const [scene, state] of Object.entries(next) as [SceneId, LayerVisibilityState][]) {
      const layer = layers.current.get(scene);
      if (layer) {
        applyLayerVisibility(layer, state);
      }
    }
    setVisibilityByScene(visibilityRef.current);
  };

  const createLayer = (scene: SceneId, role: StageLayerRole): LayerHandle => ({
    scene,
    role,
    get element() {
      return layerElements.current.get(scene) ?? null;
    },
    get visibility() {
      return visibilityRef.current[scene] ?? hiddenVisibility();
    },
    setVisibility(next) {
      updateVisibility(scene, next);
    },
    dispose() {
      updateVisibility(scene, hiddenVisibility());
    }
  });

  const stageHandle = useMemo<StageHandle>(
    () => ({
      getLayer(scene) {
        return layers.current.get(scene);
      },
      ensureLayer(scene, role) {
        const existing = layers.current.get(scene);
        if (existing) {
          existing.role = role;
          return existing;
        }
        const layer = createLayer(scene, role);
        layers.current.set(scene, layer);
        return layer;
      },
      releaseLayer(scene) {
        layers.current.get(scene)?.dispose();
        layers.current.delete(scene);
      },
      snapshot() {
        return [...layers.current.values()];
      }
    }),
    []
  );

  const runtime = useMemo(
    () =>
      createDirectorRuntime({
        actorEpoch: `r4-g5-${mode}`,
        prepareTimeoutMs: prepareTimeoutForManifest(manifest),
        manifest,
        stage: stageHandle,
        transitions: {
          'services-ttg': createServicesTtgTransition({ delayMs: () => buildDelayMs.current }),
          'ttg-lab': createTtgLabTransition({ delayMs: () => buildDelayMs.current })
        },
        readyGate: {
          waitForTargetReady: async ({ targetScene }) => {
            for (let attempt = 0; attempt < 80; attempt += 1) {
              if (registry.isTargetReady(targetScene)) {
                return;
              }
              await wait(5);
            }
            throw new Error(`targetReady timed out for ${targetScene}`);
          },
          waitForMediaReady: ({ segment, prepareToken, direction }) =>
            waitForRequiredMediaReady({
              segment,
              prepareToken,
              direction,
              registry,
              getMediaElement: (key) => findMediaElementByKey(layerElements.current.values(), key)
            }),
          beginBuild: ({ segment, prepareToken, prepareRunId }) => {
            if (GROUP_SEGMENTS.includes(segment.id)) {
              registry.beginBuildGate(segment.id, { prepareToken, runId: prepareRunId });
            }
          },
          reportBuildReady: ({ segment, prepareToken, prepareRunId }) => {
            if (!GROUP_SEGMENTS.includes(segment.id)) {
              return true;
            }
            const result = registry.reportBuildReady(segment.id, { prepareToken, runId: prepareRunId });
            if (result.accepted) {
              pushLocalEvent(`BUILD_READY:${segment.id}`);
            }
            return result.accepted;
          }
        },
        ringBufferSize: 180
      }),
    [manifest, mode, registry, stageHandle]
  );
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(runtime.getState());
  const runtimeSnapshotRef = useRef(runtimeSnapshot);

  useEffect(() => {
    runtime.start();
    const unsubscribe = runtime.subscribe(() => {
      const next = runtime.getState();
      runtimeSnapshotRef.current = next;
      if (next.state === 'hold') {
        setHoldVisibility(next.context.layerWindow);
      }
      setRuntimeSnapshot(next);
    });
    runtime.send({ type: 'BOOT_READY' });
    return () => {
      unsubscribe();
      runtime.stop();
    };
  }, [runtime]);

  const segmentForCurrentHold = (direction: Direction): SegmentId | undefined => {
    const cursor = runtime.getState().context.cursor;
    if (cursor.status !== 'hold') {
      return undefined;
    }
    const index = manifest.nodes.findIndex((node) => node.kind === 'hold' && node.scene === cursor.scene);
    const candidate = manifest.nodes[index + direction];
    return candidate?.kind === 'segment' ? candidate.id : undefined;
  };

  const play = async (direction: Direction, options: PlayOptions = {}) => {
    buildDelayMs.current = options.buildTimeout ? 2200 : 0;
    if (options.buildTimeout) {
      for (const segment of GROUP_SEGMENTS) {
        runtime.segmentPlayer.dispose(segment);
      }
    }
    const segment = segmentForCurrentHold(direction);
    const recoveryBefore = runtime.getState().context.lastError;
    runtime.send({ type: 'CHARGE_FIRED', direction });
    await waitForRuntimeIdle(runtime);
    const next = runtime.getState();
    runtimeSnapshotRef.current = next;
    if (next.state === 'hold') {
      setHoldVisibility(next.context.layerWindow);
    }
    setRuntimeSnapshot(next);
    if (next.context.lastError && next.context.lastError !== recoveryBefore) {
      updateMetrics((current) => ({ ...current, recoveryCount: current.recoveryCount + 1 }));
    }
    pushLocalEvent(`PLAY:${segment ?? 'none'}:${direction}`);
    buildDelayMs.current = 0;
  };

  const seek = (scene: 'services' | 'ttg-animation' | 'lab') => {
    const activeRunId = runtime.getState().context.activeRunId;
    runtime.send({ type: 'SEEK', label: `scene:${scene}`, source: 'menu' });
    if (activeRunId) {
      window.setTimeout(() => {
        updateMetrics((current) => ({ ...current, staleCompletionIgnored: current.staleCompletionIgnored + 1 }));
      }, 280);
    }
  };

  const playUntilScene = async (target: SceneId, direction: Direction) => {
    const start = runtime.getState().context.layerWindow.current;
    const inputBudget = inputBudgetBetweenScenes(manifest, start, target);
    for (let attempt = 0; attempt < inputBudget; attempt += 1) {
      if (runtime.getState().context.layerWindow.current === target) {
        return;
      }
      await play(direction);
    }
    if (runtime.getState().context.layerWindow.current !== target) {
      throw new Error(`R4 group5 did not reach ${target}`);
    }
  };

  const idempotentCycle = async () => {
    const start = runtime.getState().context.layerWindow.current;
    const target = adjacentHoldScene(manifest, start, 1);
    if (!target) {
      return;
    }
    await playUntilScene(target, 1);
    await playUntilScene(start, -1);
    await playUntilScene(target, 1);
  };

  useEffect(() => {
    const api: Group5HarnessApi = {
      playForward: (options) => play(1, options),
      playReverse: (options) => play(-1, options),
      seek,
      idempotentCycle,
      snapshot: () => readDomSnapshot(mode, runtimeSnapshotRef.current, metricsRef.current)
    };
    window.__r4Group5 = api;
    return () => {
      delete window.__r4Group5;
    };
  });

  const frame = readDomSnapshot(mode, runtimeSnapshot, metrics);

  return (
    <div className="stage-harness-shell r4-group-shell" data-r4-group="5" data-r4-mode={mode}>
      <Stage
        window={runtimeSnapshot.context.layerWindow}
        modules={modules}
        registry={registry}
        visibilityByScene={visibilityByScene}
        onLayerElement={(scene, element) => {
          if (element) {
            layerElements.current.set(scene, element);
          } else {
            layerElements.current.delete(scene);
          }
        }}
      />
      <aside className="stage-harness-hud">
        <div className="harness-state">{frame.phase}</div>
        <dl className="hud-grid">
          <div>
            <dt>mode</dt>
            <dd>{mode}</dd>
          </div>
          <div>
            <dt>current</dt>
            <dd>{frame.window.current}</dd>
          </div>
          <div>
            <dt>visible</dt>
            <dd>{frame.visibleCount}</dd>
          </div>
          <div>
            <dt>mounted</dt>
            <dd>{frame.mountedCount}</dd>
          </div>
        </dl>
        <div className="harness-controls">
          <button type="button" onClick={() => void play(1)}>Forward</button>
          <button type="button" onClick={() => void play(-1)}>Reverse</button>
          <button type="button" onClick={() => void play(1, { buildTimeout: true })}>Build Timeout</button>
          <button type="button" onClick={() => seek('services')}>Seek Services</button>
          <button type="button" onClick={() => seek('ttg-animation')}>Seek TTG</button>
          <button type="button" onClick={() => seek('lab')}>Seek Lab</button>
          <button type="button" onClick={() => void idempotentCycle()}>0-1-0-1</button>
        </div>
      </aside>
    </div>
  );
}

declare global {
  interface Window {
    __r4Group5?: Group5HarnessApi;
  }
}
