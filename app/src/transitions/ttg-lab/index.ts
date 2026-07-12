import { renderLabHold } from '../../scenes/lab';
import {
  commitTtgForwardStart,
  parkTtgMedia,
  prepareTtgPlaybackLeg,
  prepareTtgSourceTerminal,
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
    prepareLeg: (root, leg, mediaRun) => {
      if (leg.legIndex === 0) {
        return prepareTtgPlaybackLeg(root, mediaRun);
      }
      if (leg.direction === -1) {
        return prepareTtgSourceTerminal(root, mediaRun);
      }
    },
    commitLegEndpoint: (root, leg, mediaRun) => {
      if (leg.direction === -1 && leg.legIndex === 0) {
        commitTtgForwardStart(root, mediaRun);
      }
    },
    disposeSource: (root, progress) => {
      if (progress > 0.001) {
        parkTtgMedia(root);
      }
    },
    renderSource: (root, progress, mediaRun) => renderTtgAnimationProgress(root, progress, { mediaRun }),
  });
  return {
    ...transition,
    requiredMilestones: requiredMilestonesFor('ttg-lab'),
    mediaPlayback: mediaPlaybackFor('ttg-lab') ?? []
  };
}

export const ttgLabTransition = createTtgLabTransition();
