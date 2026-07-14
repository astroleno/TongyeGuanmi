import { renderLabHold } from '../../scenes/lab';
import { preparePhAnimationFrame, renderPhHold } from '../../scenes/ph-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createLabPhTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  const transition = createInkSegmentTransition({
    id: 'lab-ph',
    delayMs: options.delayMs,
    field: {
      kind: 'horizontal',
      direction: 'top-to-bottom',
      seed: 'lab-ph'
    },
    prepareEndpoints: ({ from, to }) => {
      renderLabHold(from);
      renderPhHold(to);
    },
    transitionAttr: 'lab-ph-top-ink'
  });
  return {
    ...transition,
    requiredMilestones: ['targetReady', 'mediaReady', 'buildReady'],
    buildTimeline: async (context) => {
      const root = context.to.element?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]')
        ?? context.to.element
        ?? null;
      const video = root?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
      if (video) {
        await preparePhAnimationFrame(root, 0, {
          runId: `${context.runId}:entry`,
          direction: 1,
          reducedMotion: context.prefersReducedMotion
        });
      }
      return transition.buildTimeline(context);
    }
  };
}

export const labPhTransition = createLabPhTransition();
