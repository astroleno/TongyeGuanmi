import { renderHeroProgress } from '../../scenes/hero';
import { renderPatternProgress } from '../../scenes/pattern';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

const BLOOM_START = 0.42;
const BLOOM_END = 0.70;
const REVEAL_END = 0.46;

function range01(progress: number, start: number, end: number): number {
  if (end <= start) {
    return progress >= end ? 1 : 0;
  }
  return Math.min(1, Math.max(0, (progress - start) / (end - start)));
}

export function patternBloomProgressForHeroPattern(progress: number): number {
  return range01(progress, BLOOM_START, BLOOM_END);
}

export function patternRevealProgressForHeroPattern(progress: number): number {
  return range01(progress, 0, REVEAL_END);
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
    clipProgress: patternRevealProgressForHeroPattern,
    inkProgress: patternRevealProgressForHeroPattern,
    transitionAttr: 'hero-pattern-center-ink'
  });
}

export const heroPatternTransition = createHeroPatternTransition();
