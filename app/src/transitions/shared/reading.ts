import { applyLayerVisibility, hiddenVisibility, holdVisibility } from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentId,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';

export type ReadingSegmentOptions = {
  id: SegmentId;
  delayMs?: (() => number) | undefined;
  renderFrom?: (root: HTMLElement | null, progress: number) => void;
  renderTo?: (root: HTMLElement | null, progress: number) => void;
  rootSelector?: (scene: string) => string;
  transformSelector?: (scene: string) => string;
  fixedFrom?: boolean;
  fixedTo?: boolean;
  renderProgress?: 'complete' | 'current';
};

type ReadingSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function defaultRootSelector(scene: string): string {
  return `[data-r4-scene="${scene}"], [data-r3-scene="${scene}"]`;
}

function sceneRoot(element: HTMLElement | null | undefined, scene: string, selector = defaultRootSelector): HTMLElement | null {
  return element?.querySelector<HTMLElement>(selector(scene)) ?? element ?? null;
}

function sampleReading(progress: number): ReadingSample {
  if (progress >= 0.999) {
    return {
      from: hiddenVisibility(),
      to: holdVisibility(false)
    };
  }
  if (progress <= 0.001) {
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

function setReadingTransform(element: HTMLElement | null, transform: string): void {
  if (!element) {
    return;
  }
  element.style.transform = transform;
  element.style.willChange = transform ? 'transform, opacity' : '';
}

class ReadingSegmentTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[] = [];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;

  constructor(
    private readonly context: TransitionContext,
    private readonly renderFrom?: (root: HTMLElement | null, progress: number) => void,
    private readonly renderTo?: (root: HTMLElement | null, progress: number) => void,
    private readonly rootSelector?: (scene: string) => string,
    private readonly transformSelector?: (scene: string) => string,
    private readonly fixedFrom = false,
    private readonly fixedTo = false,
    private readonly renderProgress: 'complete' | 'current' = 'complete'
  ) {
    this.labels = { start: 0, middle: 0.5, end: 1 };
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
    const next = clamp(value);
    const sample = sampleReading(next);
    const fromTransformRoot = this.transformRoot(this.context.from.element, this.context.from.scene);
    const toTransformRoot = this.transformRoot(this.context.to.element, this.context.to.scene);
    this.progressValue = next;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    if (this.transformSelector) {
      setReadingTransform(this.context.from.element, '');
      setReadingTransform(this.context.to.element, '');
    }
    if (next <= 0.001) {
      setReadingTransform(fromTransformRoot, '');
      setReadingTransform(toTransformRoot, this.fixedTo ? '' : 'translate3d(0, 100%, 0)');
    } else if (next >= 0.999) {
      setReadingTransform(fromTransformRoot, this.fixedFrom ? '' : 'translate3d(0, -100%, 0)');
      setReadingTransform(toTransformRoot, '');
    } else {
      setReadingTransform(fromTransformRoot, this.fixedFrom ? '' : `translate3d(0, ${(-next * 100).toFixed(3)}%, 0)`);
      setReadingTransform(toTransformRoot, this.fixedTo ? '' : `translate3d(0, ${((1 - next) * 100).toFixed(3)}%, 0)`);
    }
    const renderProgress = this.renderProgress === 'current' ? next : 1;
    this.renderFrom?.(sceneRoot(this.context.from.element, this.context.from.scene, this.rootSelector), renderProgress);
    this.renderTo?.(sceneRoot(this.context.to.element, this.context.to.scene, this.rootSelector), renderProgress);
  }

  jumpToEnd(direction: Direction): void {
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): ReadingSample {
    return sampleReading(clamp(progress));
  }

  rootIdentity() {
    return {
      from: this.context.from.element,
      to: this.context.to.element
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    setReadingTransform(this.context.from.element, '');
    setReadingTransform(this.context.to.element, '');
    setReadingTransform(this.transformRoot(this.context.from.element, this.context.from.scene), '');
    setReadingTransform(this.transformRoot(this.context.to.element, this.context.to.scene), '');
  }

  private transformRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
    if (!this.transformSelector) {
      return element ?? null;
    }
    return sceneRoot(element, scene, this.transformSelector);
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

export function createReadingSegmentTransition(options: ReadingSegmentOptions): TransitionModule {
  return {
    id: options.id,
    requiredMilestones: ['targetReady', 'buildReady'],
    reducedMotionFallback: (context) => {
      const endpoint = context.direction === 1 ? 1 : 0;
      const renderProgress = options.renderProgress === 'current' ? endpoint : 1;
      applyLayerVisibility(context.from, context.direction === 1 ? hiddenVisibility() : holdVisibility(true));
      applyLayerVisibility(context.to, context.direction === 1 ? holdVisibility(true) : hiddenVisibility());
      setReadingTransform(context.from.element, '');
      setReadingTransform(context.to.element, '');
      if (options.transformSelector) {
        setReadingTransform(sceneRoot(context.from.element, context.from.scene, options.transformSelector), '');
        setReadingTransform(sceneRoot(context.to.element, context.to.scene, options.transformSelector), '');
      }
      options.renderFrom?.(sceneRoot(context.from.element, context.from.scene, options.rootSelector), renderProgress);
      options.renderTo?.(sceneRoot(context.to.element, context.to.scene, options.rootSelector), renderProgress);
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new ReadingSegmentTimeline(
        context,
        options.renderFrom,
        options.renderTo,
        options.rootSelector,
        options.transformSelector,
        options.fixedFrom,
        options.fixedTo,
        options.renderProgress
      );
    }
  };
}
