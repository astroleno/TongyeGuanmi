import { applyLayerVisibility, hiddenVisibility, holdVisibility } from '../../pilot/visibility';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
import type {
  Direction,
  LayerVisibilityState,
  SegmentId,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionPrewarmContext,
  TransitionModule
} from '../../story/types';
import { createTransitionLayerElevation, type TransitionLayerElevation } from './layerElevation';
import {
  createInkFieldRenderer,
  InkRendererRunError,
  mountTransitionInkCanvas,
  type InkFieldRenderer,
  type InkGradePreset,
  type InkRendererFailure,
  productionInkRendererRequired
} from './sceneInk';
import {
  createInkFieldFrame,
  type HorizontalInkFieldFrame,
  type InkFieldFrame,
  type InkFieldSpec
} from './inkField';
import {
  applyConcealBoundary,
  applyRevealBoundary,
  clearBoundaryGeometry
} from './inkOwnership';
import { createSceneMotionLeaseGroup, type SceneMotionLeaseGroup } from '../../stage/scene-motion';
import {
  createHorizontalInkContour,
  type HorizontalInkContour
} from './horizontalInkContour';

const ENDPOINT_RUN_ATTRIBUTE = 'data-r4-endpoint-run';
const ENDPOINT_ROLE_ATTRIBUTE = 'data-r4-endpoint-role';
const ENDPOINT_READY_ATTRIBUTE = 'data-r4-endpoint-ready';
const TRANSITION_ATTRIBUTE = 'data-r4-transition';
const INK_ACTIVE_ATTRIBUTE = 'data-r4-ink-active';
const INK_PROGRESS_ATTRIBUTE = 'data-r4-ink-progress';

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

export type InkTargetPresentationContext = InkSourceRenderContext & Readonly<{
  generation: string;
  target: 'from' | 'to';
}>;

export type InkPlaybackPhase = Readonly<{
  from: number;
  to: number;
  durationMs: number;
}>;

export type InkPhaseBoundaryContext = InkSourceRenderContext & Readonly<{
  progress: number;
  roots: InkEndpointRoots;
  signal: AbortSignal;
}>;

export type InkSegmentOptions = {
  id: SegmentId;
  field: InkFieldSpec | ((roots: InkFieldRoots) => InkFieldSpec);
  fieldProgress?: (progress: number) => number;
  ownershipSurfaces?: (roots: InkFieldRoots) => InkOwnershipSurfaces;
  includeToSurface?: boolean;
  delayMs?: (() => number) | undefined;
  playbackPhases?: readonly InkPlaybackPhase[];
  presentPhaseBoundary?: (context: InkPhaseBoundaryContext) => Promise<void> | void;
  canvasHost?: 'from' | 'to' | 'stage';
  elevateTarget?: boolean;
  sample?: (progress: number) => InkSample;
  prepareEndpoints(roots: InkEndpointRoots): void;
  prepareTargetPresentation?: (
    roots: InkEndpointRoots,
    context: InkTargetPresentationContext
  ) => Promise<void> | void;
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
  // The default remains the established cubic curve. A lower symmetric power
  // gives a prewarmed, input-driven path visible feedback before its first
  // full Ink frame without changing any field or renderer parameter.
  ease?: number;
  warm?: (context: TransitionPrewarmContext) => Promise<void> | void;
};

export type InkEndpointRoots = Readonly<{
  from: HTMLElement | null;
  to: HTMLElement | null;
}>;

export type InkSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeInOutPower(value: number, exponent = 3): number {
  const p = clamp(value);
  return p < 0.5
    ? Math.pow(2 * p, exponent) / 2
    : 1 - Math.pow(2 * (1 - p), exponent) / 2;
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

type InkLayerContext = Pick<TransitionContext, 'from' | 'to'>;

function sharedStageHost(context: InkLayerContext): HTMLElement | null {
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
  element.dataset.visible = semanticBoolean(state.visible && state.opacity > 0.001);
  element.dataset.interactable = String(!state.inert && state.pointerEvents === 'auto');
}

function canvasHost(context: InkLayerContext, host: InkSegmentOptions['canvasHost']): HTMLElement | null {
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

function isHorizontalFrame(frame: InkFieldFrame): frame is HorizontalInkFieldFrame {
  return frame.spec.kind === 'horizontal';
}

type PreparedInkSurface = readonly [HTMLCanvasElement, InkFieldRenderer, number, number];

function preparedSurfaceMatches(
  surface: PreparedInkSurface,
  viewport: Readonly<{ width: number; height: number }>
): boolean {
  return Math.abs(surface[2] - viewport.width) <= 8
    && Math.abs(surface[3] - viewport.height) <= 8
    && surface[1].isActive();
}

function disposePreparedSurface(surface: PreparedInkSurface | undefined): void {
  surface?.[1].destroy();
}

export { applyConcealBoundary, applyRevealBoundary, clearBoundaryGeometry } from './inkOwnership';

type InkEndpointRole = 'source' | 'target';

class InkEndpointRunOwnership {
  private readonly elements = new Map<HTMLElement, InkEndpointRole>();
  private ready = false;

  constructor(
    private readonly generation: string,
    private readonly direction: Direction
  ) {}

  sync(
    fromElement: HTMLElement | null,
    toElement: HTMLElement | null,
    roots: InkEndpointRoots
  ): void {
    const next = new Map<HTMLElement, InkEndpointRole>();
    const fromRole: InkEndpointRole = this.direction === 1 ? 'source' : 'target';
    const toRole: InkEndpointRole = this.direction === 1 ? 'target' : 'source';
    for (const element of [fromElement, roots.from]) {
      if (element) next.set(element, fromRole);
    }
    for (const element of [toElement, roots.to]) {
      if (element) next.set(element, toRole);
    }
    if (
      next.size === this.elements.size
      && [...next].every(([element, role]) => this.elements.get(element) === role)
    ) {
      return;
    }
    for (const element of this.elements.keys()) {
      if (!next.has(element)) {
        this.release(element);
      }
    }
    this.elements.clear();
    for (const [element, role] of next) {
      this.elements.set(element, role);
      element.setAttribute(ENDPOINT_RUN_ATTRIBUTE, this.generation);
      element.setAttribute(ENDPOINT_ROLE_ATTRIBUTE, role);
      if (role === 'target' && this.ready) {
        element.setAttribute(ENDPOINT_READY_ATTRIBUTE, this.generation);
      } else if (element.dataset.r4EndpointRun === this.generation) {
        element.removeAttribute(ENDPOINT_READY_ATTRIBUTE);
      }
    }
  }

  markReady(): void {
    this.ready = true;
    for (const [element, role] of this.elements) {
      if (role === 'target' && element.dataset.r4EndpointRun === this.generation) {
        element.setAttribute(ENDPOINT_READY_ATTRIBUTE, this.generation);
      }
    }
  }

  dispose(): void {
    for (const element of this.elements.keys()) {
      this.release(element);
    }
    this.elements.clear();
  }

  private release(element: HTMLElement): void {
    if (element.dataset.r4EndpointRun !== this.generation) {
      return;
    }
    element.removeAttribute(ENDPOINT_RUN_ATTRIBUTE);
    element.removeAttribute(ENDPOINT_ROLE_ATTRIBUTE);
    element.removeAttribute(ENDPOINT_READY_ATTRIBUTE);
  }
}

class InkSegmentTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];

  private progressValue!: number;
  private disposed?: boolean;
  private animationFrame?: number;
  private canvas!: HTMLCanvasElement | null;
  private inkRenderer!: InkFieldRenderer | null;
  private readonly fieldSpec: InkFieldSpec;
  /** One packed contour transport for every non-depth field in this run. */
  private readonly fieldContour: HorizontalInkContour | null;
  private readonly elevation: TransitionLayerElevation | null;
  private readonly attrsElement: HTMLElement | null;
  private readonly surfaceHost: HTMLElement | null;
  private viewport: Readonly<{ width: number; height: number }>;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly motionLeases: SceneMotionLeaseGroup;
  private readonly generation: string;
  private readonly id: SegmentId;
  private readonly rootSelector: InkSegmentOptions['rootSelector'];
  private readonly reducedMotion: boolean;
  private readonly host: InkSegmentOptions['canvasHost'];
  private rendererFailure?: InkRendererFailure;
  private liveElevation?: TransitionLayerElevation;
  private liveElevationElement?: HTMLElement;
  private endpointsPrepared!: boolean;
  private preparedFromRoot!: HTMLElement | null;
  private preparedToRoot!: HTMLElement | null;
  private renderedSourceRoot: HTMLElement | null = null;
  private renderedSourceProgress = Number.NaN;
  private playbackDirection: Direction;
  private readonly revealSurfaces = new Set<HTMLElement>();
  private readonly concealSurfaces = new Set<HTMLElement>();
  private readonly phaseController = new AbortController();

  constructor(
    private readonly context: TransitionContext,
    private readonly options: InkSegmentOptions,
    private readonly endpointOwnership: InkEndpointRunOwnership,
    preparedRoots: InkEndpointRoots,
    preparedSurface?: PreparedInkSurface
  ) {
    const generation = `${context.runId}:${context.prepareToken}`;
    this.generation = generation;
    this.id = options.id;
    this.rootSelector = options.rootSelector;
    this.reducedMotion = context.prefersReducedMotion;
    this.host = options.canvasHost;
    this.playbackDirection = context.direction;
    this.progressValue = context.direction === 1 ? 0 : 1;
    this.preparedFromRoot = preparedRoots.from;
    this.preparedToRoot = preparedRoots.to;
    this.endpointsPrepared = true;
    this.motionLeases = createSceneMotionLeaseGroup(`${context.runId}:${this.id}`);
    const stops = options.stops ?? [];
    this.labels = Object.fromEntries([
      ['start', 0],
      ['ink', 0.5],
      ...stops.map((stop, index) => [`stage:${index}`, stop] as const),
      ['end', 1]
    ]);
    this.pauses = context.segment.policy.kind === 'stagedSnap'
      ? context.segment.policy.advance.flatMap((advance, index) => (
          advance.kind === 'gesture' ? [`stage:${index}`] : []
        ))
      : [];
    const surfaceHost = canvasHost(context, this.host);
    this.surfaceHost = surfaceHost;
    this.viewport = viewportFor(surfaceHost);
    this.resizeObserver = typeof ResizeObserver === 'undefined' || !surfaceHost
      ? null
      : new ResizeObserver(([entry]) => {
          const width = entry?.contentRect.width || surfaceHost.clientWidth;
          const height = entry?.contentRect.height || surfaceHost.clientHeight;
          if (width > 0 && height > 0) {
            this.viewport = { width, height };
          }
        });
    if (this.resizeObserver && surfaceHost) {
      this.resizeObserver.observe(surfaceHost);
    }
    this.attrsElement = this.host === 'from'
      ? context.from.element
      : this.host === 'stage'
        ? surfaceHost
        : context.to.element;
    this.elevation = options.elevateTarget === false ? null : createTransitionLayerElevation(context.to.element);
    const roots = this.fieldRoots();
    this.fieldSpec = typeof options.field === 'function'
      ? options.field(roots)
      : options.field;
    this.fieldContour = this.fieldSpec.kind === 'depth'
      ? null
      : createHorizontalInkContour({
          authoredSeed: this.fieldSpec.seed,
          variationKey: this.fieldSpec.kind === 'horizontal'
            ? context.runId
            : `radial:${context.runId}`
        });
    const grade = options.grade;
    const reusableSurface = (
      !context.prefersReducedMotion
      && surfaceHost
      && preparedSurface
      && preparedSurfaceMatches(preparedSurface, this.viewport)
      && preparedSurface[1].rebindGeneration(generation)
    ) ? preparedSurface : undefined;
    if (!reusableSurface) {
      disposePreparedSurface(preparedSurface);
    }
    this.canvas = context.prefersReducedMotion ? null : mountTransitionInkCanvas(
      surfaceHost,
      options.id,
      { renderer: 'field', grade, generation },
      reusableSurface?.[0]
    );
    this.inkRenderer = context.prefersReducedMotion ? null : reusableSurface?.[1]
      ?? createInkFieldRenderer(this.canvas, {
        fieldKind: this.fieldSpec.kind,
        grade,
        generation
      });
    if (productionInkRendererRequired(context.prefersReducedMotion) && !this.inkRenderer) {
      this.motionLeases.dispose();
      this.elevation?.restore();
      this.canvas?.remove();
      this.canvas = null;
      throw this.rendererError();
    }
    this.ensureEndpointsPrepared();
    this.inkRenderer?.prewarm(
      createInkFieldFrame(
        this.fieldSpec,
        0.003,
        this.viewport,
        this.fieldContour ? { contour: this.fieldContour } : {}
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
    this.assertRendererReady();
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
    const fromRoot = sceneRoot(liveFromElement, this.context.from.scene, this.rootSelector);
    const toRoot = sceneRoot(liveToElement, this.context.to.scene, this.rootSelector);
    this.endpointOwnership.sync(liveFromElement, liveToElement, { from: fromRoot, to: toRoot });
    this.ensureEndpointsPrepared(fromRoot, toRoot);
    const motionScenes = this.options.motionScenes ?? [];
    this.motionLeases.sync([
      {
        key: 'from',
        root: fromRoot,
        active: !this.reducedMotion
          && motionScenes.includes('from')
          && visibleForMotion(sample.from)
      },
      {
        key: 'to',
        root: toRoot,
        active: !this.reducedMotion
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
      this.viewport,
      this.fieldContour ? { contour: this.fieldContour } : {}
    );
    const roots = this.fieldRoots(fromRoot, toRoot, activeSurfaceHost);
    const surfaces = this.options.ownershipSurfaces?.(roots) ?? {};
    const revealSurfaces = new Set(
      [
        ...(this.options.includeToSurface === false ? [] : [liveToElement]),
        ...(surfaces.reveal ?? [])
      ].filter(
        (element): element is HTMLElement => Boolean(element)
      )
    );
    const concealSurfaces = new Set(
      [
        ...(isHorizontalFrame(frame) ? [liveFromElement] : []),
        ...(surfaces.conceal ?? [])
      ].filter(
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
    const liveAttrsElement = this.host === 'from'
      ? liveFromElement
      : this.host === 'stage'
        ? activeSurfaceHost
         : liveToElement;
    const fieldVisible = fieldProgress > 0.002 && fieldProgress < 0.999;
    const inkActive = fieldVisible && Boolean(this.inkRenderer?.isActive());
    if (fieldVisible) {
      liveAttrsElement?.setAttribute(TRANSITION_ATTRIBUTE, this.options.transitionAttr ?? this.id);
      liveAttrsElement?.setAttribute(INK_PROGRESS_ATTRIBUTE, fieldProgress.toFixed(4));
      if (inkActive) {
        liveAttrsElement?.setAttribute(INK_ACTIVE_ATTRIBUTE, 'true');
      } else {
        liveAttrsElement?.removeAttribute(INK_ACTIVE_ATTRIBUTE);
      }
    } else {
      liveAttrsElement?.removeAttribute(TRANSITION_ATTRIBUTE);
      liveAttrsElement?.removeAttribute(INK_ACTIVE_ATTRIBUTE);
      liveAttrsElement?.removeAttribute(INK_PROGRESS_ATTRIBUTE);
    }
    if (this.canvas) {
      if (fieldVisible) {
        if (inkActive) {
          this.canvas.dataset.r4InkActive = 'true';
          this.canvas.dataset.r4InkBodyVisible = 'true';
        } else {
          delete this.canvas.dataset.r4InkActive;
          delete this.canvas.dataset.r4InkBodyVisible;
        }
        this.canvas.dataset.r4InkProgress = fieldProgress.toFixed(4);
      } else {
        delete this.canvas.dataset.r4InkActive;
        delete this.canvas.dataset.r4InkBodyVisible;
        delete this.canvas.dataset.r4InkProgress;
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
    if (!this.phaseController.signal.aborted) {
      this.phaseController.abort(new Error(`Ink timeline ${this.id} disposed`));
    }
    this.resizeObserver?.disconnect();
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
    clearBoundaryGeometry(this.context.to.element);
    clearBoundaryGeometry(liveToElement);
    const liveAttrsElement = this.host === 'from'
      ? liveFromElement
      : this.host === 'stage'
        ? activeSurfaceHost
        : liveToElement;
    for (const element of new Set([this.attrsElement, liveAttrsElement])) {
      clearBoundaryGeometry(element);
      element?.removeAttribute(TRANSITION_ATTRIBUTE);
      element?.removeAttribute(INK_ACTIVE_ATTRIBUTE);
      element?.removeAttribute(INK_PROGRESS_ATTRIBUTE);
    }
    this.endpointOwnership.dispose();
  }

  private sourceRenderContext(): InkSourceRenderContext {
    return {
      runId: this.context.runId,
      prepareToken: this.context.prepareToken,
      direction: this.playbackDirection,
      prefersReducedMotion: this.reducedMotion
    };
  }

  private rendererError(): InkRendererRunError {
    return new InkRendererRunError(this.id, this.rendererFailure ?? {
      generation: this.generation,
      reason: 'unavailable'
    });
  }

  private assertRendererReady(): void {
    if (!productionInkRendererRequired(this.reducedMotion)) {
      return;
    }
    const active = this.inkRenderer?.isActive() ?? false;
    const failure = this.inkRenderer?.getFailure();
    if (failure) {
      this.rendererFailure = failure;
    }
    if (!active || this.rendererFailure) {
      throw this.rendererError();
    }
  }

  private ensureEndpointsPrepared(
    fromRoot = sceneRoot(liveLayerElement(this.context.from), this.context.from.scene, this.rootSelector),
    toRoot = sceneRoot(liveLayerElement(this.context.to), this.context.to.scene, this.rootSelector)
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
    from = sceneRoot(liveLayerElement(this.context.from), this.context.from.scene, this.rootSelector),
    to = sceneRoot(liveLayerElement(this.context.to), this.context.to.scene, this.rootSelector),
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

  private async animateTo(target: number): Promise<void> {
    const start = this.progressValue;
    const delta = target - start;
    const durationMs = this.reducedMotion ? 0 : this.context.segment.virtualDuration;
    if (delta === 0 || durationMs <= 0) {
      this.progress(target);
      return;
    }

    const ranges = this.phaseRanges(start, target);
    for (let index = 0; index < ranges.length; index += 1) {
      const range = ranges[index]!;
      await this.animateRange(range.target, range.durationMs);
      if (index + 1 < ranges.length && this.options.presentPhaseBoundary) {
        if (this.phaseController.signal.aborted) {
          throw this.phaseController.signal.reason instanceof Error
            ? this.phaseController.signal.reason
            : new Error(`Ink phase boundary aborted for ${this.id}`);
        }
        await this.options.presentPhaseBoundary({
          ...this.sourceRenderContext(),
          progress: range.target,
          signal: this.phaseController.signal,
          roots: {
            from: sceneRoot(liveLayerElement(this.context.from), this.context.from.scene, this.rootSelector),
            to: sceneRoot(liveLayerElement(this.context.to), this.context.to.scene, this.rootSelector)
          }
        });
        if (this.phaseController.signal.aborted) {
          throw this.phaseController.signal.reason instanceof Error
            ? this.phaseController.signal.reason
            : new Error(`Ink phase boundary aborted for ${this.id}`);
        }
      }
    }
  }

  private animateRange(target: number, durationMs: number): Promise<void> {
    const start = this.progressValue;
    const delta = target - start;
    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        if (this.disposed) {
          resolve();
          return;
        }
        const progress = Math.min(1, Math.max(0, now - startedAt) / durationMs);
        try {
          this.progress(start + delta * easeInOutPower(progress, this.options.ease));
        } catch (error) {
          reject(error);
          return;
        }
        if (progress >= 1) {
          this.animationFrame = 0;
          resolve();
          return;
        }
        this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }

  private phaseRanges(start: number, target: number): readonly { target: number; durationMs: number }[] {
    const phases = this.options.playbackPhases;
    if (!phases?.length) {
      return [{ target, durationMs: this.context.segment.virtualDuration }];
    }
    const direction = target > start ? 1 : -1;
    const ordered = direction === 1 ? phases : [...phases].reverse();
    const ranges: { target: number; durationMs: number }[] = [];
    let cursor = start;
    for (const phase of ordered) {
      const lower = clamp(Math.min(phase.from, phase.to));
      const upper = clamp(Math.max(phase.from, phase.to));
      const overlapStart = Math.max(lower, Math.min(upper, cursor));
      const overlapEnd = direction === 1
        ? Math.min(upper, target)
        : Math.max(lower, target);
      if ((direction === 1 && overlapEnd <= overlapStart) || (direction === -1 && overlapEnd >= overlapStart)) {
        continue;
      }
      const span = Math.max(0.0001, upper - lower);
      const phaseTarget = overlapEnd;
      ranges.push({
        target: phaseTarget,
        durationMs: phase.durationMs * Math.abs(phaseTarget - overlapStart) / span
      });
      cursor = phaseTarget;
      if (Math.abs(cursor - target) <= 0.0001) break;
    }
    return ranges.length ? ranges : [{ target, durationMs: this.context.segment.virtualDuration }];
  }
}

export function createInkSegmentTransition(options: InkSegmentOptions): TransitionModule {
  let preparedSurface: PreparedInkSurface | undefined;

  const prewarm = (context: TransitionPrewarmContext): Promise<void> | void => {
    const field = options.field;
    if (!context.prefersReducedMotion && typeof field !== 'function') {
      const grade = options.grade;
      const viewport = viewportFor(canvasHost(context, options.canvasHost));
      if (!preparedSurface || !preparedSurfaceMatches(preparedSurface, viewport)) {
        disposePreparedSurface(preparedSurface);
        preparedSurface = undefined;
        const canvas = (context.to.element?.ownerDocument ?? globalThis.document)
          ?.createElement?.('canvas');
        if (canvas) {
          const renderer = createInkFieldRenderer(canvas, {
            fieldKind: field.kind,
            grade,
            generation: `prewarm:${options.id}`
          });
          if (renderer) {
            renderer.prewarm(createInkFieldFrame(field, 0.003, viewport));
            preparedSurface = [canvas, renderer, viewport.width, viewport.height];
          } else {
            canvas.remove();
          }
        }
      }
    }
    return options.warm?.(context);
  };

  return {
    id: options.id,
    requiredMilestones: ['targetReady', 'buildReady'],
    prewarm,
    reducedMotionFallback: async (context) => {
      const endpoint = context.direction === 1 ? 1 : 0;
      const generation = `${context.runId}:${context.prepareToken}`;
      const roots = {
        from: sceneRoot(liveLayerElement(context.from), context.from.scene, options.rootSelector),
        to: sceneRoot(liveLayerElement(context.to), context.to.scene, options.rootSelector)
      };
      const ownership = new InkEndpointRunOwnership(generation, context.direction);
      ownership.sync(liveLayerElement(context.from), liveLayerElement(context.to), roots);
      applyLayerVisibility(context.direction === 1 ? context.to : context.from, hiddenVisibility());
      try {
        options.prepareEndpoints(roots);
        await options.prepareTargetPresentation?.(roots, {
          runId: context.runId,
          prepareToken: context.prepareToken,
          direction: context.direction,
          prefersReducedMotion: context.prefersReducedMotion,
          generation,
          target: context.direction === 1 ? 'to' : 'from'
        });
        ownership.markReady();
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
      } finally {
        ownership.dispose();
      }
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const generation = `${context.runId}:${context.prepareToken}`;
      const roots = {
        from: sceneRoot(liveLayerElement(context.from), context.from.scene, options.rootSelector),
        to: sceneRoot(liveLayerElement(context.to), context.to.scene, options.rootSelector)
      };
      const ownership = new InkEndpointRunOwnership(generation, context.direction);
      ownership.sync(liveLayerElement(context.from), liveLayerElement(context.to), roots);
      applyLayerVisibility(context.direction === 1 ? context.to : context.from, hiddenVisibility());
      const prepared = preparedSurface;
      preparedSurface = undefined;
      try {
        options.prepareEndpoints(roots);
        await options.prepareTargetPresentation?.(roots, {
          runId: context.runId,
          prepareToken: context.prepareToken,
          direction: context.direction,
          prefersReducedMotion: context.prefersReducedMotion,
          generation,
          target: context.direction === 1 ? 'to' : 'from'
        });
        ownership.markReady();
        return new InkSegmentTimeline(context, options, ownership, roots, prepared);
      } catch (error) {
        disposePreparedSurface(prepared);
        ownership.dispose();
        throw error;
      }
    },
    dispose() {
      disposePreparedSurface(preparedSurface);
      preparedSurface = undefined;
    }
  };
}
