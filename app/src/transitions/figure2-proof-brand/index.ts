import { renderBrandProgress } from '../../scenes/brand';
import { renderProofClosingProgress } from '../../scenes/figure2-proof-closing';
import { createInkSegmentTransition } from '../shared/ink';
import type { SegmentTimelineHandle, TransitionContext, TransitionModule } from '../../story/types';

const PROOF_BRAND_ORIGIN = { x: 0.5, y: 1.04 } as const;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function retainedArch(root: HTMLElement | null): HTMLElement | null {
  return root?.ownerDocument?.querySelector<HTMLElement>('.stage-proof-retained-arch') ?? null;
}

function clearRetainedArchMask(root: HTMLElement | null): void {
  const arch = retainedArch(root);
  if (!arch) {
    return;
  }
  arch.style.removeProperty('--r4-proof-retained-arch-opacity');
  arch.style.removeProperty('mask-image');
  arch.style.removeProperty('-webkit-mask-image');
  arch.style.removeProperty('mask-size');
  arch.style.removeProperty('-webkit-mask-size');
  arch.style.removeProperty('mask-repeat');
  arch.style.removeProperty('-webkit-mask-repeat');
  arch.style.removeProperty('mask-mode');
  arch.style.removeProperty('--r4-proof-retained-arch-edge');
  arch.style.removeProperty('clip-path');
  arch.style.removeProperty('-webkit-clip-path');
}

function renderRetainedArchMask(root: HTMLElement | null, progress: number): void {
  const arch = retainedArch(root);
  if (!arch) {
    return;
  }
  const p = clamp(progress);
  if (p <= 0.001) {
    clearRetainedArchMask(root);
    return;
  }
  if (p >= 0.999) {
    arch.style.setProperty('--r4-proof-retained-arch-opacity', '0.0000');
    arch.style.removeProperty('--r4-proof-retained-arch-edge');
    arch.style.removeProperty('mask-image');
    arch.style.removeProperty('-webkit-mask-image');
    arch.style.removeProperty('clip-path');
    arch.style.removeProperty('-webkit-clip-path');
    return;
  }
  arch.style.setProperty('--r4-proof-retained-arch-opacity', '0.9200');
  arch.style.removeProperty('--r4-proof-retained-arch-edge');
  arch.style.removeProperty('mask-image');
  arch.style.removeProperty('-webkit-mask-image');
  arch.style.removeProperty('mask-size');
  arch.style.removeProperty('-webkit-mask-size');
  arch.style.removeProperty('mask-repeat');
  arch.style.removeProperty('-webkit-mask-repeat');
  arch.style.removeProperty('mask-mode');
  arch.style.removeProperty('clip-path');
  arch.style.removeProperty('-webkit-clip-path');
}

function renderProofClosingWithRetainedArch(root: HTMLElement | null, remainingProgress: number): void {
  const transitionProgress = 1 - clamp(remainingProgress);
  renderProofClosingProgress(root, 1);
  renderRetainedArchMask(root, transitionProgress);
}

function wrapRetainedArchCleanup(
  timeline: SegmentTimelineHandle,
  context: TransitionContext
): SegmentTimelineHandle {
  return {
    ...(timeline.labels ? { labels: timeline.labels } : {}),
    ...(timeline.pauses ? { pauses: timeline.pauses } : {}),
    play: (direction) => timeline.play(direction),
    progress: (progress) => timeline.progress(progress),
    reverse: () => timeline.reverse(),
    jumpToEnd: (direction) => timeline.jumpToEnd(direction),
    ...(timeline.sample ? { sample: (progress: number) => timeline.sample!(progress) } : {}),
    dispose() {
      timeline.dispose();
      clearRetainedArchMask(context.from.element);
    }
  };
}

export function createFigure2ProofBrandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  const transition = createInkSegmentTransition({
    id: 'figure2-proof-brand',
    delayMs: options.delayMs,
    origin: PROOF_BRAND_ORIGIN,
    revealMode: 'live-clip',
    elevateTarget: false,
    renderFrom: renderProofClosingWithRetainedArch,
    renderFromProgress: 'remaining',
    renderTo: renderBrandProgress,
    renderToProgress: 'static',
    transitionAttr: 'figure2-proof-brand-ink-handoff'
  });
  return {
    ...transition,
    buildTimeline: async (context) => wrapRetainedArchCleanup(await transition.buildTimeline(context), context)
  };
}

export const figure2ProofBrandTransition = createFigure2ProofBrandTransition();
