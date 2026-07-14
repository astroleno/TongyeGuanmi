import type { TransitionModule } from '../../story/types';
import {
  prepareHeroPatternFrame,
  renderHeroPatternProgress
} from '../../scenes/hero';
import { renderPatternHold } from '../../scenes/pattern';
import { createInkSegmentTransition } from '../shared/ink';

export const HERO_PATTERN_INK_ORIGIN = Object.freeze({ x: 0.5, y: 0.5 });

export function renderHeroForHeroPattern(root: HTMLElement | null): void {
  renderHeroPatternProgress(root, 0);
}

export function renderPatternForHeroPattern(root: HTMLElement | null): void {
  renderPatternHold(root);
}

export function createHeroPatternTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  const transition = createInkSegmentTransition({
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
    renderSource: (root, progress, mediaRun) => renderHeroPatternProgress(root, progress, {
      mediaRun: {
        runId: mediaRun.runId,
        direction: mediaRun.direction,
        reducedMotion: mediaRun.prefersReducedMotion
      }
    }),
    renderSourceProgress: 'forward',
    motionScenes: ['from', 'to'],
    transitionAttr: 'hero-pattern-live-circle'
  });
  return {
    ...transition,
    buildTimeline: async (context) => {
      const root = context.from.element?.querySelector<HTMLElement>('[data-r4-scene="hero"]')
        ?? context.from.element
        ?? null;
      const video = root?.querySelector<HTMLVideoElement>('[data-hero-figure-video]');
      const sourceLayer = context.direction === -1 ? context.from.element : null;
      const sourceVisibility = sourceLayer?.style.visibility;
      if (sourceLayer) {
        // A visibility:hidden video may not receive rVFC while its reverse
        // endpoint is prepared. Opacity remains zero, so this cannot flash.
        sourceLayer.style.visibility = 'visible';
      }
      try {
        const timeline = await transition.buildTimeline(context);
        if (video) {
          await prepareHeroPatternFrame(root, context.direction === 1 ? 0 : 1, {
            runId: context.runId,
            direction: context.direction,
            reducedMotion: context.prefersReducedMotion
          });
        }
        return timeline;
      } finally {
        if (sourceLayer) {
          sourceLayer.style.visibility = sourceVisibility ?? '';
        }
      }
    }
  };
}

export const heroPatternTransition = createHeroPatternTransition();
