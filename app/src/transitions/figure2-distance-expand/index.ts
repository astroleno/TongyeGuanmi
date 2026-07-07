import { renderFigure2ProofTransitionProgress } from '../../scenes/figure2-animation';
import { renderProofOpeningProgress } from '../../scenes/figure2-proof-opening';
import { applyLayerVisibility, hiddenVisibility, holdVisibility, range01, smoothStep } from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import { createSceneInkRenderer, type SceneInkRenderer } from '../shared/sceneInk';

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
  const clamped = clamp(progress);
  if (clamped >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  if (clamped <= 0.001) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

function ensureInkCanvas(container: HTMLElement | null): HTMLCanvasElement | null {
  if (!container) {
    return null;
  }
  const existing = container.querySelector<HTMLCanvasElement>(':scope > canvas[data-r4-ink-segment="figure2-distance-expand"]');
  if (existing) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'r4-ink-transition-canvas r4-scene-ink-canvas r4-figure2-proof-ink-canvas';
  canvas.dataset.r4InkSegment = 'figure2-distance-expand';
  canvas.dataset.figure2ProofInkRenderer = 'scene';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  return canvas;
}

function applyRadialClip(element: HTMLElement | null, progress: number): void {
  if (!element) {
    return;
  }
  const clamped = smoothStep(clamp(progress));
  if (clamped <= 0.001) {
    element.style.clipPath = 'circle(0% at 50.00% 52.00%)';
    element.style.setProperty('-webkit-clip-path', element.style.clipPath);
    return;
  }
  if (clamped >= 0.999) {
    element.style.clipPath = '';
    element.style.removeProperty('-webkit-clip-path');
    return;
  }
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, rect.width || window.innerWidth || 1);
  const height = Math.max(1, rect.height || window.innerHeight || 1);
  const cx = width * 0.5;
  const cy = height * 0.52;
  const radius = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy)
  ) * (0.04 + clamped * 1.06);
  const clip = `circle(${radius.toFixed(2)}px at 50.00% 52.00%)`;
  element.style.clipPath = clip;
  element.style.setProperty('-webkit-clip-path', clip);
}

export function figure2ProofRevealProgress(progress: number): number {
  return smoothStep(range01(progress, 0.10, 0.94));
}

class Figure2DistanceExpandTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>> = { start: 0, 'stage:0': 0.72, end: 1 };
  readonly pauses: readonly string[] = ['stage:0'];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;
  private reportedTimelineReady = false;
  private readonly inkCanvas: HTMLCanvasElement | null;
  private readonly inkRenderer: SceneInkRenderer | null;
  private readonly elevation: TransitionLayerElevation;

  constructor(private readonly context: TransitionContext) {
    const proofRoot = sceneRoot(context.to.element, 'figure2-proof-opening');
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.inkCanvas = ensureInkCanvas(proofRoot);
    this.inkRenderer = createSceneInkRenderer(this.inkCanvas, {
      hideAtEnd: true,
      perlinOverlay: true,
      perlinStrength: 0.36,
      progressSpan: 1.04,
      colorLift: 0.64,
      sceneBrightness: 1,
      inkCenterX: 0.5,
      inkCenterY: 0.52,
      transparentOutside: true
    });
    this.inkRenderer?.prewarm();
    this.progress(0);
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
    const reveal = figure2ProofRevealProgress(clamped);
    const overlayOpacity = smoothStep(range01(reveal, 0.015, 0.16));
    const sample = sampleFigure2Proof(clamped);
    this.progressValue = clamped;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    this.elevation.elevate();
    this.render(reveal, overlayOpacity);
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

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.inkRenderer?.destroy();
    this.elevation.restore();
    this.context.to.element?.style.removeProperty('clip-path');
    this.context.to.element?.style.removeProperty('-webkit-clip-path');
  }

  private render(reveal: number, overlayOpacity: number): void {
    const fromRoot = sceneRoot(this.context.from.element, 'figure2-animation');
    const toRoot = sceneRoot(this.context.to.element, 'figure2-proof-opening');
    renderFigure2ProofTransitionProgress(fromRoot, reveal);
    renderProofOpeningProgress(toRoot, reveal);
    toRoot?.style.setProperty('--r4-proof-overlay-opacity', overlayOpacity.toFixed(4));
    toRoot?.style.setProperty('--r4-proof-reveal-stop', `${(-12 + reveal * 122).toFixed(2)}%`);
    toRoot?.style.setProperty('--r4-proof-reveal-edge', `${(2 + reveal * 132).toFixed(2)}%`);
    toRoot?.setAttribute('data-figure2-proof-overlay-progress', reveal.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-reveal-stop', `${(-12 + reveal * 122).toFixed(2)}%`);
    toRoot?.setAttribute('data-figure2-retained-arch', 'true');
    this.context.to.element?.setAttribute('data-r4-transition', 'figure2-proof-overlay-scene-ink');
    this.context.to.element?.setAttribute('data-r4-ink-active', String(reveal > 0.002 && reveal < 0.998));
    this.context.to.element?.setAttribute('data-r4-ink-progress', reveal.toFixed(4));
    this.context.to.element?.setAttribute('data-r4-clip-progress', reveal.toFixed(4));
    this.context.to.element?.setAttribute('data-figure2-proof-ink-renderer', 'scene');
    toRoot?.setAttribute('data-r4-transition', 'figure2-proof-overlay-scene-ink');
    toRoot?.setAttribute('data-r4-ink-active', String(reveal > 0.002 && reveal < 0.998));
    toRoot?.setAttribute('data-r4-ink-progress', reveal.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-ink-renderer', 'scene');
    applyRadialClip(this.context.to.element, reveal);
    this.inkRenderer?.render(reveal, reveal, { perlinStrength: 0.36, sceneBrightness: 1 });
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
      const startedAt = performance.now();
      const tick = (now: number) => {
        if (this.disposed) {
          resolve();
          return;
        }
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        this.progress(start + delta * progress);
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

export function createFigure2DistanceExpandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'figure2-distance-expand',
    requiredMilestones: ['targetReady', 'buildReady', 'timelineReady'],
    reducedMotionFallback: (context) => {
      applyLayerVisibility(context.from, hiddenVisibility());
      applyLayerVisibility(context.to, holdVisibility(true));
      renderFigure2ProofTransitionProgress(sceneRoot(context.from.element, 'figure2-animation'), 1);
      renderProofOpeningProgress(sceneRoot(context.to.element, 'figure2-proof-opening'), 1);
      context.reportMilestone({
        key: 'timelineReady',
        segment: context.segment.id,
        runId: context.runId,
        direction: context.direction,
        progress: 1
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
