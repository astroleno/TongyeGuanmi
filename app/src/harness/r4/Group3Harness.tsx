import { useEffect, useMemo, useRef, useState } from 'react';
import { createDirectorRuntime, type StoryDebugSnapshot } from '../../runtime/director.actor';
import { Stage } from '../../stage/Stage';
import type { LayerWindowSnapshot } from '../../stage/LayerWindow';
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
import { brandScene } from '../../scenes/brand';
import { figure2AnimationScene } from '../../scenes/figure2-animation';
import { figure2ProofCardsScene } from '../../scenes/figure2-proof-cards';
import { figure2ProofClosingScene } from '../../scenes/figure2-proof-closing';
import { figure2ProofOpeningScene } from '../../scenes/figure2-proof-opening';
import { createFigure2DistanceExpandTransition } from '../../transitions/figure2-distance-expand';
import { createFigure2ProofBrandTransition } from '../../transitions/figure2-proof-brand';
import { createFigure2ProofCardsClosingTransition } from '../../transitions/figure2-proof-cards-closing';
import { createFigure2ProofOpeningCardsTransition } from '../../transitions/figure2-proof-opening-cards';
import { applyLayerVisibility, hiddenVisibility, holdVisibility } from '../../pilot/visibility';
import { createR4Group3Manifest, type R4Group3HarnessMode } from './group3Manifest';
import { findMediaElementByKey, prepareTimeoutForManifest, waitForRequiredMediaReady } from './mediaGate';

type HarnessPhase = 'booting' | 'hold' | 'preparing' | 'playing' | 'scrubbing' | 'staged-paused' | 'settling' | 'recovering' | 'seeking';

type PlayOptions = {
  buildTimeout?: boolean;
};

type Group3Metrics = {
  recoveryCount: number;
  staleCompletionIgnored: number;
  localEvents: readonly string[];
};

export type Group3Snapshot = {
  phase: HarnessPhase;
  mode: R4Group3HarnessMode;
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

type Group3HarnessApi = {
  playForward(options?: PlayOptions): Promise<void>;
  playReverse(options?: PlayOptions): Promise<void>;
  seek(scene: 'figure2-animation' | 'figure2-proof-opening' | 'figure2-proof-cards' | 'figure2-proof-closing' | 'brand'): void;
  idempotentCycle(): Promise<void>;
  snapshot(): Group3Snapshot;
};

const modules = {
  'figure2-animation': figure2AnimationScene,
  'figure2-proof-opening': figure2ProofOpeningScene,
  'figure2-proof-cards': figure2ProofCardsScene,
  'figure2-proof-closing': figure2ProofClosingScene,
  brand: brandScene
};

const GROUP_SCENES: SceneId[] = [
  'figure2-animation',
  'figure2-proof-opening',
  'figure2-proof-cards',
  'figure2-proof-closing',
  'brand'
];
const GROUP_SEGMENTS: SegmentId[] = [
  'figure2-distance-expand',
  'figure2-proof-opening-cards',
  'figure2-proof-cards-closing',
  'figure2-proof-brand'
];

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
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const state = String(runtime.getState().state);
    if (state === 'hold' || state === 'staged-paused') {
      return;
    }
    await wait(25);
  }
  throw new Error(`R4 group3 harness did not return to hold; current state: ${String(runtime.getState().state)}`);
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

function readDomSnapshot(mode: R4Group3HarnessMode, snapshot: StoryDebugSnapshot, metrics: Group3Metrics): Group3Snapshot {
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
    eventLog: [...eventTypes(snapshot), ...metrics.localEvents].slice(-180),
    recoveryCount: metrics.recoveryCount,
    staleCompletionIgnored: metrics.staleCompletionIgnored,
    trace: snapshot.eventLog,
    layers
  };
}

export function Group3Harness({ mode }: { mode: R4Group3HarnessMode }) {
  const manifest = useMemo(() => createR4Group3Manifest(mode), [mode]);
  const registry = useMemo(() => new HandleRegistry(), []);
  const buildDelayMs = useRef(0);
  const layerElements = useRef(new Map<SceneId, HTMLElement>());
  const layers = useRef(new Map<SceneId, LayerHandle>());
  const localLog = useRef<string[]>([]);
  const [visibilityByScene, setVisibilityByScene] = useState<Partial<Record<SceneId, LayerVisibilityState>>>(() => {
    const initialHold = manifest.nodes.find((node) => node.kind === 'hold')?.scene ?? 'figure2-animation';
    return holdVisibilityForWindow({ current: initialHold, retiring: [] });
  });
  const visibilityRef = useRef(visibilityByScene);
  const [metrics, setMetrics] = useState<Group3Metrics>({
    recoveryCount: 0,
    staleCompletionIgnored: 0,
    localEvents: []
  });
  const metricsRef = useRef(metrics);

  const updateMetrics = (updater: (current: Group3Metrics) => Group3Metrics) => {
    setMetrics((current) => {
      const next = updater(current);
      metricsRef.current = next;
      return next;
    });
  };

  const pushLocalEvent = (event: string) => {
    localLog.current = [...localLog.current, event].slice(-100);
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
        actorEpoch: `r4-g3-${mode}`,
        prepareTimeoutMs: prepareTimeoutForManifest(manifest),
        manifest,
        stage: stageHandle,
        transitions: {
          'figure2-distance-expand': createFigure2DistanceExpandTransition({ delayMs: () => buildDelayMs.current }),
          'figure2-proof-opening-cards': createFigure2ProofOpeningCardsTransition({ delayMs: () => buildDelayMs.current }),
          'figure2-proof-cards-closing': createFigure2ProofCardsClosingTransition({ delayMs: () => buildDelayMs.current }),
          'figure2-proof-brand': createFigure2ProofBrandTransition({ delayMs: () => buildDelayMs.current })
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
        ringBufferSize: 220
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

  const seek = (scene: 'figure2-animation' | 'figure2-proof-opening' | 'figure2-proof-cards' | 'figure2-proof-closing' | 'brand') => {
    const activeRunId = runtime.getState().context.activeRunId;
    runtime.send({ type: 'SEEK', label: `scene:${scene}`, source: 'menu' });
    if (activeRunId) {
      window.setTimeout(() => {
        updateMetrics((current) => ({ ...current, staleCompletionIgnored: current.staleCompletionIgnored + 1 }));
      }, 280);
    }
  };

  const idempotentCycle = async () => {
    const playThroughStages = async (direction: Direction) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await play(direction);
        const state = runtime.getState();
        if (state.state !== 'staged-paused' || state.context.activeDirection !== direction) {
          return;
        }
      }
    };
    await playThroughStages(1);
    await playThroughStages(-1);
    await playThroughStages(1);
  };

  useEffect(() => {
    const api: Group3HarnessApi = {
      playForward: (options) => play(1, options),
      playReverse: (options) => play(-1, options),
      seek,
      idempotentCycle,
      snapshot: () => readDomSnapshot(mode, runtimeSnapshotRef.current, metricsRef.current)
    };
    window.__r4Group3 = api;
    return () => {
      delete window.__r4Group3;
    };
  });

  const frame = readDomSnapshot(mode, runtimeSnapshot, metrics);

  return (
    <div className="stage-harness-shell r4-group-shell" data-r4-group="3" data-r4-mode={mode}>
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
          <button type="button" onClick={() => seek('figure2-animation')}>Seek Figure2</button>
          <button type="button" onClick={() => seek('figure2-proof-opening')}>Seek Opening</button>
          <button type="button" onClick={() => seek('figure2-proof-cards')}>Seek Cards</button>
          <button type="button" onClick={() => seek('figure2-proof-closing')}>Seek Closing</button>
          <button type="button" onClick={() => seek('brand')}>Seek Brand</button>
          <button type="button" onClick={() => void idempotentCycle()}>0-1-0-1</button>
        </div>
      </aside>
    </div>
  );
}

declare global {
  interface Window {
    __r4Group3?: Group3HarnessApi;
  }
}
