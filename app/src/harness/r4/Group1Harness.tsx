import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createDirectorRuntime, type StoryDebugSnapshot } from '../../runtime/director.actor';
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
import { heroScene } from '../../scenes/hero';
import { patternScene } from '../../scenes/pattern';
import { starMapScene } from '../../scenes/star-map';
import { createHeroPatternTransition } from '../../transitions/hero-pattern';
import { createPatternStarMapTransition } from '../../transitions/pattern-star-map';
import { hiddenVisibility, holdVisibility } from '../../pilot/visibility';
import { createR4Group1Manifest, type R4Group1HarnessMode } from './group1Manifest';

type HarnessPhase = 'booting' | 'hold' | 'preparing' | 'playing' | 'scrubbing' | 'staged-paused' | 'settling' | 'recovering' | 'seeking';

type PlayOptions = {
  buildTimeout?: boolean;
};

type Group1Metrics = {
  recoveryCount: number;
  staleCompletionIgnored: number;
  localEvents: readonly string[];
};

export type Group1Snapshot = {
  phase: HarnessPhase;
  mode: R4Group1HarnessMode;
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

type Group1HarnessApi = {
  playForward(options?: PlayOptions): Promise<void>;
  playReverse(options?: PlayOptions): Promise<void>;
  seek(scene: 'hero' | 'pattern' | 'star-map'): void;
  scrubHeroPattern(progress: number): Promise<void>;
  scrubPatternStarMap(progress: number): Promise<void>;
  idempotentCycle(): Promise<void>;
  snapshot(): Group1Snapshot;
};

const modules = {
  hero: heroScene,
  pattern: patternScene,
  'star-map': starMapScene
};

const GROUP_SCENES: SceneId[] = ['hero', 'pattern', 'star-map'];
const GROUP_SEGMENTS: SegmentId[] = ['hero-pattern', 'pattern-star-map'];

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
  throw new Error(`R4 group1 harness did not return to hold; current state: ${String(runtime.getState().state)}`);
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

function readDomSnapshot(mode: R4Group1HarnessMode, snapshot: StoryDebugSnapshot, metrics: Group1Metrics): Group1Snapshot {
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

export function Group1Harness({ mode }: { mode: R4Group1HarnessMode }) {
  const manifest = useMemo(() => createR4Group1Manifest(mode), [mode]);
  const registry = useMemo(() => new HandleRegistry(), []);
  const buildDelayMs = useRef(0);
  const localLog = useRef<string[]>([]);
  const layerStore = useMemo(() => {
    const initialHold = manifest.nodes.find((node) => node.kind === 'hold')?.scene ?? 'hero';
    return new LayerStore(holdVisibilityForWindow({ current: initialHold, retiring: [] }));
  }, [manifest]);
  const layerSnapshot = useSyncExternalStore(layerStore.subscribe, layerStore.getSnapshot, layerStore.getSnapshot);
  const visibilityByScene = layerSnapshot.visibilityByScene;
  const [metrics, setMetrics] = useState<Group1Metrics>({
    recoveryCount: 0,
    staleCompletionIgnored: 0,
    localEvents: []
  });
  const metricsRef = useRef(metrics);

  const updateMetrics = (updater: (current: Group1Metrics) => Group1Metrics) => {
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
        actorEpoch: `r4-g1-${mode}`,
        manifest,
        prepareTimeoutMs: manifest.defaults.buildTimeoutMs + 1500,
        stage: stageHandle,
        transitions: {
          'hero-pattern': createHeroPatternTransition({ delayMs: () => buildDelayMs.current }),
          'pattern-star-map': createPatternStarMapTransition({ delayMs: () => buildDelayMs.current })
        },
        readyGate: {
          waitForTargetReady: async ({ targetScene }) => {
            for (let attempt = 0; attempt < 240; attempt += 1) {
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
    const before = runtime.getState();
    let segment = before.state === 'staged-paused'
      ? before.context.activeSegment
      : segmentForCurrentHold(direction);
    for (let attempt = 0; !segment && before.state !== 'staged-paused' && attempt < 24; attempt += 1) {
      await wait(16);
      segment = segmentForCurrentHold(direction);
    }
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

  const seek = (scene: 'hero' | 'pattern' | 'star-map') => {
    const activeRunId = runtime.getState().context.activeRunId;
    runtime.send({ type: 'SEEK', label: `scene:${scene}`, source: 'menu' });
    if (activeRunId) {
      window.setTimeout(() => {
        updateMetrics((current) => ({ ...current, staleCompletionIgnored: current.staleCompletionIgnored + 1 }));
      }, 280);
    }
  };

  const scrubHeroPattern = async (progress: number) => {
    const clamped = Math.min(1, Math.max(0, progress));
    await runtime.segmentPlayer.ensureBuilt('hero-pattern', {
      direction: 1
    });
    runtime.segmentPlayer.scrub('hero-pattern', clamped);
  };

  const scrubPatternStarMap = async (progress: number) => {
    const clamped = Math.min(1, Math.max(0, progress));
    await runtime.segmentPlayer.ensureBuilt('pattern-star-map', {
      direction: 1
    });
    runtime.segmentPlayer.scrub('pattern-star-map', clamped);
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
    const api: Group1HarnessApi = {
      playForward: (options) => play(1, options),
      playReverse: (options) => play(-1, options),
      seek,
      scrubHeroPattern,
      scrubPatternStarMap,
      idempotentCycle,
      snapshot: () => readDomSnapshot(mode, runtimeSnapshotRef.current, metricsRef.current)
    };
    window.__r4Group1 = api;
    return () => {
      delete window.__r4Group1;
    };
  });

  const frame = readDomSnapshot(mode, runtimeSnapshot, metrics);

  return (
    <div className="stage-harness-shell r4-group-shell" data-r4-group="1" data-r4-mode={mode}>
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
          <button type="button" onClick={() => seek('hero')}>Seek Hero</button>
          <button type="button" onClick={() => seek('pattern')}>Seek Pattern</button>
          <button type="button" onClick={() => seek('star-map')}>Seek Star</button>
          <button type="button" onClick={() => void idempotentCycle()}>0-1-0-1</button>
        </div>
      </aside>
    </div>
  );
}

declare global {
  interface Window {
    __r4Group1?: Group1HarnessApi;
  }
}
