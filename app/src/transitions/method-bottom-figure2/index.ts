import {
  ensureFigure2HoldFrame,
  renderFigure2AnimationProgress
} from '../../scenes/figure2-animation';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import { createInkSegmentTransition } from '../shared/ink';

export function figure2InkProgressForMethodBottom(progress: number): number {
  return range01(progress, 0, .8);
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

export function createMethodBottomFigure2Transition(options: { delayMs?: () => number } = {}) {
  return createInkSegmentTransition({
    id: 'method-bottom-figure2',
    delayMs: options.delayMs,
    field: {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'method-bottom-figure2'
    },
    fieldProgress: figure2InkProgressForMethodBottom,
    includeToSurface: false,
    ownershipSurfaces: ({ to, stage }) => ({
      reveal: [
        to?.querySelector<HTMLElement>('.r4-figure2__field'),
        stage?.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]')
      ] as HTMLElement[]
    }),
    sample: sampleMethodBottomFigure2,
    ease: 1.25,
    prepareEndpoints: ({ to }) => renderFigure2AnimationProgress(to, 0, { videoMode: 'none' }),
    warm: (context) => ensureFigure2HoldFrame(
      context.to.element!.querySelector<HTMLElement>('[data-r4-scene="figure2-animation"]')
        ?? context.to.element!
    ),
    transitionAttr: 'method-bottom-figure2-bottom-ink'
  });
}

export const methodBottomFigure2Transition = createMethodBottomFigure2Transition();
