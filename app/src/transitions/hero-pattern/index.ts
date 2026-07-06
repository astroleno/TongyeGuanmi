import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, hiddenVisibility, holdVisibility, smoothStep, applyLayerVisibility } from '../../pilot/visibility';
import { renderHeroProgress } from '../../scenes/hero';
import { renderPatternProgress } from '../../scenes/pattern';
import type { LayerVisibilityState, TransitionContext, TransitionModule } from '../../story/types';

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleHeroPattern(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState } {
  const p = smoothStep(progress);
  return {
    from: fadeVisibility(1 - p),
    to: fadeVisibility(p)
  };
}

function completeReducedMotion(context: TransitionContext): void {
  applyLayerVisibility(context.from, hiddenVisibility());
  applyLayerVisibility(context.to, holdVisibility(true));
  renderHeroProgress(sceneRoot(context.from.element, 'hero'), 0);
  renderPatternProgress(sceneRoot(context.to.element, 'pattern'), 1);
}

export function createHeroPatternTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'hero-pattern',
    requiredMilestones: ['targetReady', 'buildReady'],
    reducedMotionFallback: completeReducedMotion,
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return new PilotProgressTimeline({
        from: context.from,
        to: context.to,
        durationMs: context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
        sample: sampleHeroPattern,
        render: (progress) => {
          const eased = smoothStep(progress);
          context.to.element?.setAttribute('data-r4-transition', 'hero-pattern');
          renderHeroProgress(sceneRoot(context.from.element, 'hero'), 1 - eased * 0.82);
          renderPatternProgress(sceneRoot(context.to.element, 'pattern'), eased);
        }
      });
    }
  };
}

export const heroPatternTransition = createHeroPatternTransition();
