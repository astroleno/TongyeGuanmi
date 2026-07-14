import { renderLabHold } from '../../scenes/lab';
import {
  commitTtgForwardStart,
  commitTtgPlaybackLeg,
  commitTtgTerminalFrame,
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
        return prepareTtgPlaybackLeg(root, { ...mediaRun, signal: leg.signal });
      }
      if (leg.direction === -1) {
        return prepareTtgSourceTerminal(root, { ...mediaRun, signal: leg.signal });
      }
    },
    commitLegStart: (root, leg, mediaRun) => {
      if (leg.legIndex === 0 || leg.direction === -1) {
        commitTtgPlaybackLeg(root, mediaRun);
      }
    },
    commitLegEndpoint: (root, leg, mediaRun) => {
      if (leg.legIndex !== 0) {
        return;
      }
      if (leg.direction === -1) {
        commitTtgForwardStart(root, mediaRun);
      } else {
        commitTtgTerminalFrame(root, mediaRun);
      }
    },
    disposeSource: (root, progress, mediaRun) => {
      if (mediaRun.direction === -1 && progress <= 0.001) {
        return;
      }
      parkTtgMedia(root);
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
