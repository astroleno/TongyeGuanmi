import { hiddenVisibility } from '../pilot/visibility';
import type {
  LayerHandle,
  LayerVisibilityState,
  SceneId,
  StageHandle,
  StageLayerRole
} from '../story/types';

export type LayerStoreSnapshot = {
  revision: number;
  visibilityByScene: Readonly<Partial<Record<SceneId, LayerVisibilityState>>>;
};

function visibilityEquals(left: LayerVisibilityState | undefined, right: LayerVisibilityState): boolean {
  return left?.mounted === right.mounted
    && left.visible === right.visible
    && left.inert === right.inert
    && left.opacity === right.opacity
    && left.pointerEvents === right.pointerEvents;
}

function cloneVisibility(
  visibility: Partial<Record<SceneId, LayerVisibilityState>>
): Partial<Record<SceneId, LayerVisibilityState>> {
  return Object.fromEntries(
    Object.entries(visibility).map(([scene, state]) => [scene, state ? { ...state } : state])
  ) as Partial<Record<SceneId, LayerVisibilityState>>;
}

function applyVisibilityToElement(element: HTMLElement, state: LayerVisibilityState): void {
  element.style.opacity = String(state.opacity);
  element.style.visibility = state.visible ? 'visible' : 'hidden';
  element.style.pointerEvents = state.pointerEvents;
  element.inert = state.inert;
  element.setAttribute('aria-hidden', state.inert ? 'true' : 'false');
  element.dataset.visible = String(state.visible && state.opacity > 0.001);
  element.dataset.interactable = String(!state.inert && state.pointerEvents === 'auto');
}

export class LayerStore implements StageHandle {
  private readonly handles = new Map<SceneId, LayerHandle>();
  private readonly elements = new Map<SceneId, HTMLElement>();
  private readonly listeners = new Set<() => void>();
  private visibilityByScene: Partial<Record<SceneId, LayerVisibilityState>>;
  private snapshotValue: LayerStoreSnapshot;

  constructor(initialVisibility: Partial<Record<SceneId, LayerVisibilityState>> = {}) {
    this.visibilityByScene = cloneVisibility(initialVisibility);
    this.snapshotValue = {
      revision: 0,
      visibilityByScene: this.visibilityByScene
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): LayerStoreSnapshot => this.snapshotValue;

  get revision(): number {
    return this.snapshotValue.revision;
  }

  getLayer(scene: SceneId): LayerHandle | undefined {
    return this.handles.get(scene);
  }

  ensureLayer(scene: SceneId, role: StageLayerRole): LayerHandle {
    const existing = this.handles.get(scene);
    if (existing) {
      existing.role = role;
      return existing;
    }
    const elementForScene = () => this.elements.get(scene) ?? null;
    const visibilityForScene = () => this.visibilityByScene[scene] ?? hiddenVisibility();
    const setSceneVisibility = (state: LayerVisibilityState) => this.setVisibility(scene, state);
    const handle: LayerHandle = {
      scene,
      role,
      get element() {
        return elementForScene();
      },
      get visibility() {
        return visibilityForScene();
      },
      setVisibility(state) {
        setSceneVisibility(state);
      },
      dispose() {
        setSceneVisibility(hiddenVisibility());
      }
    };
    this.handles.set(scene, handle);
    return handle;
  }

  releaseLayer(scene: SceneId): void {
    this.handles.get(scene)?.dispose();
    this.handles.delete(scene);
  }

  snapshot(): readonly LayerHandle[] {
    return [...this.handles.values()];
  }

  bindElement(scene: SceneId, element: HTMLElement | null): void {
    if (!element) {
      this.elements.delete(scene);
      return;
    }
    this.elements.set(scene, element);
    applyVisibilityToElement(element, this.visibilityByScene[scene] ?? hiddenVisibility());
  }

  boundElements(): IterableIterator<HTMLElement> {
    return this.elements.values();
  }

  setVisibility(scene: SceneId, state: LayerVisibilityState): boolean {
    if (visibilityEquals(this.visibilityByScene[scene], state)) {
      return false;
    }
    this.commit({ ...this.visibilityByScene, [scene]: { ...state } });
    return true;
  }

  setVisibilityAtRevision(scene: SceneId, state: LayerVisibilityState, expectedRevision: number): boolean {
    if (expectedRevision !== this.revision) {
      return false;
    }
    return this.setVisibility(scene, state);
  }

  replaceVisibility(next: Partial<Record<SceneId, LayerVisibilityState>>): boolean {
    const scenes = new Set([...Object.keys(this.visibilityByScene), ...Object.keys(next)] as SceneId[]);
    const changed = [...scenes].some((scene) => {
      const nextState = next[scene] ?? hiddenVisibility();
      return !visibilityEquals(this.visibilityByScene[scene], nextState);
    });
    if (!changed) {
      return false;
    }
    this.commit(cloneVisibility(next));
    return true;
  }

  private commit(next: Partial<Record<SceneId, LayerVisibilityState>>): void {
    this.visibilityByScene = next;
    this.snapshotValue = {
      revision: this.snapshotValue.revision + 1,
      visibilityByScene: this.visibilityByScene
    };
    for (const [scene, element] of this.elements) {
      applyVisibilityToElement(element, this.visibilityByScene[scene] ?? hiddenVisibility());
    }
    for (const listener of this.listeners) {
      listener();
    }
  }
}
