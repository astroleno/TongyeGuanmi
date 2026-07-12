import { renderFigure2AnimationProgress } from '../../scenes/figure2-animation';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

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
    field: {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'method-bottom-figure2'
    },
    fieldProgress: figure2InkProgressForMethodBottom,
    ownershipSurfaces: ({ stage }) => ({
      reveal: [
        stage?.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]')
      ].filter((element): element is HTMLElement => Boolean(element))
    }),
    elevateTarget: true,
    sample: sampleMethodBottomFigure2,
    prepareEndpoints: ({ to }) => renderFigure2AnimationProgress(to, 0, { videoMode: 'none' }),
    transitionAttr: 'method-bottom-figure2-bottom-ink'
  });

  return inkTransition;
}

export const methodBottomFigure2Transition = createMethodBottomFigure2Transition();
