import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, range01, smoothStep } from '../../pilot/visibility';
import { CRANE_FIGURE_MEDIA_KEY, CRANE_FLOCK_MEDIA_KEY, renderCraneAnimationProgress } from '../../scenes/crane-animation';
import { renderContactProgress } from '../../scenes/contact';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import type { Direction, LayerVisibilityState, SegmentTimelineHandle, TransitionContext, TransitionModule } from '../../story/types';

export const CRANE_CONTACT_COPY_CUE = { targetScene: 'contact', atProgress: 0.8 } as const;
const CONTACT_RECEIVER_START = 0.58;
const CONTACT_RECEIVER_END = 0.94;

function rootFor(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleCraneContact(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState; copyCueActive: boolean } {
  const copyCueActive = progress >= CRANE_CONTACT_COPY_CUE.atProgress;
  const receiverProgress = smoothStep(range01(progress, CONTACT_RECEIVER_START, CONTACT_RECEIVER_END));
  const contactOpacity = receiverProgress > 0 ? Math.max(0.02, receiverProgress) : 0;
  const craneOpacity = 1 - smoothStep(range01(progress, 0.88, 1));
  return {
    from: fadeVisibility(craneOpacity),
    to: fadeVisibility(contactOpacity),
    copyCueActive
  };
}

function writeHandoffReceiver(element: HTMLElement | null | undefined, progress: number): void {
  const receiverProgress = smoothStep(range01(progress, CONTACT_RECEIVER_START, CONTACT_RECEIVER_END));
  element?.setAttribute('data-r4-handoff-receiver-active', String(receiverProgress > 0.001 && receiverProgress < 0.999));
  element?.setAttribute('data-r4-handoff-receiver-progress', receiverProgress.toFixed(4));
}

class CraneContactTimeline implements SegmentTimelineHandle {
  readonly labels = {
    start: 0,
    copyCue: CRANE_CONTACT_COPY_CUE.atProgress,
    end: 1
  } as const;
  readonly pauses: readonly string[] = [];
  private readonly timeline: PilotProgressTimeline;
  private readonly elevation: TransitionLayerElevation;

  constructor(context: TransitionContext) {
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.timeline = new PilotProgressTimeline({
      from: context.from,
      to: context.to,
      durationMs: context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
      copyCue: CRANE_CONTACT_COPY_CUE,
      sample: sampleCraneContact,
      render: (progress) => {
        this.elevation.elevate();
        renderCraneAnimationProgress(rootFor(context.from.element, 'crane-animation'), progress, { playback: true });
        renderContactProgress(rootFor(context.to.element, 'contact'), smoothStep(range01(progress, CONTACT_RECEIVER_START, CONTACT_RECEIVER_END)));
        writeHandoffReceiver(context.to.element, progress);
        context.from.element?.setAttribute('data-r4-transition', 'crane-contact-media');
        context.to.element?.setAttribute('data-r4-transition', 'crane-contact-copy-cue');
      }
    });
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
    this.elevation.restore();
    this.timeline.dispose();
  }

  sample(progress: number) {
    return this.timeline.sample(progress);
  }
}

export function createCraneContactTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'crane-contact',
    requiredMilestones: ['targetReady', 'mediaReady', 'buildReady'],
    copyCue: CRANE_CONTACT_COPY_CUE,
    mediaPlayback: [
      {
        id: 'crane-transition',
        media: [CRANE_FIGURE_MEDIA_KEY, CRANE_FLOCK_MEDIA_KEY],
        forward: { mode: 'timeline', required: true },
        reverse: { mode: 'static-fallback', required: false },
        readyMilestones: ['targetReady', 'mediaReady'],
        terminalFallbackScene: 'contact',
        preparingTimeoutMs: 1800
      }
    ],
    reducedMotionFallback: (context) => {
      renderCraneAnimationProgress(rootFor(context.from.element, 'crane-animation'), 1);
      renderContactProgress(rootFor(context.to.element, 'contact'), 1);
      writeHandoffReceiver(context.to.element, 1);
      context.from.setVisibility(fadeVisibility(0));
      context.to.setVisibility(fadeVisibility(1));
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new CraneContactTimeline(context);
    }
  };
}

export const craneContactTransition = createCraneContactTransition();
