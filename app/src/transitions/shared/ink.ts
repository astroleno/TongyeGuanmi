import { applyLayerVisibility, hiddenVisibility, holdVisibility, smoothStep } from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentId,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';
import { createTransitionLayerElevation, type TransitionLayerElevation } from './layerElevation';
import { createCurtainInkRenderer, type CurtainInkRenderer } from './sceneInk';

export type InkOrigin = {
  x: number;
  y: number;
};

export type InkSegmentOptions = {
  id: SegmentId;
  origin: InkOrigin;
  delayMs?: (() => number) | undefined;
  canvasHost?: 'from' | 'to';
  elevateTarget?: boolean;
  clipTarget?: boolean;
  sample?: (progress: number) => InkSample;
  renderFrom?: (root: HTMLElement | null, progress: number) => void;
  renderFromProgress?: 'remaining' | 'forward' | ((progress: number) => number);
  renderTo?: (root: HTMLElement | null, progress: number) => void;
  renderToProgress?: 'remaining' | 'forward' | ((progress: number) => number);
  clipProgress?: (progress: number) => number;
  inkProgress?: (progress: number) => number;
  rootSelector?: (scene: string) => string;
  transitionAttr?: string;
  stops?: readonly number[];
  reportTimelineReadyAt?: number;
};

export type InkSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
};

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
  const p = smoothStep(progress);
  if (p >= 0.999) {
    return {
      from: hiddenVisibility(),
      to: holdVisibility(false)
    };
  }
  if (p <= 0.001) {
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
  mode: 'remaining' | 'forward' | ((progress: number) => number) | undefined,
  progress: number,
  fallback: 'remaining' | 'forward'
): number {
  if (typeof mode === 'function') {
    return clamp(mode(progress));
  }
  const resolved = mode ?? fallback;
  return resolved === 'forward' ? progress : 1 - progress;
}

function ensureCanvas(container: HTMLElement | null, id: SegmentId, origin: InkOrigin): HTMLCanvasElement | null {
  if (!container) {
    return null;
  }
  const existing = container.querySelector<HTMLCanvasElement>(`:scope > canvas[data-r4-ink-segment="${id}"]`);
  if (existing) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'r4-ink-transition-canvas';
  canvas.dataset.r4InkSegment = id;
  canvas.dataset.inkOriginX = origin.x.toFixed(3);
  canvas.dataset.inkOriginY = origin.y.toFixed(3);
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  return canvas;
}

function targetClipPath(origin: InkOrigin, progress: number): string {
  const p = clamp(progress);
  if (p >= 0.999) {
    return '';
  }
  if (origin.y >= 0.98) {
    return `inset(${((1 - p) * 100).toFixed(3)}% 0 0 0)`;
  }
  if (origin.y <= 0.02) {
    return `inset(0 0 ${((1 - p) * 100).toFixed(3)}% 0)`;
  }
  return `circle(${(p * 142).toFixed(3)}% at ${(origin.x * 100).toFixed(3)}% ${(origin.y * 100).toFixed(3)}%)`;
}

class InkSegmentTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly inkRenderer: CurtainInkRenderer | null;
  private readonly elevation: TransitionLayerElevation | null;
  private readonly attrsElement: HTMLElement | null;

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
    this.attrsElement = options.canvasHost === 'from' ? context.from.element : context.to.element;
    this.canvas = ensureCanvas(this.attrsElement, options.id, options.origin);
    this.inkRenderer = createCurtainInkRenderer(this.canvas, {
      direction: options.origin.y >= 0.5 ? 'bottom-up' : 'top-down',
      colorLift: 0.56,
      coverAlpha: 0.82,
      fadeOutStart: 0.74,
      fadeOutEnd: 0.98,
      progressSpan: 1
    });
    this.elevation = options.elevateTarget === false ? null : createTransitionLayerElevation(context.to.element);
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
    const sample = this.options.sample?.(clamped) ?? sampleInk(clamped);
    const clipProgress = clamp(this.options.clipProgress?.(clamped) ?? clamped);
    const inkProgress = clamp(this.options.inkProgress?.(clamped) ?? clipProgress);
    this.progressValue = clamped;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    this.elevation?.elevate();
    if (this.options.clipTarget !== false && this.context.to.element) {
      const clipPath = targetClipPath(this.options.origin, clipProgress);
      const revealActive = Boolean(clipPath) && clipProgress > 0.002 && clipProgress < 0.998;
      if (clipPath) {
        this.context.to.element.style.clipPath = clipPath;
        this.context.to.element.style.setProperty('-webkit-clip-path', clipPath);
      } else {
        this.context.to.element.style.removeProperty('clip-path');
        this.context.to.element.style.removeProperty('-webkit-clip-path');
      }
      if (revealActive) {
        this.context.to.element.dataset.r4RevealProgress = clipProgress.toFixed(4);
      } else {
        this.context.to.element.removeAttribute('data-r4-reveal-progress');
      }
    }
    this.attrsElement?.setAttribute('data-r4-transition', this.options.transitionAttr ?? this.options.id);
    this.attrsElement?.setAttribute('data-r4-ink-active', String(inkProgress > 0.002 && inkProgress < 0.998));
    this.attrsElement?.setAttribute('data-r4-clip-progress', clipProgress.toFixed(4));
    this.attrsElement?.setAttribute('data-r4-ink-progress', inkProgress.toFixed(4));
    this.inkRenderer?.render(inkProgress);
    const fromProgress = mappedProgress(this.options.renderFromProgress, clamped, 'remaining');
    const toProgress = mappedProgress(this.options.renderToProgress, clamped, 'forward');
    this.options.renderFrom?.(sceneRoot(this.context.from.element, this.context.from.scene, this.options.rootSelector), fromProgress);
    this.options.renderTo?.(sceneRoot(this.context.to.element, this.context.to.scene, this.options.rootSelector), toProgress);
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
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): InkSample {
    const clamped = clamp(progress);
    return this.options.sample?.(clamped) ?? sampleInk(clamped);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.inkRenderer?.destroy();
    this.elevation?.restore();
    this.context.to.element?.style.removeProperty('clip-path');
    this.context.to.element?.style.removeProperty('-webkit-clip-path');
    this.context.to.element?.removeAttribute('data-r4-reveal-progress');
    this.attrsElement?.style.removeProperty('clip-path');
    this.attrsElement?.style.removeProperty('-webkit-clip-path');
    this.attrsElement?.removeAttribute('data-r4-transition');
    this.attrsElement?.removeAttribute('data-r4-ink-active');
    this.attrsElement?.removeAttribute('data-r4-clip-progress');
    this.attrsElement?.removeAttribute('data-r4-ink-progress');
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
      applyLayerVisibility(context.from, hiddenVisibility());
      applyLayerVisibility(context.to, holdVisibility(true));
      options.renderFrom?.(
        sceneRoot(context.from.element, context.from.scene, options.rootSelector),
        mappedProgress(options.renderFromProgress, 1, 'remaining')
      );
      options.renderTo?.(sceneRoot(context.to.element, context.to.scene, options.rootSelector), mappedProgress(options.renderToProgress, 1, 'forward'));
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new InkSegmentTimeline(context, options);
    }
  };
}
