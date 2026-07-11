import { renderLabHold } from '../../scenes/lab';
import { renderTtgAnimationProgress } from '../../scenes/ttg-animation';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import { createInkSegmentTransition, type InkSample } from '../shared/ink';
import type { TransitionModule } from '../../story/types';
import { mediaPlaybackFor, requiredMilestonesFor } from '../../story/manifest';

export const TTG_LAB_ANIMATION_STOP = 0.676;

function inkProgress(progress: number): number {
  return range01(progress, TTG_LAB_ANIMATION_STOP, 1);
}

function sampleTtgLab(progress: number): InkSample {
  const reveal = inkProgress(progress);
  if (reveal <= 0.001) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  if (reveal >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

export function createTtgLabTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  const transition = createInkSegmentTransition({
    id: 'ttg-lab',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: -0.04 },
    revealMode: 'live-clip',
    prepareEndpoints: ({ to }) => renderLabHold(to),
    renderSource: (root, progress) => renderTtgAnimationProgress(root, progress, { playback: true }),
    renderSourceProgress: (progress) => range01(progress, 0, TTG_LAB_ANIMATION_STOP),
    clipProgress: inkProgress,
    inkProgress,
    sample: sampleTtgLab,
    stops: [TTG_LAB_ANIMATION_STOP],
    transitionAttr: 'ttg-lab-top-ink'
  });
  return {
    ...transition,
    requiredMilestones: requiredMilestonesFor('ttg-lab'),
    mediaPlayback: mediaPlaybackFor('ttg-lab') ?? []
  };
}

export const ttgLabTransition = createTtgLabTransition();
