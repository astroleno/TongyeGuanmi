import type {
  SegmentProgressReceipt,
  SegmentProgressRequest,
  SegmentTimelineHandle,
  TransitionModule,
  TransitionPrewarmContext
} from '../../story/types';
import {
  prepareHeroPatternStartFrame,
  prepareHeroPatternFrame,
  heroPatternSegmentProgressReceipt,
  requestHeroPatternFrame,
  renderHeroPatternProgress,
  HERO_MEDIA_KEY
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
import { createRuntimeSegmentProgressReceipt } from '../../story/presented-progress-coordinator';
import { mediaPlaybackFor } from '../../story/manifest';

export const HERO_PATTERN_INK_ORIGIN = Object.freeze({ x: 0.5, y: 0.5 });
export const HERO_PATTERN_FRAME_PREPARING_TIMEOUT_MS = 8000;
export { HERO_PATTERN_INK_MS, HERO_PATTERN_MOTION_MS, HERO_PATTERN_MOTION_STOP } from '../../story/timings';
const HERO_SCENE_SELECTOR = '[data-r4-scene="hero"]';

type HeroPatternLayerContext = Pick<TransitionPrewarmContext, 'direction' | 'from' | 'to'>;

function sceneRootIn(
  element: HTMLElement | null | undefined,
  selector: string
): HTMLElement | null {
  if (!element) return null;
  return element.matches(selector)
    ? element
    : element.querySelector<HTMLElement>(selector);
}

function heroLayerForDirection(
  context: HeroPatternLayerContext,
  direction = context.direction
): HTMLElement | null {
  const preferred = direction === 1 ? context.from.element : context.to.element;
  const fallback = direction === 1 ? context.to.element : context.from.element;
  if (sceneRootIn(preferred, HERO_SCENE_SELECTOR)) return preferred;
  if (sceneRootIn(fallback, HERO_SCENE_SELECTOR)) return fallback;
  return preferred ?? fallback ?? null;
}

function heroRootForDirection(
  context: HeroPatternLayerContext,
  direction = context.direction
): HTMLElement | null {
  const layer = heroLayerForDirection(context, direction);
  return sceneRootIn(layer, HERO_SCENE_SELECTOR) ?? layer;
}

function patternRootForEndpoints(
  from: HTMLElement | null,
  to: HTMLElement | null
): HTMLElement | null {
  return sceneRootIn(from, '[data-r4-scene="pattern"]')
    ?? sceneRootIn(to, '[data-r4-scene="pattern"]');
}

function heroRootForRoots(
  roots: Readonly<{ from: HTMLElement | null; to: HTMLElement | null }>,
  direction: number
): HTMLElement | null {
  const preferred = direction === 1 ? roots.from : roots.to;
  const fallback = direction === 1 ? roots.to : roots.from;
  return sceneRootIn(preferred, HERO_SCENE_SELECTOR)
    ?? sceneRootIn(fallback, HERO_SCENE_SELECTOR)
    ?? preferred
    ?? fallback;
}

function heroRootForRender(
  root: HTMLElement | null,
  direction: number
): HTMLElement | null {
  const direct = sceneRootIn(root, HERO_SCENE_SELECTOR);
  if (direct) return direct;
  if (direction === 1) return root;
  return root?.ownerDocument?.querySelector<HTMLElement>(HERO_SCENE_SELECTOR) ?? root;
}

function withPresentedProgress(
  timeline: SegmentTimelineHandle,
  presentProgress: (request: SegmentProgressRequest) => Promise<SegmentProgressReceipt>
): SegmentTimelineHandle {
  const wrapped: SegmentTimelineHandle = {
    play: timeline.play.bind(timeline),
    reverse: timeline.reverse.bind(timeline),
    progress: timeline.progress.bind(timeline),
    jumpToEnd: timeline.jumpToEnd.bind(timeline),
    dispose: timeline.dispose.bind(timeline),
    presentProgress
  };
  if (timeline.labels) wrapped.labels = timeline.labels;
  if (timeline.pauses) wrapped.pauses = timeline.pauses;
  if (timeline.sample) wrapped.sample = timeline.sample.bind(timeline);
  if (timeline.rootIdentity) wrapped.rootIdentity = timeline.rootIdentity.bind(timeline);
  if (timeline.effectCanvases) wrapped.effectCanvases = timeline.effectCanvases.bind(timeline);
  if (timeline.prepareLeg) wrapped.prepareLeg = timeline.prepareLeg.bind(timeline);
  if (timeline.commitLeg) wrapped.commitLeg = timeline.commitLeg.bind(timeline);
  return wrapped;
}

export function heroPatternMotionProgress(progress: number): number {
  return range01(progress, 0, HERO_PATTERN_MOTION_STOP);
}

export function heroPatternInkProgress(progress: number): number {
  return range01(progress, HERO_PATTERN_MOTION_STOP, 1);
}

export function renderHeroForHeroPattern(root: HTMLElement | null): void {
  renderHeroPatternProgress(root, 0, { retainMediaFrame: true });
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

async function prepareHeroPatternBoundary(
  root: HTMLElement | null | undefined,
  progress: number,
  mediaRun: Parameters<typeof prepareHeroPatternFrame>[2]
): Promise<void> {
  const linked = createLinkedAbortController(mediaRun.signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
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
    clearTimeout(timer);
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
      await prepareHeroPatternBoundary(
        heroRootForRoots(roots, direction),
        direction === 1 ? 1 : 0,
        {
          runId,
          direction,
          reducedMotion: prefersReducedMotion,
          signal
        }
      );
      await waitForHeroPatternCommittedFrame(signal);
    },
    prepareEndpoints: ({ from, to }) => {
      renderHeroForHeroPattern(sceneRootIn(from, HERO_SCENE_SELECTOR) ?? sceneRootIn(to, HERO_SCENE_SELECTOR));
      renderPatternForHeroPattern(patternRootForEndpoints(from, to));
    },
    renderSource: (root, progress, mediaRun) => renderHeroPatternProgress(heroRootForRender(
      root,
      mediaRun.direction
    ), progress, {
      mediaRun: {
        runId: mediaRun.runId,
        direction: mediaRun.direction,
        reducedMotion: mediaRun.prefersReducedMotion
      }
    }),
    renderSourceProgress: heroPatternMotionProgress,
    motionScenes: ['from', 'to'],
    ease: 1.25,
    warm: (context) => prepareHeroPatternStartFrame(heroRootForDirection(context)),
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
    mediaPlayback: mediaPlaybackFor('hero-pattern') ?? [
      {
        id: 'hero-figure-pattern',
        media: [HERO_MEDIA_KEY],
        forward: { mode: 'frame-lock', required: true },
        reverse: { mode: 'frame-lock', required: true },
        readyMilestones: ['targetReady', 'mediaReady'],
        terminalFallbackScene: 'pattern',
        preparingTimeoutMs: HERO_PATTERN_FRAME_PREPARING_TIMEOUT_MS
      }
    ],
    buildTimeline: async (context) => {
      const root = heroRootForDirection(context);
      const video = root?.querySelector<HTMLVideoElement>('[data-hero-figure-video]');
      const sourceLayer = heroLayerForDirection(context);
      const restoreHidden = context.direction < 0 && sourceLayer?.style.visibility === 'hidden';
      const restoreOpacity = context.direction < 0
        && sourceLayer !== null
        && Number.parseFloat(sourceLayer.style.opacity || '1') <= 0.001;
      const previousZIndex = sourceLayer?.style.zIndex;
      const exposeSourceForFrame = () => {
        if (!sourceLayer) return;
        // A visibility:hidden video may not receive rVFC while an endpoint is
        // prepared. Forward replay can begin before React has committed the
        // post-reverse role, so cover both directions. A freshly mounted reverse
        // source is also fully transparent; give it a non-visible compositor
        // probe (the Stage visibility threshold is <= .001) so Chromium can
        // present the paused frame without exposing Hero over Pattern.
        sourceLayer.style.visibility = 'visible';
        if (restoreOpacity) {
          sourceLayer.style.opacity = '0.001';
          sourceLayer.style.zIndex = '31';
        }
      };
      exposeSourceForFrame();
      try {
        const timeline = await transition.buildTimeline(context);
        if (video) {
          // Ink endpoint ownership resets the reverse source to the hidden
          // Stage state during construction, so restore compositor eligibility
          // after construction and before requesting the causal frame.
          exposeSourceForFrame();
          await prepareHeroPatternBoundary(root, context.direction === 1 ? 0 : 1, {
            runId: context.runId,
            direction: context.direction,
            reducedMotion: context.prefersReducedMotion
          });
        }
        return withPresentedProgress(timeline, (request) => {
          const desiredProgress = Math.min(1, Math.max(0, request.desiredProgress));
          if (context.prefersReducedMotion || desiredProgress > HERO_PATTERN_MOTION_STOP + 0.0001) {
            return Promise.resolve(createRuntimeSegmentProgressReceipt(request));
          }
          const sourceProgress = heroPatternMotionProgress(desiredProgress);
          const mediaRequest = { ...request, desiredProgress: sourceProgress };
          const sourceLayer = heroLayerForDirection(context, request.direction);
          const restoreHidden = sourceLayer?.style.visibility === 'hidden';
          const restoreOpacity = restoreHidden
            && Number.parseFloat(sourceLayer?.style.opacity || '1') <= 0.001;
          const previousZIndex = sourceLayer?.style.zIndex;
          if (restoreHidden && sourceLayer) {
            // A cached reverse run can request its first strict frame while
            // the Hero layer is still parked as the hidden `next` layer. Keep
            // the source compositor-eligible for the duration of the causal
            // callback without exposing it above the Pattern receiver.
            sourceLayer.style.visibility = 'visible';
            if (restoreOpacity) {
              sourceLayer.style.opacity = '0.001';
              sourceLayer.style.zIndex = '31';
            }
          }
          return requestHeroPatternFrame(heroRootForDirection(context, request.direction), sourceProgress, {
            runId: request.runId,
            direction: request.direction,
            sequence: request.sequence,
            reducedMotion: context.prefersReducedMotion,
            signal: request.signal
          }).then((frame) => {
            const receipt = heroPatternSegmentProgressReceipt(mediaRequest, frame);
            return {
              ...receipt,
              desiredProgress: request.desiredProgress,
              presentedProgress: receipt.presentedProgress * HERO_PATTERN_MOTION_STOP
            };
          }).finally(() => {
            if (restoreHidden && sourceLayer) {
              sourceLayer.style.visibility = 'hidden';
            }
            if (restoreOpacity && sourceLayer) {
              sourceLayer.style.opacity = '0';
              sourceLayer.style.zIndex = previousZIndex ?? '';
            }
          });
        });
      } finally {
        if (restoreHidden) {
          sourceLayer.style.visibility = 'hidden';
        }
        if (restoreOpacity) {
          sourceLayer.style.opacity = '0';
          sourceLayer.style.zIndex = previousZIndex ?? '';
        }
      }
    }
  };
}

export const heroPatternTransition = createHeroPatternTransition();
