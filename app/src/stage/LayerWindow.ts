import { storyManifest } from '../story/manifest';
import type { SceneId, StoryManifest } from '../story/types';

export type LayerWindowSnapshot = {
  prev?: SceneId;
  current: SceneId;
  next?: SceneId;
  retiring: readonly SceneId[];
};

export type LayerWindowMember = {
  scene: SceneId;
  role: 'prev' | 'current' | 'next' | 'retiring';
  mountId: number;
};

function holdScenes(manifest: StoryManifest): SceneId[] {
  return manifest.nodes.flatMap((node) => (node.kind === 'hold' ? [node.scene] : []));
}

function sceneAt(scenes: readonly SceneId[], index: number): SceneId | undefined {
  return index >= 0 && index < scenes.length ? scenes[index] : undefined;
}

function activeScenes(snapshot: LayerWindowSnapshot): SceneId[] {
  return [snapshot.prev, snapshot.current, snapshot.next].filter((scene): scene is SceneId => Boolean(scene));
}

export function createLayerWindow(current: SceneId, manifest: StoryManifest = storyManifest): LayerWindowSnapshot {
  const scenes = holdScenes(manifest);
  const index = scenes.indexOf(current);
  if (index === -1) {
    throw new Error(`Cannot create LayerWindow for unknown scene: ${current}`);
  }

  const prev = sceneAt(scenes, index - 1);
  const next = sceneAt(scenes, index + 1);
  return {
    current,
    retiring: [],
    ...(prev ? { prev } : {}),
    ...(next ? { next } : {})
  };
}

export function advanceLayerWindow(
  snapshot: LayerWindowSnapshot,
  current: SceneId,
  manifest: StoryManifest = storyManifest
): LayerWindowSnapshot {
  const next = createLayerWindow(current, manifest);
  const oldMembers = new Set([snapshot.prev, snapshot.current, snapshot.next].filter(Boolean));
  const newMembers = new Set([next.prev, next.current, next.next].filter(Boolean));
  const retiring = [...oldMembers].filter((scene): scene is SceneId => Boolean(scene) && !newMembers.has(scene));
  return {
    ...next,
    retiring
  };
}

export function releaseRetiringLayers(snapshot: LayerWindowSnapshot): LayerWindowSnapshot {
  return {
    ...snapshot,
    retiring: []
  };
}

export function assertLayerWindowInvariants(snapshot: LayerWindowSnapshot): void {
  const active = activeScenes(snapshot);
  const activeSet = new Set(active);
  if (active.length > 3) {
    throw new Error(`LayerWindow active layer count exceeded 3: ${active.length}`);
  }
  if (active.length !== activeSet.size) {
    throw new Error('LayerWindow active roles must reference distinct scenes');
  }
  if (snapshot.retiring.some((scene) => activeSet.has(scene))) {
    throw new Error('LayerWindow retiring layer cannot remain an active window member');
  }
  if (active.length + snapshot.retiring.length > 4) {
    throw new Error(`LayerWindow transient mounted layer count exceeded 4: ${active.length + snapshot.retiring.length}`);
  }
}

export function fallbackLayerWindow(manifest: StoryManifest = storyManifest): LayerWindowSnapshot {
  const fallback = manifest.nodes.find((node) => node.kind === 'hold' && node.staticFallback);
  if (fallback?.kind !== 'hold') {
    throw new Error('Manifest does not include a static fallback hold');
  }
  return createLayerWindow(fallback.scene, manifest);
}

export class LayerWindow {
  private snapshotValue: LayerWindowSnapshot;
  private readonly manifest: StoryManifest;
  private readonly mountIds = new Map<SceneId, number>();
  private readonly retiringEnteredAtHold = new Map<SceneId, number>();
  private nextMountId = 0;
  private holdSerial = 0;

  constructor(current: SceneId, manifest: StoryManifest = storyManifest) {
    this.manifest = manifest;
    this.snapshotValue = createLayerWindow(current, manifest);
    this.ensureMountIds(this.snapshotValue);
    assertLayerWindowInvariants(this.snapshotValue);
  }

  get snapshot(): LayerWindowSnapshot {
    return this.snapshotValue;
  }

  commitHold(current: SceneId): LayerWindowSnapshot {
    if (this.retiringEnteredAtHold.size > 0) {
      throw new Error('LayerWindow retiring layer survived into the next hold');
    }
    this.holdSerial += 1;
    this.snapshotValue = advanceLayerWindow(this.snapshotValue, current, this.manifest);
    this.ensureMountIds(this.snapshotValue);
    for (const scene of this.snapshotValue.retiring) {
      this.retiringEnteredAtHold.set(scene, this.holdSerial);
    }
    assertLayerWindowInvariants(this.snapshotValue);
    return this.snapshotValue;
  }

  releaseRetiring(): readonly SceneId[] {
    const released = [...this.snapshotValue.retiring];
    for (const scene of released) {
      this.mountIds.delete(scene);
      this.retiringEnteredAtHold.delete(scene);
    }
    this.snapshotValue = releaseRetiringLayers(this.snapshotValue);
    assertLayerWindowInvariants(this.snapshotValue);
    return released;
  }

  members(): readonly LayerWindowMember[] {
    const members: LayerWindowMember[] = [];
    if (this.snapshotValue.prev) {
      members.push({ scene: this.snapshotValue.prev, role: 'prev', mountId: this.mountId(this.snapshotValue.prev) });
    }
    members.push({ scene: this.snapshotValue.current, role: 'current', mountId: this.mountId(this.snapshotValue.current) });
    if (this.snapshotValue.next) {
      members.push({ scene: this.snapshotValue.next, role: 'next', mountId: this.mountId(this.snapshotValue.next) });
    }
    for (const scene of this.snapshotValue.retiring) {
      members.push({ scene, role: 'retiring', mountId: this.mountId(scene) });
    }
    return members;
  }

  mountId(scene: SceneId): number {
    const mountId = this.mountIds.get(scene);
    if (mountId === undefined) {
      throw new Error(`LayerWindow scene is not mounted: ${scene}`);
    }
    return mountId;
  }

  private ensureMountIds(snapshot: LayerWindowSnapshot): void {
    for (const scene of [...activeScenes(snapshot), ...snapshot.retiring]) {
      if (!this.mountIds.has(scene)) {
        this.nextMountId += 1;
        this.mountIds.set(scene, this.nextMountId);
      }
    }
  }
}
