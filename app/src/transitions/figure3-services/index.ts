import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, range01, smoothStep } from '../../pilot/visibility';
import { FIGURE3_MEDIA_KEY, renderFigure3AnimationProgress } from '../../scenes/figure3-animation';
import { renderServicesProgress } from '../../scenes/services';
import type { Direction, LayerVisibilityState, SegmentTimelineHandle, TransitionContext, TransitionModule } from '../../story/types';

export const FIGURE3_SERVICES_DURATION_MS = 2800;
export const FIGURE3_SERVICES_COPY_CUE = { targetScene: 'services', atProgress: 0.8 } as const;

function rootFor(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleFigure3Services(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState; copyCueActive: boolean } {
  const copyCueActive = progress >= FIGURE3_SERVICES_COPY_CUE.atProgress;
  const servicesOpacity = copyCueActive ? Math.max(0.02, smoothStep(range01(progress, 0.8, 1))) : 0;
  const figureOpacity = 1 - smoothStep(range01(progress, 0.72, 1));
  return {
    from: fadeVisibility(figureOpacity),
    to: fadeVisibility(servicesOpacity),
    copyCueActive
  };
}

class Figure3ServicesTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];
  private readonly timeline: PilotProgressTimeline;

  constructor(context: TransitionContext, durationMs: number) {
    const stops = context.segment.policy.kind === 'stagedSnap' ? context.segment.policy.stops : [];
    this.timeline = new PilotProgressTimeline({
      from: context.from,
      to: context.to,
      durationMs,
      copyCue: FIGURE3_SERVICES_COPY_CUE,
      sample: sampleFigure3Services,
      render: (progress) => {
        renderFigure3AnimationProgress(rootFor(context.from.element, 'figure3-animation'), progress);
        renderServicesProgress(rootFor(context.to.element, 'services'), smoothStep(range01(progress, 0.8, 1)));
        context.from.element?.setAttribute('data-r4-transition', 'figure3-services-media');
        context.to.element?.setAttribute('data-r4-transition', 'figure3-services-copy-cue');
      }
    });
    this.labels = Object.fromEntries([
      ['start', 0],
      ['copyCue', FIGURE3_SERVICES_COPY_CUE.atProgress],
      ...stops.map((stop, index) => [`stage:${index}`, stop] as const),
      ['end', 1]
    ]);
    this.pauses = stops.map((_, index) => `stage:${index}`);
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
    this.timeline.dispose();
  }

  sample(progress: number) {
    return this.timeline.sample(progress);
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
      renderFigure3AnimationProgress(rootFor(context.from.element, 'figure3-animation'), 1);
      renderServicesProgress(rootFor(context.to.element, 'services'), 1);
      context.from.setVisibility(fadeVisibility(0));
      context.to.setVisibility(fadeVisibility(1));
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
