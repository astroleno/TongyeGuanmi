import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import {
  CRANE_FIGURE_MEDIA_KEY,
  CRANE_FLOCK_MEDIA_KEY,
  createCranePresentedFrameBarrier,
  disposeCranePresentedFrameBarrier,
  craneSegmentProgressReceipt,
  prepareCraneAnimationFrame,
  renderCraneAnimationProgress,
  requestCraneAnimationFrame
} from '../../scenes/crane-animation';
import {
  releaseContactEntrance,
  renderContactEntrance
} from '../../scenes/contact';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import { createRuntimeSegmentProgressReceipt } from '../../story/presented-progress-coordinator';
import type {
  Direction,
  LayerVisibilityState,
  SegmentProgressReceipt,
  SegmentProgressRequest,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';
import type { PresentedFrameBarrier } from '../../media/presented-frame-barrier';

export const CRANE_CONTACT_COPY_CUE = { targetScene: 'contact', atProgress: 0.8 } as const;
const CRANE_MOTION_END = 1;
const CONTACT_RECEIVER_START = CRANE_CONTACT_COPY_CUE.atProgress;
const CONTACT_RECEIVER_END = 1;
const transitionRunByElement = new WeakMap<HTMLElement, string>();

function rootFor(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  if (!element) {
    return null;
  }
  return element.matches(`[data-r4-scene="${scene}"]`)
    || element.dataset.r4Scene === scene
    ? element
    : element.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`);
}

function sampleCraneContact(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState; copyCueActive: boolean } {
  const copyCueActive = progress >= CRANE_CONTACT_COPY_CUE.atProgress;
  return {
    from: progress >= 0.999 ? hiddenVisibility() : holdVisibility(false),
    to: progress >= CONTACT_RECEIVER_START ? holdVisibility(false) : hiddenVisibility(),
    copyCueActive
  };
}

function renderContactSceneEntrance(
  root: HTMLElement | null | undefined,
  progress: number,
  runId: string
): void {
  const receiverProgress = range01(progress, CONTACT_RECEIVER_START, CONTACT_RECEIVER_END);
  renderContactEntrance(
    rootFor(root, 'contact'),
    progress >= CRANE_CONTACT_COPY_CUE.atProgress ? 1 : 0,
    receiverProgress,
    runId
  );
}

function writeTransitionRun(
  element: HTMLElement | null | undefined,
  name: string,
  runId: string
): void {
  if (!element) {
    return;
  }
  transitionRunByElement.set(element, runId);
  element.dataset.r4Transition = name;
  element.dataset.r4TransitionRun = runId;
}

function clearTransitionRun(element: HTMLElement | null | undefined, runId: string): void {
  if (!element || transitionRunByElement.get(element) !== runId) {
    return;
  }
  transitionRunByElement.delete(element);
  delete element.dataset.r4Transition;
  delete element.dataset.r4TransitionRun;
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
  private readonly runId: string;
  private readonly craneRoot: HTMLElement | null;
  private readonly contactRoot: HTMLElement | null;
  private readonly frameBarrier: PresentedFrameBarrier | undefined;
  private renderedProgress = 0;
  private playbackDirection: Direction;

  constructor(context: TransitionContext) {
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.runId = context.runId;
    this.craneRoot = rootFor(context.from.element, 'crane-animation');
    this.contactRoot = rootFor(context.to.element, 'contact');
    this.frameBarrier = this.craneRoot?.querySelector('[data-crane-figure-video]')
      ? createCranePresentedFrameBarrier(this.craneRoot)
      : undefined;
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
        renderCraneAnimationProgress(this.craneRoot, craneProgress, {
          mediaRun: {
            runId: context.runId,
            direction: this.playbackDirection,
            reducedMotion: context.prefersReducedMotion
          }
        });
        this.renderedProgress = progress;
        renderContactSceneEntrance(this.contactRoot, progress, context.runId);
        writeTransitionRun(this.craneRoot, 'crane-contact-media', context.runId);
        writeTransitionRun(this.contactRoot, 'crane-contact-copy-cue', context.runId);
      }
    });
  }

  play(): Promise<void> {
    this.playbackDirection = 1;
    return this.timeline.play();
  }

  progress(value: number): void {
    this.timeline.progress(value);
  }

  reverse(): Promise<void> {
    this.playbackDirection = -1;
    return this.timeline.reverse();
  }

  jumpToEnd(direction: Direction): void {
    this.playbackDirection = direction;
    this.timeline.jumpToEnd(direction);
  }

  presentProgress(request: SegmentProgressRequest): Promise<SegmentProgressReceipt> {
    if (!this.frameBarrier) {
      return Promise.resolve(createRuntimeSegmentProgressReceipt(request));
    }
    this.playbackDirection = request.direction;
    return requestCraneAnimationFrame(
      this.craneRoot,
      request.desiredProgress,
      {
        runId: request.runId,
        direction: request.direction,
        sequence: request.sequence,
        reducedMotion: false,
        signal: request.signal
      },
      this.frameBarrier
    ).then((receipt) => craneSegmentProgressReceipt(request, receipt));
  }

  dispose(): void {
    const progress = this.timeline.snapshot.progress;
    this.elevation.restore();
    if (progress >= 0.999 || progress <= 0.001) {
      releaseContactEntrance(
        this.contactRoot,
        this.runId,
        progress
      );
    }
    clearTransitionRun(this.craneRoot, this.runId);
    clearTransitionRun(this.contactRoot, this.runId);
    disposeCranePresentedFrameBarrier(this.craneRoot);
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
        forward: { mode: 'frame-lock', required: true },
        reverse: { mode: 'frame-lock', required: true },
        readyMilestones: ['targetReady', 'mediaReady'],
        terminalFallbackScene: 'contact',
        preparingTimeoutMs: 1800
      }
    ],
    reducedMotionFallback: async (context) => {
      const endpoint = context.direction === 1 ? 1 : 0;
      const source = rootFor(context.from.element, 'crane-animation');
      if (source?.querySelector('[data-crane-figure-video]')) {
        await prepareCraneAnimationFrame(source, endpoint, {
          runId: context.runId,
          direction: context.direction,
          reducedMotion: true
        });
      }
      renderCraneAnimationProgress(source, endpoint, {
        mediaRun: {
          runId: context.runId,
          direction: context.direction,
          reducedMotion: true
        }
      });
      const contact = rootFor(context.to.element, 'contact');
      renderContactSceneEntrance(contact, endpoint, context.runId);
      releaseContactEntrance(contact, context.runId, endpoint);
      context.from.setVisibility(context.direction === 1 ? hiddenVisibility() : holdVisibility(true));
      context.to.setVisibility(context.direction === 1 ? holdVisibility(true) : hiddenVisibility());
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const crane = rootFor(context.from.element, 'crane-animation');
      if (crane?.querySelector('[data-crane-figure-video]')) {
        await prepareCraneAnimationFrame(
          crane,
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
