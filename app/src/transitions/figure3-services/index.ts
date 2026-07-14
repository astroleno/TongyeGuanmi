import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, hiddenVisibility, holdVisibility, range01, smoothStep } from '../../pilot/visibility';
import {
  FIGURE3_HOLD_PROGRESS,
  FIGURE3_MEDIA_KEY,
  prepareFigure3AnimationFrame,
  renderFigure3AnimationProgress,
  type Figure3MediaRun
} from '../../scenes/figure3-animation';
import { renderServicesProgress } from '../../scenes/services';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import type { Direction, LayerVisibilityState, SegmentTimelineHandle, TransitionContext, TransitionModule } from '../../story/types';
import { FIGURE3_SERVICES_DURATION_MS } from '../../story/timings';

export { FIGURE3_SERVICES_DURATION_MS } from '../../story/timings';
export const FIGURE3_SERVICES_COPY_CUE = { targetScene: 'services', atProgress: 0.8 } as const;
const receiverRunByElement = new WeakMap<HTMLElement, string>();

function rootFor(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleFigure3Services(
  progress: number
): { from: LayerVisibilityState; to: LayerVisibilityState; copyCueActive: boolean } {
  const copyCueActive = progress >= FIGURE3_SERVICES_COPY_CUE.atProgress;
  const receiverProgress = smoothStep(range01(progress, FIGURE3_SERVICES_COPY_CUE.atProgress, 1));
  return {
    from: progress >= 1 ? hiddenVisibility() : fadeVisibility(1 - receiverProgress),
    to: progress >= 1 ? holdVisibility(false) : fadeVisibility(receiverProgress),
    copyCueActive
  };
}

function receiverProgressFor(progress: number): number {
  return smoothStep(range01(progress, FIGURE3_SERVICES_COPY_CUE.atProgress, 1));
}

function writeHandoffReceiver(
  element: HTMLElement | null | undefined,
  progress: number,
  runId: string
): void {
  if (!element) {
    return;
  }
  const receiverProgress = receiverProgressFor(progress);
  receiverRunByElement.set(element, runId);
  element.setAttribute('data-r4-handoff-receiver-progress', receiverProgress.toFixed(4));
  element.style.setProperty('--r4-handoff-paper-alpha', receiverProgress.toFixed(4));
  element.style.setProperty('--r4-handoff-wash-alpha', receiverProgress.toFixed(4));
}

function clearHandoffReceiver(element: HTMLElement | null | undefined, runId?: string): void {
  if (!element || (runId && receiverRunByElement.get(element) !== runId)) {
    return;
  }
  receiverRunByElement.delete(element);
  element.removeAttribute('data-r4-handoff-receiver-progress');
  element.style.removeProperty('--r4-handoff-paper-alpha');
  element.style.removeProperty('--r4-handoff-wash-alpha');
}

function normalizeHandoffReceiver(
  element: HTMLElement | null | undefined,
  progress: number,
  runId: string
): void {
  const owner = element && receiverRunByElement.get(element);
  if (owner && owner !== runId) {
    return;
  }
  writeHandoffReceiver(element, progress, runId);
}

class Figure3ServicesTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];
  private readonly timeline: PilotProgressTimeline;
  private readonly elevation: TransitionLayerElevation;
  private readonly toElement: HTMLElement | null | undefined;
  private readonly mediaRun: Figure3MediaRun;

  constructor(context: TransitionContext, durationMs: number, mediaRun: Figure3MediaRun) {
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.toElement = context.to.element;
    this.mediaRun = mediaRun;
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
          smoothStep(progress),
          { mediaRun: this.mediaRun }
        );
        renderServicesProgress(
          rootFor(context.to.element, 'services'),
          receiverProgressFor(progress)
        );
        writeHandoffReceiver(context.to.element, progress, context.runId);
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
      normalizeHandoffReceiver(this.toElement, 1, this.mediaRun.runId);
    } else if (progress <= 0.001) {
      clearHandoffReceiver(this.toElement, this.mediaRun.runId);
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
        reverse: { mode: 'timeline', required: true },
        readyMilestones: ['targetReady', 'mediaReady'],
        terminalFallbackScene: 'services',
        preparingTimeoutMs: 1800
      }
    ],
    reducedMotionFallback: (context) => {
      const endpoint = context.direction === 1 ? 1 : 0;
      renderFigure3AnimationProgress(rootFor(context.from.element, 'figure3-animation'), FIGURE3_HOLD_PROGRESS);
      renderServicesProgress(rootFor(context.to.element, 'services'), 1);
      writeHandoffReceiver(context.to.element, endpoint, context.runId);
      context.from.setVisibility(context.direction === 1 ? hiddenVisibility() : holdVisibility(true));
      context.to.setVisibility(context.direction === 1 ? holdVisibility(true) : hiddenVisibility());
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const source = rootFor(context.from.element, 'figure3-animation');
      const video = source?.querySelector<HTMLVideoElement>('[data-figure3-alpha-video]');
      const mediaRun: Figure3MediaRun = {
        runId: context.runId,
        direction: context.direction,
        reducedMotion: context.prefersReducedMotion
      };
      if (video) {
        await prepareFigure3AnimationFrame(source, context.direction === 1 ? 0 : 1, mediaRun);
      }
      return new Figure3ServicesTimeline(
        context,
        context.prefersReducedMotion ? 0 : FIGURE3_SERVICES_DURATION_MS,
        mediaRun
      );
    }
  };
}

export const figure3ServicesTransition = createFigure3ServicesTransition();
