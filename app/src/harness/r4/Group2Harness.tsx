import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createDirectorRuntime, type StoryDebugSnapshot } from '../../runtime/director.actor';
import { normalizeInputDelta, type RawInput } from '../../runtime/input-normalizer';
import { Stage } from '../../stage/Stage';
import { LayerStore } from '../../stage/LayerStore';
import type { LayerWindowSnapshot } from '../../stage/LayerWindow';
import { HandleRegistry } from '../../story/registry';
import type {
  Direction,
  LayerVisibilityState,
  SceneId,
  SegmentId
} from '../../story/types';
import { methodTopScene } from '../../scenes/method-top';
import { figure2AnimationScene } from '../../scenes/figure2-animation';
import { createMethodBottomFigure2Transition } from '../../transitions/method-bottom-figure2';
import { hiddenVisibility, holdVisibility } from '../../pilot/visibility';
import { createR4Group2Manifest, type R4Group2HarnessMode } from './group2Manifest';

type HarnessPhase = 'booting' | 'hold' | 'preparing' | 'playing' | 'scrubbing' | 'staged-paused' | 'settling' | 'recovering' | 'seeking';

type PlayOptions = {
  buildTimeout?: boolean;
};

type Group2Metrics = {
  recoveryCount: number;
  staleCompletionIgnored: number;
  localEvents: readonly string[];
};

export type Group2Snapshot = {
  phase: HarnessPhase;
  mode: R4Group2HarnessMode;
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

type Group2HarnessApi = {
  playForward(options?: PlayOptions): Promise<void>;
  playReverse(options?: PlayOptions): Promise<void>;
  seek(scene: 'method-top' | 'figure2-animation'): void;
  idempotentCycle(): Promise<void>;
  snapshot(): Group2Snapshot;
};

const modules = {
  'method-top': methodTopScene,
  'figure2-animation': figure2AnimationScene
};

const GROUP_SCENES: SceneId[] = ['method-top', 'figure2-animation'];
const GROUP_SEGMENTS: SegmentId[] = ['method-bottom-figure2'];

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
  for (let attempt = 0; attempt < 140; attempt += 1) {
    const state = String(runtime.getState().state);
    if (state === 'hold' || state === 'staged-paused') {
      return;
    }
    await wait(25);
  }
  throw new Error(`R4 group2 harness did not return to hold; current state: ${String(runtime.getState().state)}`);
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

function readDomSnapshot(mode: R4Group2HarnessMode, snapshot: StoryDebugSnapshot, metrics: Group2Metrics): Group2Snapshot {
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

export function Group2Harness({ mode }: { mode: R4Group2HarnessMode }) {
  const manifest = useMemo(() => createR4Group2Manifest(mode), [mode]);
  const registry = useMemo(() => new HandleRegistry(), []);
  const buildDelayMs = useRef(0);
  const localLog = useRef<string[]>([]);
  const layerStore = useMemo(() => {
    const initialHold = manifest.nodes.find((node) => node.kind === 'hold')?.scene ?? 'method-top';
    return new LayerStore(holdVisibilityForWindow({ current: initialHold, retiring: [] }));
  }, [manifest]);
  const layerSnapshot = useSyncExternalStore(layerStore.subscribe, layerStore.getSnapshot, layerStore.getSnapshot);
  const visibilityByScene = layerSnapshot.visibilityByScene;
  const [metrics, setMetrics] = useState<Group2Metrics>({
    recoveryCount: 0,
    staleCompletionIgnored: 0,
    localEvents: []
  });
  const metricsRef = useRef(metrics);

  const updateMetrics = (updater: (current: Group2Metrics) => Group2Metrics) => {
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

  const setHoldVisibility = (window: LayerWindowSnapshot) => {
    layerStore.replaceVisibility(holdVisibilityForWindow(window));
  };

  const stageHandle = layerStore;

  const runtime = useMemo(
    () =>
      createDirectorRuntime({
        actorEpoch: `r4-g2-${mode}`,
        manifest,
        stage: stageHandle,
        transitions: {
          'method-bottom-figure2': createMethodBottomFigure2Transition({ delayMs: () => buildDelayMs.current })
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
        ringBufferSize: 160
      }),
    [manifest, mode, registry, stageHandle]
  );
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(runtime.getState());
  const runtimeSnapshotRef = useRef(runtimeSnapshot);
  const previousTouchY = useRef<number | null>(null);

  const sendRawInput = (input: RawInput) => {
    const normalized = normalizeInputDelta(input);
    if (Math.abs(normalized.delta) < 0.0001) {
      return;
    }
    runtime.send({ type: 'INPUT_DELTA', ...normalized, now: Date.now() });
  };

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

  const seek = (scene: 'method-top' | 'figure2-animation') => {
    const activeRunId = runtime.getState().context.activeRunId;
    runtime.send({ type: 'SEEK', label: `scene:${scene}`, source: 'menu' });
    if (activeRunId) {
      window.setTimeout(() => {
        updateMetrics((current) => ({ ...current, staleCompletionIgnored: current.staleCompletionIgnored + 1 }));
      }, 280);
    }
  };

  const idempotentCycle = async () => {
    await play(1);
    await play(-1);
    await play(1);
  };

  useEffect(() => {
    const api: Group2HarnessApi = {
      playForward: (options) => play(1, options),
      playReverse: (options) => play(-1, options),
      seek,
      idempotentCycle,
      snapshot: () => readDomSnapshot(mode, runtimeSnapshotRef.current, metricsRef.current)
    };
    window.__r4Group2 = api;
    return () => {
      delete window.__r4Group2;
    };
  });

  const frame = readDomSnapshot(mode, runtimeSnapshot, metrics);

  return (
    <div
      className="stage-harness-shell r4-group-shell"
      data-r4-group="2"
      data-r4-mode={mode}
      onWheel={(event) => {
        if ((event.target as HTMLElement | null)?.closest('.stage-harness-hud')) {
          return;
        }
        const deltaMode = event.deltaMode === 1 || event.deltaMode === 2 ? event.deltaMode : 0;
        sendRawInput({ type: 'wheel', deltaY: event.deltaY, deltaMode, viewportHeight: window.innerHeight });
      }}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, textarea, select, .stage-harness-hud')) {
          return;
        }
        sendRawInput({ type: 'key', key: event.key, viewportHeight: window.innerHeight });
      }}
      onTouchStart={(event) => {
        previousTouchY.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchMove={(event) => {
        const currentY = event.touches[0]?.clientY;
        const previousY = previousTouchY.current;
        if (currentY === undefined || previousY === null) {
          return;
        }
        previousTouchY.current = currentY;
        sendRawInput({ type: 'touch', currentY, previousY, viewportHeight: window.innerHeight });
      }}
      onTouchEnd={() => {
        previousTouchY.current = null;
      }}
    >
      <Stage
        window={runtimeSnapshot.context.layerWindow}
        modules={modules}
        registry={registry}
        visibilityByScene={visibilityByScene}
        onLayerElement={(scene, element) => layerStore.bindElement(scene, element)}
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
          <button type="button" onClick={() => seek('method-top')}>Seek Method</button>
          <button type="button" onClick={() => seek('figure2-animation')}>Seek Figure2</button>
          <button type="button" onClick={() => void idempotentCycle()}>0-1-0-1</button>
        </div>
      </aside>
    </div>
  );
}

declare global {
  interface Window {
    __r4Group2?: Group2HarnessApi;
  }
}
