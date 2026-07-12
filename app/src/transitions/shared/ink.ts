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
  createInkFieldRenderer,
  mountTransitionInkCanvas,
  type InkFieldRenderer,
  type InkGradePreset
} from './sceneInk';
import {
  createInkFieldFrame,
  inkFieldOrigin,
  type HorizontalInkFieldFrame,
  type InkFieldFrame,
  type InkFieldSpec
} from './inkField';
import { createSceneMotionLeaseGroup, type SceneMotionLeaseGroup } from '../../stage/scene-motion';
import {
  createHorizontalInkContour,
  type HorizontalInkContour
} from './horizontalInkContour';

export type InkFieldRoots = Readonly<{
  from: HTMLElement | null;
  to: HTMLElement | null;
  stage: HTMLElement | null;
}>;

export type InkOwnershipSurfaces = Readonly<{
  reveal?: readonly HTMLElement[];
  conceal?: readonly HTMLElement[];
}>;

export type InkSourceRenderContext = Readonly<{
  runId: TransitionContext['runId'];
  prepareToken: TransitionContext['prepareToken'];
  direction: Direction;
  prefersReducedMotion: boolean;
}>;

export type InkSegmentOptions = {
  id: SegmentId;
  field: InkFieldSpec | ((roots: InkFieldRoots) => InkFieldSpec);
  fieldProgress?: (progress: number) => number;
  ownershipSurfaces?: (roots: InkFieldRoots) => InkOwnershipSurfaces;
  delayMs?: (() => number) | undefined;
  canvasHost?: 'from' | 'to' | 'stage';
  elevateTarget?: boolean;
  sample?: (progress: number) => InkSample;
  prepareEndpoints(roots: InkEndpointRoots): void;
  renderSource?: (
    root: HTMLElement | null,
    progress: number,
    context: InkSourceRenderContext
  ) => void;
  renderSourceProgress?: 'static' | 'remaining' | 'forward' | ((progress: number) => number);
  rootSelector?: (scene: string) => string;
  transitionAttr?: string;
  stops?: readonly number[];
  reportTimelineReadyAt?: number;
  motionScenes?: readonly ('from' | 'to')[];
  grade?: InkGradePreset;
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

function visibleForMotion(state: LayerVisibilityState): boolean {
  return state.mounted && state.visible && state.opacity > 0.001;
}

export function clearBoundaryGeometry(element: HTMLElement | null | undefined): void {
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
  element.removeAttribute('data-r4-ink-field-seed');
  element.removeAttribute('data-r4-ink-contour-revision');
  element.removeAttribute('data-r4-ink-contour-threshold');
  element.removeAttribute('data-r4-ink-contour-seed');
  element.removeAttribute('data-r4-ink-contour-direction');
  element.removeAttribute('data-r4-ink-contour-samples');
}

function isHorizontalFrame(frame: InkFieldFrame): frame is HorizontalInkFieldFrame {
  return frame.spec.kind === 'horizontal';
}

function applyBoundaryGeometry(
  element: HTMLElement,
  frame: InkFieldFrame,
  clipPath: string
): void {
  const origin = inkFieldOrigin(frame.spec);
  element.style.clipPath = clipPath;
  element.style.setProperty('-webkit-clip-path', clipPath);
  element.dataset.r4InkBoundaryKind = frame.spec.kind;
  element.dataset.r4InkBoundaryOrigin = `${origin.x.toFixed(4)},${origin.y.toFixed(4)}`;
  element.dataset.r4InkBoundaryProgress = frame.progress.toFixed(4);
  element.dataset.r4InkFieldSeed = String(frame.seed);
  if (isHorizontalFrame(frame)) {
    element.dataset.r4InkBoundaryRevision = frame.revision;
    element.dataset.r4InkContourRevision = frame.revision;
    element.dataset.r4InkContourThreshold = frame.threshold.toFixed(6);
    element.dataset.r4InkContourSeed = String(frame.contour.seed);
    element.dataset.r4InkContourDirection = frame.spec.direction;
    element.dataset.r4InkContourSamples = String(frame.contour.samples.length);
  } else {
    delete element.dataset.r4InkBoundaryRevision;
    delete element.dataset.r4InkContourRevision;
    delete element.dataset.r4InkContourThreshold;
    delete element.dataset.r4InkContourSeed;
    delete element.dataset.r4InkContourDirection;
    delete element.dataset.r4InkContourSamples;
  }
}

export function applyRevealBoundary(element: HTMLElement, frame: InkFieldFrame): void {
  if (frame.progress >= 0.999) {
    clearBoundaryGeometry(element);
    return;
  }
  if (!frame.ownership.revealClip) {
    clearBoundaryGeometry(element);
    return;
  }
  applyBoundaryGeometry(element, frame, frame.ownership.revealClip);
  element.dataset.r4RevealProgress = frame.progress.toFixed(4);
  element.dataset.r4RevealMode = 'ink-occluded-live-gate';
}

function applyConcealBoundary(element: HTMLElement, frame: InkFieldFrame): void {
  if (frame.progress <= 0.001) {
    element.style.visibility = 'visible';
    clearBoundaryGeometry(element);
    return;
  }
  if (frame.progress >= 0.999 || !frame.ownership.concealClip) {
    element.style.visibility = 'hidden';
    clearBoundaryGeometry(element);
    return;
  }
  element.style.visibility = 'visible';
  applyBoundaryGeometry(element, frame, frame.ownership.concealClip);
}

class InkSegmentTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;
  private canvas: HTMLCanvasElement | null;
  private inkRenderer: InkFieldRenderer | null;
  private readonly fieldSpec: InkFieldSpec;
  private readonly horizontalContour: HorizontalInkContour | null;
  private readonly elevation: TransitionLayerElevation | null;
  private readonly attrsElement: HTMLElement | null;
  private readonly surfaceHost: HTMLElement | null;
  private readonly motionLeases: SceneMotionLeaseGroup;
  private liveElevation: TransitionLayerElevation | null = null;
  private liveElevationElement: HTMLElement | null = null;
  private endpointsPrepared = false;
  private preparedFromRoot: HTMLElement | null = null;
  private preparedToRoot: HTMLElement | null = null;
  private renderedSourceRoot: HTMLElement | null = null;
  private renderedSourceProgress = Number.NaN;
  private playbackDirection: Direction;
  private readonly revealSurfaces = new Set<HTMLElement>();
  private readonly concealSurfaces = new Set<HTMLElement>();

  constructor(
    private readonly context: TransitionContext,
    private readonly options: InkSegmentOptions
  ) {
    const generation = `${context.runId}:${context.prepareToken}`;
    this.playbackDirection = context.direction;
    this.progressValue = context.direction === 1 ? 0 : 1;
    this.motionLeases = createSceneMotionLeaseGroup(`${context.runId}:${options.id}`);
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
      renderer: 'field',
      grade: options.grade ?? 'edge-only',
      generation
    });
    this.elevation = options.elevateTarget === false ? null : createTransitionLayerElevation(context.to.element);
    this.ensureEndpointsPrepared();
    const roots = this.fieldRoots();
    this.fieldSpec = typeof options.field === 'function'
      ? options.field(roots)
      : options.field;
    this.horizontalContour = this.fieldSpec.kind === 'horizontal'
      ? createHorizontalInkContour({
          authoredSeed: this.fieldSpec.seed,
          variationKey: context.runId
        })
      : null;
    this.inkRenderer = createInkFieldRenderer(this.canvas, {
      grade: options.grade ?? 'edge-only',
      generation
    });
    this.inkRenderer?.prewarm(
      createInkFieldFrame(
        this.fieldSpec,
        0.003,
        viewportFor(surfaceHost),
        this.horizontalContour ? { contour: this.horizontalContour } : {}
      )
    );
    this.progress(context.direction === 1 ? 0 : 1);
  }

  play(): Promise<void> {
    this.playbackDirection = 1;
    return this.animateTo(1);
  }

  reverse(): Promise<void> {
    this.playbackDirection = -1;
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
    if (clamped > this.progressValue + 0.0001) {
      this.playbackDirection = 1;
    } else if (clamped < this.progressValue - 0.0001) {
      this.playbackDirection = -1;
    }
    const sample = this.options.sample?.(clamped) ?? sampleInk(clamped);
    const fieldProgress = clamp(this.options.fieldProgress?.(clamped) ?? clamped);
    this.progressValue = clamped;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    const liveFromElement = liveLayerElement(this.context.from);
    const liveToElement = liveLayerElement(this.context.to);
    const fromRoot = sceneRoot(liveFromElement, this.context.from.scene, this.options.rootSelector);
    const toRoot = sceneRoot(liveToElement, this.context.to.scene, this.options.rootSelector);
    this.ensureEndpointsPrepared(fromRoot, toRoot);
    const motionScenes = this.options.motionScenes ?? [];
    this.motionLeases.sync([
      {
        key: 'from',
        root: fromRoot,
        active: !this.context.prefersReducedMotion
          && motionScenes.includes('from')
          && visibleForMotion(sample.from)
      },
      {
        key: 'to',
        root: toRoot,
        active: !this.context.prefersReducedMotion
          && motionScenes.includes('to')
          && visibleForMotion(sample.to)
      }
    ]);
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
    if (
      this.options.renderSource
      && (
        fromRoot !== this.renderedSourceRoot
        || !Number.isFinite(this.renderedSourceProgress)
        || Math.abs(sourceProgress - this.renderedSourceProgress) > 0.0001
      )
    ) {
      this.options.renderSource(fromRoot, sourceProgress, this.sourceRenderContext());
      this.renderedSourceRoot = fromRoot;
      this.renderedSourceProgress = sourceProgress;
    }
    const frame = createInkFieldFrame(
      this.fieldSpec,
      fieldProgress,
      viewportFor(activeSurfaceHost),
      this.horizontalContour ? { contour: this.horizontalContour } : {}
    );
    const roots = this.fieldRoots(fromRoot, toRoot, activeSurfaceHost);
    const surfaces = this.options.ownershipSurfaces?.(roots) ?? {};
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
      if (fieldProgress <= 0.001) {
        element.style.visibility = 'visible';
      } else if (fieldProgress >= 0.999) {
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
    const fieldVisible = fieldProgress > 0.002 && fieldProgress < 0.999;
    const inkActive = fieldVisible && Boolean(this.inkRenderer?.isActive());
    if (fieldVisible) {
      liveAttrsElement?.setAttribute('data-r4-transition', this.options.transitionAttr ?? this.options.id);
      liveAttrsElement?.setAttribute('data-r4-ink-progress', fieldProgress.toFixed(4));
      if (inkActive) {
        liveAttrsElement?.setAttribute('data-r4-ink-active', 'true');
      } else {
        liveAttrsElement?.removeAttribute('data-r4-ink-active');
      }
    } else {
      liveAttrsElement?.removeAttribute('data-r4-transition');
      liveAttrsElement?.removeAttribute('data-r4-ink-active');
      liveAttrsElement?.removeAttribute('data-r4-ink-progress');
    }
    if (this.canvas) {
      if (fieldVisible) {
        if (inkActive) {
          this.canvas.dataset.r4InkActive = 'true';
        } else {
          delete this.canvas.dataset.r4InkActive;
        }
        this.canvas.dataset.r4InkProgress = fieldProgress.toFixed(4);
        const origin = inkFieldOrigin(frame.spec);
        this.canvas.dataset.r4InkBoundaryKind = frame.spec.kind;
        this.canvas.dataset.r4InkBoundaryOrigin = `${origin.x.toFixed(4)},${origin.y.toFixed(4)}`;
        this.canvas.dataset.r4InkBoundaryProgress = fieldProgress.toFixed(4);
        this.canvas.dataset.r4InkFieldSeed = String(frame.seed);
        if (isHorizontalFrame(frame)) {
          this.canvas.dataset.r4InkBoundaryRevision = frame.revision;
          this.canvas.dataset.r4InkContourRevision = frame.revision;
          this.canvas.dataset.r4InkContourThreshold = frame.threshold.toFixed(6);
          this.canvas.dataset.r4InkContourSeed = String(frame.contour.seed);
          this.canvas.dataset.r4InkContourDirection = frame.spec.direction;
          this.canvas.dataset.r4InkContourSamples = String(frame.contour.samples.length);
        } else {
          delete this.canvas.dataset.r4InkBoundaryRevision;
          delete this.canvas.dataset.r4InkContourRevision;
          delete this.canvas.dataset.r4InkContourThreshold;
          delete this.canvas.dataset.r4InkContourSeed;
          delete this.canvas.dataset.r4InkContourDirection;
          delete this.canvas.dataset.r4InkContourSamples;
        }
      } else {
        delete this.canvas.dataset.r4InkActive;
        delete this.canvas.dataset.r4InkProgress;
        delete this.canvas.dataset.r4InkBoundaryKind;
        delete this.canvas.dataset.r4InkBoundaryOrigin;
        delete this.canvas.dataset.r4InkBoundaryProgress;
        delete this.canvas.dataset.r4InkBoundaryRevision;
        delete this.canvas.dataset.r4InkFieldSeed;
        delete this.canvas.dataset.r4InkContourRevision;
        delete this.canvas.dataset.r4InkContourThreshold;
        delete this.canvas.dataset.r4InkContourSeed;
        delete this.canvas.dataset.r4InkContourDirection;
        delete this.canvas.dataset.r4InkContourSamples;
      }
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
    this.playbackDirection = direction;
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
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.motionLeases.dispose();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    const inkRenderer = this.inkRenderer;
    const canvas = this.canvas;
    this.inkRenderer = null;
    this.canvas = null;
    inkRenderer?.destroy();
    canvas?.remove();
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
    this.preparedFromRoot = null;
    this.preparedToRoot = null;
    this.renderedSourceRoot = null;
    this.liveElevation = null;
    this.liveElevationElement = null;
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

  private sourceRenderContext(): InkSourceRenderContext {
    return {
      runId: this.context.runId,
      prepareToken: this.context.prepareToken,
      direction: this.playbackDirection,
      prefersReducedMotion: this.context.prefersReducedMotion
    };
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

  private fieldRoots(
    from = sceneRoot(liveLayerElement(this.context.from), this.context.from.scene, this.options.rootSelector),
    to = sceneRoot(liveLayerElement(this.context.to), this.context.to.scene, this.options.rootSelector),
    stage = liveStageHost(this.context, this.surfaceHost)
  ): InkFieldRoots {
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
      const endpoint = context.direction === 1 ? 1 : 0;
      const roots = {
        from: sceneRoot(liveLayerElement(context.from), context.from.scene, options.rootSelector),
        to: sceneRoot(liveLayerElement(context.to), context.to.scene, options.rootSelector)
      };
      options.prepareEndpoints(roots);
      options.renderSource?.(
        roots.from,
        mappedProgress(options.renderSourceProgress, endpoint, 'static'),
        {
          runId: context.runId,
          prepareToken: context.prepareToken,
          direction: context.direction,
          prefersReducedMotion: context.prefersReducedMotion
        }
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
