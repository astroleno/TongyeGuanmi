import { renderHeroProgress } from '../../scenes/hero';
import { renderPatternProgress } from '../../scenes/pattern';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

const BLOOM_START = 0.42;
const BLOOM_END = 0.70;

export function patternBloomProgressForHeroPattern(progress: number): number {
  if (BLOOM_END <= BLOOM_START) {
    return progress >= BLOOM_END ? 1 : 0;
  }
  return Math.min(1, Math.max(0, (progress - BLOOM_START) / (BLOOM_END - BLOOM_START)));
}

export function renderPatternForHeroPattern(root: HTMLElement | null, progress: number): void {
  renderPatternProgress(root, patternBloomProgressForHeroPattern(progress), { visible: true });
}

export function createHeroPatternTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'hero-pattern',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 0.5 },
    renderFrom: renderHeroProgress,
    renderTo: renderPatternForHeroPattern,
    transitionAttr: 'hero-pattern-center-ink'
  });
}

export const heroPatternTransition = createHeroPatternTransition();
