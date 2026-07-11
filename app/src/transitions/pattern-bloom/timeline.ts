import { renderHeroProgress } from '../../scenes/hero';
import { renderPatternProgress } from '../../scenes/pattern';
import { pauseStarMapTransitionMotion, releaseStarMapTransitionMotion, renderStarMapProgress } from '../../scenes/star-map';
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
import { createSceneInkRenderer, mountTransitionInkCanvas, type SceneInkRenderer } from '../shared/sceneInk';

export const HERO_PATTERN_INK_TARGET_IMAGE = new URL('../../../../assets/patterns/exports/pattern-bloom-initial-no-stars.png', import.meta.url).href;
export const PATTERN_STAR_MAP_INK_TARGET_IMAGE = new URL('../../../../assets/back2.png', import.meta.url).href;

export const PATTERN_REVEAL_END = 0.58;
export const PATTERN_BLOOM_START = PATTERN_REVEAL_END;
export const PATTERN_BLOOM_END = 1;
export const PATTERN_SECOND_REVEAL_START = 0.58;
export const PATTERN_SECOND_REVEAL_END = 1;
export const PATTERN_STAR_MAP_INK_PROGRESS_SPAN = 0.94;
export const PATTERN_STAR_MAP_MAIN_BRIGHTNESS = 0.74;
export const PATTERN_STAR_MAP_PERLIN_RESOLVE_START = 0.72;
const PATTERN_STAR_MAP_TRANSITION_BRIGHTNESS = 0.92;
const PATTERN_STAR_MAP_TRANSITION_PERLIN_STRENGTH = 0.40;

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

function samplePatternStarMap(progress: number): PatternBloomSample {
  const clamped = clamp(progress);
  if (clamped >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  if (clamped <= 0.001) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

function sharedStageHost(context: TransitionContext): HTMLElement | null {
  const fromParent = context.from.element?.parentElement ?? null;
  const toParent = context.to.element?.parentElement ?? null;
  return fromParent && fromParent === toParent ? fromParent : toParent ?? fromParent ?? context.to.element ?? context.from.element ?? null;
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

export function patternRotationProgressForHeroPattern(progress: number): number {
  return smoothStep(range01(patternHeroGlobalProgress(progress), 0, PATTERN_REVEAL_END));
}

export function patternRevealProgressForHeroPattern(progress: number): number {
  return smoothStep(range01(patternHeroGlobalProgress(progress), 0, PATTERN_REVEAL_END));
}

export function patternSceneOpacityForHeroPattern(progress: number): number {
  const reveal = patternRevealProgressForHeroPattern(progress);
  return smoothStep(range01(reveal, 0.90, 0.998));
}

export function renderHeroForHeroPattern(root: HTMLElement | null): void {
  renderHeroProgress(root, 1);
}

export function patternStarMapGlobalProgress(progress: number): number {
  return PATTERN_SECOND_REVEAL_START + clamp(progress) * (PATTERN_SECOND_REVEAL_END - PATTERN_SECOND_REVEAL_START);
}

export function patternSecondRevealProgressForStarMap(progress: number): number {
  return smoothStep(range01(patternStarMapGlobalProgress(progress), PATTERN_SECOND_REVEAL_START, PATTERN_SECOND_REVEAL_END));
}

export function patternSecondInkProgressForStarMap(progress: number): number {
  return patternSecondRevealProgressForStarMap(progress);
}

export function patternTopSceneOpacityForStarMap(progress: number): number {
  const secondReveal = patternSecondInkProgressForStarMap(progress);
  const topSceneExit = smoothStep(range01(secondReveal, 0.68, 0.98));
  const lotusOpacity = 1 - topSceneExit;
  if (secondReveal >= 0.998) {
    return 0;
  }
  return Math.max(0, Math.min(lotusOpacity, secondReveal > 0.002 ? 0.18 : 1));
}

export function starMapPresentationProgressForPatternStarMap(progress: number): number {
  const inkReveal = patternSecondInkProgressForStarMap(progress);
  return smoothStep(range01(inkReveal, 0.92, 0.998));
}

function starMapInkGrade(inkReveal: number): { perlinStrength: number; sceneBrightness: number } {
  const resolved = smoothStep(range01(
    inkReveal,
    PATTERN_STAR_MAP_PERLIN_RESOLVE_START,
    PATTERN_STAR_MAP_INK_PROGRESS_SPAN
  ));
  return {
    perlinStrength: PATTERN_STAR_MAP_TRANSITION_PERLIN_STRENGTH * (1 - resolved),
    sceneBrightness: PATTERN_STAR_MAP_TRANSITION_BRIGHTNESS
      + (PATTERN_STAR_MAP_MAIN_BRIGHTNESS - PATTERN_STAR_MAP_TRANSITION_BRIGHTNESS) * resolved
  };
}

class PatternBloomTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;
  private readonly inkCanvas: HTMLCanvasElement | null;
  private readonly inkRenderer: SceneInkRenderer | null;
  private readonly elevation: TransitionLayerElevation;
  private readonly starMapRoot: HTMLElement | null;
  private readonly starMapSourceCanvas: HTMLCanvasElement | null;

  constructor(
    private readonly context: TransitionContext,
    private readonly options: PatternBloomOptions
  ) {
    const stops = context.segment.policy.kind === 'stagedSnap' ? context.segment.policy.stops : [];
    this.labels = Object.fromEntries([
      ['start', 0],
      ['reveal', PATTERN_REVEAL_END],
      ['bloom', PATTERN_BLOOM_END],
      ...stops.map((stop, index) => [`stage:${index}`, stop] as const),
      ['end', 1]
    ]);
    this.pauses = stops.map((_, index) => `stage:${index}`);
    const elevationTarget = options.variant === 'pattern-star-map' ? context.from.element : context.to.element;
    this.elevation = createTransitionLayerElevation(elevationTarget);
    this.starMapRoot = options.variant === 'pattern-star-map' ? sceneRoot(context.to.element, 'star-map') : null;
    this.starMapSourceCanvas = this.starMapRoot?.querySelector<HTMLCanvasElement>('[data-belief-star-field]') ?? null;
    pauseStarMapTransitionMotion(this.starMapRoot);
    const origin = options.variant === 'hero-pattern' ? { x: 0.5, y: 0.5 } : { x: 0.24, y: 0.55 };
    this.inkCanvas = mountTransitionInkCanvas(sharedStageHost(context), options.id, {
      renderer: 'scene',
      origin,
      preset: 'cinematic-color'
    });
    if (this.inkCanvas) {
      this.inkCanvas.dataset.patternInkRenderer = 'scene';
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
    const sample = this.options.variant === 'pattern-star-map' ? samplePatternStarMap(clamped) : samplePatternBloom(clamped);
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
    return this.options.variant === 'pattern-star-map' ? samplePatternStarMap(progress) : samplePatternBloom(progress);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.inkRenderer?.destroy();
    this.inkCanvas?.remove();
    this.elevation.restore();
    releaseStarMapTransitionMotion(this.starMapRoot);
    clearTransitionAttrs(this.context.to.element);
    clearTransitionAttrs(this.context.from.element);
  }

  private renderHeroPattern(progress: number): void {
    const reveal = patternRevealProgressForHeroPattern(progress);
    const bloom = patternBloomProgressForHeroPattern(progress);
    const rotation = patternRotationProgressForHeroPattern(progress);
    const sceneOpacity = patternSceneOpacityForHeroPattern(progress);
    const patternRoot = sceneRoot(this.context.to.element, 'pattern');
    renderHeroForHeroPattern(sceneRoot(this.context.from.element, 'hero'));
    renderPatternProgress(patternRoot, bloom, { visible: true, copyProgress: bloom, rotationProgress: rotation });
    patternRoot?.style.setProperty('--r4-pattern-scene-opacity', sceneOpacity.toFixed(4));
    patternRoot?.setAttribute('data-pattern-reveal-progress', reveal.toFixed(4));
    patternRoot?.setAttribute('data-pattern-bloom-progress', bloom.toFixed(4));
    patternRoot?.setAttribute('data-pattern-rotation-progress', rotation.toFixed(4));
    patternRoot?.setAttribute('data-pattern-ink-renderer', 'scene');
    setTransitionAttrs(this.context.to.element, this.options.id, 'pattern-bloom-hero-scene-ink', reveal, reveal, progress);
    this.inkRenderer?.render(reveal, reveal);
    if (this.inkCanvas) {
      this.inkCanvas.dataset.r4InkActive = String(reveal > 0.002 && reveal < 0.998);
      this.inkCanvas.dataset.r4InkProgress = reveal.toFixed(4);
    }
  }

  private renderPatternStarMap(progress: number): void {
    const secondReveal = patternSecondRevealProgressForStarMap(progress);
    const inkReveal = patternSecondInkProgressForStarMap(progress);
    const patternOpacity = patternTopSceneOpacityForStarMap(progress);
    const starPresentationProgress = starMapPresentationProgressForPatternStarMap(progress);
    const grade = starMapInkGrade(inkReveal);
    const patternRoot = sceneRoot(this.context.from.element, 'pattern');
    const starMapRoot = this.starMapRoot;
    if (inkReveal >= PATTERN_STAR_MAP_INK_PROGRESS_SPAN) {
      releaseStarMapTransitionMotion(starMapRoot);
    } else {
      pauseStarMapTransitionMotion(starMapRoot);
    }
    renderPatternProgress(patternRoot, 1, { visible: true, opacity: patternOpacity, copyProgress: 1, rotationProgress: 1 });
    renderStarMapProgress(starMapRoot, 1);
    starMapRoot?.style.setProperty('--r3-star-copy-opacity', (starPresentationProgress * 0.72).toFixed(4));
    starMapRoot?.style.setProperty('--r3-star-scene-opacity', '1.0000');
    patternRoot?.setAttribute('data-pattern-second-reveal-progress', secondReveal.toFixed(4));
    patternRoot?.setAttribute('data-pattern-top-scene-opacity', patternOpacity.toFixed(4));
    patternRoot?.setAttribute('data-pattern-ink-renderer', 'scene');
    starMapRoot?.setAttribute('data-pattern-second-reveal-progress', secondReveal.toFixed(4));
    starMapRoot?.setAttribute('data-pattern-star-presentation-progress', starPresentationProgress.toFixed(4));
    starMapRoot?.setAttribute('data-pattern-ink-renderer', 'scene');
    setTransitionAttrs(this.context.from.element, this.options.id, 'pattern-bloom-star-map-scene-ink', inkReveal, inkReveal, progress);
    this.inkRenderer?.render(inkReveal, inkReveal, {
      perlinStrength: grade.perlinStrength,
      sceneBrightness: grade.sceneBrightness
    });
    if (this.inkCanvas) {
      this.inkCanvas.dataset.r4InkActive = String(inkReveal > 0.002 && inkReveal < 0.998);
      this.inkCanvas.dataset.r4InkProgress = inkReveal.toFixed(4);
      this.inkCanvas.dataset.starMapSceneBrightness = grade.sceneBrightness.toFixed(4);
      this.inkCanvas.dataset.starMapPerlinStrength = grade.perlinStrength.toFixed(4);
    }
  }

  private createInkOptions() {
    if (this.options.variant === 'hero-pattern') {
      return {
        targetSrc: HERO_PATTERN_INK_TARGET_IMAGE,
        hideAtEnd: true,
        perlinOverlay: false,
        perlinStrength: 0,
        progressSpan: 1,
        sceneBrightness: 1,
        inkCenterX: 0.5,
        inkCenterY: 0.5,
        transparentOutside: true
      };
    }
    return {
      targetSrc: PATTERN_STAR_MAP_INK_TARGET_IMAGE,
      nextSceneElement: this.starMapSourceCanvas,
      hideAtEnd: true,
      perlinOverlay: true,
      perlinStrength: PATTERN_STAR_MAP_TRANSITION_PERLIN_STRENGTH,
      progressSpan: PATTERN_STAR_MAP_INK_PROGRESS_SPAN,
      sceneBrightness: PATTERN_STAR_MAP_TRANSITION_BRIGHTNESS,
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
