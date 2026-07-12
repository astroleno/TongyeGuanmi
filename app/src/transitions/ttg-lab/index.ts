import { renderLabHold } from '../../scenes/lab';
import {
  prepareTtgAnimationFrame,
  renderTtgAnimationProgress
} from '../../scenes/ttg-animation';
import { INTRA_CHAPTER_DISSOLVE_MS, TTG_PLAYBACK_MS } from '../../story/timings';
import { createStagedMediaHandoff } from '../shared/stagedMediaHandoff';
import type { TransitionModule } from '../../story/types';
import { mediaPlaybackFor, requiredMilestonesFor } from '../../story/manifest';

export const TTG_LAB_ANIMATION_STOP = TTG_PLAYBACK_MS
  / (TTG_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);

export function createTtgLabTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  const transition = createStagedMediaHandoff({
    id: 'ttg-lab',
    ...(options.delayMs ? { delayMs: options.delayMs } : {}),
    prepareEndpoints: ({ to }) => renderLabHold(to),
    prepareSourceTerminal: (root, mediaRun) => prepareTtgAnimationFrame(root, 1, mediaRun),
    renderSource: (root, progress, mediaRun) => renderTtgAnimationProgress(root, progress, { mediaRun }),
  });
  return {
    ...transition,
    requiredMilestones: requiredMilestonesFor('ttg-lab'),
    mediaPlayback: mediaPlaybackFor('ttg-lab') ?? []
  };
}

export const ttgLabTransition = createTtgLabTransition();
