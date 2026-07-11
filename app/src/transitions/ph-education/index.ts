import { renderEducationHold } from '../../scenes/education';
import { PH_PLAYBACK_MS, renderPhAnimationProgress } from '../../scenes/ph-animation';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import { createInkSegmentTransition, type InkSample } from '../shared/ink';
import type { TransitionModule } from '../../story/types';
import { mediaPlaybackFor, requiredMilestonesFor } from '../../story/manifest';

export const PH_EDUCATION_INK_MS = 1200;
export const PH_EDUCATION_ANIMATION_STOP = PH_PLAYBACK_MS / (PH_PLAYBACK_MS + PH_EDUCATION_INK_MS);

function inkProgress(progress: number): number {
  return range01(progress, PH_EDUCATION_ANIMATION_STOP, 1);
}

function samplePhEducation(progress: number): InkSample {
  const reveal = inkProgress(progress);
  if (reveal <= 0.001) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  if (reveal >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

export function createPhEducationTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  const transition = createInkSegmentTransition({
    id: 'ph-education',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: -0.04 },
    revealMode: 'live-clip',
    prepareEndpoints: ({ to }) => renderEducationHold(to),
    renderSource: (root, progress) => renderPhAnimationProgress(root, progress, { playback: true }),
    renderSourceProgress: (progress) => range01(progress, 0, PH_EDUCATION_ANIMATION_STOP),
    clipProgress: inkProgress,
    inkProgress,
    sample: samplePhEducation,
    stops: [PH_EDUCATION_ANIMATION_STOP],
    transitionAttr: 'ph-education-top-ink'
  });
  return {
    ...transition,
    requiredMilestones: requiredMilestonesFor('ph-education'),
    mediaPlayback: mediaPlaybackFor('ph-education') ?? []
  };
}

export const phEducationTransition = createPhEducationTransition();
