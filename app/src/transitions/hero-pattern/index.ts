import type { TransitionModule } from '../../story/types';
import {
  prepareHeroPatternFrame,
  renderHeroPatternProgress
} from '../../scenes/hero';
import { renderPatternHold } from '../../scenes/pattern';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import {
  HERO_PATTERN_MOTION_STOP
} from '../../story/timings';
import { createInkSegmentTransition } from '../shared/ink';

export const HERO_PATTERN_INK_ORIGIN = Object.freeze({ x: 0.5, y: 0.5 });
export { HERO_PATTERN_INK_MS, HERO_PATTERN_MOTION_MS, HERO_PATTERN_MOTION_STOP } from '../../story/timings';

export function heroPatternMotionProgress(progress: number): number {
  return range01(progress, 0, HERO_PATTERN_MOTION_STOP);
}

export function heroPatternInkProgress(progress: number): number {
  return range01(progress, HERO_PATTERN_MOTION_STOP, 1);
}

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
    fieldProgress: heroPatternInkProgress,
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
    renderSourceProgress: heroPatternMotionProgress,
    motionScenes: ['from', 'to'],
    sample: (progress) => {
      const ink = heroPatternInkProgress(progress);
      if (ink <= 0.001) return { from: holdVisibility(false), to: hiddenVisibility() };
      if (ink >= 0.999) return { from: hiddenVisibility(), to: holdVisibility(false) };
      return { from: holdVisibility(false), to: holdVisibility(false) };
    },
    transitionAttr: 'hero-pattern-live-circle'
  });
  return {
    ...transition,
    buildTimeline: async (context) => {
      const root = context.from.element?.querySelector<HTMLElement>('[data-r4-scene="hero"]')
        ?? context.from.element
        ?? null;
      const video = root?.querySelector<HTMLVideoElement>('[data-hero-figure-video]');
      const sourceLayer = context.from.element;
      const restoreHidden = context.direction < 0 && sourceLayer?.style.visibility === 'hidden';
      if (sourceLayer) {
        // A visibility:hidden video may not receive rVFC while an endpoint is
        // prepared. Forward replay can begin before React has committed the
        // post-reverse role, so cover both directions. Opacity remains owned by
        // the stage and prevents a hidden endpoint from flashing.
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
        if (restoreHidden) {
          sourceLayer.style.visibility = 'hidden';
        }
      }
    }
  };
}

export const heroPatternTransition = createHeroPatternTransition();
