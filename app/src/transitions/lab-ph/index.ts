import { renderPhAnimationProgress } from '../../scenes/ph-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

function renderLabReferenceProgress(root: HTMLElement | null | undefined, progress: number): void {
  const clamped = Math.min(1, Math.max(0, progress));
  root?.style.setProperty('--r4-lab-ref-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-lab-ref-opacity', clamped.toFixed(4));
  root?.style.setProperty('--r4-lab-ref-y', `${((1 - clamped) * 28).toFixed(2)}px`);
  root?.setAttribute('data-lab-progress', clamped.toFixed(4));
}

export function createLabPhTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'lab-ph',
    delayMs: options.delayMs,
    origin: { x: 0.11, y: 0.36 },
    renderFrom: renderLabReferenceProgress,
    renderTo: renderPhAnimationProgress,
    transitionAttr: 'lab-ph-sun-radial-ink'
  });
}

export const labPhTransition = createLabPhTransition();
