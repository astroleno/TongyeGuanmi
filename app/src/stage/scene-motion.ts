export type SceneMotionSnapshot = Readonly<{
  active: boolean;
  baseActive: boolean;
  leaseCount: number;
  leaseOwners: readonly string[];
  bound: boolean;
}>;

export type SceneMotionLease = Readonly<{
  release(): void;
}>;

export type SceneMotionBinding = Readonly<{
  setBaseActive(active: boolean): void;
  dispose(): void;
}>;

export type SceneMotionLeaseTarget = Readonly<{
  key: string;
  root: HTMLElement | null;
  active: boolean;
}>;

export type SceneMotionLeaseGroup = Readonly<{
  sync(targets: readonly SceneMotionLeaseTarget[]): void;
  dispose(): void;
}>;

type MotionListener = (active: boolean) => void;

type MotionState = {
  root: HTMLElement;
  baseOwners: Set<symbol>;
  leaseOwners: Map<string, Set<symbol>>;
  listeners: Set<MotionListener>;
};

const motionStates = new WeakMap<HTMLElement, MotionState>();

function stateFor(root: HTMLElement): MotionState {
  const existing = motionStates.get(root);
  if (existing) {
    return existing;
  }
  const created: MotionState = {
    root,
    baseOwners: new Set(),
    leaseOwners: new Map(),
    listeners: new Set()
  };
  motionStates.set(root, created);
  updateDiagnostics(created);
  return created;
}

function snapshotFor(state: MotionState): SceneMotionSnapshot {
  const leaseOwners = [...state.leaseOwners.entries()]
    .filter(([, acquisitions]) => acquisitions.size > 0)
    .map(([owner]) => owner)
    .sort();
  const baseActive = state.baseOwners.size > 0;
  return {
    active: baseActive || leaseOwners.length > 0,
    baseActive,
    leaseCount: leaseOwners.length,
    leaseOwners,
    bound: state.listeners.size > 0
  };
}

function updateDiagnostics(state: MotionState): SceneMotionSnapshot {
  const snapshot = snapshotFor(state);
  state.root.dataset.sceneMotionActive = String(snapshot.active);
  state.root.dataset.sceneMotionBaseActive = String(snapshot.baseActive);
  state.root.dataset.sceneMotionLeaseCount = String(snapshot.leaseCount);
  state.root.dataset.sceneMotionOwners = snapshot.leaseOwners.join(',');
  state.root.dataset.sceneMotionBound = String(snapshot.bound);
  return snapshot;
}

function publish(state: MotionState): void {
  const snapshot = updateDiagnostics(state);
  for (const listener of state.listeners) {
    listener(snapshot.active);
  }
}

export function sceneMotionSnapshot(root: HTMLElement | null): SceneMotionSnapshot {
  if (!root) {
    return { active: false, baseActive: false, leaseCount: 0, leaseOwners: [], bound: false };
  }
  return updateDiagnostics(stateFor(root));
}

export function acquireSceneMotionLease(root: HTMLElement | null, owner: string): SceneMotionLease {
  if (!root) {
    return { release() {} };
  }
  const state = stateFor(root);
  const acquisition = Symbol(owner);
  const acquisitions = state.leaseOwners.get(owner) ?? new Set<symbol>();
  acquisitions.add(acquisition);
  state.leaseOwners.set(owner, acquisitions);
  publish(state);
  let released = false;
  return {
    release() {
      if (released) {
        return;
      }
      released = true;
      const current = state.leaseOwners.get(owner);
      current?.delete(acquisition);
      if (current?.size === 0) {
        state.leaseOwners.delete(owner);
      }
      publish(state);
    }
  };
}

export function bindSceneMotion(root: HTMLElement, listener: MotionListener): SceneMotionBinding {
  const state = stateFor(root);
  const baseOwner = Symbol('scene-base-motion');
  let baseActive = false;
  let disposed = false;
  state.listeners.add(listener);
  updateDiagnostics(state);
  listener(snapshotFor(state).active);
  return {
    setBaseActive(active) {
      if (disposed || active === baseActive) {
        return;
      }
      baseActive = active;
      if (active) {
        state.baseOwners.add(baseOwner);
      } else {
        state.baseOwners.delete(baseOwner);
      }
      publish(state);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      state.baseOwners.delete(baseOwner);
      state.listeners.delete(listener);
      publish(state);
      listener(false);
    }
  };
}

export function createSceneMotionLeaseGroup(owner: string): SceneMotionLeaseGroup {
  const entries = new Map<string, { root: HTMLElement; lease: SceneMotionLease }>();
  let disposed = false;
  return {
    sync(targets) {
      if (disposed) {
        return;
      }
      const next = new Map(targets.map((target) => [target.key, target]));
      for (const [key, entry] of entries) {
        const target = next.get(key);
        if (!target?.active || !target.root || target.root !== entry.root) {
          entry.lease.release();
          entries.delete(key);
        }
      }
      for (const target of next.values()) {
        if (target.root) {
          sceneMotionSnapshot(target.root);
        }
        if (!target.active || !target.root || entries.has(target.key)) {
          continue;
        }
        entries.set(target.key, {
          root: target.root,
          lease: acquireSceneMotionLease(target.root, `${owner}:${target.key}`)
        });
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const entry of entries.values()) {
        entry.lease.release();
      }
      entries.clear();
    }
  };
}
