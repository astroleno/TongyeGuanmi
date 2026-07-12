import {
  figure2DepthTransformForProgress,
  renderFigure2AnimationProgress,
  renderFigure2Hold
} from '../../scenes/figure2-animation';
import { renderProofOpeningHold } from '../../scenes/figure2-proof-opening';
import { applyLayerVisibility, hiddenVisibility, holdVisibility, range01, smoothStep } from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';
import { mediaPlaybackFor, requiredMilestonesFor } from '../../story/manifest';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import {
  createDepthThresholdMask,
  thresholdTables,
  type DepthThresholdMask
} from '../shared/depthThresholdMask';
import {
  createInkFieldFrame,
  inkOwnershipGateProgress,
  type InkDepthTransform
} from '../shared/inkField';
import {
  createInkFieldRenderer,
  mountTransitionInkCanvas,
  type InkFieldRenderer
} from '../shared/sceneInk';

const FIGURE2_DEPTH_IMAGE = new URL('../../../../assets/figure2-middle-depth.png', import.meta.url).href;
export const FIGURE2_INTRO_END = 0.72;
export const FIGURE2_PROOF_REVEAL_START = FIGURE2_INTRO_END;

type Figure2ProofSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"], [data-r3-scene="${scene}"]`) ?? element ?? null;
}

function sampleFigure2Proof(progress: number): Figure2ProofSample {
  const reveal = figure2ProofRevealProgress(clamp(progress));
  const ownership = inkOwnershipGateProgress(reveal);
  if (ownership === 1) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  if (ownership === 0) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

function sharedStageHost(context: TransitionContext): HTMLElement | null {
  const fromParent = context.from.element?.parentElement ?? null;
  const toParent = context.to.element?.parentElement ?? null;
  return fromParent && fromParent === toParent
    ? fromParent
    : toParent ?? fromParent ?? context.to.element ?? context.from.element ?? null;
}

function clearTransitionAttrs(element: HTMLElement | null | undefined): void {
  if (!element) {
    return;
  }
  element.removeAttribute('data-r4-transition');
  element.removeAttribute('data-figure2-intro-progress');
  element.removeAttribute('data-figure2-proof-transition-progress');
  element.removeAttribute('data-figure2-proof-reveal-progress');
  element.removeAttribute('data-figure2-proof-mask-values');
}

export function figure2ProofRevealProgress(progress: number): number {
  const transitionProgress = range01(progress, FIGURE2_INTRO_END, 1);
  return smoothStep(range01(transitionProgress, 0.10, 0.94));
}

export function figure2IntroProgress(progress: number): number {
  return range01(progress, 0, FIGURE2_INTRO_END);
}

export function figure2ProofTransitionProgress(progress: number): number {
  return range01(progress, FIGURE2_INTRO_END, 1);
}

export function figure2VideoModeForProofTransition(
  transitionProgress: number,
  direction: Direction = 1
): 'native' | 'seek' | 'none' {
  if (transitionProgress > 0.001) {
    return 'none';
  }
  return direction === 1 ? 'native' : 'seek';
}

class Figure2DistanceExpandTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>> = {
    start: 0,
    'stage:0': FIGURE2_INTRO_END,
    reveal: FIGURE2_PROOF_REVEAL_START,
    end: 1
  };
  readonly pauses: readonly string[] = ['stage:0'];

  private progressValue = 0;
  private playbackDirection: Direction;
  private disposed = false;
  private animationFrame = 0;
  private reportedTimelineReady = false;
  private readonly elevation: TransitionLayerElevation;
  private readonly depthMask: DepthThresholdMask | null;
  private readonly inkCanvas: HTMLCanvasElement | null;
  private readonly inkRenderer: InkFieldRenderer | null;

  constructor(private readonly context: TransitionContext) {
    const generation = `${context.runId}:${context.prepareToken}`;
    this.playbackDirection = context.direction;
    this.elevation = createTransitionLayerElevation(context.to.element);
    const fromRoot = sceneRoot(context.from.element, 'figure2-animation');
    const stage = sharedStageHost(context);
    const depthField = fromRoot?.querySelector<HTMLElement>('[data-figure2-depth-ranked-field="true"]') ?? null;
    const figureDepthSurface = fromRoot?.querySelector<HTMLElement>(
      '[data-figure2-figure-depth-surface="true"]'
    ) ?? null;
    const proofGround = stage?.querySelector<HTMLElement>('[data-figure2-retained-ground="true"]') ?? null;
    const terminalTransform = figure2DepthTransformForProgress(fromRoot, 1);
    this.depthMask = createDepthThresholdMask({
      host: stage,
      targets: [
        ...(depthField ? [{ element: depthField, polarity: 'conceal' as const }] : []),
        ...(figureDepthSurface
          ? [{ element: figureDepthSurface, polarity: 'conceal' as const }]
          : []),
        ...(proofGround ? [{ element: proofGround, polarity: 'reveal' as const }] : []),
        ...(context.to.element ? [{ element: context.to.element, polarity: 'reveal' as const }] : [])
      ],
      depthSrc: FIGURE2_DEPTH_IMAGE,
      runId: context.runId,
      transform: terminalTransform
    });
    this.inkCanvas = mountTransitionInkCanvas(stage, 'figure2-distance-expand', {
      renderer: 'field',
      grade: 'edge-only',
      generation,
      className: 'r4-figure2-proof-ink-canvas'
    });
    this.inkRenderer = context.prefersReducedMotion ? null : createInkFieldRenderer(this.inkCanvas, {
      grade: 'edge-only',
      generation
    });
    this.inkRenderer?.prewarm(this.depthFrame(0.003, terminalTransform));
    renderProofOpeningHold(sceneRoot(context.to.element, 'figure2-proof-opening'));
    this.progress(context.direction === 1 ? 0 : 1);
  }

  play(): Promise<void> {
    return this.animateTo(1);
  }

  reverse(): Promise<void> {
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
    const intro = figure2IntroProgress(clamped);
    const transition = figure2ProofTransitionProgress(clamped);
    const reveal = figure2ProofRevealProgress(clamped);
    const sample = sampleFigure2Proof(clamped);
    this.progressValue = clamped;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    this.elevation.elevate();

    const fromRoot = sceneRoot(this.context.from.element, 'figure2-animation');
    const toRoot = sceneRoot(this.context.to.element, 'figure2-proof-opening');
    const figureState = renderFigure2AnimationProgress(fromRoot, intro, {
      proofProgress: 0,
      videoMode: figure2VideoModeForProofTransition(transition, this.playbackDirection),
      mediaRun: {
        runId: this.context.runId,
        direction: this.playbackDirection,
        reducedMotion: this.context.prefersReducedMotion
      }
    });
    renderProofOpeningHold(toRoot);
    const depthOwnership = inkOwnershipGateProgress(reveal);
    const binaryTables = this.depthMask?.render(depthOwnership, figureState.depthTransform)
      ?? thresholdTables(depthOwnership);
    const inkFrame = this.depthFrame(reveal, figureState.depthTransform);
    if (this.inkCanvas) {
      const fieldVisible = reveal > 0.002 && reveal < 0.999;
      const active = fieldVisible && Boolean(this.inkRenderer?.isActive());
      if (fieldVisible) {
        if (active) {
          this.inkCanvas.dataset.r4InkActive = 'true';
        } else {
          delete this.inkCanvas.dataset.r4InkActive;
        }
        this.inkCanvas.dataset.r4InkProgress = reveal.toFixed(4);
        this.inkCanvas.dataset.r4InkBoundaryKind = 'depth';
        this.inkCanvas.dataset.r4InkBoundaryOrigin = '0.5000,0.5000';
        this.inkCanvas.dataset.r4InkBoundaryProgress = reveal.toFixed(4);
        this.inkCanvas.dataset.r4InkFieldSeed = String(inkFrame.seed);
      } else {
        delete this.inkCanvas.dataset.r4InkActive;
        delete this.inkCanvas.dataset.r4InkProgress;
        delete this.inkCanvas.dataset.r4InkBoundaryKind;
        delete this.inkCanvas.dataset.r4InkBoundaryOrigin;
        delete this.inkCanvas.dataset.r4InkBoundaryProgress;
        delete this.inkCanvas.dataset.r4InkFieldSeed;
      }
    }
    this.inkRenderer?.render(inkFrame);
    const valueDomain = [...new Set(binaryTables.reveal)].join(',');

    this.context.to.element?.setAttribute('data-r4-transition', 'figure2-proof-binary-depth');
    this.context.to.element?.setAttribute('data-figure2-intro-progress', intro.toFixed(4));
    this.context.to.element?.setAttribute('data-figure2-proof-transition-progress', transition.toFixed(4));
    this.context.to.element?.setAttribute('data-figure2-proof-reveal-progress', reveal.toFixed(4));
    this.context.to.element?.setAttribute('data-figure2-proof-mask-values', valueDomain);
    toRoot?.setAttribute('data-r4-transition', 'figure2-proof-binary-depth');
    toRoot?.setAttribute('data-figure2-proof-reveal-progress', reveal.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-mask-values', valueDomain);

    if (!this.reportedTimelineReady && clamped >= 0.5) {
      this.reportedTimelineReady = true;
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
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): Figure2ProofSample {
    return sampleFigure2Proof(progress);
  }

  rootIdentity() {
    return {
      from: this.context.from.element,
      to: this.context.to.element
    };
  }

  effectCanvases(): readonly HTMLCanvasElement[] {
    return this.inkCanvas ? [this.inkCanvas] : [];
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.inkRenderer?.destroy();
    this.inkCanvas?.remove();
    renderFigure2AnimationProgress(
      sceneRoot(this.context.from.element, 'figure2-animation'),
      figure2IntroProgress(this.progressValue),
      {
        proofProgress: 0,
        videoMode: 'seek',
        mediaRun: {
          runId: this.context.runId,
          direction: this.playbackDirection,
          reducedMotion: this.context.prefersReducedMotion
        }
      }
    );
    if (this.progressValue > 0.001 && this.progressValue < 0.999) {
      applyLayerVisibility(this.context.from, holdVisibility(false));
      applyLayerVisibility(this.context.to, hiddenVisibility());
    }
    this.depthMask?.dispose();
    this.elevation.restore();
    clearTransitionAttrs(this.context.to.element);
    clearTransitionAttrs(sceneRoot(this.context.to.element, 'figure2-proof-opening'));
  }

  private depthFrame(
    progress: number,
    transform: InkDepthTransform
  ) {
    return createInkFieldFrame(
      {
        kind: 'depth',
        depthSrc: FIGURE2_DEPTH_IMAGE,
        seed: 'figure2-distance-expand',
        transform
      },
      progress,
      transform.viewport
    );
  }

  private animateTo(target: number): Promise<void> {
    const start = this.progressValue;
    const delta = target - start;
    const stagedPlayback = this.stagedPlaybackFor(start, target);
    const durationMs = this.context.prefersReducedMotion ? 0 : stagedPlayback.durationMs;
    if (delta === 0 || durationMs <= 0) {
      this.progress(target);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        if (this.disposed) {
          resolve();
          return;
        }
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        this.progress(stagedPlayback.progressAt(progress));
        if (progress >= 1) {
          resolve();
          return;
        }
        this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }

  private stagedPlaybackFor(start: number, target: number): {
    durationMs: number;
    progressAt: (elapsedRatio: number) => number;
  } {
    const policy = this.context.segment.policy;
    if (policy.kind !== 'stagedSnap' || policy.stops.length === 0 || policy.playMs.length < 2) {
      return {
        durationMs: this.context.segment.virtualDuration,
        progressAt: (elapsedRatio) => start + (target - start) * elapsedRatio
      };
    }

    const stop = clamp(policy.stops[0] ?? FIGURE2_INTRO_END);
    const firstMs = Math.max(0, policy.playMs[0] ?? this.context.segment.virtualDuration * stop);
    const secondMs = Math.max(0, policy.playMs[1] ?? this.context.segment.virtualDuration * (1 - stop));
    const totalMs = firstMs + secondMs;
    if (totalMs <= 0 || Math.abs(start - target) < 0.001) {
      return { durationMs: 0, progressAt: () => target };
    }

    const fullForward = start <= 0.001 && target >= 0.999;
    const fullReverse = start >= 0.999 && target <= 0.001;
    if (!fullForward && !fullReverse) {
      return {
        durationMs: this.context.segment.virtualDuration,
        progressAt: (elapsedRatio) => start + (target - start) * elapsedRatio
      };
    }

    return {
      durationMs: totalMs,
      progressAt: (elapsedRatio) => {
        const elapsedMs = Math.min(totalMs, Math.max(0, elapsedRatio * totalMs));
        if (fullForward) {
          if (elapsedMs <= firstMs) {
            return stop * (elapsedMs / Math.max(1, firstMs));
          }
          return stop + (1 - stop) * ((elapsedMs - firstMs) / Math.max(1, secondMs));
        }
        if (elapsedMs <= secondMs) {
          return 1 - (1 - stop) * (elapsedMs / Math.max(1, secondMs));
        }
        return stop * (1 - ((elapsedMs - secondMs) / Math.max(1, firstMs)));
      }
    };
  }
}

export function createFigure2DistanceExpandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'figure2-distance-expand',
    requiredMilestones: requiredMilestonesFor('figure2-distance-expand'),
    mediaPlayback: mediaPlaybackFor('figure2-distance-expand') ?? [],
    reducedMotionFallback: (context) => {
      if (context.direction === -1) {
        applyLayerVisibility(context.from, holdVisibility(true));
        applyLayerVisibility(context.to, hiddenVisibility());
        renderFigure2Hold(sceneRoot(context.from.element, 'figure2-animation'));
      } else {
        applyLayerVisibility(context.from, hiddenVisibility());
        applyLayerVisibility(context.to, holdVisibility(true));
        renderFigure2AnimationProgress(sceneRoot(context.from.element, 'figure2-animation'), 1, {
          proofProgress: 0,
          videoMode: 'none'
        });
      }
      renderProofOpeningHold(sceneRoot(context.to.element, 'figure2-proof-opening'));
      context.reportMilestone({
        key: 'timelineReady',
        segment: context.segment.id,
        runId: context.runId,
        direction: context.direction,
        progress: context.direction === 1 ? 1 : 0
      });
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new Figure2DistanceExpandTimeline(context);
    }
  };
}

export const figure2DistanceExpandTransition = createFigure2DistanceExpandTransition();
