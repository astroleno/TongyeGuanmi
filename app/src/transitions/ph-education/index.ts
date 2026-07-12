import { renderEducationHold } from '../../scenes/education';
import { preparePhAnimationFrame, renderPhAnimationProgress } from '../../scenes/ph-animation';
import { INTRA_CHAPTER_DISSOLVE_MS, PH_PLAYBACK_MS } from '../../story/timings';
import { createStagedMediaHandoff } from '../shared/stagedMediaHandoff';
import type { TransitionModule } from '../../story/types';
import { mediaPlaybackFor, requiredMilestonesFor } from '../../story/manifest';

export const PH_EDUCATION_ANIMATION_STOP = PH_PLAYBACK_MS
  / (PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);

export function createPhEducationTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  const transition = createStagedMediaHandoff({
    id: 'ph-education',
    ...(options.delayMs ? { delayMs: options.delayMs } : {}),
    prepareEndpoints: ({ to }) => renderEducationHold(to),
    prepareSourceTerminal: (root, mediaRun) => preparePhAnimationFrame(root, 1, mediaRun),
    renderSource: (root, progress, mediaRun) => renderPhAnimationProgress(root, progress, { mediaRun }),
  });
  return {
    ...transition,
    requiredMilestones: requiredMilestonesFor('ph-education'),
    mediaPlayback: mediaPlaybackFor('ph-education') ?? []
  };
}

export const phEducationTransition = createPhEducationTransition();
