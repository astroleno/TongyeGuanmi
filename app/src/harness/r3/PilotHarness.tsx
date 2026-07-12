import { useEffect, useMemo, useRef, useState } from 'react';
import { createDirectorRuntime, type StoryDebugSnapshot } from '../../runtime/director.actor';
import { Stage } from '../../stage/Stage';
import { positionReadingAtEdge } from '../../stage/reading';
import type { LayerWindowSnapshot } from '../../stage/LayerWindow';
import { HandleRegistry } from '../../story/registry';
import type {
  Direction,
  LayerHandle,
  LayerVisibilityState,
  PrepareToken,
  SceneId,
  SegmentId,
  StageHandle,
  StageLayerRole,
  SegmentRunId
} from '../../story/types';
import { aodAnimationScene } from '../../scenes/aod-animation';
import { methodTopScene } from '../../scenes/method-top';
import { starMapScene } from '../../scenes/star-map';
import { createStarMapAodTransition } from '../../transitions/star-map-aod';
import { createAodMethodTopTransition } from '../../transitions/aod-method-top';
import {
  AOD_MEDIA_KEY,
  waitForAodVideoEnded,
  waitForAodVideoReady,
  type AodVideoMilestoneRecord
} from '../../transitions/aod-method-top/media';
import { hiddenVisibility, holdVisibility, applyLayerVisibility } from '../../pilot/visibility';
import { createR3PilotManifest, type PilotHarnessMode } from './pilotManifest';
import { shouldWaitForPilotMediaReady } from './mediaGate';
import type { InkGradePreset } from '../../transitions/shared/sceneInk';

type HarnessPhase = 'booting' | 'hold' | 'preparing' | 'playing' | 'scrubbing' | 'staged-paused' | 'settling' | 'recovering' | 'seeking';

type PlayOptions = {
  slowReady?: boolean;
  buildTimeout?: boolean;
  offline?: boolean;
};

type PilotMetrics = {
  mediaReadyAccepted: number;
  loadedmetadataAccepted: number;
  canplayAccepted: number;
  endedAccepted: number;
  copyCueActivations: number;
  duplicateMediaReadyIgnored: number;
  staleMediaEventIgnored: number;
  mediaTimeouts: number;
  staleCompletionIgnored: number;
  recoveryCount: number;
  localEvents: readonly string[];
  mediaMilestones: readonly AodVideoMilestoneRecord[];
};

export type PilotSnapshot = {
  phase: HarnessPhase;
  mode: PilotHarnessMode;
  window: LayerWindowSnapshot;
  visibleCount: number;
  interactableCount: number;
  mountedCount: number;
  eventLog: readonly string[];
  mediaReadyAccepted: number;
  loadedmetadataAccepted: number;
  canplayAccepted: number;
  endedAccepted: number;
  duplicateMediaReadyIgnored: number;
  staleMediaEventIgnored: number;
  mediaTimeouts: number;
  staleCompletionIgnored: number;
  recoveryCount: number;
  copyCueActivations: number;
  mediaMilestones: readonly AodVideoMilestoneRecord[];
  trace: StoryDebugSnapshot['eventLog'];
  inkGrade: InkGradePreset;
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

type PilotHarnessApi = {
  playForward(options?: PlayOptions): Promise<void>;
  playReverse(options?: PlayOptions): Promise<void>;
  seek(scene: SceneId): void;
  duplicateMediaReady(): void;
  staleMediaReady(): void;
  probeVideoMilestones(): Promise<void>;
  copyCueCycle(): Promise<void>;
  setInkGrade(grade: InkGradePreset): void;
  snapshot(): PilotSnapshot;
};

const modules = {
  'star-map': starMapScene,
  'aod-animation': aodAnimationScene,
  'method-top': methodTopScene
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function firstHoldFor(window: LayerWindowSnapshot): SceneId {
  return window.current;
}

function holdVisibilityForWindow(window: LayerWindowSnapshot): Partial<Record<SceneId, LayerVisibilityState>> {
  const scenes: SceneId[] = ['star-map', 'aod-animation', 'method-top'];
  const next = Object.fromEntries(scenes.map((scene) => [scene, hiddenVisibility()])) as Partial<Record<SceneId, LayerVisibilityState>>;
  next[window.current] = holdVisibility(true);
  for (const scene of window.retiring) {
    next[scene] = hiddenVisibility();
  }
  return next;
}

async function waitForRuntimeIdle(runtime: ReturnType<typeof createDirectorRuntime>): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const snapshot = runtime.getState();
    const state = String(snapshot.state);
    const recovery = snapshot.context.recovery;
    const recoverySettled = recovery?.scope !== 'segment' || recovery.status !== 'recovering';
    if ((state === 'hold' || state === 'staged-paused') && recoverySettled) {
      return;
    }
    await wait(25);
  }
  throw new Error(`R3 pilot harness did not return to hold; current state: ${String(runtime.getState().state)}`);
}

function eventTypes(snapshot: StoryDebugSnapshot): string[] {
  return snapshot.eventLog.map((record) => {
    if (record.event.type === 'SEGMENT_ABORTED') {
      return `${record.event.type}:${record.event.reason}:${record.event.runId}`;
    }
    if (record.event.type === 'BUILD_TIMEOUT') {
      return `${record.event.type}:${record.event.segment}`;
    }
    if (record.event.type === 'MEDIA_READY') {
      return `${record.event.type}:${record.event.key}`;
    }
    return record.event.type;
  });
}

function readDomSnapshot(
  mode: PilotHarnessMode,
  snapshot: StoryDebugSnapshot,
  metrics: PilotMetrics,
  inkGrade: InkGradePreset
): PilotSnapshot {
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
  const eventLog = [...eventTypes(snapshot), ...metrics.localEvents].slice(-160);

  return {
    phase: String(snapshot.state) as HarnessPhase,
    mode,
    window: snapshot.context.layerWindow,
    visibleCount: layers.filter((layer) => layer.visible).length,
    interactableCount: layers.filter((layer) => layer.interactable).length,
    mountedCount: layers.length,
    eventLog,
    mediaReadyAccepted: metrics.mediaReadyAccepted,
    loadedmetadataAccepted: metrics.loadedmetadataAccepted,
    canplayAccepted: metrics.canplayAccepted,
    endedAccepted: metrics.endedAccepted,
    duplicateMediaReadyIgnored: metrics.duplicateMediaReadyIgnored,
    staleMediaEventIgnored: metrics.staleMediaEventIgnored,
    mediaTimeouts: metrics.mediaTimeouts,
    staleCompletionIgnored: metrics.staleCompletionIgnored,
    recoveryCount: metrics.recoveryCount,
    copyCueActivations: Math.max(metrics.copyCueActivations, ...layers.map((layer) => layer.copyCueActivations)),
    mediaMilestones: metrics.mediaMilestones,
    trace: snapshot.eventLog,
    inkGrade,
    layers
  };
}

export function PilotHarness({ mode }: { mode: PilotHarnessMode }) {
  const manifest = useMemo(() => createR3PilotManifest(mode), [mode]);
  const registry = useMemo(() => new HandleRegistry(), []);
  const buildDelayMs = useRef(0);
  const layerElements = useRef(new Map<SceneId, HTMLElement>());
  const layers = useRef(new Map<SceneId, LayerHandle>());
  const localLog = useRef<string[]>([]);
  const mediaGateCounter = useRef(0);
  const videoProbeCounter = useRef(0);
  const playOptionsRef = useRef<PlayOptions>({});
  const inkGradeRef = useRef<InkGradePreset>('edge-only');
  const [visibilityByScene, setVisibilityByScene] = useState<Partial<Record<SceneId, LayerVisibilityState>>>(() => {
    const initialWindow = { current: manifest.nodes.find((node) => node.kind === 'hold')?.scene ?? 'star-map', retiring: [] } as LayerWindowSnapshot;
    return holdVisibilityForWindow(initialWindow);
  });
  const visibilityRef = useRef(visibilityByScene);
  const [metrics, setMetrics] = useState<PilotMetrics>({
    mediaReadyAccepted: 0,
    loadedmetadataAccepted: 0,
    canplayAccepted: 0,
    endedAccepted: 0,
    copyCueActivations: 0,
    duplicateMediaReadyIgnored: 0,
    staleMediaEventIgnored: 0,
    mediaTimeouts: 0,
    staleCompletionIgnored: 0,
    recoveryCount: 0,
    localEvents: [],
    mediaMilestones: []
  });
  const metricsRef = useRef(metrics);

  const updateMetrics = (updater: (current: PilotMetrics) => PilotMetrics) => {
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

  const recordMediaMilestone = (record: AodVideoMilestoneRecord) => {
    updateMetrics((current) => ({
      ...current,
      loadedmetadataAccepted: current.loadedmetadataAccepted + (record.milestone === 'loadedmetadata' && record.accepted ? 1 : 0),
      canplayAccepted: current.canplayAccepted + (record.milestone === 'canplay' && record.accepted ? 1 : 0),
      endedAccepted: current.endedAccepted + (record.milestone === 'ended' && record.accepted ? 1 : 0),
      staleMediaEventIgnored: current.staleMediaEventIgnored + (record.reason === 'stale' ? 1 : 0),
      mediaTimeouts: current.mediaTimeouts + (record.reason === 'timeout' ? 1 : 0),
      mediaMilestones: [...current.mediaMilestones, record].slice(-80)
    }));
    pushLocalEvent(`MEDIA_${record.milestone}:${record.accepted ? 'accepted' : record.reason ?? 'ignored'}`);
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

  const aodVideo = () => layerElements.current.get('aod-animation')?.querySelector<HTMLVideoElement>('[data-aod-figure-video]') ?? null;

  const runtime = useMemo(() => {
    const runtimeBox: { current?: ReturnType<typeof createDirectorRuntime> } = {};
    const transitions = {
      'star-map-aod': createStarMapAodTransition({
        delayMs: () => buildDelayMs.current,
        grade: () => inkGradeRef.current
      }),
      'aod-method-top': createAodMethodTopTransition({
        delayMs: () => buildDelayMs.current,
        getVideo: aodVideo
      })
    };
    const runtimeInstance = createDirectorRuntime({
      actorEpoch: 'r3-pilot',
      manifest,
      stage: stageHandle,
      transitions,
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
        waitForMediaReady: async ({ segment, prepareToken, direction }) => {
          if (!shouldWaitForPilotMediaReady(segment, direction)) {
            if (segment.id === 'aod-method-top') {
              pushLocalEvent('MEDIA_READY:reverse-static-fallback');
            }
            return;
          }
          registry.beginMediaGate(AOD_MEDIA_KEY, { prepareToken });
          const options = playOptionsRef.current;
          if (options.slowReady) {
            await wait(180);
          }
          if (options.offline) {
            await wait(220);
            recordMediaMilestone({
              milestone: 'timeout',
              key: AOD_MEDIA_KEY,
              prepareToken,
              accepted: false,
              reason: 'timeout'
            });
            throw new Error('AOD media offline simulation');
          }
          let video: HTMLVideoElement | null = null;
          for (let attempt = 0; attempt < 80; attempt += 1) {
            video = aodVideo();
            if (video) {
              break;
            }
            await wait(5);
          }
          await waitForAodVideoReady(video, {
            prepareToken,
            timeoutMs: 1600,
            onMilestone: recordMediaMilestone
          });
          const result = registry.reportMediaReady(AOD_MEDIA_KEY, { prepareToken });
          if (!result.accepted) {
            if (result.reason === 'duplicate') {
              updateMetrics((current) => ({
                ...current,
                duplicateMediaReadyIgnored: current.duplicateMediaReadyIgnored + 1
              }));
            }
            if (result.reason === 'stale') {
              updateMetrics((current) => ({
                ...current,
                staleMediaEventIgnored: current.staleMediaEventIgnored + 1
              }));
            }
            throw new Error(`AOD mediaReady rejected: ${result.reason}`);
          }
          runtimeInstance.send({ type: 'MEDIA_READY', key: 'mediaReady', prepareToken });
          updateMetrics((current) => ({
            ...current,
            mediaReadyAccepted: current.mediaReadyAccepted + 1
          }));
          pushLocalEvent('MEDIA_READY:accepted');
        },
        beginBuild: ({ segment, prepareToken, prepareRunId }) => {
          if (segment.id === 'star-map-aod' || segment.id === 'aod-method-top') {
            registry.beginBuildGate(segment.id, { prepareToken, runId: prepareRunId });
          }
        },
        reportBuildReady: ({ segment, prepareToken, prepareRunId }) => {
          if (segment.id !== 'star-map-aod' && segment.id !== 'aod-method-top') {
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
    });
    runtimeBox.current = runtimeInstance;
    return runtimeInstance;
  }, [manifest, registry, stageHandle]);
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
    playOptionsRef.current = options;
    buildDelayMs.current = options.buildTimeout ? 2200 : 0;
    if (options.buildTimeout) {
      runtime.segmentPlayer.dispose('star-map-aod');
      runtime.segmentPlayer.dispose('aod-method-top');
    }
    const segment = segmentForCurrentHold(direction);
    const recoveryBefore = runtime.getState().context.lastError;
    runtime.send({ type: 'CHARGE_FIRED', direction });
    await waitForRuntimeIdle(runtime);
    const next = runtime.getState();
    runtimeSnapshotRef.current = next;
    if (next.state === 'hold') {
      setHoldVisibility(next.context.layerWindow);
      const entry = next.context.holdEntry;
      if (next.context.cursor.status === 'hold' && entry.scene === next.context.cursor.scene) {
        positionReadingAtEdge(layerElements.current.get(entry.scene), entry.edge);
      }
    }
    setRuntimeSnapshot(next);
    if (next.context.lastError && next.context.lastError !== recoveryBefore) {
      updateMetrics((current) => ({ ...current, recoveryCount: current.recoveryCount + 1 }));
    }
    if (segment === 'aod-method-top' && direction === 1 && next.context.cursor.status === 'hold' && next.context.cursor.scene === 'method-top') {
      updateMetrics((current) => ({ ...current, copyCueActivations: current.copyCueActivations + 1 }));
    }
    pushLocalEvent(`PLAY:${segment ?? 'none'}:${direction}`);
    playOptionsRef.current = {};
  };

  const seek = (scene: SceneId) => {
    const activeRunId = runtime.getState().context.activeRunId;
    runtime.send({ type: 'SEEK', label: `scene:${scene}`, source: 'menu' });
    if (activeRunId) {
      window.setTimeout(() => {
        updateMetrics((current) => ({
          ...current,
          staleCompletionIgnored: current.staleCompletionIgnored + 1
        }));
      }, 280);
    }
  };

  const duplicateMediaReady = () => {
    mediaGateCounter.current += 1;
    const prepareToken = `r3-pilot:prepare:${mediaGateCounter.current}` as PrepareToken;
    registry.beginMediaGate(AOD_MEDIA_KEY, { prepareToken });
    const first = registry.reportMediaReady(AOD_MEDIA_KEY, { prepareToken });
    const second = registry.reportMediaReady(AOD_MEDIA_KEY, { prepareToken });
    updateMetrics((current) => ({
      ...current,
      mediaReadyAccepted: current.mediaReadyAccepted + (first.accepted ? 1 : 0),
      duplicateMediaReadyIgnored: current.duplicateMediaReadyIgnored + (!second.accepted && second.reason === 'duplicate' ? 1 : 0)
    }));
    pushLocalEvent(`DUPLICATE_MEDIA_READY:${second.accepted ? 'accepted' : second.reason}`);
  };

  const staleMediaReady = () => {
    mediaGateCounter.current += 1;
    const prepareToken = `r3-pilot:prepare:${mediaGateCounter.current}` as PrepareToken;
    const staleToken = `r3-pilot:prepare:${mediaGateCounter.current + 1}` as PrepareToken;
    registry.beginMediaGate(AOD_MEDIA_KEY, { prepareToken });
    const result = registry.reportMediaReady(AOD_MEDIA_KEY, { prepareToken: staleToken });
    updateMetrics((current) => ({
      ...current,
      staleMediaEventIgnored: current.staleMediaEventIgnored + (!result.accepted && result.reason === 'stale' ? 1 : 0)
    }));
    pushLocalEvent(`STALE_MEDIA_READY:${result.accepted ? 'accepted' : result.reason}`);
  };

  const probeVideoMilestones = async () => {
    let video: HTMLVideoElement | null = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      video = aodVideo();
      if (video) {
        break;
      }
      await wait(5);
    }
    if (!video) {
      throw new Error('AOD video is not mounted for milestone probe');
    }
    videoProbeCounter.current += 1;
    const prepareToken = `r3-probe:prepare:${videoProbeCounter.current}` as PrepareToken;
    const runId = `r3-probe:${videoProbeCounter.current}` as SegmentRunId;
    await waitForAodVideoReady(video, {
      prepareToken,
      timeoutMs: 2000,
      isCurrent: () => true,
      onMilestone: recordMediaMilestone
    });
    video.pause();
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.max(0, video.duration - 0.08);
    }
    video.playbackRate = 1;
    await video.play();
    await waitForAodVideoEnded(video, {
      runId,
      timeoutMs: 1200,
      isCurrent: () => true,
      onMilestone: recordMediaMilestone
    });
    video.pause();
    video.playbackRate = 1;
    pushLocalEvent('VIDEO_MILESTONE_PROBE:completed');
  };

  const copyCueCycle = async () => {
    if (firstHoldFor(runtime.getState().context.layerWindow) !== 'aod-animation') {
      seek('aod-animation');
      await wait(20);
    }
    await play(1);
    await play(-1);
    await play(1);
  };

  function setInkGrade(grade: InkGradePreset) {
    inkGradeRef.current = grade;
    runtime.segmentPlayer.dispose('star-map-aod');
    pushLocalEvent(`INK_GRADE:${grade}`);
  }

  useEffect(() => {
    const api: PilotHarnessApi = {
      playForward: (options) => play(1, options),
      playReverse: (options) => play(-1, options),
      seek,
      duplicateMediaReady,
      staleMediaReady,
      probeVideoMilestones,
      copyCueCycle,
      setInkGrade: (grade) => setInkGrade(grade),
      snapshot: () => readDomSnapshot(mode, runtime.getState(), metricsRef.current, inkGradeRef.current)
    };
    window.__r3Pilot = api;
    return () => {
      delete window.__r3Pilot;
    };
  });

  const frame = readDomSnapshot(mode, runtimeSnapshot, metrics, inkGradeRef.current);
  const copyCueScene = (visibilityByScene['method-top']?.opacity ?? 0) > 0.001 ? 'method-top' : undefined;

  return (
    <div className="stage-harness-shell r3-pilot-shell" data-r3-pilot-mode={mode}>
      <Stage
        window={runtimeSnapshot.context.layerWindow}
        modules={modules}
        registry={registry}
        visibilityByScene={visibilityByScene}
        copyCueScene={copyCueScene}
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
            <dt>media</dt>
            <dd>{frame.mediaReadyAccepted}/{frame.loadedmetadataAccepted}/{frame.canplayAccepted}/{frame.endedAccepted}</dd>
          </div>
          <div>
            <dt>copyCue</dt>
            <dd>{frame.copyCueActivations}</dd>
          </div>
          <div>
            <dt>ink grade</dt>
            <dd>{frame.inkGrade}</dd>
          </div>
        </dl>
        <div className="harness-controls">
          <button type="button" onClick={() => void play(1)}>Forward</button>
          <button type="button" onClick={() => void play(-1)}>Reverse</button>
          <button type="button" onClick={() => void play(1, { slowReady: true })}>Slow Ready</button>
          <button type="button" onClick={() => void play(1, { offline: true })}>Offline</button>
          <button type="button" onClick={() => void play(1, { buildTimeout: true })}>Build Timeout</button>
          <button type="button" onClick={() => seek('star-map')}>Seek Star</button>
          <button type="button" onClick={() => seek('aod-animation')}>Seek AOD</button>
          <button type="button" onClick={duplicateMediaReady}>Duplicate Media</button>
          <button type="button" onClick={staleMediaReady}>Stale Media</button>
          <button type="button" onClick={() => void copyCueCycle()}>CopyCue Cycle</button>
          <button type="button" onClick={() => setInkGrade('edge-only')}>Ink Edge</button>
          <button type="button" onClick={() => setInkGrade('dark')}>Ink Dark</button>
        </div>
      </aside>
    </div>
  );
}

declare global {
  interface Window {
    __r3Pilot?: PilotHarnessApi;
  }
}
