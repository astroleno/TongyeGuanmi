import { applyLayerVisibility, hiddenVisibility, holdVisibility } from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentId,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';
import { createTransitionLayerElevation, type TransitionLayerElevation } from './layerElevation';
import {
  createBoundaryInkRenderer,
  mountTransitionInkCanvas,
  type BoundaryInkRenderer
} from './sceneInk';
import {
  createInkBoundaryFrame,
  type InkBoundaryFrame,
  type InkBoundarySpec
} from './inkBoundary';
import { positionReadingAtEdge } from '../../stage/reading';

export type InkBoundaryRoots = Readonly<{
  from: HTMLElement | null;
  to: HTMLElement | null;
  stage: HTMLElement | null;
}>;

export type InkBoundarySurfaces = Readonly<{
  reveal?: readonly HTMLElement[];
  conceal?: readonly HTMLElement[];
}>;

export type InkSegmentOptions = {
  id: SegmentId;
  boundary: InkBoundarySpec | ((roots: InkBoundaryRoots) => InkBoundarySpec);
  boundaryProgress?: (progress: number) => number;
  boundarySurfaces?: (roots: InkBoundaryRoots) => InkBoundarySurfaces;
  delayMs?: (() => number) | undefined;
  canvasHost?: 'from' | 'to' | 'stage';
  elevateTarget?: boolean;
  sample?: (progress: number) => InkSample;
  prepareEndpoints(roots: InkEndpointRoots): void;
  renderSource?: (root: HTMLElement | null, progress: number) => void;
  renderSourceProgress?: 'static' | 'remaining' | 'forward' | ((progress: number) => number);
  rootSelector?: (scene: string) => string;
  transitionAttr?: string;
  stops?: readonly number[];
  reportTimelineReadyAt?: number;
  positionFromReadingOnReverse?: boolean;
};

export type InkEndpointRoots = Readonly<{
  from: HTMLElement | null;
  to: HTMLElement | null;
}>;

export type InkSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
};

const MAX_INK_FRAME_DELTA_MS = 64;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeInOutCubic(value: number): number {
  const p = clamp(value);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function defaultRootSelector(scene: string): string {
  return `[data-r4-scene="${scene}"], [data-r3-scene="${scene}"]`;
}

function sceneRoot(element: HTMLElement | null | undefined, scene: string, selector = defaultRootSelector): HTMLElement | null {
  return element?.querySelector<HTMLElement>(selector(scene)) ?? element ?? null;
}

function sampleInk(progress: number): InkSample {
  const rawProgress = clamp(progress);
  if (rawProgress >= 0.999) {
    return {
      from: hiddenVisibility(),
      to: holdVisibility(false)
    };
  }
  if (rawProgress <= 0.001) {
    return {
      from: holdVisibility(false),
      to: hiddenVisibility()
    };
  }
  return {
    from: holdVisibility(false),
    to: holdVisibility(false)
  };
}

function mappedProgress(
  mode: 'static' | 'remaining' | 'forward' | ((progress: number) => number) | undefined,
  progress: number,
  fallback: 'static' | 'remaining' | 'forward'
): number {
  if (typeof mode === 'function') {
    return clamp(mode(progress));
  }
  const resolved = mode ?? fallback;
  if (resolved === 'static') {
    return 1;
  }
  return resolved === 'forward' ? progress : 1 - progress;
}

function sharedStageHost(context: TransitionContext): HTMLElement | null {
  const fromParent = context.from.element?.parentElement ?? null;
  const toParent = context.to.element?.parentElement ?? null;
  return fromParent && fromParent === toParent ? fromParent : toParent ?? fromParent;
}

function liveLayerElement(
  layer: Pick<TransitionContext['from'], 'scene' | 'element'>
): HTMLElement | null {
  const element = layer.element ?? null;
  if (element?.isConnected !== false) {
    return element;
  }
  const documentRef = element?.ownerDocument ?? (typeof document === 'undefined' ? null : document);
  return documentRef?.querySelector<HTMLElement>(`[data-stage-layer="${layer.scene}"]`) ?? element;
}

function liveStageHost(context: TransitionContext, fallback: HTMLElement | null): HTMLElement | null {
  if (fallback?.isConnected !== false) {
    return fallback;
  }
  const documentRef = fallback?.ownerDocument
    ?? context.to.element?.ownerDocument
    ?? context.from.element?.ownerDocument
    ?? (typeof document === 'undefined' ? null : document);
  return documentRef?.querySelector<HTMLElement>('[data-testid="r2-stage"]') ?? fallback;
}

function applyVisibilityToElement(element: HTMLElement | null, state: LayerVisibilityState): void {
  if (!element) {
    return;
  }
  element.style.opacity = String(state.opacity);
  element.style.visibility = state.visible ? 'visible' : 'hidden';
  element.style.pointerEvents = state.pointerEvents;
  element.style.clipPath = '';
  element.style.removeProperty('-webkit-clip-path');
  element.inert = state.inert;
  element.setAttribute('aria-hidden', state.inert ? 'true' : 'false');
  element.dataset.visible = String(state.visible && state.opacity > 0.001);
  element.dataset.interactable = String(!state.inert && state.pointerEvents === 'auto');
}

function canvasHost(context: TransitionContext, host: InkSegmentOptions['canvasHost']): HTMLElement | null {
  if (host === 'from') {
    return context.from.element ?? null;
  }
  if (host === 'to') {
    return context.to.element ?? null;
  }
  return sharedStageHost(context) ?? context.to.element ?? context.from.element ?? null;
}

function viewportFor(element: HTMLElement | null): Readonly<{ width: number; height: number }> {
  const rect = element?.getBoundingClientRect?.();
  const windowWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const windowHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  return {
    width: rect?.width || element?.clientWidth || windowWidth || 1440,
    height: rect?.height || element?.clientHeight || windowHeight || 900
  };
}

function clearBoundaryGeometry(element: HTMLElement | null | undefined): void {
  if (!element) {
    return;
  }
  element.style.clipPath = '';
  element.style.removeProperty('clip-path');
  element.style.removeProperty('-webkit-clip-path');
  element.removeAttribute('data-r4-reveal-progress');
  element.removeAttribute('data-r4-reveal-mode');
  element.removeAttribute('data-r4-ink-boundary-kind');
  element.removeAttribute('data-r4-ink-boundary-origin');
  element.removeAttribute('data-r4-ink-boundary-progress');
  element.removeAttribute('data-r4-ink-boundary-revision');
}

function applyBoundaryGeometry(
  element: HTMLElement,
  frame: InkBoundaryFrame,
  clipPath: string
): void {
  element.style.clipPath = clipPath;
  element.style.setProperty('-webkit-clip-path', clipPath);
  element.dataset.r4InkBoundaryKind = frame.kind;
  element.dataset.r4InkBoundaryOrigin = `${frame.origin.x.toFixed(4)},${frame.origin.y.toFixed(4)}`;
  element.dataset.r4InkBoundaryProgress = frame.progress.toFixed(4);
  element.dataset.r4InkBoundaryRevision = frame.revision;
}

function applyRevealBoundary(element: HTMLElement, frame: InkBoundaryFrame): void {
  if (frame.progress >= 0.999) {
    clearBoundaryGeometry(element);
    return;
  }
  applyBoundaryGeometry(element, frame, frame.revealClipPath);
  element.dataset.r4RevealProgress = frame.progress.toFixed(4);
  element.dataset.r4RevealMode = 'live-clip';
}

function applyConcealBoundary(element: HTMLElement, frame: InkBoundaryFrame): void {
  if (frame.progress <= 0.001) {
    element.style.visibility = 'visible';
    clearBoundaryGeometry(element);
    return;
  }
  if (frame.progress >= 0.999 || !frame.concealClipPath) {
    element.style.visibility = 'hidden';
    clearBoundaryGeometry(element);
    return;
  }
  element.style.visibility = 'visible';
  applyBoundaryGeometry(element, frame, frame.concealClipPath);
}

class InkSegmentTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly inkRenderer: BoundaryInkRenderer | null;
  private readonly boundarySpec: InkBoundarySpec;
  private readonly elevation: TransitionLayerElevation | null;
  private readonly attrsElement: HTMLElement | null;
  private readonly surfaceHost: HTMLElement | null;
  private liveElevation: TransitionLayerElevation | null = null;
  private liveElevationElement: HTMLElement | null = null;
  private endpointsPrepared = false;
  private preparedFromRoot: HTMLElement | null = null;
  private preparedToRoot: HTMLElement | null = null;
  private readonly revealSurfaces = new Set<HTMLElement>();
  private readonly concealSurfaces = new Set<HTMLElement>();

  constructor(
    private readonly context: TransitionContext,
    private readonly options: InkSegmentOptions
  ) {
    const stops = options.stops ?? [];
    this.labels = Object.fromEntries([
      ['start', 0],
      ['ink', 0.5],
      ...stops.map((stop, index) => [`stage:${index}`, stop] as const),
      ['end', 1]
    ]);
    this.pauses = stops.map((_, index) => `stage:${index}`);
    const surfaceHost = canvasHost(context, options.canvasHost);
    this.surfaceHost = surfaceHost;
    this.attrsElement = options.canvasHost === 'from'
      ? context.from.element
      : options.canvasHost === 'stage'
        ? surfaceHost
        : context.to.element;
    this.canvas = mountTransitionInkCanvas(surfaceHost, options.id, {
      renderer: 'boundary',
      preset: 'cinematic-color'
    });
    this.elevation = options.elevateTarget === false ? null : createTransitionLayerElevation(context.to.element);
    this.ensureEndpointsPrepared();
    const roots = this.boundaryRoots();
    this.boundarySpec = typeof options.boundary === 'function'
      ? options.boundary(roots)
      : options.boundary;
    this.inkRenderer = createBoundaryInkRenderer(this.canvas);
    this.inkRenderer?.prewarm(
      createInkBoundaryFrame(this.boundarySpec, 0.003, viewportFor(surfaceHost))
    );
    this.progress(context.direction === 1 ? 0 : 1);
  }

  play(): Promise<void> {
    return this.animateTo(1);
  }

  reverse(): Promise<void> {
    this.positionFromReadingForReverse();
    return this.animateTo(0);
  }

  progress(value: number): void {
    if (this.disposed) {
      return;
    }
    const activeSurfaceHost = liveStageHost(this.context, this.surfaceHost);
    if (
      this.canvas
      && activeSurfaceHost
      && typeof activeSurfaceHost.append === 'function'
      && this.canvas.parentElement !== activeSurfaceHost
    ) {
      activeSurfaceHost.append(this.canvas);
      this.canvas.dataset.r4InkRemounts = String(Number(this.canvas.dataset.r4InkRemounts ?? 0) + 1);
    }
    const clamped = clamp(value);
    const sample = this.options.sample?.(clamped) ?? sampleInk(clamped);
    const boundaryProgress = clamp(this.options.boundaryProgress?.(clamped) ?? clamped);
    this.progressValue = clamped;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    const liveFromElement = liveLayerElement(this.context.from);
    const liveToElement = liveLayerElement(this.context.to);
    const fromRoot = sceneRoot(liveFromElement, this.context.from.scene, this.options.rootSelector);
    const toRoot = sceneRoot(liveToElement, this.context.to.scene, this.options.rootSelector);
    this.ensureEndpointsPrepared(fromRoot, toRoot);
    if (liveFromElement !== this.context.from.element) {
      applyVisibilityToElement(liveFromElement, sample.from);
    }
    if (liveToElement !== this.context.to.element) {
      applyVisibilityToElement(liveToElement, sample.to);
    }
    this.elevation?.elevate();
    if (liveToElement && liveToElement !== this.context.to.element) {
      if (this.liveElevationElement !== liveToElement) {
        this.liveElevation?.restore();
        this.liveElevationElement = liveToElement;
        this.liveElevation = createTransitionLayerElevation(liveToElement);
      }
      this.liveElevation?.elevate();
    }
    const sourceProgress = mappedProgress(this.options.renderSourceProgress, clamped, 'static');
    this.options.renderSource?.(fromRoot, sourceProgress);
    const frame = createInkBoundaryFrame(
      this.boundarySpec,
      boundaryProgress,
      viewportFor(activeSurfaceHost)
    );
    const roots = this.boundaryRoots(fromRoot, toRoot, activeSurfaceHost);
    const surfaces = this.options.boundarySurfaces?.(roots) ?? {};
    const revealSurfaces = new Set(
      [liveToElement, ...(surfaces.reveal ?? [])].filter(
        (element): element is HTMLElement => Boolean(element)
      )
    );
    const concealSurfaces = new Set(
      [...(surfaces.conceal ?? [])].filter(
        (element): element is HTMLElement => Boolean(element)
      )
    );
    this.replaceManagedSurfaces(this.revealSurfaces, revealSurfaces, clearBoundaryGeometry);
    this.replaceManagedSurfaces(this.concealSurfaces, concealSurfaces, (element) => {
      clearBoundaryGeometry(element);
      if (boundaryProgress <= 0.001) {
        element.style.visibility = 'visible';
      } else if (boundaryProgress >= 0.999) {
        element.style.visibility = 'hidden';
      }
    });
    for (const element of revealSurfaces) {
      applyRevealBoundary(element, frame);
    }
    for (const element of concealSurfaces) {
      applyConcealBoundary(element, frame);
    }
    const liveAttrsElement = this.options.canvasHost === 'from'
      ? liveFromElement
      : this.options.canvasHost === 'stage'
        ? activeSurfaceHost
         : liveToElement;
    liveAttrsElement?.setAttribute('data-r4-transition', this.options.transitionAttr ?? this.options.id);
    liveAttrsElement?.setAttribute('data-r4-ink-active', String(boundaryProgress > 0.002 && boundaryProgress < 0.999));
    liveAttrsElement?.setAttribute('data-r4-ink-progress', boundaryProgress.toFixed(4));
    if (this.canvas) {
      this.canvas.dataset.r4InkActive = String(boundaryProgress > 0.002 && boundaryProgress < 0.999);
      this.canvas.dataset.r4InkProgress = boundaryProgress.toFixed(4);
      this.canvas.dataset.r4InkBoundaryKind = frame.kind;
      this.canvas.dataset.r4InkBoundaryOrigin = `${frame.origin.x.toFixed(4)},${frame.origin.y.toFixed(4)}`;
      this.canvas.dataset.r4InkBoundaryProgress = boundaryProgress.toFixed(4);
      this.canvas.dataset.r4InkBoundaryRevision = frame.revision;
    }
    this.inkRenderer?.render(frame);
    if (this.options.reportTimelineReadyAt !== undefined && clamped >= this.options.reportTimelineReadyAt) {
      this.context.reportMilestone({
        key: 'timelineReady',
        segment: this.context.segment.id,
        runId: this.context.runId,
        direction: this.context.direction,
        progress: clamped
      });
    }
  }

  jumpToEnd(direction: Direction): void {
    if (direction === -1) {
      this.positionFromReadingForReverse();
    }
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): InkSample {
    const clamped = clamp(progress);
    return this.options.sample?.(clamped) ?? sampleInk(clamped);
  }

  rootIdentity() {
    return {
      from: liveLayerElement(this.context.from),
      to: liveLayerElement(this.context.to)
    };
  }

  effectCanvases(): readonly HTMLCanvasElement[] {
    return this.canvas ? [this.canvas] : [];
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.inkRenderer?.destroy();
    this.canvas?.remove();
    this.elevation?.restore();
    this.liveElevation?.restore();
    const liveFromElement = liveLayerElement(this.context.from);
    const liveToElement = liveLayerElement(this.context.to);
    const activeSurfaceHost = liveStageHost(this.context, this.surfaceHost);
    for (const element of this.revealSurfaces) {
      clearBoundaryGeometry(element);
    }
    for (const element of this.concealSurfaces) {
      if (this.progressValue >= 0.999) {
        element.style.visibility = 'hidden';
      } else if (this.progressValue <= 0.001) {
        element.style.visibility = 'visible';
      }
      clearBoundaryGeometry(element);
    }
    this.revealSurfaces.clear();
    this.concealSurfaces.clear();
    clearBoundaryGeometry(this.context.to.element);
    clearBoundaryGeometry(liveToElement);
    const liveAttrsElement = this.options.canvasHost === 'from'
      ? liveFromElement
      : this.options.canvasHost === 'stage'
        ? activeSurfaceHost
        : liveToElement;
    for (const element of new Set([this.attrsElement, liveAttrsElement])) {
      clearBoundaryGeometry(element);
      element?.removeAttribute('data-r4-transition');
      element?.removeAttribute('data-r4-ink-active');
      element?.removeAttribute('data-r4-ink-progress');
    }
  }

  private positionFromReadingForReverse(): void {
    if (this.options.positionFromReadingOnReverse) {
      positionReadingAtEdge(liveLayerElement(this.context.from), 'bottom');
    }
  }

  private ensureEndpointsPrepared(
    fromRoot = sceneRoot(liveLayerElement(this.context.from), this.context.from.scene, this.options.rootSelector),
    toRoot = sceneRoot(liveLayerElement(this.context.to), this.context.to.scene, this.options.rootSelector)
  ): void {
    if (
      this.endpointsPrepared
      && this.preparedFromRoot === fromRoot
      && this.preparedToRoot === toRoot
    ) {
      return;
    }
    this.options.prepareEndpoints({ from: fromRoot, to: toRoot });
    this.preparedFromRoot = fromRoot;
    this.preparedToRoot = toRoot;
    this.endpointsPrepared = true;
  }

  private boundaryRoots(
    from = sceneRoot(liveLayerElement(this.context.from), this.context.from.scene, this.options.rootSelector),
    to = sceneRoot(liveLayerElement(this.context.to), this.context.to.scene, this.options.rootSelector),
    stage = liveStageHost(this.context, this.surfaceHost)
  ): InkBoundaryRoots {
    return { from, to, stage };
  }

  private replaceManagedSurfaces(
    managed: Set<HTMLElement>,
    next: Set<HTMLElement>,
    release: (element: HTMLElement) => void
  ): void {
    for (const element of managed) {
      if (!next.has(element)) {
        release(element);
        managed.delete(element);
      }
    }
    for (const element of next) {
      managed.add(element);
    }
  }

  private animateTo(target: number): Promise<void> {
    const start = this.progressValue;
    const delta = target - start;
    const durationMs = this.context.prefersReducedMotion ? 0 : this.context.segment.virtualDuration;
    if (delta === 0 || durationMs <= 0) {
      this.progress(target);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let elapsedMs = 0;
      let lastFrameAt = performance.now();
      const tick = (now: number) => {
        if (this.disposed) {
          resolve();
          return;
        }
        const frameDelta = Math.max(0, now - lastFrameAt);
        lastFrameAt = now;
        elapsedMs += Math.min(frameDelta, MAX_INK_FRAME_DELTA_MS);
        const progress = Math.min(1, elapsedMs / durationMs);
        this.progress(start + delta * easeInOutCubic(progress));
        if (progress >= 1) {
          resolve();
          return;
        }
        this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }
}

export function createInkSegmentTransition(options: InkSegmentOptions): TransitionModule {
  return {
    id: options.id,
    requiredMilestones: ['targetReady', 'buildReady'],
    reducedMotionFallback: (context) => {
      if (context.direction === -1 && options.positionFromReadingOnReverse) {
        positionReadingAtEdge(liveLayerElement(context.from), 'bottom');
      }
      const endpoint = context.direction === 1 ? 1 : 0;
      const roots = {
        from: sceneRoot(liveLayerElement(context.from), context.from.scene, options.rootSelector),
        to: sceneRoot(liveLayerElement(context.to), context.to.scene, options.rootSelector)
      };
      options.prepareEndpoints(roots);
      options.renderSource?.(
        roots.from,
        mappedProgress(options.renderSourceProgress, endpoint, 'static')
      );
      applyLayerVisibility(context.from, context.direction === 1 ? hiddenVisibility() : holdVisibility(true));
      applyLayerVisibility(context.to, context.direction === 1 ? holdVisibility(true) : hiddenVisibility());
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const timeline = new InkSegmentTimeline(context, options);
      return timeline;
    }
  };
}
