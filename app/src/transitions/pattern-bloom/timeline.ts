import { renderHeroProgress } from '../../scenes/hero';
import { renderPatternProgress } from '../../scenes/pattern';
import { renderStarMapProgress } from '../../scenes/star-map';
import { applyLayerVisibility, hiddenVisibility, holdVisibility, range01, smoothStep } from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentId,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import { createSceneInkRenderer, type SceneInkRenderer } from '../shared/sceneInk';

export const PATTERN_REVEAL_END = 0.46;
export const PATTERN_BLOOM_START = 0.42;
export const PATTERN_BLOOM_END = 0.70;
export const PATTERN_SECOND_REVEAL_START = 0.58;
export const PATTERN_SECOND_REVEAL_END = 0.985;

type PatternBloomSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
};

type PatternBloomVariant = 'hero-pattern' | 'pattern-star-map';

type PatternBloomOptions = {
  id: Extract<SegmentId, 'hero-pattern' | 'pattern-star-map'>;
  delayMs?: (() => number) | undefined;
  variant: PatternBloomVariant;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"], [data-r3-scene="${scene}"]`) ?? element ?? null;
}

function samplePatternBloom(progress: number): PatternBloomSample {
  const clamped = clamp(progress);
  if (clamped >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  if (clamped <= 0.001) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

function ensureInkCanvas(container: HTMLElement | null, id: SegmentId): HTMLCanvasElement | null {
  if (!container) {
    return null;
  }
  const existing = container.querySelector<HTMLCanvasElement>(`:scope > canvas[data-r4-ink-segment="${id}"]`);
  if (existing) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'r4-ink-transition-canvas r4-scene-ink-canvas';
  canvas.dataset.r4InkSegment = id;
  canvas.dataset.patternInkRenderer = 'scene';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  return canvas;
}

function setTransitionAttrs(
  element: HTMLElement | null,
  id: SegmentId,
  transition: string,
  inkProgress: number,
  clipProgress: number,
  activeProgress = inkProgress
): void {
  if (!element) {
    return;
  }
  element.dataset.r4Transition = transition;
  element.dataset.r4InkActive = String(activeProgress > 0.002 && activeProgress < 0.998);
  element.dataset.r4InkProgress = inkProgress.toFixed(4);
  element.dataset.r4ClipProgress = clipProgress.toFixed(4);
  element.dataset.patternInkRenderer = 'scene';
  const canvas = element.querySelector<HTMLCanvasElement>(`:scope > canvas[data-r4-ink-segment="${id}"]`);
  if (canvas) {
    canvas.dataset.patternInkRenderer = 'scene';
  }
}

function clearTransitionAttrs(element: HTMLElement | null): void {
  if (!element) {
    return;
  }
  delete element.dataset.r4Transition;
  delete element.dataset.r4InkActive;
  delete element.dataset.r4InkProgress;
  delete element.dataset.r4ClipProgress;
}

export function patternHeroGlobalProgress(progress: number): number {
  return clamp(progress);
}

export function patternBloomProgressForHeroPattern(progress: number): number {
  return range01(patternHeroGlobalProgress(progress), PATTERN_BLOOM_START, PATTERN_BLOOM_END);
}

export function patternRevealProgressForHeroPattern(progress: number): number {
  return smoothStep(range01(patternHeroGlobalProgress(progress), 0, PATTERN_REVEAL_END));
}

export function patternStarMapGlobalProgress(progress: number): number {
  return PATTERN_SECOND_REVEAL_START + clamp(progress) * (PATTERN_SECOND_REVEAL_END - PATTERN_SECOND_REVEAL_START);
}

export function patternSecondRevealProgressForStarMap(progress: number): number {
  return smoothStep(range01(patternStarMapGlobalProgress(progress), PATTERN_SECOND_REVEAL_START, PATTERN_SECOND_REVEAL_END));
}

export function patternTopSceneOpacityForStarMap(progress: number): number {
  const secondReveal = patternSecondRevealProgressForStarMap(progress);
  const topSceneExit = smoothStep(range01(secondReveal, 0.68, 0.98));
  const lotusOpacity = 1 - topSceneExit;
  if (secondReveal >= 0.998) {
    return 0;
  }
  return Math.min(lotusOpacity, secondReveal > 0.002 ? 0.18 : 1);
}

class PatternBloomTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[] = [];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;
  private readonly inkCanvas: HTMLCanvasElement | null;
  private readonly inkRenderer: SceneInkRenderer | null;
  private readonly elevation: TransitionLayerElevation;

  constructor(
    private readonly context: TransitionContext,
    private readonly options: PatternBloomOptions
  ) {
    this.labels = { start: 0, reveal: 0.46, bloom: 0.7, end: 1 };
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.inkCanvas = ensureInkCanvas(context.to.element, options.id);
    if (this.inkCanvas) {
      const origin = options.variant === 'hero-pattern' ? { x: 0.5, y: 0.5 } : { x: 0.24, y: 0.55 };
      this.inkCanvas.dataset.inkOriginX = origin.x.toFixed(3);
      this.inkCanvas.dataset.inkOriginY = origin.y.toFixed(3);
    }
    this.inkRenderer = createSceneInkRenderer(this.inkCanvas, this.createInkOptions());
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
    const sample = samplePatternBloom(clamped);
    this.progressValue = clamped;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    this.elevation.elevate();
    if (this.options.variant === 'hero-pattern') {
      this.renderHeroPattern(clamped);
    } else {
      this.renderPatternStarMap(clamped);
    }
  }

  jumpToEnd(direction: Direction): void {
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): PatternBloomSample {
    return samplePatternBloom(progress);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.inkRenderer?.destroy();
    this.elevation.restore();
    clearTransitionAttrs(this.context.to.element);
    this.context.to.element?.style.removeProperty('clip-path');
    this.context.to.element?.style.removeProperty('-webkit-clip-path');
  }

  private renderHeroPattern(progress: number): void {
    const reveal = patternRevealProgressForHeroPattern(progress);
    const bloom = patternBloomProgressForHeroPattern(progress);
    const sceneOpacity = reveal >= 0.998 ? 1 : 0;
    const patternRoot = sceneRoot(this.context.to.element, 'pattern');
    renderHeroProgress(sceneRoot(this.context.from.element, 'hero'), 1 - progress);
    renderPatternProgress(patternRoot, bloom, { visible: true });
    patternRoot?.style.setProperty('--r4-pattern-scene-opacity', sceneOpacity.toFixed(4));
    patternRoot?.setAttribute('data-pattern-reveal-progress', reveal.toFixed(4));
    patternRoot?.setAttribute('data-pattern-bloom-progress', bloom.toFixed(4));
    patternRoot?.setAttribute('data-pattern-ink-renderer', 'scene');
    setTransitionAttrs(this.context.to.element, this.options.id, 'pattern-bloom-hero-scene-ink', reveal, reveal, progress);
    this.inkRenderer?.render(reveal, reveal);
  }

  private renderPatternStarMap(progress: number): void {
    const secondReveal = patternSecondRevealProgressForStarMap(progress);
    const patternOpacity = patternTopSceneOpacityForStarMap(progress);
    const starPresentationProgress = progress >= 0.999 ? 1 : 0;
    const starSceneOpacity = progress >= 0.999 ? 1 : 0;
    const patternRoot = sceneRoot(this.context.from.element, 'pattern');
    const starMapRoot = sceneRoot(this.context.to.element, 'star-map');
    renderPatternProgress(patternRoot, 1, { visible: true, opacity: patternOpacity });
    renderStarMapProgress(starMapRoot, starPresentationProgress);
    starMapRoot?.style.setProperty('--r3-star-scene-opacity', starSceneOpacity.toFixed(4));
    patternRoot?.setAttribute('data-pattern-second-reveal-progress', secondReveal.toFixed(4));
    patternRoot?.setAttribute('data-pattern-top-scene-opacity', patternOpacity.toFixed(4));
    patternRoot?.setAttribute('data-pattern-ink-renderer', 'scene');
    starMapRoot?.setAttribute('data-pattern-second-reveal-progress', secondReveal.toFixed(4));
    starMapRoot?.setAttribute('data-pattern-star-presentation-progress', starPresentationProgress.toFixed(4));
    starMapRoot?.setAttribute('data-pattern-ink-renderer', 'scene');
    setTransitionAttrs(this.context.to.element, this.options.id, 'pattern-bloom-star-map-scene-ink', secondReveal, secondReveal, progress);
    this.inkRenderer?.render(secondReveal, secondReveal, {
      perlinStrength: 0.40,
      sceneBrightness: 0.92
    });
  }

  private createInkOptions() {
    if (this.options.variant === 'hero-pattern') {
      const patternCanvas = sceneRoot(this.context.to.element, 'pattern')?.querySelector<HTMLCanvasElement>('[data-pattern-canvas]') ?? null;
      return {
        nextSceneElement: patternCanvas,
        hideAtEnd: true,
        perlinOverlay: false,
        perlinStrength: 0,
        progressSpan: 1,
        colorLift: 0.58,
        sceneBrightness: 1,
        inkCenterX: 0.5,
        inkCenterY: 0.5,
        transparentOutside: true
      };
    }
    const starCanvas = sceneRoot(this.context.to.element, 'star-map')?.querySelector<HTMLCanvasElement>('[data-belief-star-field]') ?? null;
    return {
      nextSceneElement: starCanvas,
      hideAtEnd: true,
      perlinOverlay: true,
      perlinStrength: 0.40,
      progressSpan: 0.94,
      colorLift: 0.62,
      sceneBrightness: 0.92,
      inkCenterX: 0.24,
      inkCenterY: 0.55,
      transparentOutside: true
    };
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

export function createPatternBloomTransition(options: PatternBloomOptions): TransitionModule {
  return {
    id: options.id,
    requiredMilestones: ['targetReady', 'buildReady'],
    reducedMotionFallback: (context) => {
      applyLayerVisibility(context.from, hiddenVisibility());
      applyLayerVisibility(context.to, holdVisibility(true));
      if (options.variant === 'hero-pattern') {
        renderPatternProgress(sceneRoot(context.to.element, 'pattern'), 1, { visible: true });
      } else {
        renderPatternProgress(sceneRoot(context.from.element, 'pattern'), 1, { visible: true, opacity: 0 });
        renderStarMapProgress(sceneRoot(context.to.element, 'star-map'), 1);
      }
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new PatternBloomTimeline(context, options);
    }
  };
}
