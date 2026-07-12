import { storyManifest } from '../../story/manifest';
import type {
  LayerHandle,
  LayerVisibilityState,
  SceneId,
  SegmentId,
  SpineSegmentNode,
  TransitionContext
} from '../../story/types';

export class FakeStyle {
  readonly values = new Map<string, string>();
  opacity = '';
  visibility = '';
  pointerEvents = '';
  clipPath = '';
  zIndex = '';

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  removeProperty(name: string): void {
    this.values.delete(name);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }
}

class FakeClassList {
  private readonly values = new Set<string>();

  add(...tokens: string[]): void {
    tokens.forEach((token) => this.values.add(token));
  }

  remove(...tokens: string[]): void {
    tokens.forEach((token) => this.values.delete(token));
  }

  contains(token: string): boolean {
    return this.values.has(token);
  }
}

export class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  readonly classList = new FakeClassList();
  readonly ownerDocument = { defaultView: { innerHeight: 720 } };
  parentElement: FakeElement | null = null;
  inert = false;
  className = '';
  private readonly selectors = new Map<string, FakeElement>();

  append(child: FakeElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  connect(selector: string, element: FakeElement): void {
    this.selectors.set(selector, element);
  }

  matches(selector: string): boolean {
    const scene = selector.match(/\[data-r4-scene="([^"]+)"\]/)?.[1];
    return scene !== undefined && this.dataset.r4Scene === scene;
  }

  querySelector(selector: string): FakeElement | null {
    const direct = this.selectors.get(selector);
    if (direct) {
      return direct;
    }
    const scene = selector.match(/\[data-r4-scene="([^"]+)"\]/)?.[1];
    const sceneMatch = scene ? this.selectors.get(`[data-r4-scene="${scene}"]`) : undefined;
    if (sceneMatch) {
      return sceneMatch;
    }
    const inkSegment = selector.match(/data-r4-ink-segment="([^"]+)"/)?.[1];
    if (inkSegment) {
      return this.children.find((child) => child.dataset.r4InkSegment === inkSegment) ?? null;
    }
    if (selector === '[data-stage-retained-figure2-arch="true"]') {
      return this.children.find((child) => child.dataset.stageRetainedFigure2Arch === 'true') ?? null;
    }
    return null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  setAttribute(name: string, value: string): void {
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  removeAttribute(name: string): void {
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }
}

export class FakeCanvas extends FakeElement {
  getContext(): null {
    return null;
  }

  remove(): void {
    if (!this.parentElement) {
      return;
    }
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) {
      this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
  }
}

export class FakeVideo extends FakeElement {
  duration = 2.5;
  private time = 0;
  currentTimeWrites = 0;
  paused = true;
  loop = false;
  muted = false;
  playsInline = false;
  playbackRate = 1;
  playCalls = 0;
  preload = 'auto';
  loadCalls = 0;

  get currentTime(): number {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    this.currentTimeWrites += 1;
  }

  get ended(): boolean {
    return this.currentTime >= this.duration - 0.001;
  }

  pause(): void {
    this.paused = true;
  }

  load(): void {
    this.loadCalls += 1;
  }

  addEventListener(type: string, listener: () => void): void {
    void type;
    void listener;
  }

  removeEventListener(type: string, listener: () => void): void {
    void type;
    void listener;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }
}

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id
  );
  if (!found) {
    throw new Error(`${id} segment missing`);
  }
  return structuredClone(found);
}

function layer(
  scene: SceneId,
  role: 'current' | 'next',
  element: FakeElement
): LayerHandle {
  let visibility: LayerVisibilityState = {
    mounted: true,
    visible: role === 'current',
    inert: role !== 'current',
    opacity: role === 'current' ? 1 : 0,
    pointerEvents: role === 'current' ? 'auto' : 'none'
  };
  return {
    scene,
    role,
    element: element as unknown as HTMLElement,
    get visibility() {
      return visibility;
    },
    setVisibility(next) {
      visibility = next;
    },
    dispose() {
      visibility = { mounted: false, visible: false, inert: true, opacity: 0, pointerEvents: 'none' };
    }
  };
}

export function createBackHalfDomContext(
  id: SegmentId,
  from: SceneId,
  to: SceneId
): {
  context: TransitionContext;
  stage: FakeElement;
  fromLayer: LayerHandle;
  toLayer: LayerHandle;
  fromRoot: FakeElement;
  toRoot: FakeElement;
} {
  const stage = new FakeElement();
  const fromElement = new FakeElement();
  const toElement = new FakeElement();
  const fromRoot = new FakeElement();
  const toRoot = new FakeElement();
  fromRoot.dataset.r4Scene = from;
  toRoot.dataset.r4Scene = to;
  fromElement.connect(`[data-r4-scene="${from}"]`, fromRoot);
  toElement.connect(`[data-r4-scene="${to}"]`, toRoot);
  stage.append(fromElement);
  stage.append(toElement);
  const fromLayer = layer(from, 'current', fromElement);
  const toLayer = layer(to, 'next', toElement);
  return {
    stage,
    fromLayer,
    toLayer,
    fromRoot,
    toRoot,
    context: {
      segment: segment(id),
      from: fromLayer,
      to: toLayer,
      stage: {
        getLayer: () => undefined,
        ensureLayer: (scene, role) => layer(scene, role === 'current' ? 'current' : 'next', new FakeElement()),
        releaseLayer: () => undefined,
        snapshot: () => []
      },
      direction: 1,
      runId: 'back-half-test:1',
      prepareToken: 'back-half-test:prepare:1',
      prefersReducedMotion: false,
      reportMilestone: () => undefined
    }
  };
}
