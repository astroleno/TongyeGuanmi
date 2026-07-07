import { renderFigure2AnimationProgress, renderFigure2ProofTransitionProgress } from '../../scenes/figure2-animation';
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
import { createFigure2DepthInkRenderer, type Figure2DepthInkRenderer } from '../shared/figure2DepthInk';

const FIGURE2_DEPTH_IMAGE = new URL('../../../../assets/figure2-middle-depth.png', import.meta.url).href;
const FIGURE2_NEXT_WHITE_IMAGE = new URL('../../../../assets/figure2-next-white.png', import.meta.url).href;
const FIGURE2_PAPER_GROUND = '#ece8dc';
const FIGURE2_PAPER_GROUND_SOFT = '#f6f2e8';
const PROOF_LAYER_SHOW_START = 0.16;

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
  if (clamped <= PROOF_LAYER_SHOW_START) {
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
  canvas.dataset.figure2ProofInkRenderer = 'depth-scene';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  return canvas;
}

type ProofPaperTexture = {
  canvas: HTMLCanvasElement;
  update(): void;
  destroy(): void;
};

function createProofPaperTexture(): ProofPaperTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    return null;
  }

  let width = 0;
  let height = 0;
  let disposed = false;

  return {
    canvas,
    update() {
      if (disposed) {
        return;
      }
      const viewportWidth = Math.max(1, window.innerWidth || 1);
      const viewportHeight = Math.max(1, window.innerHeight || 1);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const nextWidth = Math.round(viewportWidth * ratio);
      const nextHeight = Math.round(viewportHeight * ratio);
      if (nextWidth === width && nextHeight === height && canvas.dataset.inkTextureReady === 'true') {
        return;
      }
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, viewportWidth, viewportHeight);
      const paperGradient = context.createLinearGradient(0, 0, 0, viewportHeight);
      paperGradient.addColorStop(0, FIGURE2_PAPER_GROUND_SOFT);
      paperGradient.addColorStop(0.58, FIGURE2_PAPER_GROUND);
      paperGradient.addColorStop(1, '#e4ddcf');
      context.fillStyle = paperGradient;
      context.fillRect(0, 0, viewportWidth, viewportHeight);
      canvas.dataset.inkTextureReady = 'true';
    },
    destroy() {
      disposed = true;
      canvas.dataset.inkTextureReady = 'false';
    }
  };
}

function ensureFigureMaskCanvas(fromRoot: HTMLElement | null): HTMLCanvasElement | null {
  const figureGroup = fromRoot?.querySelector<HTMLElement>('.r4-figure2__figures') ?? null;
  if (!figureGroup) {
    return null;
  }
  const existing = figureGroup.querySelector<HTMLCanvasElement>(':scope > canvas[data-r4-figure2-mask-canvas="true"]');
  if (existing) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'r4-figure2__figure-mask-canvas';
  canvas.dataset.r4Figure2MaskCanvas = 'true';
  canvas.dataset.inkTextureReady = 'false';
  canvas.setAttribute('aria-hidden', 'true');
  figureGroup.append(canvas);
  return canvas;
}

function updateFigureMaskCanvas(canvas: HTMLCanvasElement | null, fromRoot: HTMLElement | null, inkProgress: number): void {
  const figureGroup = fromRoot?.querySelector<HTMLElement>('.r4-figure2__figures') ?? null;
  const context = canvas?.getContext('2d', { alpha: true }) ?? null;
  if (!canvas || !context || !figureGroup || inkProgress <= 0.001) {
    if (canvas) {
      canvas.dataset.inkTextureReady = 'false';
    }
    return;
  }

  const groupRect = figureGroup.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
  const width = Math.max(1, Math.round(groupRect.width * ratio));
  const height = Math.max(1, Math.round(groupRect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  let drewFrame = false;

  for (const video of fromRoot?.querySelectorAll<HTMLVideoElement>('[data-figure2-video]') ?? []) {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      continue;
    }
    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    try {
      context.drawImage(
        video,
        (rect.left - groupRect.left) * ratio,
        (rect.top - groupRect.top) * ratio,
        rect.width * ratio,
        rect.height * ratio
      );
      drewFrame = true;
    } catch {
      // The video buffer can miss a frame while the browser swaps decoded data.
    }
  }

  canvas.dataset.inkTextureReady = drewFrame ? 'true' : 'false';
}

export function figure2ProofRevealProgress(progress: number): number {
  return smoothStep(range01(progress, 0.10, 0.94));
}

export function figure2IntroProgress(progress: number): number {
  return progress <= 0 ? 0 : 1;
}

export function figure2ProofTransitionProgress(progress: number): number {
  return clamp(progress);
}

class Figure2DistanceExpandTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>> = { start: 0, 'stage:0': PROOF_LAYER_SHOW_START, reveal: PROOF_LAYER_SHOW_START, end: 1 };
  readonly pauses: readonly string[] = ['stage:0'];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;
  private reportedTimelineReady = false;
  private readonly inkCanvas: HTMLCanvasElement | null;
  private readonly inkRenderer: Figure2DepthInkRenderer | null;
  private readonly elevation: TransitionLayerElevation;
  private readonly proofTexture: ProofPaperTexture | null;
  private readonly figureMaskCanvas: HTMLCanvasElement | null;

  constructor(private readonly context: TransitionContext) {
    const fromRoot = sceneRoot(context.from.element, 'figure2-animation');
    const proofRoot = sceneRoot(context.to.element, 'figure2-proof-opening');
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.proofTexture = createProofPaperTexture();
    this.proofTexture?.update();
    this.figureMaskCanvas = ensureFigureMaskCanvas(fromRoot);
    this.inkCanvas = ensureInkCanvas(context.to.element);
    this.inkRenderer = createFigure2DepthInkRenderer(this.inkCanvas, {
      targetSrc: FIGURE2_NEXT_WHITE_IMAGE,
      depthSrc: FIGURE2_DEPTH_IMAGE,
      nextSceneElement: this.proofTexture?.canvas ?? null,
      figureMaskElement: this.figureMaskCanvas,
      hideAtEnd: true,
      progressSpan: 1,
      colorLift: 0.34,
      sceneBrightness: 1,
      inkCenterX: 0.5,
      inkCenterY: 0.52,
      transparentOutside: true
    });
    proofRoot?.setAttribute('data-figure2-proof-ink-renderer', 'depth-scene');
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
    const reveal = figure2ProofRevealProgress(figure2ProofTransitionProgress(clamped));
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
    this.proofTexture?.destroy();
    this.figureMaskCanvas?.remove();
    this.elevation.restore();
    this.context.to.element?.style.removeProperty('clip-path');
    this.context.to.element?.style.removeProperty('-webkit-clip-path');
    const toRoot = sceneRoot(this.context.to.element, 'figure2-proof-opening');
    toRoot?.removeAttribute('data-r4-proof-transition-active');
  }

  private render(reveal: number, overlayOpacity: number): void {
    const fromRoot = sceneRoot(this.context.from.element, 'figure2-animation');
    const toRoot = sceneRoot(this.context.to.element, 'figure2-proof-opening');
    const active = reveal > 0.002 && reveal < 0.998;
    renderFigure2AnimationProgress(fromRoot, 1, { proofProgress: reveal, videoMode: 'none' });
    renderProofOpeningProgress(toRoot, reveal);
    this.proofTexture?.update();
    updateFigureMaskCanvas(this.figureMaskCanvas, fromRoot, reveal);
    toRoot?.style.setProperty('--r4-proof-overlay-opacity', overlayOpacity.toFixed(4));
    toRoot?.style.setProperty('--r4-proof-reveal-stop', `${(-12 + reveal * 122).toFixed(2)}%`);
    toRoot?.style.setProperty('--r4-proof-reveal-edge', `${(2 + reveal * 132).toFixed(2)}%`);
    toRoot?.setAttribute('data-figure2-proof-overlay-progress', reveal.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-reveal-stop', `${(-12 + reveal * 122).toFixed(2)}%`);
    toRoot?.setAttribute('data-figure2-retained-arch', 'true');
    if (active) {
      toRoot?.setAttribute('data-r4-proof-transition-active', 'true');
    } else {
      toRoot?.removeAttribute('data-r4-proof-transition-active');
    }
    this.context.to.element?.setAttribute('data-r4-transition', 'figure2-proof-overlay-scene-ink');
    this.context.to.element?.setAttribute('data-r4-ink-active', String(active));
    this.context.to.element?.setAttribute('data-r4-ink-progress', reveal.toFixed(4));
    this.context.to.element?.setAttribute('data-r4-clip-progress', reveal.toFixed(4));
    this.context.to.element?.setAttribute('data-figure2-proof-ink-renderer', 'depth-scene');
    toRoot?.setAttribute('data-r4-transition', 'figure2-proof-overlay-scene-ink');
    toRoot?.setAttribute('data-r4-ink-active', String(active));
    toRoot?.setAttribute('data-r4-ink-progress', reveal.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-ink-renderer', 'depth-scene');
    this.inkRenderer?.render(reveal, reveal);
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
