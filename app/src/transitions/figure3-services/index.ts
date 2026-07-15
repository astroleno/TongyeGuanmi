import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { hiddenVisibility, holdVisibility, range01, smoothStep } from '../../pilot/visibility';
import {
  FIGURE3_HOLD_PROGRESS,
  FIGURE3_MEDIA_KEY,
  prepareFigure3AnimationFrame,
  renderFigure3AnimationProgress,
  type Figure3MediaRun
} from '../../scenes/figure3-animation';
import {
  releaseServicesEntrance,
  renderServicesEntrance,
  renderServicesHold
} from '../../scenes/services';
import { positionReadingAtEdge } from '../../stage/reading';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import type { Direction, LayerVisibilityState, SegmentTimelineHandle, TransitionContext, TransitionModule } from '../../story/types';
import { FIGURE3_SERVICES_DURATION_MS } from '../../story/timings';

export { FIGURE3_SERVICES_DURATION_MS } from '../../story/timings';
export const FIGURE3_SERVICES_COPY_CUE = { targetScene: 'services', atProgress: 0.8 } as const;
const transitionRunByElement = new WeakMap<HTMLElement, string>();

function rootFor(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

export type Figure3ServicesChannels = Readonly<{
  progress: number;
  mediaProgress: number;
  sourceVisibility: number;
  copyProgress: number;
  paperAlpha: number;
}>;

export function sampleFigure3ServicesChannels(progress: number): Figure3ServicesChannels {
  const clamped = Math.min(1, Math.max(0, progress));
  return {
    progress: clamped,
    mediaProgress: smoothStep(range01(clamped, 0, 0.96)),
    sourceVisibility: 1 - smoothStep(range01(clamped, 0.9, 0.98)),
    copyProgress: smoothStep(range01(clamped, FIGURE3_SERVICES_COPY_CUE.atProgress, 0.94)),
    paperAlpha: smoothStep(range01(clamped, FIGURE3_SERVICES_COPY_CUE.atProgress, 0.96))
  };
}

function sampleFigure3Services(
  progress: number
): { from: LayerVisibilityState; to: LayerVisibilityState; copyCueActive: boolean } {
  const channels = sampleFigure3ServicesChannels(progress);
  const copyCueActive = channels.progress >= FIGURE3_SERVICES_COPY_CUE.atProgress;
  return {
    from: channels.progress < 1
      ? { ...holdVisibility(false), opacity: channels.sourceVisibility }
      : hiddenVisibility(),
    to: copyCueActive ? holdVisibility(false) : hiddenVisibility(),
    copyCueActive
  };
}

function writeTransitionRun(element: HTMLElement | null | undefined, name: string, runId: string): void {
  if (!element) return;
  transitionRunByElement.set(element, runId);
  element.setAttribute('data-r4-transition', name);
  element.setAttribute('data-r4-transition-run', runId);
}

function clearTransitionRun(element: HTMLElement | null | undefined, runId: string): void {
  if (!element || transitionRunByElement.get(element) !== runId) return;
  transitionRunByElement.delete(element);
  element.removeAttribute('data-r4-transition');
  element.removeAttribute('data-r4-transition-run');
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
        const channels = sampleFigure3ServicesChannels(progress);
        this.elevation.elevate();
        renderFigure3AnimationProgress(
          rootFor(context.from.element, 'figure3-animation'),
          channels.mediaProgress,
          { mediaRun: this.mediaRun }
        );
        renderServicesEntrance(
          rootFor(context.to.element, 'services'),
          channels.copyProgress,
          channels.paperAlpha,
          context.runId
        );
        writeTransitionRun(context.from.element, 'figure3-services-media', context.runId);
        writeTransitionRun(context.to.element, 'figure3-services-copy-cue', context.runId);
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
    if (progress >= 0.999 || progress <= 0.001) {
      releaseServicesEntrance(
        rootFor(this.toElement, 'services'),
        this.mediaRun.runId,
        progress
      );
    }
    clearTransitionRun(this.timeline.rootIdentity().from, this.mediaRun.runId);
    clearTransitionRun(this.timeline.rootIdentity().to, this.mediaRun.runId);
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
        forward: { mode: 'play', required: true },
        reverse: { mode: 'timeline', required: true },
        readyMilestones: ['targetReady', 'mediaReady'],
        terminalFallbackScene: 'services',
        preparingTimeoutMs: 1800
      }
    ],
    reducedMotionFallback: (context) => {
      renderFigure3AnimationProgress(rootFor(context.from.element, 'figure3-animation'), FIGURE3_HOLD_PROGRESS);
      renderServicesHold(rootFor(context.to.element, 'services'));
      context.from.setVisibility(context.direction === 1 ? hiddenVisibility() : holdVisibility(true));
      context.to.setVisibility(context.direction === 1 ? holdVisibility(true) : hiddenVisibility());
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const source = rootFor(context.from.element, 'figure3-animation');
      positionReadingAtEdge(context.to.element, 'top');
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
