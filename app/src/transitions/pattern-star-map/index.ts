import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { applyLayerVisibility, fadeVisibility, hiddenVisibility, holdVisibility, smoothStep } from '../../pilot/visibility';
import { renderPatternProgress } from '../../scenes/pattern';
import { renderStarMapProgress } from '../../scenes/star-map';
import type { LayerVisibilityState, TransitionContext, TransitionModule } from '../../story/types';

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"], [data-r3-scene="${scene}"]`) ?? element ?? null;
}

function samplePatternStarMap(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState } {
  const p = smoothStep(progress);
  return {
    from: fadeVisibility(1 - p),
    to: fadeVisibility(p)
  };
}

function completeReducedMotion(context: TransitionContext): void {
  applyLayerVisibility(context.from, hiddenVisibility());
  applyLayerVisibility(context.to, holdVisibility(true));
  renderPatternProgress(sceneRoot(context.from.element, 'pattern'), 0);
  renderStarMapProgress(sceneRoot(context.to.element, 'star-map'), 1);
}

export function createPatternStarMapTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'pattern-star-map',
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
        sample: samplePatternStarMap,
        render: (progress) => {
          const eased = smoothStep(progress);
          context.to.element?.setAttribute('data-r4-transition', 'pattern-star-map');
          renderPatternProgress(sceneRoot(context.from.element, 'pattern'), 1 - eased * 0.32);
          renderStarMapProgress(sceneRoot(context.to.element, 'star-map'), eased);
        }
      });
    }
  };
}

export const patternStarMapTransition = createPatternStarMapTransition();
