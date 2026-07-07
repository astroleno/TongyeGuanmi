import { applyLayerVisibility, fadeVisibility, hiddenVisibility, holdVisibility, smoothStep } from '../../pilot/visibility';
import { renderFigure2AnimationProgress } from '../../scenes/figure2-animation';
import { renderProofOpeningProgress } from '../../scenes/figure2-proof-opening';
import type {
  Direction,
  LayerHandle,
  LayerVisibilityState,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';

type TimelineSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
};

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleFigure2Distance(progress: number): TimelineSample {
  const p = smoothStep(progress);
  return {
    from: fadeVisibility(1 - p),
    to: fadeVisibility(p)
  };
}

class StagedProgressTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;

  constructor(
    private readonly from: LayerHandle,
    private readonly to: LayerHandle,
    private readonly durationMs: number,
    stops: readonly number[],
    private readonly renderAt?: (progress: number) => void
  ) {
    this.labels = Object.fromEntries([
      ['start', 0],
      ...stops.map((stop, index) => [`stage:${index}`, stop] as const),
      ['end', 1]
    ]);
    this.pauses = stops.map((_, index) => `stage:${index}`);
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
    const clamped = Math.min(1, Math.max(0, value));
    const sample = sampleFigure2Distance(clamped);
    this.progressValue = clamped;
    applyLayerVisibility(this.from, sample.from);
    applyLayerVisibility(this.to, sample.to);
    this.renderAt?.(clamped);
  }

  jumpToEnd(direction: Direction): void {
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): TimelineSample {
    return sampleFigure2Distance(progress);
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
    if (delta === 0 || this.durationMs <= 0) {
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
        const progress = Math.min(1, elapsed / this.durationMs);
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

function completeReducedMotion(context: TransitionContext): void {
  applyLayerVisibility(context.from, hiddenVisibility());
  applyLayerVisibility(context.to, holdVisibility(true));
  renderFigure2AnimationProgress(sceneRoot(context.from.element, 'figure2-animation'), 0);
  renderProofOpeningProgress(sceneRoot(context.to.element, 'figure2-proof-opening'), 1);
}

export function createFigure2DistanceExpandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'figure2-distance-expand',
    requiredMilestones: ['targetReady', 'buildReady', 'timelineReady'],
    reducedMotionFallback: completeReducedMotion,
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const stops = context.segment.policy.kind === 'stagedSnap' ? context.segment.policy.stops : [];
      return new StagedProgressTimeline(
        context.from,
        context.to,
        context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
        stops,
        (progress) => {
          const eased = smoothStep(progress);
          context.to.element?.setAttribute('data-r4-transition', 'figure2-distance-expand');
          renderFigure2AnimationProgress(sceneRoot(context.from.element, 'figure2-animation'), 1 - eased * 0.28);
          renderProofOpeningProgress(sceneRoot(context.to.element, 'figure2-proof-opening'), eased);
          if (eased >= 0.5) {
            context.reportMilestone({
              key: 'timelineReady',
              segment: context.segment.id,
              runId: context.runId,
              direction: context.direction,
              progress: eased
            });
          }
        }
      );
    }
  };
}

export const figure2DistanceExpandTransition = createFigure2DistanceExpandTransition();
