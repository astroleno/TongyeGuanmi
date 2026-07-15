import {
  applyLayerVisibility,
  fadeVisibility,
  hiddenVisibility,
  holdVisibility,
  range01
} from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentId,
  SegmentTimelineHandle,
  StagedLegPreparation,
  TransitionContext,
  TransitionModule
} from '../../story/types';
import { MediaPreparationError } from '../../media/media-preparation';

export type StagedMediaRenderContext = Readonly<{
  runId: TransitionContext['runId'];
  prepareToken: TransitionContext['prepareToken'];
  direction: Direction;
  prefersReducedMotion: boolean;
}>;

export type StagedMediaSourceExitLifecycle = Readonly<{
  prepareLeg?: (
    root: HTMLElement | null,
    leg: StagedLegPreparation,
    context: StagedMediaRenderContext
  ) => Promise<void> | void;
  commitLegStart?: (
    root: HTMLElement | null,
    leg: StagedLegPreparation,
    context: StagedMediaRenderContext
  ) => void;
  commitLegEndpoint?: (
    root: HTMLElement | null,
    leg: StagedLegPreparation,
    context: StagedMediaRenderContext
  ) => void;
  dispose?: (
    root: HTMLElement | null,
    progress: number,
    context: StagedMediaRenderContext
  ) => void;
  renderExit(
    root: HTMLElement | null,
    progress: number,
    context: StagedMediaRenderContext
  ): void;
}>;

export type StagedMediaTargetHoldLifecycle = Readonly<{
  prepareFinalHold(root: HTMLElement | null): void;
}>;

export type StagedMediaHandoffOptions = Readonly<{
  id: SegmentId;
  delayMs?: () => number;
  rootSelector?: (scene: string) => string;
  source: StagedMediaSourceExitLifecycle;
  target: StagedMediaTargetHoldLifecycle;
}>;

export type StagedMediaHandoffSample = Readonly<{
  from: LayerVisibilityState;
  to: LayerVisibilityState;
}>;

const MAX_FRAME_DELTA_MS = 64;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeInOutCubic(value: number): number {
  const progress = clamp(value);
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function defaultRootSelector(scene: string): string {
  return `[data-r4-scene="${scene}"], [data-r3-scene="${scene}"]`;
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

function sceneRoot(
  element: HTMLElement | null,
  scene: string,
  selector = defaultRootSelector
): HTMLElement | null {
  return element?.querySelector<HTMLElement>(selector(scene)) ?? element;
}

function stagedStop(context: TransitionContext): number {
  const policy = context.segment.policy;
  if (policy.kind !== 'stagedSnap' || policy.stops.length !== 1 || policy.playMs.length !== 2) {
    throw new Error(`Invalid staged handoff: ${context.segment.id}`);
  }
  return policy.stops[0] ?? 0;
}

export function sampleStagedMediaHandoff(
  progress: number,
  stop: number
): StagedMediaHandoffSample {
  const clamped = clamp(progress);
  const dissolve = range01(clamped, stop, 1);
  if (dissolve <= 0.001) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  if (dissolve >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  return {
    from: fadeVisibility(1 - dissolve),
    to: fadeVisibility(dissolve)
  };
}

function applyVisibilityToElement(element: HTMLElement | null, state: LayerVisibilityState): void {
  if (!element) {
    return;
  }
  element.style.opacity = String(state.opacity);
  element.style.visibility = state.visible ? 'visible' : 'hidden';
  element.style.pointerEvents = state.pointerEvents;
  element.inert = state.inert;
  element.setAttribute('aria-hidden', state.inert ? 'true' : 'false');
  element.dataset.visible = String(state.visible && state.opacity > 0.001);
  element.dataset.interactable = String(!state.inert && state.pointerEvents === 'auto');
}

function clearHandoffAttrs(element: HTMLElement | null): void {
  element?.removeAttribute('data-r4-handoff');
  element?.removeAttribute('data-r4-handoff-segment');
  element?.removeAttribute('data-r4-handoff-progress');
}

function applyHandoffAttrs(
  element: HTMLElement | null,
  id: SegmentId,
  dissolve: number
): void {
  if (!element) {
    return;
  }
  element.dataset.r4Handoff = 'dissolve';
  element.dataset.r4HandoffSegment = id;
  element.dataset.r4HandoffProgress = dissolve.toFixed(4);
}

function rootsFor(context: TransitionContext, options: StagedMediaHandoffOptions) {
  const fromElement = liveLayerElement(context.from);
  const toElement = liveLayerElement(context.to);
  return {
    fromElement,
    toElement,
    from: sceneRoot(fromElement, context.from.scene, options.rootSelector),
    to: sceneRoot(toElement, context.to.scene, options.rootSelector)
  };
}

function renderContext(context: TransitionContext, direction: Direction): StagedMediaRenderContext {
  return {
    runId: context.runId,
    prepareToken: context.prepareToken,
    direction,
    prefersReducedMotion: context.prefersReducedMotion
  };
}

function applyInitialVisibility(context: TransitionContext, options: StagedMediaHandoffOptions): void {
  const stop = stagedStop(context);
  const sample = sampleStagedMediaHandoff(context.direction === 1 ? 0 : 1, stop);
  const roots = rootsFor(context, options);
  applyLayerVisibility(context.from, sample.from);
  applyLayerVisibility(context.to, sample.to);
  applyVisibilityToElement(roots.fromElement, sample.from);
  applyVisibilityToElement(roots.toElement, sample.to);
  clearHandoffAttrs(roots.fromElement);
  clearHandoffAttrs(roots.toElement);
  options.target.prepareFinalHold(roots.to);
}

class StagedMediaHandoffTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];

  private readonly stop: number;
  private progressValue: number;
  private playbackDirection: Direction;
  private disposed = false;
  private animationFrame = 0;
  private preparedFromRoot: HTMLElement | null = null;
  private preparedToRoot: HTMLElement | null = null;
  private renderedSourceRoot: HTMLElement | null = null;
  private renderedSourceProgress = Number.NaN;
  private renderedSourceDirection: Direction | undefined;
  private preparationGeneration = 0;
  private preparedLeg: StagedLegPreparation | undefined;
  private armedLeg: StagedLegPreparation | undefined;

  constructor(
    private readonly context: TransitionContext,
    private readonly options: StagedMediaHandoffOptions
  ) {
    this.stop = stagedStop(context);
    this.pauses = context.segment.policy.kind === 'stagedSnap'
      && context.segment.policy.advance[0]?.kind === 'gesture'
      ? ['stage:0']
      : [];
    this.labels = {
      start: 0,
      media: 0,
      'stage:0': this.stop,
      dissolve: this.stop,
      end: 1
    };
    this.progressValue = context.direction === 1 ? 0 : 1;
    this.playbackDirection = context.direction;
    this.progress(this.progressValue);
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
    const clamped = clamp(value);
    if (clamped > this.progressValue + 0.0001) {
      this.playbackDirection = 1;
    } else if (clamped < this.progressValue - 0.0001) {
      this.playbackDirection = -1;
    }
    this.progressValue = clamped;

    const roots = rootsFor(this.context, this.options);
    if (roots.from !== this.preparedFromRoot || roots.to !== this.preparedToRoot) {
      this.options.target.prepareFinalHold(roots.to);
      this.preparedFromRoot = roots.from;
      this.preparedToRoot = roots.to;
    }

    const sample = sampleStagedMediaHandoff(clamped, this.stop);
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    applyVisibilityToElement(roots.fromElement, sample.from);
    applyVisibilityToElement(roots.toElement, sample.to);

    const sourceProgress = range01(clamped, 0, this.stop);
    if (
      roots.from !== this.renderedSourceRoot
      || Math.abs(sourceProgress - this.renderedSourceProgress) > 0.0001
      || this.renderedSourceDirection !== this.playbackDirection
    ) {
      this.options.source.renderExit(
        roots.from,
        sourceProgress,
        renderContext(this.context, this.playbackDirection)
      );
      this.renderedSourceRoot = roots.from;
      this.renderedSourceProgress = sourceProgress;
      this.renderedSourceDirection = this.playbackDirection;
    }

    const dissolve = range01(clamped, this.stop, 1);
    if (dissolve > 0.001 && dissolve < 0.999) {
      applyHandoffAttrs(roots.fromElement, this.options.id, dissolve);
      applyHandoffAttrs(roots.toElement, this.options.id, dissolve);
    } else {
      clearHandoffAttrs(roots.fromElement);
      clearHandoffAttrs(roots.toElement);
    }

    const armedLeg = this.armedLeg;
    if (armedLeg && Math.abs(clamped - armedLeg.to) <= 0.0001) {
      this.armedLeg = undefined;
      this.options.source.commitLegEndpoint?.(
        roots.from,
        armedLeg,
        renderContext(this.context, armedLeg.direction)
      );
    }
  }

  jumpToEnd(direction: Direction): void {
    this.playbackDirection = direction;
    this.progress(direction === 1 ? 1 : 0);
  }

  prepareLeg(leg: StagedLegPreparation): Promise<void> | void {
    const roots = rootsFor(this.context, this.options);
    const generation = ++this.preparationGeneration;
    this.preparedLeg = undefined;
    const readiness = this.options.source.prepareLeg?.(
      roots.from,
      leg,
      renderContext(this.context, leg.direction)
    );
    const markPrepared = () => {
      if (
        this.disposed
        || this.preparationGeneration !== generation
        || leg.signal.aborted
      ) {
        const reason = leg.signal.reason;
        if (reason instanceof MediaPreparationError) {
          throw reason;
        }
        throw new MediaPreparationError(
          'MEDIA_PREPARATION_ABORTED',
          `Stale staged prepare: ${leg.runId}`,
          reason === undefined ? {} : { cause: reason }
        );
      }
      this.preparedLeg = leg;
    };
    if (!readiness) {
      markPrepared();
      return;
    }
    return Promise.resolve(readiness).then(markPrepared);
  }

  commitLeg(leg: StagedLegPreparation): void {
    if (this.disposed || this.preparedLeg !== leg || leg.signal.aborted) {
      throw new MediaPreparationError(
        'MEDIA_PREPARATION_ABORTED',
        `Unprepared staged leg: ${leg.runId}`
      );
    }
    const roots = rootsFor(this.context, this.options);
    this.options.source.commitLegStart?.(
      roots.from,
      leg,
      renderContext(this.context, leg.direction)
    );
    this.preparedLeg = undefined;
    this.armedLeg = leg;
  }

  sample(progress: number): StagedMediaHandoffSample {
    return sampleStagedMediaHandoff(progress, this.stop);
  }

  rootIdentity() {
    return {
      from: liveLayerElement(this.context.from),
      to: liveLayerElement(this.context.to)
    };
  }

  effectCanvases(): readonly HTMLCanvasElement[] {
    return [];
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.preparationGeneration += 1;
    this.preparedLeg = undefined;
    this.armedLeg = undefined;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    const roots = rootsFor(this.context, this.options);
    this.options.source.dispose?.(
      roots.from,
      this.progressValue,
      renderContext(this.context, this.playbackDirection)
    );
    clearHandoffAttrs(roots.fromElement);
    clearHandoffAttrs(roots.toElement);
    this.preparedFromRoot = null;
    this.preparedToRoot = null;
    this.renderedSourceRoot = null;
  }

  private animateTo(target: number): Promise<void> {
    const start = this.progressValue;
    const delta = target - start;
    const durationMs = this.context.prefersReducedMotion
      ? 0
      : this.context.segment.virtualDuration * Math.abs(delta);
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
        elapsedMs += Math.min(frameDelta, MAX_FRAME_DELTA_MS);
        const elapsedRatio = Math.min(1, elapsedMs / durationMs);
        this.progress(start + delta * easeInOutCubic(elapsedRatio));
        if (elapsedRatio >= 1) {
          resolve();
          return;
        }
        this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }
}

export function createStagedMediaHandoff(
  options: StagedMediaHandoffOptions
): TransitionModule {
  return {
    id: options.id,
    requiredMilestones: ['targetReady', 'buildReady'],
    reducedMotionFallback: async (context) => {
      applyInitialVisibility(context, options);
      const endpoint = context.direction === 1 ? 1 : 0;
      const roots = rootsFor(context, options);
      options.source.renderExit(
        roots.from,
        range01(endpoint, 0, stagedStop(context)),
        renderContext(context, context.direction)
      );
      const sample = sampleStagedMediaHandoff(endpoint, stagedStop(context));
      applyLayerVisibility(context.from, sample.from);
      applyLayerVisibility(context.to, sample.to);
      applyVisibilityToElement(roots.fromElement, sample.from);
      applyVisibilityToElement(roots.toElement, sample.to);
      clearHandoffAttrs(roots.fromElement);
      clearHandoffAttrs(roots.toElement);
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      applyInitialVisibility(context, options);
      return new StagedMediaHandoffTimeline(context, options);
    }
  };
}
