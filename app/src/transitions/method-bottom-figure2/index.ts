import { renderFigure2AnimationProgress } from '../../scenes/figure2-animation';
import { renderMethodBottomProgress } from '../../scenes/method-bottom';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

const FIGURE2_INK_END = 0.34;

export function figure2StageProgressForMethodBottom(progress: number): number {
  return range01(progress, FIGURE2_INK_END, 1);
}

export function figure2InkProgressForMethodBottom(progress: number): number {
  return range01(progress, 0, FIGURE2_INK_END);
}

function sampleMethodBottomFigure2(progress: number) {
  if (progress >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  if (progress <= FIGURE2_INK_END) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  return { from: hiddenVisibility(), to: holdVisibility(false) };
}

function renderFigure2StageProgress(root: HTMLElement | null, progress: number): void {
  renderFigure2AnimationProgress(root, progress, { videoMode: 'native' });
}

export function createMethodBottomFigure2Transition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'method-bottom-figure2',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    canvasHost: 'from',
    elevateTarget: false,
    clipTarget: false,
    sample: sampleMethodBottomFigure2,
    renderFrom: renderMethodBottomProgress,
    renderTo: renderFigure2StageProgress,
    renderToProgress: figure2StageProgressForMethodBottom,
    clipProgress: figure2InkProgressForMethodBottom,
    inkProgress: figure2InkProgressForMethodBottom,
    transitionAttr: 'method-bottom-figure2-bottom-ink'
  });
}

export const methodBottomFigure2Transition = createMethodBottomFigure2Transition();
