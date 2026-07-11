import type { TransitionModule } from '../../story/types';
import { renderHeroProgress } from '../../scenes/hero';
import { renderPatternHold } from '../../scenes/pattern';
import { createInkSegmentTransition } from '../shared/ink';

export const HERO_PATTERN_INK_ORIGIN = Object.freeze({ x: 0.5, y: 0.5 });

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
    field: {
      kind: 'radial',
      origin: HERO_PATTERN_INK_ORIGIN,
      seed: 'hero-pattern'
    },
    prepareEndpoints: ({ from, to }) => {
      renderHeroForHeroPattern(from);
      renderPatternForHeroPattern(to);
    },
    transitionAttr: 'hero-pattern-live-circle'
  });
}

export const heroPatternTransition = createHeroPatternTransition();
