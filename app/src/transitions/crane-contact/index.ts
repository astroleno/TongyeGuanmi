import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import { CRANE_FIGURE_MEDIA_KEY, CRANE_FLOCK_MEDIA_KEY, renderCraneAnimationProgress } from '../../scenes/crane-animation';
import { renderContactProgress } from '../../scenes/contact';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import type { Direction, LayerVisibilityState, SegmentTimelineHandle, TransitionContext, TransitionModule } from '../../story/types';

export const CRANE_CONTACT_COPY_CUE = { targetScene: 'contact', atProgress: 0.8 } as const;
const CRANE_MOTION_END = 1;
const CONTACT_RECEIVER_START = CRANE_CONTACT_COPY_CUE.atProgress;
const CONTACT_RECEIVER_END = 1;

function rootFor(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleCraneContact(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState; copyCueActive: boolean } {
  const copyCueActive = progress >= CRANE_CONTACT_COPY_CUE.atProgress;
  return {
    from: progress >= 0.999 ? hiddenVisibility() : holdVisibility(false),
    to: progress >= CONTACT_RECEIVER_START ? holdVisibility(false) : hiddenVisibility(),
    copyCueActive
  };
}

function writeHandoffReceiver(element: HTMLElement | null | undefined, progress: number): void {
  const receiverProgress = range01(progress, CONTACT_RECEIVER_START, CONTACT_RECEIVER_END);
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

class CraneContactTimeline implements SegmentTimelineHandle {
  readonly labels = {
    start: 0,
    copyCue: CRANE_CONTACT_COPY_CUE.atProgress,
    end: 1
  } as const;
  readonly pauses: readonly string[] = [];
  private readonly timeline: PilotProgressTimeline;
  private readonly elevation: TransitionLayerElevation;
  private readonly toElement: HTMLElement | null | undefined;
  private renderedProgress = 0;

  constructor(context: TransitionContext) {
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.toElement = context.to.element;
    this.timeline = new PilotProgressTimeline({
      from: context.from,
      to: context.to,
      durationMs: context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
      easing: 'linear',
      copyCue: CRANE_CONTACT_COPY_CUE,
      sample: sampleCraneContact,
      render: (progress) => {
        const movingForward = progress >= this.renderedProgress;
        const craneProgress = range01(progress, 0, CRANE_MOTION_END);
        const mediaOptions = movingForward ? { playback: true } : { reverseScrub: true };
        this.elevation.elevate();
        renderCraneAnimationProgress(
          rootFor(context.from.element, 'crane-animation'),
          craneProgress,
          mediaOptions
        );
        this.renderedProgress = progress;
        renderContactProgress(
          rootFor(context.to.element, 'contact'),
          progress >= CRANE_CONTACT_COPY_CUE.atProgress ? 1 : 0
        );
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
    clearHandoffReceiver(this.toElement);
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
        reverse: { mode: 'timeline', required: true },
        readyMilestones: ['targetReady', 'mediaReady'],
        terminalFallbackScene: 'contact',
        preparingTimeoutMs: 1800
      }
    ],
    reducedMotionFallback: (context) => {
      renderCraneAnimationProgress(rootFor(context.from.element, 'crane-animation'), 1);
      renderContactProgress(rootFor(context.to.element, 'contact'), 1);
      writeHandoffReceiver(context.to.element, 1);
      context.from.setVisibility(hiddenVisibility());
      context.to.setVisibility(holdVisibility(true));
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
