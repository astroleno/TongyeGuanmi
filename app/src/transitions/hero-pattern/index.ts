import type { TransitionModule } from '../../story/types';
import { renderPatternProgress } from '../../scenes/pattern';
import {
  createPatternBloomTransition,
  patternBloomProgressForHeroPattern,
  patternRevealProgressForHeroPattern
} from '../pattern-bloom/timeline';

export { patternBloomProgressForHeroPattern, patternRevealProgressForHeroPattern };

export function renderPatternForHeroPattern(root: HTMLElement | null, progress: number): void {
  renderPatternProgress(root, patternBloomProgressForHeroPattern(progress), { visible: true });
}

export function createHeroPatternTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createPatternBloomTransition({
    id: 'hero-pattern',
    delayMs: options.delayMs,
    variant: 'hero-pattern'
  });
}

export const heroPatternTransition = createHeroPatternTransition();
