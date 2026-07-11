import { applyLayerVisibility, hiddenVisibility, holdVisibility } from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentId,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';

export type SectionHandoffOptions = {
  id: SegmentId;
  delayMs?: (() => number) | undefined;
  renderFrom?: (root: HTMLElement | null, progress: number) => void;
  renderTo?: (root: HTMLElement | null, progress: number) => void;
  rootSelector?: (scene: string) => string;
};

type SectionSample = {
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

function sampleSection(progress: number): SectionSample {
  const clamped = clamp(progress);
  if (clamped <= 0.001) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  if (clamped >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

function setTransform(element: HTMLElement | null, transform: string): void {
  if (!element) {
    return;
  }
  element.style.transform = transform;
  element.style.willChange = transform ? 'transform' : '';
}

function easeInOutCubic(value: number): number {
  const p = clamp(value);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

class SectionHandoffTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>> = { start: 0, end: 1 };
  readonly pauses: readonly string[] = [];

  private disposed = false;
  private progressValue = 0;
  private animationFrame = 0;

  constructor(
    private readonly context: TransitionContext,
    private readonly options: SectionHandoffOptions
  ) {
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
    const sample = sampleSection(next);
    this.progressValue = next;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    const fromRoot = sceneRoot(this.context.from.element, this.context.from.scene, this.options.rootSelector);
    const toRoot = sceneRoot(this.context.to.element, this.context.to.scene, this.options.rootSelector);
    if (next <= 0.001) {
      setTransform(fromRoot, '');
      setTransform(toRoot, 'translate3d(0, 100%, 0)');
    } else if (next >= 0.999) {
      setTransform(fromRoot, 'translate3d(0, -100%, 0)');
      setTransform(toRoot, '');
    } else {
      setTransform(fromRoot, `translate3d(0, ${(-next * 100).toFixed(3)}%, 0)`);
      setTransform(toRoot, `translate3d(0, ${((1 - next) * 100).toFixed(3)}%, 0)`);
    }
    this.options.renderFrom?.(sceneRoot(this.context.from.element, this.context.from.scene, this.options.rootSelector), 1);
    this.options.renderTo?.(sceneRoot(this.context.to.element, this.context.to.scene, this.options.rootSelector), 1);
  }

  jumpToEnd(direction: Direction): void {
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): SectionSample {
    return sampleSection(progress);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    setTransform(sceneRoot(this.context.from.element, this.context.from.scene, this.options.rootSelector), '');
    setTransform(sceneRoot(this.context.to.element, this.context.to.scene, this.options.rootSelector), '');
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
        const elapsed = Math.min(1, (now - startedAt) / durationMs);
        this.progress(start + delta * easeInOutCubic(elapsed));
        if (elapsed >= 1) {
          resolve();
          return;
        }
        this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }
}

export function createSectionHandoffTransition(options: SectionHandoffOptions): TransitionModule {
  return {
    id: options.id,
    requiredMilestones: ['targetReady', 'buildReady'],
    reducedMotionFallback: (context) => {
      applyLayerVisibility(context.from, hiddenVisibility());
      applyLayerVisibility(context.to, holdVisibility(true));
      setTransform(sceneRoot(context.from.element, context.from.scene, options.rootSelector), '');
      setTransform(sceneRoot(context.to.element, context.to.scene, options.rootSelector), '');
      options.renderFrom?.(sceneRoot(context.from.element, context.from.scene, options.rootSelector), 1);
      options.renderTo?.(sceneRoot(context.to.element, context.to.scene, options.rootSelector), 1);
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new SectionHandoffTimeline(context, options);
    }
  };
}
