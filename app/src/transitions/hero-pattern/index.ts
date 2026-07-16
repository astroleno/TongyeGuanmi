import type { TransitionModule } from '../../story/types';
import {
  prepareHeroPatternStartFrame,
  prepareHeroPatternFrame,
  renderHeroPatternProgress
} from '../../scenes/hero';
import { renderPatternHold } from '../../scenes/pattern';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import {
  HERO_PATTERN_INK_MS,
  HERO_PATTERN_MOTION_MS,
  HERO_PATTERN_MOTION_STOP
} from '../../story/timings';
import { createInkSegmentTransition } from '../shared/ink';
import { createLinkedAbortController, MediaPreparationError } from '../../media/media-preparation';

export const HERO_PATTERN_INK_ORIGIN = Object.freeze({ x: 0.5, y: 0.5 });
export const HERO_PATTERN_FRAME_PREPARING_TIMEOUT_MS = 1800;
export { HERO_PATTERN_INK_MS, HERO_PATTERN_MOTION_MS, HERO_PATTERN_MOTION_STOP } from '../../story/timings';
const HERO_SCENE_SELECTOR = '[data-r4-scene="hero"]';

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

function abortedFrameError(reason?: unknown): MediaPreparationError {
  return new MediaPreparationError(
    'MEDIA_PREPARATION_ABORTED',
    'Hero terminal frame preparation aborted',
    reason === undefined ? {} : { cause: reason }
  );
}

export function waitForHeroPatternCommittedFrame(
  signal?: AbortSignal,
  timeoutMs = HERO_PATTERN_FRAME_PREPARING_TIMEOUT_MS
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortedFrameError(signal.reason));
  }
  if (typeof requestAnimationFrame === 'undefined') {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let firstFrame = 0;
    let secondFrame = 0;
    const timer: [ReturnType<typeof setTimeout>?] = [];
    const cleanup = () => {
      if (firstFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(firstFrame);
      if (secondFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(secondFrame);
      if (timer[0]) clearTimeout(timer[0]);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortedFrameError(signal?.reason));
    };
    const onTimeout = () => {
      cleanup();
      reject(new MediaPreparationError(
        'MEDIA_PREPARATION_TIMEOUT',
        `Hero terminal frame confirmation exceeded ${timeoutMs}ms`
      ));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer[0] = setTimeout(onTimeout, timeoutMs);
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        cleanup();
        resolve();
      });
    });
  });
}

export async function prepareHeroPatternBoundary(
  root: HTMLElement | null | undefined,
  progress: number,
  mediaRun: Parameters<typeof prepareHeroPatternFrame>[2]
): Promise<void> {
  const linked = createLinkedAbortController(mediaRun.signal);
  const timer: [ReturnType<typeof setTimeout>?] = [];
  const timeout = new Promise<never>((_, reject) => {
    timer[0] = setTimeout(() => {
      const error = new MediaPreparationError(
        'MEDIA_PREPARATION_TIMEOUT',
        `Hero terminal frame preparation exceeded ${HERO_PATTERN_FRAME_PREPARING_TIMEOUT_MS}ms`
      );
      if (!linked.controller.signal.aborted) {
        linked.controller.abort(error);
      }
      reject(error);
    }, HERO_PATTERN_FRAME_PREPARING_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      prepareHeroPatternFrame(root, progress, { ...mediaRun, signal: linked.controller.signal }),
      timeout
    ]);
  } finally {
    if (timer[0]) clearTimeout(timer[0]);
    linked.dispose();
  }
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
    playbackPhases: [
      { from: 0, to: HERO_PATTERN_MOTION_STOP, durationMs: HERO_PATTERN_MOTION_MS },
      { from: HERO_PATTERN_MOTION_STOP, to: 1, durationMs: HERO_PATTERN_INK_MS }
    ],
    presentPhaseBoundary: async ({ roots, runId, direction, prefersReducedMotion, signal }) => {
      await prepareHeroPatternBoundary(roots.from, 1, {
        runId,
        direction,
        reducedMotion: prefersReducedMotion,
        signal
      });
      await waitForHeroPatternCommittedFrame(signal);
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
    renderSourceProgress: heroPatternMotionProgress,
    motionScenes: ['from', 'to'],
    ease: 1.25,
    warm: (context) => prepareHeroPatternStartFrame(
      context.from.element!.querySelector<HTMLElement>(HERO_SCENE_SELECTOR)
        ?? context.from.element!
    ),
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
      const root = context.from.element?.querySelector<HTMLElement>(HERO_SCENE_SELECTOR)
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
          await prepareHeroPatternBoundary(root, context.direction === 1 ? 0 : 1, {
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
