import type { TransitionModule } from '../../story/types';
import { renderHeroProgress } from '../../scenes/hero';
import { readPatternCenter, renderPatternHold } from '../../scenes/pattern';
import { createInkSegmentTransition } from '../shared/ink';

export function renderHeroForHeroPattern(root: HTMLElement | null): void {
  renderHeroProgress(root, 1);
}

export function renderPatternForHeroPattern(root: HTMLElement | null): void {
  renderPatternHold(root);
}

export function createHeroPatternTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'hero-pattern',
    delayMs: options.delayMs,
    boundary: ({ to }) => ({
      kind: 'radial',
      origin: readPatternCenter(to),
      seed: 'hero-pattern'
    }),
    prepareEndpoints: ({ from, to }) => {
      renderHeroForHeroPattern(from);
      renderPatternForHeroPattern(to);
    },
    transitionAttr: 'hero-pattern-live-circle'
  });
}

export const heroPatternTransition = createHeroPatternTransition();
