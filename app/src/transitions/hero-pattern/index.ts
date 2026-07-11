import type { TransitionModule } from '../../story/types';
import { renderHeroProgress } from '../../scenes/hero';
import { renderPatternHold } from '../../scenes/pattern';
import { createInkSegmentTransition } from '../shared/ink';

export const HERO_PATTERN_ORIGIN = { x: 0.24, y: 0.55 } as const;

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
    origin: HERO_PATTERN_ORIGIN,
    revealMode: 'live-clip',
    renderFrom: renderHeroForHeroPattern,
    renderTo: renderPatternForHeroPattern,
    transitionAttr: 'hero-pattern-live-circle'
  });
}

export const heroPatternTransition = createHeroPatternTransition();
