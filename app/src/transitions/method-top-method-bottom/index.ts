import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, holdVisibility, range01, smoothStep } from '../../pilot/visibility';
import { renderMethodBottomEntrance } from '../../scenes/method-bottom';
import { renderMethodTopEntrance } from '../../scenes/method-top';
import type { LayerVisibilityState, TransitionContext, TransitionModule } from '../../story/types';

function contentOpacity(progress: number): readonly [number, number] {
  return [
    1 - smoothStep(range01(progress, 0.08, 0.68)),
    smoothStep(range01(progress, 0.22, 0.92))
  ];
}

function sampleMethodTopMethodBottom(context: TransitionContext, progress: number): {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
} {
  const [top, bottom] = contentOpacity(progress);
  // Keep the receiver's paper root fully opaque throughout the handoff. The
  // current layer stays above it (see Stage z-indexes), so source content can
  // still fade naturally while the dark stage never becomes exposed.
  return context.direction > 0
    ? { from: fadeVisibility(top), to: holdVisibility(false) }
    : { from: holdVisibility(false), to: fadeVisibility(bottom) };
}

function renderMethodSplitProgress(context: TransitionContext, progress: number): void {
  const [top, bottom] = contentOpacity(progress);
  const renderScene = (scene: typeof context.from.scene, element: HTMLElement | null) => (
    scene === 'method-top'
      ? renderMethodTopEntrance(element, top)
      : renderMethodBottomEntrance(element, bottom)
  );
  renderScene(context.from.scene, context.from.element);
  renderScene(context.to.scene, context.to.element);
}

export function createMethodTopMethodBottomTransition(options: {
  delayMs?: () => number;
} = {}): TransitionModule {
  return {
    id: 'method-top-method-bottom',
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      return new PilotProgressTimeline({
        from: context.from,
        to: context.to,
        durationMs: context.prefersReducedMotion ? 0 : 600,
        direction: context.direction,
        sample: (progress) => sampleMethodTopMethodBottom(context, progress),
        render: (progress) => renderMethodSplitProgress(context, progress)
      });
    }
  };
}
