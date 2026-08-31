import { renderEducationHold } from '../../scenes/education';
import {
  parkPhMedia,
  phSegmentProgressReceipt,
  preparePhAnimationFrame,
  renderPhAnimationProgress,
  requestPhAnimationFrame
} from '../../scenes/ph-animation';
import { INTRA_CHAPTER_DISSOLVE_MS, PH_PLAYBACK_MS } from '../../story/timings';
import { positionReadingAtEdge } from '../../stage/reading';
import { createStagedMediaHandoff } from '../shared/stagedMediaHandoff';
import type { TransitionModule } from '../../story/types';
import { mediaPlaybackFor, requiredMilestonesFor } from '../../story/manifest';

export const PH_EDUCATION_ANIMATION_STOP = PH_PLAYBACK_MS
  / (PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);

export function createPhEducationTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  const transition = createStagedMediaHandoff({
    id: 'ph-education',
    ...(options.delayMs ? { delayMs: options.delayMs } : {}),
    target: {
      prepareFinalHold: (root) => {
        renderEducationHold(root);
        positionReadingAtEdge(root, 'top');
      }
    },
    source: {
      prepareLeg: (root, leg, mediaRun) => {
        if (leg.legIndex === 0) {
          return preparePhAnimationFrame(
            root,
            leg.direction === 1 ? 0 : 1,
            { ...mediaRun, signal: leg.signal }
          );
        }
        if (leg.direction === -1) {
          return preparePhAnimationFrame(root, 1, { ...mediaRun, signal: leg.signal });
        }
      },
      dispose: (root) => parkPhMedia(root),
      presentProgress: (root, progress, request, mediaRun) => requestPhAnimationFrame(root, progress, {
        runId: request.runId,
        direction: request.direction,
        sequence: request.sequence,
        reducedMotion: mediaRun.prefersReducedMotion,
        signal: request.signal
      }).then((frame) => phSegmentProgressReceipt(request, frame)),
      renderExit: (root, progress) => renderPhAnimationProgress(root, progress)
    }
  });
  return {
    ...transition,
    requiredMilestones: requiredMilestonesFor('ph-education'),
    mediaPlayback: mediaPlaybackFor('ph-education') ?? []
  };
}

export const phEducationTransition = createPhEducationTransition();
