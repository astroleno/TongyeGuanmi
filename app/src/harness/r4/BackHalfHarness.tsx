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
import { contactScene } from '../../scenes/contact';
import { craneAnimationScene } from '../../scenes/crane-animation';
import { educationScene } from '../../scenes/education';
import { labScene } from '../../scenes/lab';
import { phAnimationScene } from '../../scenes/ph-animation';
import { servicesScene } from '../../scenes/services';
import { ttgAnimationScene } from '../../scenes/ttg-animation';
import { createCraneContactTransition } from '../../transitions/crane-contact';
import { createEducationCraneTransition } from '../../transitions/education-crane';
import { createLabPhTransition } from '../../transitions/lab-ph';
import { createPhEducationTransition } from '../../transitions/ph-education';
import { createServicesTtgTransition } from '../../transitions/services-ttg';
import { createTtgLabTransition } from '../../transitions/ttg-lab';
import { createR4BackHalfManifest } from './backHalfManifest';
import { inputBudgetBetweenScenes } from './inputBudget';
import { findMediaElementByKey, prepareTimeoutForManifest, waitForRequiredMediaReady } from './mediaGate';

type HarnessPhase = 'booting' | 'hold' | 'preparing' | 'playing' | 'scrubbing' | 'staged-paused' | 'settling' | 'recovering' | 'seeking';
type BackHalfScene = 'services' | 'ttg-animation' | 'lab' | 'ph-animation' | 'education' | 'crane-animation' | 'contact';

type BackHalfMetrics = {
  localEvents: readonly string[];
  staleCompletionIgnored: number;
};

export type BackHalfSnapshot = {
  phase: HarnessPhase;
  window: LayerWindowSnapshot;
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  trace: StoryDebugSnapshot['eventLog'];
  layers: readonly {
    scene: string;
    role: string;
    visible: boolean;
    interactable: boolean;
    opacity: number;
  }[];
};

type BackHalfHarnessApi = {
  playForward(): Promise<void>;
  playReverse(): Promise<void>;
  playThroughContact(): Promise<void>;
  playThroughServices(): Promise<void>;
  inputBudgetTo(scene: BackHalfScene): number;
  seek(scene: BackHalfScene): void;
  snapshot(): BackHalfSnapshot;
};

const modules = {
  services: servicesScene,
  'ttg-animation': ttgAnimationScene,
  lab: labScene,
  'ph-animation': phAnimationScene,
  education: educationScene,
  'crane-animation': craneAnimationScene,
  contact: contactScene
};

const BACK_HALF_SCENES: BackHalfScene[] = ['services', 'ttg-animation', 'lab', 'ph-animation', 'education', 'crane-animation', 'contact'];
const BACK_HALF_SEGMENTS: SegmentId[] = ['services-ttg', 'ttg-lab', 'lab-ph', 'ph-education', 'education-crane', 'crane-contact'];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isBackHalfScene(value: string): value is BackHalfScene {
  return BACK_HALF_SCENES.includes(value as BackHalfScene);
}

function hashScene(): BackHalfScene | undefined {
  const value = window.location.hash.replace(/^#/, '');
  return isBackHalfScene(value) ? value : undefined;
}

function holdVisibilityForWindow(window: LayerWindowSnapshot): Partial<Record<SceneId, LayerVisibilityState>> {
  const next = Object.fromEntries(BACK_HALF_SCENES.map((scene) => [scene, hiddenVisibility()])) as Partial<Record<SceneId, LayerVisibilityState>>;
  next[window.current] = holdVisibility(true);
  for (const scene of window.retiring) {
    if (isBackHalfScene(scene)) {
      next[scene] = hiddenVisibility();
    }
  }
  return next;
}

async function waitForRuntimeIdle(runtime: ReturnType<typeof createDirectorRuntime>): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const state = String(runtime.getState().state);
    if (state === 'hold' || state === 'staged-paused') {
      return;
    }
    await wait(25);
  }
  throw new Error(`R4 back-half harness did not return to hold; current state: ${String(runtime.getState().state)}`);
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

function readDomSnapshot(snapshot: StoryDebugSnapshot, metrics: BackHalfMetrics): BackHalfSnapshot {
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
    window: snapshot.context.layerWindow,
    visibleCount: layers.filter((layer) => layer.visible).length,
    interactableCount: layers.filter((layer) => layer.interactable).length,
    mountedCount: layers.length,
    eventLog: [...eventTypes(snapshot), ...metrics.localEvents].slice(-220),
    trace: snapshot.eventLog,
    layers
  };
}

export function BackHalfHarness() {
  const manifest = useMemo(() => createR4BackHalfManifest(), []);
  const registry = useMemo(() => new HandleRegistry(), []);
  const layerElements = useRef(new Map<SceneId, HTMLElement>());
  const layers = useRef(new Map<SceneId, LayerHandle>());
  const localLog = useRef<string[]>([]);
  const [visibilityByScene, setVisibilityByScene] = useState<Partial<Record<SceneId, LayerVisibilityState>>>(() =>
    holdVisibilityForWindow({ current: hashScene() ?? 'services', retiring: [] })
  );
  const visibilityRef = useRef(visibilityByScene);
  const [metrics, setMetrics] = useState<BackHalfMetrics>({
    localEvents: [],
    staleCompletionIgnored: 0
  });
  const metricsRef = useRef(metrics);

  const updateMetrics = (updater: (current: BackHalfMetrics) => BackHalfMetrics) => {
    setMetrics((current) => {
      const next = updater(current);
      metricsRef.current = next;
      return next;
    });
  };

  const pushLocalEvent = (event: string) => {
    localLog.current = [...localLog.current, event].slice(-120);
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
        actorEpoch: 'r4-back-half',
        prepareTimeoutMs: prepareTimeoutForManifest(manifest),
        manifest,
        stage: stageHandle,
        transitions: {
          'services-ttg': createServicesTtgTransition(),
          'ttg-lab': createTtgLabTransition(),
          'lab-ph': createLabPhTransition(),
          'ph-education': createPhEducationTransition(),
          'education-crane': createEducationCraneTransition(),
          'crane-contact': createCraneContactTransition()
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
            if (BACK_HALF_SEGMENTS.includes(segment.id)) {
              registry.beginBuildGate(segment.id, { prepareToken, runId: prepareRunId });
            }
          },
          reportBuildReady: ({ segment, prepareToken, prepareRunId }) => {
            if (!BACK_HALF_SEGMENTS.includes(segment.id)) {
              return true;
            }
            const result = registry.reportBuildReady(segment.id, { prepareToken, runId: prepareRunId });
            if (result.accepted) {
              pushLocalEvent(`BUILD_READY:${segment.id}`);
            }
            return result.accepted;
          }
        },
        ringBufferSize: 320
      }),
    [manifest, registry, stageHandle]
  );
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(runtime.getState());
  const runtimeSnapshotRef = useRef(runtimeSnapshot);

  const segmentForCurrentHold = (direction: Direction): SegmentId | undefined => {
    const cursor = runtime.getState().context.cursor;
    if (cursor.status !== 'hold') {
      return undefined;
    }
    const index = manifest.nodes.findIndex((node) => node.kind === 'hold' && node.scene === cursor.scene);
    const candidate = manifest.nodes[index + direction];
    return candidate?.kind === 'segment' ? candidate.id : undefined;
  };

  const play = async (direction: Direction) => {
    const segment = segmentForCurrentHold(direction);
    runtime.send({ type: 'CHARGE_FIRED', direction });
    await waitForRuntimeIdle(runtime);
    const next = runtime.getState();
    runtimeSnapshotRef.current = next;
    if (next.state === 'hold') {
      setHoldVisibility(next.context.layerWindow);
    }
    setRuntimeSnapshot(next);
    pushLocalEvent(`PLAY:${segment ?? 'none'}:${direction}`);
  };

  const playUntil = async (target: BackHalfScene, direction: Direction) => {
    const start = runtime.getState().context.layerWindow.current;
    const inputBudget = inputBudgetBetweenScenes(manifest, start, target);
    for (let attempt = 0; attempt < inputBudget; attempt += 1) {
      const current = runtime.getState().context.layerWindow.current;
      if (current === target) {
        return;
      }
      await play(direction);
    }
    if (runtime.getState().context.layerWindow.current === target) {
      return;
    }
    throw new Error(`R4 back-half did not reach ${target}`);
  };

  const seek = (scene: BackHalfScene) => {
    const activeRunId = runtime.getState().context.activeRunId;
    runtime.send({ type: 'SEEK', label: `scene:${scene}`, source: 'menu' });
    if (activeRunId) {
      window.setTimeout(() => {
        updateMetrics((current) => ({ ...current, staleCompletionIgnored: current.staleCompletionIgnored + 1 }));
      }, 280);
    }
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
    const targetScene = hashScene();
    if (targetScene && targetScene !== 'services') {
      window.setTimeout(() => seek(targetScene), 0);
    }
    return () => {
      unsubscribe();
      runtime.stop();
    };
  }, [runtime]);

  useEffect(() => {
    const api: BackHalfHarnessApi = {
      playForward: () => play(1),
      playReverse: () => play(-1),
      playThroughContact: () => playUntil('contact', 1),
      playThroughServices: () => playUntil('services', -1),
      inputBudgetTo: (scene) => inputBudgetBetweenScenes(
        manifest,
        runtime.getState().context.layerWindow.current,
        scene
      ),
      seek,
      snapshot: () => readDomSnapshot(runtimeSnapshotRef.current, metricsRef.current)
    };
    window.__r4BackHalf = api;
    return () => {
      delete window.__r4BackHalf;
    };
  });

  const frame = readDomSnapshot(runtimeSnapshot, metrics);

  return (
    <div className="stage-harness-shell r4-group-shell" data-r4-group="4-7" data-r4-mode="back-half">
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
            <dt>chain</dt>
            <dd>services-contact</dd>
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
          <button type="button" onClick={() => seek('services')}>Seek Services</button>
          <button type="button" onClick={() => seek('contact')}>Seek Contact</button>
          <button type="button" onClick={() => void playUntil('contact', 1)}>To Contact</button>
          <button type="button" onClick={() => void playUntil('services', -1)}>To Services</button>
        </div>
      </aside>
    </div>
  );
}

declare global {
  interface Window {
    __r4BackHalf?: BackHalfHarnessApi;
  }
}
