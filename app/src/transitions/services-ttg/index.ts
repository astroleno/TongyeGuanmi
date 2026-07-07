import { renderTtgAnimationProgress } from '../../scenes/ttg-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

function renderServicesReferenceProgress(root: HTMLElement | null | undefined, progress: number): void {
  const clamped = Math.min(1, Math.max(0, progress));
  root?.style.setProperty('--r4-services-ref-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-services-ref-opacity', clamped.toFixed(4));
  root?.style.setProperty('--r4-services-ref-y', `${((1 - clamped) * 28).toFixed(2)}px`);
  root?.setAttribute('data-services-progress', clamped.toFixed(4));
}

export function createServicesTtgTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'services-ttg',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    renderFrom: renderServicesReferenceProgress,
    renderTo: renderTtgAnimationProgress,
    transitionAttr: 'services-ttg-bottom-ink'
  });
}

export const servicesTtgTransition = createServicesTtgTransition();
