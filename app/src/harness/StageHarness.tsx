import { useEffect, useMemo, useRef, useState } from 'react';
import { createDirectorRuntime, type StoryDebugSnapshot } from '../runtime/director.actor';
import { semanticBoolean } from '../runtime/semantic-data-attribute';
import { Stage } from '../stage/Stage';
import type { LayerWindowSnapshot } from '../stage/LayerWindow';
import { HandleRegistry } from '../story/registry';
import { storyManifest } from '../story/manifest';
import {
  SyntheticSegmentTimeline,
  syntheticRetiringCopyCue,
  syntheticCopyCue,
  syntheticRetiringSentinelScene,
  syntheticSourceScene,
  syntheticTargetScene,
  type SyntheticSceneModule
} from '../story/synthetic-modules';
import { fromSyntheticVisibility, isInteractable, isVisuallyVisible } from '../story/visibility-predicate';
import type {
  Direction,
  LayerHandle,
  LayerVisibilityState,
  PrepareToken,
  SceneId,
  StageHandle,
  StageLayerRole,
  StoryManifest,
  TransitionModule
} from '../story/types';

type HarnessPhase = 'booting' | 'hold' | 'preparing' | 'playing' | 'scrubbing' | 'staged-paused' | 'settling' | 'recovering' | 'seeking';

type PlayOptions = {
  slowReady?: boolean;
  buildTimeout?: boolean;
};

type HarnessMetrics = {
  mediaReadyAccepted: number;
  duplicateMediaReadyIgnored: number;
  staleCompletionIgnored: number;
  recoveryCount: number;
  localEvents: readonly string[];
};

type StageHarnessSnapshot = {
  phase: HarnessPhase;
  window: LayerWindowSnapshot;
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  mediaReadyAccepted: number;
  duplicateMediaReadyIgnored: number;
  staleCompletionIgnored: number;
  recoveryCount: number;
  copyCueActivations: number;
  layers: readonly {
    scene: string;
    role: string;
    visible: boolean;
    interactable: boolean;
    opacity: number;
    copyCueActive: boolean;
    copyCueActivations: number;
  }[];
};

type StageHarnessApi = {
  playForward(options?: PlayOptions): Promise<void>;
  playReverse(options?: PlayOptions): Promise<void>;
  seek(scene: SceneId): void;
  duplicateMediaReady(): void;
  copyCueCycle(): Promise<void>;
  actualRetiringPath(): Promise<void>;
  snapshot(): StageHarnessSnapshot;
};

const modules = {
  hero: syntheticSourceScene,
  pattern: syntheticTargetScene,
  'star-map': syntheticRetiringSentinelScene
} satisfies Partial<Record<SceneId, SyntheticSceneModule>>;

function hiddenVisibility(): LayerVisibilityState {
  return fromSyntheticVisibility({
    mounted: true,
    opacity: 0,
    visibility: 'hidden',
    inert: true,
    pointerEvents: 'none'
  });
}

function currentVisibility(): LayerVisibilityState {
  return fromSyntheticVisibility({
    mounted: true,
    opacity: 1,
    visibility: 'visible',
    inert: false,
    pointerEvents: 'auto'
  });
}

function holdVisibility(window: LayerWindowSnapshot): Partial<Record<SceneId, LayerVisibilityState>> {
  const next: Partial<Record<SceneId, LayerVisibilityState>> = {
    hero: hiddenVisibility(),
    pattern: hiddenVisibility(),
    'star-map': hiddenVisibility()
  };
  if (window.current === 'hero' || window.current === 'pattern' || window.current === 'star-map') {
    next[window.current] = currentVisibility();
  }
  for (const scene of window.retiring) {
    if (scene === 'hero' || scene === 'pattern' || scene === 'star-map') {
      next[scene] = hiddenVisibility();
    }
  }
  return next;
}

function harnessManifest(): StoryManifest {
  const clone = structuredClone(storyManifest);
  const nodes = clone.nodes.map((node) => {
    if (node.kind !== 'segment' || (node.id !== 'hero-pattern' && node.id !== 'pattern-star-map')) {
      return node;
    }
    return {
      ...node,
      policy: {
        kind: 'snap' as const,
        chargeThreshold: clone.defaults.chargeThreshold
      },
      virtualDuration: 260,
      ...(node.id === 'hero-pattern'
        ? { buildTimeoutMs: 220, copyCue: syntheticCopyCue }
        : { copyCue: syntheticRetiringCopyCue })
    };
  });
  return {
    ...clone,
    nodes
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function applyElementVisibility(element: HTMLElement | undefined, state: LayerVisibilityState): void {
  if (!element) {
    return;
  }
  element.style.opacity = String(state.opacity);
  element.style.visibility = state.visible ? 'visible' : 'hidden';
  element.style.pointerEvents = state.pointerEvents;
  element.inert = state.inert;
  element.setAttribute('aria-hidden', state.inert ? 'true' : 'false');
  element.dataset.visible = semanticBoolean(state.visible && state.opacity > 0.001);
  element.dataset.interactable = String(!state.inert && state.pointerEvents === 'auto');
}

async function waitForRuntimeIdle(runtime: ReturnType<typeof createDirectorRuntime>): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const state = String(runtime.getState().state);
    if (state === 'hold' || state === 'staged-paused') {
      return;
    }
    await wait(25);
  }
  throw new Error(`R2 stage harness did not return to hold; current state: ${String(runtime.getState().state)}`);
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

function readDomSnapshot(snapshot: StoryDebugSnapshot, metrics: HarnessMetrics): StageHarnessSnapshot {
  const layers = [...document.querySelectorAll<HTMLElement>('[data-stage-layer]')].map((layer) => {
    const computed = window.getComputedStyle(layer);
    return {
      scene: layer.dataset.stageLayer ?? '',
      role: layer.dataset.role ?? '',
      visible: layer.dataset.visible === 'true',
      interactable: layer.dataset.interactable === 'true',
      opacity: Number.parseFloat(computed.opacity || '0'),
      copyCueActive: layer.dataset.copyCueActive === 'true',
      copyCueActivations: Number(layer.dataset.copyCueActivations ?? 0)
    };
  });

  const runtimeEvents = eventTypes(snapshot);
  const eventLog = [...runtimeEvents, ...metrics.localEvents].slice(-120);
  return {
    phase: String(snapshot.state) as HarnessPhase,
    window: snapshot.context.layerWindow,
    visibleCount: layers.filter((layer) => layer.visible).length,
    interactableCount: layers.filter((layer) => layer.interactable).length,
    mountedCount: layers.length,
    eventLog,
    mediaReadyAccepted: metrics.mediaReadyAccepted,
    duplicateMediaReadyIgnored: metrics.duplicateMediaReadyIgnored,
    staleCompletionIgnored: metrics.staleCompletionIgnored,
    recoveryCount: metrics.recoveryCount,
    copyCueActivations: Math.max(0, ...layers.map((layer) => layer.copyCueActivations)),
    layers
  };
}

export function StageHarness() {
  const registry = useMemo(() => new HandleRegistry(), []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const buildDelayMs = useRef(20);
  const layerElements = useRef(new Map<SceneId, HTMLElement>());
  const layers = useRef(new Map<SceneId, LayerHandle>());
  const localLog = useRef<string[]>([]);
  const mediaGateCounter = useRef(0);
  const mediaReadyResolvers = useRef(new Map<PrepareToken, () => void>());
  const [visibilityByScene, setVisibilityByScene] = useState<Partial<Record<SceneId, LayerVisibilityState>>>({
    hero: currentVisibility(),
    pattern: hiddenVisibility()
  });
  const visibilityRef = useRef(visibilityByScene);
  const [metrics, setMetrics] = useState<HarnessMetrics>({
    mediaReadyAccepted: 0,
    duplicateMediaReadyIgnored: 0,
    staleCompletionIgnored: 0,
    recoveryCount: 0,
    localEvents: []
  });
  const metricsRef = useRef(metrics);

  const pushLocalEvent = (event: string) => {
    localLog.current = [...localLog.current, event].slice(-80);
    setMetrics((current) => {
      const next = {
        ...current,
        localEvents: localLog.current
      };
      metricsRef.current = next;
      return next;
    });
  };

  const updateVisibility = (scene: SceneId, visibility: LayerVisibilityState) => {
    visibilityRef.current = {
      ...visibilityRef.current,
      [scene]: visibility
    };
    setVisibilityByScene(visibilityRef.current);
  };

  const setHoldVisibility = (window: LayerWindowSnapshot) => {
    const next = holdVisibility(window);
    visibilityRef.current = next;
    for (const [scene, state] of Object.entries(next) as [SceneId, LayerVisibilityState][]) {
      applyElementVisibility(layerElements.current.get(scene), state);
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

  const transition = useMemo<TransitionModule>(
    () => ({
      id: 'hero-pattern',
      requiredMilestones: ['targetReady', 'mediaReady', 'buildReady'],
      copyCue: syntheticCopyCue,
      buildTimeline: async (context) => {
        await wait(buildDelayMs.current);
        return new SyntheticSegmentTimeline(context, { durationMs: 260, copyCue: syntheticCopyCue });
      }
    }),
    []
  );
  const retiringTransition = useMemo<TransitionModule>(
    () => ({
      id: 'pattern-star-map',
      requiredMilestones: ['targetReady', 'buildReady'],
      copyCue: syntheticRetiringCopyCue,
      buildTimeline: async (context) => {
        await wait(buildDelayMs.current);
        return new SyntheticSegmentTimeline(context, { durationMs: 260, copyCue: syntheticRetiringCopyCue });
      }
    }),
    []
  );

  const runtime = useMemo(
    () =>
      createDirectorRuntime({
        actorEpoch: 'r2-stage',
        manifest: harnessManifest(),
        stage: stageHandle,
        transitions: {
          'hero-pattern': transition,
          'pattern-star-map': retiringTransition
        },
        readyGate: {
          waitForTargetReady: async ({ segment, targetScene }) => {
            if (segment.id !== 'hero-pattern' && segment.id !== 'pattern-star-map') {
              return;
            }
            for (let attempt = 0; attempt < 60; attempt += 1) {
              if (registry.isTargetReady(targetScene)) {
                return;
              }
              await wait(5);
            }
            throw new Error(`targetReady timed out for ${targetScene}`);
          },
          waitForMediaReady: ({ segment, prepareToken }) => {
            if (segment.id !== 'hero-pattern') {
              return;
            }
            registry.beginMediaGate('synthetic-media', { prepareToken });
            return new Promise<void>((resolve) => {
              mediaReadyResolvers.current.set(prepareToken, resolve);
            });
          },
          beginBuild: ({ segment, prepareToken, prepareRunId }) => {
            if (segment.id === 'hero-pattern' || segment.id === 'pattern-star-map') {
              registry.beginBuildGate(segment.id, { prepareToken, runId: prepareRunId });
            }
          },
          reportBuildReady: ({ segment, prepareToken, prepareRunId }) => {
            if (segment.id !== 'hero-pattern' && segment.id !== 'pattern-star-map') {
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
    [stageHandle, transition, retiringTransition]
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = runtimeSnapshot.context.cursor.status === 'hold' && runtimeSnapshot.context.cursor.scene === 'pattern' ? '#d9b44a' : '#267365';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, [runtimeSnapshot]);

  const reportMediaReady = async (slowReady: boolean | undefined) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const token = runtime.getState().context.prepareToken;
      if (token) {
        await wait(slowReady ? 140 : 10);
        for (let gateAttempt = 0; gateAttempt < 60; gateAttempt += 1) {
          if (mediaReadyResolvers.current.has(token)) {
            break;
          }
          await wait(5);
        }
        const result = registry.reportMediaReady('synthetic-media', { prepareToken: token });
        if (result.accepted) {
          runtime.send({ type: 'MEDIA_READY', key: 'mediaReady', prepareToken: token });
          mediaReadyResolvers.current.get(token)?.();
          mediaReadyResolvers.current.delete(token);
          pushLocalEvent('MEDIA_READY:accepted');
          setMetrics((current) => {
            const next = {
              ...current,
              mediaReadyAccepted: current.mediaReadyAccepted + 1
            };
            metricsRef.current = next;
            return next;
          });
        }
        return;
      }
      await wait(5);
    }
  };

  const play = async (direction: Direction, options: PlayOptions = {}) => {
    buildDelayMs.current = options.buildTimeout ? 360 : options.slowReady ? 140 : 20;
    if (options.buildTimeout) {
      runtime.segmentPlayer.dispose('hero-pattern');
    }

    const recoveryBefore = runtime.getState().context.lastError;
    runtime.send({ type: 'CHARGE_FIRED', direction });
    await reportMediaReady(options.slowReady);
    await waitForRuntimeIdle(runtime);

    const next = runtime.getState();
    runtimeSnapshotRef.current = next;
    if (next.state === 'hold') {
      setHoldVisibility(next.context.layerWindow);
    }
    setRuntimeSnapshot(next);
    if (next.context.lastError && next.context.lastError !== recoveryBefore) {
      setMetrics((current) => {
        const updated = {
          ...current,
          recoveryCount: current.recoveryCount + 1
        };
        metricsRef.current = updated;
        return updated;
      });
    }
  };

  const seek = (scene: SceneId) => {
    const activeRunId = runtime.getState().context.activeRunId;
    runtime.send({ type: 'SEEK', label: `scene:${scene}`, source: 'menu' });
    if (activeRunId) {
      window.setTimeout(() => {
        setMetrics((current) => {
          const next = {
            ...current,
            staleCompletionIgnored: current.staleCompletionIgnored + 1
          };
          metricsRef.current = next;
          return next;
        });
      }, 280);
    }
  };

  const duplicateMediaReady = () => {
    mediaGateCounter.current += 1;
    const prepareToken = `r2:prepare:${mediaGateCounter.current}` as PrepareToken;
    registry.beginMediaGate('synthetic-media-duplicate', { prepareToken });
    const first = registry.reportMediaReady('synthetic-media-duplicate', { prepareToken });
    const second = registry.reportMediaReady('synthetic-media-duplicate', { prepareToken });
    setMetrics((current) => {
      const next = {
        ...current,
        mediaReadyAccepted: current.mediaReadyAccepted + (first.accepted ? 1 : 0),
        duplicateMediaReadyIgnored: current.duplicateMediaReadyIgnored + (!second.accepted && second.reason === 'duplicate' ? 1 : 0)
      };
      metricsRef.current = next;
      return next;
    });
    pushLocalEvent(`DUPLICATE_MEDIA_READY:${second.accepted ? 'accepted' : second.reason}`);
  };

  const copyCueCycle = async () => {
    await play(1);
    await play(-1);
    await play(1);
  };

  const actualRetiringPath = async () => {
    const cursor = runtime.getState().context.cursor;
    if (cursor.status !== 'hold' || cursor.scene !== 'hero') {
      seek('hero');
      await wait(20);
    }
    await play(1);
    await play(1);
  };

  useEffect(() => {
    const api: StageHarnessApi = {
      playForward: (options) => play(1, options),
      playReverse: (options) => play(-1, options),
      seek,
      duplicateMediaReady,
      copyCueCycle,
      actualRetiringPath,
      snapshot: () => readDomSnapshot(runtimeSnapshotRef.current, metricsRef.current)
    };
    window.__r2Stage = api;
    return () => {
      delete window.__r2Stage;
    };
  });

  const frame = readDomSnapshot(runtimeSnapshot, metrics);
  const visibleLayers = Object.values(visibilityByScene).filter((value) => value && isVisuallyVisible(value)).length;
  const interactableLayers = Object.values(visibilityByScene).filter((value) => value && isInteractable(value)).length;

  return (
    <div className="stage-harness-shell">
      <Stage
        window={runtimeSnapshot.context.layerWindow}
        modules={modules}
        registry={registry}
        visibilityByScene={visibilityByScene}
        copyCueScene={visibilityByScene.pattern && visibilityByScene.pattern.opacity >= 0.5 ? 'pattern' : undefined}
        onLayerElement={(scene, element) => {
          if (element) {
            layerElements.current.set(scene, element);
          } else {
            layerElements.current.delete(scene);
          }
        }}
      />
      <canvas ref={canvasRef} width="2" height="1" data-testid="stage-pixel-smoke" className="stage-pixel-smoke" />
      <aside className="stage-harness-hud">
        <div className="harness-state">{frame.phase}</div>
        <dl className="hud-grid">
          <div>
            <dt>visible</dt>
            <dd>{visibleLayers}</dd>
          </div>
          <div>
            <dt>interactable</dt>
            <dd>{interactableLayers}</dd>
          </div>
          <div>
            <dt>mounted</dt>
            <dd>{frame.mountedCount}</dd>
          </div>
          <div>
            <dt>runId</dt>
            <dd>{runtimeSnapshot.context.activeRunId ?? '-'}</dd>
          </div>
        </dl>
        <div className="harness-controls">
          <button type="button" onClick={() => void play(1)}>Forward</button>
          <button type="button" onClick={() => void play(-1)}>Reverse</button>
          <button type="button" onClick={() => void play(1, { slowReady: true })}>Slow Ready</button>
          <button type="button" onClick={() => void play(1, { buildTimeout: true })}>Build Timeout</button>
          <button type="button" onClick={() => seek('hero')}>Seek Hero</button>
          <button type="button" onClick={duplicateMediaReady}>Duplicate Media</button>
          <button type="button" onClick={() => void copyCueCycle()}>CopyCue Cycle</button>
          <button type="button" onClick={() => void actualRetiringPath()}>Retiring Path</button>
        </div>
      </aside>
    </div>
  );
}

declare global {
  interface Window {
    __r2Stage?: StageHarnessApi;
  }
}
