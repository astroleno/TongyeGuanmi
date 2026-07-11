import type { TransitionModule } from '../../story/types';
import { renderPatternProgress } from '../../scenes/pattern';
import {
  createPatternBloomTransition,
  HERO_PATTERN_INK_TARGET_IMAGE,
  patternBloomProgressForHeroPattern,
  patternRevealProgressForHeroPattern,
  patternRotationProgressForHeroPattern,
  patternSceneOpacityForHeroPattern,
  renderHeroForHeroPattern
} from '../pattern-bloom/timeline';

export {
  HERO_PATTERN_INK_TARGET_IMAGE,
  patternBloomProgressForHeroPattern,
  patternRevealProgressForHeroPattern,
  patternSceneOpacityForHeroPattern,
  renderHeroForHeroPattern
};

export function renderPatternForHeroPattern(root: HTMLElement | null, progress: number): void {
  const bloomProgress = patternBloomProgressForHeroPattern(progress);
  renderPatternProgress(root, bloomProgress, {
    visible: true,
    copyProgress: bloomProgress,
    rotationProgress: patternRotationProgressForHeroPattern(progress)
  });
}

export function createHeroPatternTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createPatternBloomTransition({
    id: 'hero-pattern',
    delayMs: options.delayMs,
    variant: 'hero-pattern'
  });
}

export const heroPatternTransition = createHeroPatternTransition();
