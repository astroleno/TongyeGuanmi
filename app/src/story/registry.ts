import type {
  MediaKey,
  MilestoneKey,
  PrepareToken,
  SceneId,
  SceneModule,
  SegmentId,
  SegmentRunId,
  TransitionModule
} from './types';

export type GateGuard = {
  prepareToken?: PrepareToken;
  runId?: SegmentRunId;
};

export type GateResult =
  | { accepted: true; key: string; milestone: MilestoneKey }
  | { accepted: false; key: string; milestone: MilestoneKey; reason: 'duplicate' | 'stale' | 'missing-gate' };

export type SceneReadySnapshot = {
  scene: SceneId;
  rootReady: boolean;
  preloadReady: boolean;
  requiredHandles: readonly string[];
  readyHandles: readonly string[];
  targetReady: boolean;
};

export type RegistrySnapshot = {
  scenes: readonly SceneReadySnapshot[];
  mediaReady: readonly string[];
  buildReady: readonly string[];
};

type SceneEntry = {
  module?: SceneModule;
  root: HTMLElement | null;
  requiredHandles: Set<string>;
  handles: Map<string, HTMLElement>;
  preloadStarted: boolean;
  preloadReady: boolean;
  preloadPromise?: Promise<unknown>;
};

type GuardedGate = {
  guard: GateGuard;
  accepted: boolean;
};

function gateKey(key: string, guard: GateGuard = {}): string {
  return `${key}:${guard.prepareToken ?? '-'}:${guard.runId ?? '-'}`;
}

function guardMatches(expected: GateGuard, actual: GateGuard): boolean {
  return (
    (expected.prepareToken === undefined || expected.prepareToken === actual.prepareToken) &&
    (expected.runId === undefined || expected.runId === actual.runId)
  );
}

export class HandleRegistry {
  private readonly scenes = new Map<SceneId, SceneEntry>();
  private readonly transitions = new Map<SegmentId, TransitionModule>();
  private readonly mediaGates = new Map<MediaKey, GuardedGate>();
  private readonly buildGates = new Map<SegmentId, GuardedGate>();

  registerScene(module: SceneModule): void {
    const entry = this.entryFor(module.id);
    entry.module = module;
    for (const handle of module.requiredHandles ?? []) {
      entry.requiredHandles.add(handle);
    }
  }

  registerTransition(module: TransitionModule): void {
    this.transitions.set(module.id, module);
  }

  registerRoot(scene: SceneId, element: HTMLElement | null, requiredHandles: readonly string[] = []): void {
    const entry = this.entryFor(scene);
    entry.root = element;
    for (const handle of requiredHandles) {
      entry.requiredHandles.add(handle);
    }
  }

  registerHandle(scene: SceneId, name: string, element: HTMLElement | null): void {
    const entry = this.entryFor(scene);
    entry.requiredHandles.add(name);
    if (element) {
      entry.handles.set(name, element);
    } else {
      entry.handles.delete(name);
    }
  }

  startPreload(scene: SceneId, preload?: () => Promise<unknown> | unknown): Promise<unknown> {
    const entry = this.entryFor(scene);
    if (entry.preloadReady) {
      return Promise.resolve();
    }
    if (entry.preloadPromise) {
      return entry.preloadPromise;
    }

    entry.preloadStarted = true;
    const preloadFn = preload ?? entry.module?.preload;
    entry.preloadPromise = Promise.resolve(preloadFn?.call(entry.module)).then((result) => {
      entry.preloadReady = true;
      return result;
    });
    return entry.preloadPromise;
  }

  markPreloadReady(scene: SceneId): void {
    const entry = this.entryFor(scene);
    entry.preloadStarted = true;
    entry.preloadReady = true;
  }

  isTargetReady(scene: SceneId): boolean {
    const entry = this.entryFor(scene);
    return (
      Boolean(entry.root) &&
      entry.preloadReady &&
      [...entry.requiredHandles].every((handle) => entry.handles.has(handle))
    );
  }

  snapshotScene(scene: SceneId): SceneReadySnapshot {
    const entry = this.entryFor(scene);
    return {
      scene,
      rootReady: Boolean(entry.root),
      preloadReady: entry.preloadReady,
      requiredHandles: [...entry.requiredHandles].sort(),
      readyHandles: [...entry.handles.keys()].sort(),
      targetReady: this.isTargetReady(scene)
    };
  }

  beginMediaGate(key: MediaKey, guard: GateGuard = {}): void {
    this.mediaGates.set(key, { guard, accepted: false });
  }

  reportMediaReady(key: MediaKey, guard: GateGuard = {}): GateResult {
    return this.acceptGate(this.mediaGates, key, 'mediaReady', guard);
  }

  beginBuildGate(segment: SegmentId, guard: GateGuard = {}): void {
    this.buildGates.set(segment, { guard, accepted: false });
  }

  reportBuildReady(segment: SegmentId, guard: GateGuard = {}): GateResult {
    return this.acceptGate(this.buildGates, segment, 'buildReady', guard);
  }

  transition(segment: SegmentId): TransitionModule | undefined {
    return this.transitions.get(segment);
  }

  snapshot(): RegistrySnapshot {
    return {
      scenes: [...this.scenes.keys()].sort().map((scene) => this.snapshotScene(scene)),
      mediaReady: [...this.mediaGates.entries()]
        .filter(([, gate]) => gate.accepted)
        .map(([key, gate]) => gateKey(key, gate.guard))
        .sort(),
      buildReady: [...this.buildGates.entries()]
        .filter(([, gate]) => gate.accepted)
        .map(([key, gate]) => gateKey(key, gate.guard))
        .sort()
    };
  }

  private entryFor(scene: SceneId): SceneEntry {
    let entry = this.scenes.get(scene);
    if (!entry) {
      entry = {
        root: null,
        requiredHandles: new Set(),
        handles: new Map(),
        preloadStarted: false,
        preloadReady: false
      };
      this.scenes.set(scene, entry);
    }
    return entry;
  }

  private acceptGate<Key extends string>(
    gates: Map<Key, GuardedGate>,
    key: Key,
    milestone: MilestoneKey,
    guard: GateGuard
  ): GateResult {
    const gate = gates.get(key);
    if (!gate) {
      return { accepted: false, key, milestone, reason: 'missing-gate' };
    }
    if (!guardMatches(gate.guard, guard)) {
      return { accepted: false, key, milestone, reason: 'stale' };
    }
    if (gate.accepted) {
      return { accepted: false, key, milestone, reason: 'duplicate' };
    }
    gate.accepted = true;
    return { accepted: true, key, milestone };
  }
}
