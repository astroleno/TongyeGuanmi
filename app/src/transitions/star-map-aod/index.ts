import { fadeVisibility, smoothStep } from '../../pilot/visibility';
import type { LayerVisibilityState, TransitionModule } from '../../story/types';
import { createInkSegmentTransition } from '../shared/ink';
import type { InkGradePreset } from '../shared/sceneInk';

const STAR_MAP_AOD_FIELD = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'star-map-aod'
} as const;

function sampleStarMapAod(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState } {
  const p = smoothStep(progress);
  if (p <= 0.001) {
    return { from: fadeVisibility(1), to: fadeVisibility(0) };
  }
  if (p >= 0.999) {
    return { from: fadeVisibility(0), to: fadeVisibility(1) };
  }
  return { from: fadeVisibility(1), to: fadeVisibility(1) };
}

function aodRevealSurface(element: HTMLElement | null): readonly HTMLElement[] {
  const surface = element?.querySelector<HTMLElement>('[data-aod-reveal-surface]') ?? null;
  return surface ? [surface] : [];
}

/**
 * AOD owns an inner reveal surface, while the shared Ink timeline owns the
 * canvas, generation guard, live-stage remount and complementary contour.
 */
export function createStarMapAodTransition(options: {
  delayMs?: () => number;
  grade?: InkGradePreset | (() => InkGradePreset);
} = {}): TransitionModule {
  const grade = typeof options.grade === 'function' ? options.grade() : options.grade ?? 'edge-bright';
  return createInkSegmentTransition({
    id: 'star-map-aod',
    ...(options.delayMs ? { delayMs: options.delayMs } : {}),
    field: STAR_MAP_AOD_FIELD,
    grade,
    canvasHost: 'stage',
    includeToSurface: false,
    ownershipSurfaces: ({ to }) => ({ reveal: aodRevealSurface(to) }),
    sample: sampleStarMapAod,
    prepareEndpoints: () => undefined,
    transitionAttr: 'star-map-aod-live-ink'
  });
}

export const starMapAodTransition = createStarMapAodTransition();
