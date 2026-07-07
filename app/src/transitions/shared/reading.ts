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
  switchAt?: number;
  delayMs?: (() => number) | undefined;
  renderFrom?: (root: HTMLElement | null, progress: number) => void;
  renderTo?: (root: HTMLElement | null, progress: number) => void;
  rootSelector?: (scene: string) => string;
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

function sampleReading(progress: number, switchAt: number): ReadingSample {
  if (progress >= switchAt) {
    return {
      from: hiddenVisibility(),
      to: holdVisibility(false)
    };
  }
  return {
    from: holdVisibility(false),
    to: hiddenVisibility()
  };
}

class ReadingSegmentTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[] = [];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;

  constructor(
    private readonly context: TransitionContext,
    private readonly switchAt: number,
    private readonly renderFrom?: (root: HTMLElement | null, progress: number) => void,
    private readonly renderTo?: (root: HTMLElement | null, progress: number) => void,
    private readonly rootSelector?: (scene: string) => string
  ) {
    this.labels = { start: 0, handoff: switchAt, end: 1 };
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
    const next = clamp(value);
    const sample = sampleReading(next, this.switchAt);
    this.progressValue = next;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    this.renderFrom?.(sceneRoot(this.context.from.element, this.context.from.scene, this.rootSelector), 1);
    this.renderTo?.(sceneRoot(this.context.to.element, this.context.to.scene, this.rootSelector), next >= this.switchAt ? 1 : 0);
  }

  jumpToEnd(direction: Direction): void {
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): ReadingSample {
    return sampleReading(clamp(progress), this.switchAt);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
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
  const switchAt = clamp(options.switchAt ?? 0.995);
  return {
    id: options.id,
    requiredMilestones: ['targetReady', 'buildReady'],
    reducedMotionFallback: (context) => {
      applyLayerVisibility(context.from, hiddenVisibility());
      applyLayerVisibility(context.to, holdVisibility(true));
      options.renderFrom?.(sceneRoot(context.from.element, context.from.scene, options.rootSelector), 1);
      options.renderTo?.(sceneRoot(context.to.element, context.to.scene, options.rootSelector), 1);
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new ReadingSegmentTimeline(
        context,
        switchAt,
        options.renderFrom,
        options.renderTo,
        options.rootSelector
      );
    }
  };
}
