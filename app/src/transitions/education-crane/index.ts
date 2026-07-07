import { renderCraneAnimationProgress } from '../../scenes/crane-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

function renderEducationReferenceProgress(root: HTMLElement | null | undefined, progress: number): void {
  const clamped = Math.min(1, Math.max(0, progress));
  root?.style.setProperty('--r4-education-ref-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-education-ref-opacity', clamped.toFixed(4));
  root?.style.setProperty('--r4-education-ref-y', `${((1 - clamped) * 28).toFixed(2)}px`);
  root?.setAttribute('data-education-progress', clamped.toFixed(4));
}

export function createEducationCraneTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'education-crane',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    renderFrom: renderEducationReferenceProgress,
    renderTo: renderCraneAnimationProgress,
    transitionAttr: 'education-crane-bottom-ink'
  });
}

export const educationCraneTransition = createEducationCraneTransition();
