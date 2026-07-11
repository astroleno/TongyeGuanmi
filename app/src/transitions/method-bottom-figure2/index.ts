import { renderFigure2Hold } from '../../scenes/figure2-animation';
import { positionMethodReadingAtEdge } from '../../scenes/method-top';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import { createInkSegmentTransition } from '../shared/ink';
import type { SegmentTimelineHandle, TransitionModule } from '../../story/types';

const FIGURE2_INK_END = 0.80;

export function figure2InkProgressForMethodBottom(progress: number): number {
  return range01(progress, 0, FIGURE2_INK_END);
}

function sampleMethodBottomFigure2(progress: number) {
  if (progress >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  if (progress <= 0.001) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

export function createMethodBottomFigure2Transition(options: { delayMs?: () => number } = {}): TransitionModule {
  const inkTransition = createInkSegmentTransition({
    id: 'method-bottom-figure2',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    elevateTarget: true,
    clipTarget: true,
    revealMode: 'live-clip',
    sample: sampleMethodBottomFigure2,
    prepareEndpoints: ({ to }) => renderFigure2Hold(to),
    clipProgress: figure2InkProgressForMethodBottom,
    inkProgress: figure2InkProgressForMethodBottom,
    transitionAttr: 'method-bottom-figure2-bottom-ink'
  });

  return {
    ...inkTransition,
    reducedMotionFallback: (context) => {
      if (context.direction === -1) {
        positionMethodReadingAtEdge(context.from.element, 'bottom');
      }
      return inkTransition.reducedMotionFallback?.(context);
    },
    buildTimeline: async (context) => {
      const timeline = await inkTransition.buildTimeline(context);
      const wrapped: SegmentTimelineHandle = {
        play: (direction) => timeline.play(direction),
        progress: (progress) => timeline.progress(progress),
        reverse: () => {
          positionMethodReadingAtEdge(context.from.element, 'bottom');
          return timeline.reverse();
        },
        jumpToEnd: (direction) => {
          if (direction === -1) {
            positionMethodReadingAtEdge(context.from.element, 'bottom');
          }
          timeline.jumpToEnd(direction);
        },
        dispose: () => timeline.dispose(),
        ...(timeline.labels ? { labels: timeline.labels } : {}),
        ...(timeline.pauses ? { pauses: timeline.pauses } : {}),
        ...(timeline.sample ? { sample: (progress) => timeline.sample?.(progress) ?? sampleMethodBottomFigure2(progress) } : {}),
        ...(timeline.rootIdentity ? { rootIdentity: () => timeline.rootIdentity?.() ?? { from: null, to: null } } : {}),
        ...(timeline.effectCanvases ? { effectCanvases: () => timeline.effectCanvases?.() ?? [] } : {})
      };
      return wrapped;
    }
  };
}

export const methodBottomFigure2Transition = createMethodBottomFigure2Transition();
