import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import {
  CRANE_FIGURE_MEDIA_KEY,
  CRANE_FLOCK_MEDIA_KEY,
  prepareCraneAnimationFrame,
  renderCraneAnimationProgress
} from '../../scenes/crane-animation';
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
  element?.setAttribute('data-r4-handoff-receiver-progress', receiverProgress.toFixed(4));
  element?.style.setProperty('--r4-handoff-paper-alpha', paperProgress.toFixed(4));
  element?.style.setProperty('--r4-handoff-wash-alpha', paperProgress.toFixed(4));
}

function clearHandoffReceiver(element: HTMLElement | null | undefined): void {
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
  private playbackDirection: Direction;
  private nativePlayback = false;

  constructor(context: TransitionContext) {
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.toElement = context.to.element;
    this.renderedProgress = context.direction === 1 ? 0 : 1;
    this.playbackDirection = context.direction;
    this.timeline = new PilotProgressTimeline({
      from: context.from,
      to: context.to,
      durationMs: context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
      direction: context.direction,
      easing: 'linear',
      copyCue: CRANE_CONTACT_COPY_CUE,
      sample: sampleCraneContact,
      render: (progress) => {
        if (progress > this.renderedProgress + 0.0001) {
          this.playbackDirection = 1;
        } else if (progress < this.renderedProgress - 0.0001) {
          this.playbackDirection = -1;
        }
        const craneProgress = range01(progress, 0, CRANE_MOTION_END);
        this.elevation.elevate();
        renderCraneAnimationProgress(
          rootFor(context.from.element, 'crane-animation'),
          craneProgress,
          {
            mediaRun: {
              runId: context.runId,
              direction: this.playbackDirection,
              nativePlayback: this.nativePlayback,
              reducedMotion: context.prefersReducedMotion
            }
          }
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
    this.playbackDirection = 1;
    this.nativePlayback = true;
    return this.timeline.play().finally(() => {
      this.nativePlayback = false;
    });
  }

  progress(value: number): void {
    this.nativePlayback = false;
    this.timeline.progress(value);
  }

  reverse(): Promise<void> {
    this.playbackDirection = -1;
    this.nativePlayback = false;
    return this.timeline.reverse();
  }

  jumpToEnd(direction: Direction): void {
    this.playbackDirection = direction;
    this.nativePlayback = false;
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

export function createCraneContactTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'crane-contact',
    requiredMilestones: ['targetReady', 'mediaReady', 'buildReady'],
    copyCue: CRANE_CONTACT_COPY_CUE,
    mediaPlayback: [
      {
        id: 'crane-transition',
        media: [CRANE_FIGURE_MEDIA_KEY, CRANE_FLOCK_MEDIA_KEY],
        forward: { mode: 'play', required: true },
        reverse: { mode: 'timeline', required: true },
        readyMilestones: ['targetReady', 'mediaReady'],
        terminalFallbackScene: 'contact',
        preparingTimeoutMs: 1800
      }
    ],
    reducedMotionFallback: (context) => {
      const endpoint = context.direction === 1 ? 1 : 0;
      renderCraneAnimationProgress(rootFor(context.from.element, 'crane-animation'), endpoint, {
        mediaRun: {
          runId: context.runId,
          direction: context.direction,
          reducedMotion: true
        }
      });
      renderContactProgress(rootFor(context.to.element, 'contact'), endpoint);
      writeHandoffReceiver(context.to.element, endpoint);
      context.from.setVisibility(context.direction === 1 ? hiddenVisibility() : holdVisibility(true));
      context.to.setVisibility(context.direction === 1 ? holdVisibility(true) : hiddenVisibility());
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const source = rootFor(context.from.element, 'crane-animation');
      if (source?.querySelector('[data-crane-figure-video]')) {
        await prepareCraneAnimationFrame(
          source,
          context.direction === 1 ? 0 : 1,
          {
            runId: context.runId,
            direction: context.direction,
            reducedMotion: context.prefersReducedMotion
          }
        );
      }
      return new CraneContactTimeline(context);
    }
  };
}

export const craneContactTransition = createCraneContactTransition();
