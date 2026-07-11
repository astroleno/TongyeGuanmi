import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { hiddenVisibility, holdVisibility, range01, smoothStep } from '../../pilot/visibility';
import { FIGURE3_HOLD_PROGRESS, FIGURE3_MEDIA_KEY, renderFigure3AnimationProgress } from '../../scenes/figure3-animation';
import { renderServicesProgress } from '../../scenes/services';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import type { Direction, LayerVisibilityState, SegmentTimelineHandle, TransitionContext, TransitionModule } from '../../story/types';

export const FIGURE3_SERVICES_DURATION_MS = 2000;
export const FIGURE3_SERVICES_COPY_CUE = { targetScene: 'services', atProgress: 0.8 } as const;

function rootFor(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleFigure3Services(
  progress: number
): { from: LayerVisibilityState; to: LayerVisibilityState; copyCueActive: boolean } {
  const copyCueActive = progress >= FIGURE3_SERVICES_COPY_CUE.atProgress;
  const receiverVisible = copyCueActive;
  return {
    from: progress >= 1 ? hiddenVisibility() : holdVisibility(false),
    to: receiverVisible ? holdVisibility(false) : hiddenVisibility(),
    copyCueActive
  };
}

function writeHandoffReceiver(element: HTMLElement | null | undefined, progress: number): void {
  const receiverProgress = range01(progress, FIGURE3_SERVICES_COPY_CUE.atProgress, 1);
  const paperProgress = receiverProgress;
  element?.setAttribute('data-r4-handoff-receiver-active', String(receiverProgress > 0.001 && receiverProgress < 0.999));
  element?.setAttribute('data-r4-handoff-receiver-progress', receiverProgress.toFixed(4));
  element?.style.setProperty('--r4-handoff-paper-alpha', paperProgress.toFixed(4));
  element?.style.setProperty('--r4-handoff-wash-alpha', paperProgress.toFixed(4));
}

function clearHandoffReceiver(element: HTMLElement | null | undefined): void {
  element?.removeAttribute('data-r4-handoff-receiver-active');
  element?.removeAttribute('data-r4-handoff-receiver-progress');
  element?.style.removeProperty('--r4-handoff-paper-alpha');
  element?.style.removeProperty('--r4-handoff-wash-alpha');
}

class Figure3ServicesTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];
  private readonly timeline: PilotProgressTimeline;
  private readonly elevation: TransitionLayerElevation;
  private readonly toElement: HTMLElement | null | undefined;

  constructor(context: TransitionContext, durationMs: number) {
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.toElement = context.to.element;
    this.timeline = new PilotProgressTimeline({
      from: context.from,
      to: context.to,
      durationMs,
      direction: context.direction,
      copyCue: FIGURE3_SERVICES_COPY_CUE,
      sample: sampleFigure3Services,
      render: (progress) => {
        this.elevation.elevate();
        renderFigure3AnimationProgress(
          rootFor(context.from.element, 'figure3-animation'),
          smoothStep(progress)
        );
        renderServicesProgress(
          rootFor(context.to.element, 'services'),
          progress >= FIGURE3_SERVICES_COPY_CUE.atProgress ? 1 : 0
        );
        writeHandoffReceiver(context.to.element, progress);
        context.from.element?.setAttribute('data-r4-transition', 'figure3-services-media');
        context.to.element?.setAttribute('data-r4-transition', 'figure3-services-copy-cue');
      }
    });
    this.labels = {
      start: 0,
      copyCue: FIGURE3_SERVICES_COPY_CUE.atProgress,
      end: 1
    };
    this.pauses = [];
  }

  play(): Promise<void> {
    return this.timeline.play();
  }

  progress(value: number): void {
    this.timeline.progress(value);
  }

  reverse(): Promise<void> {
    return this.timeline.reverse();
  }

  jumpToEnd(direction: Direction): void {
    this.timeline.jumpToEnd(direction);
  }

  dispose(): void {
    const progress = this.timeline.snapshot.progress;
    this.elevation.restore();
    if (progress >= 0.999) {
      writeHandoffReceiver(this.toElement, 1);
    } else {
      clearHandoffReceiver(this.toElement);
    }
    this.timeline.dispose();
  }

  sample(progress: number) {
    return this.timeline.sample(progress);
  }

  rootIdentity() {
    return this.timeline.rootIdentity();
  }
}

export function createFigure3ServicesTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'figure3-services',
    requiredMilestones: ['targetReady', 'mediaReady', 'buildReady'],
    copyCue: FIGURE3_SERVICES_COPY_CUE,
    mediaPlayback: [
      {
        id: 'figure3-alpha',
        media: [FIGURE3_MEDIA_KEY],
        forward: { mode: 'timeline', required: true },
        reverse: { mode: 'static-fallback', required: false },
        readyMilestones: ['targetReady', 'mediaReady'],
        terminalFallbackScene: 'services',
        preparingTimeoutMs: 1800
      }
    ],
    reducedMotionFallback: (context) => {
      const endpoint = context.direction === 1 ? 1 : 0;
      renderFigure3AnimationProgress(rootFor(context.from.element, 'figure3-animation'), FIGURE3_HOLD_PROGRESS);
      renderServicesProgress(rootFor(context.to.element, 'services'), 1);
      writeHandoffReceiver(context.to.element, endpoint);
      context.from.setVisibility(context.direction === 1 ? hiddenVisibility() : holdVisibility(true));
      context.to.setVisibility(context.direction === 1 ? holdVisibility(true) : hiddenVisibility());
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new Figure3ServicesTimeline(context, context.prefersReducedMotion ? 0 : FIGURE3_SERVICES_DURATION_MS);
    }
  };
}

export const figure3ServicesTransition = createFigure3ServicesTransition();
