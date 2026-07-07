import { renderHeroProgress } from '../../scenes/hero';
import { renderPatternProgress } from '../../scenes/pattern';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createHeroPatternTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'hero-pattern',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 0.5 },
    renderFrom: renderHeroProgress,
    renderTo: (root, progress) => renderPatternProgress(root, Math.min(1, progress / 0.70)),
    transitionAttr: 'hero-pattern-center-ink'
  });
}

export const heroPatternTransition = createHeroPatternTransition();
