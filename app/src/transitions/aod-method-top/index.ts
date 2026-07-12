import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, range01, smoothStep } from '../../pilot/visibility';
import { AOD_MEDIA_KEY } from './media';
import { renderAodTransitionProgress } from '../../scenes/aod-animation';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput
} from '../../media/timeline-video-driver';
import type {
  Direction,
  LayerVisibilityState,
  TransitionContext,
  TransitionModule
} from '../../story/types';

export const AOD_METHOD_TOP_DURATION_MS = 2600;
export const AOD_METHOD_COPY_CUE = { targetScene: 'method-top', atProgress: 0.8 } as const;

function videoIn(root: HTMLElement | null | undefined): HTMLVideoElement | null {
  return root?.querySelector<HTMLVideoElement>('[data-aod-figure-video]') ?? null;
}

function sampleAodMethodTop(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState; copyCueActive: boolean } {
  const copyCueActive = progress >= AOD_METHOD_COPY_CUE.atProgress;
  const aodOpacity = 1 - smoothStep(range01(progress, 0.70, 1));
  return {
    from: fadeVisibility(aodOpacity),
    to: fadeVisibility(1),
    copyCueActive
  };
}

class AodMethodTopTimeline extends PilotProgressTimeline {
  private readonly context: TransitionContext;
  private readonly getVideo: (() => HTMLVideoElement | null) | undefined;
  private readonly mediaDirection: { current: Direction };

  constructor(
    context: TransitionContext,
    options: {
      durationMs: number;
      getVideo?: (() => HTMLVideoElement | null) | undefined;
    }
  ) {
    const mediaDirection = { current: context.direction };
    super({
      from: context.from,
      to: context.to,
      durationMs: options.durationMs,
      direction: context.direction,
      copyCue: AOD_METHOD_COPY_CUE,
      sample: sampleAodMethodTop,
      render: (progress) => {
        renderAodTransitionProgress(context.from.element, progress);
        const video = options.getVideo?.() ?? videoIn(context.from.element);
        driveTimelineVideo(video, aodMediaInput(context, mediaDirection.current, progress));
        context.from.element?.setAttribute('data-r3-transition', 'aod-method-top');
        context.to.element?.setAttribute('data-r3-transition', 'aod-method-top');
        context.to.element?.setAttribute('data-aod-method-transition-progress', progress.toFixed(4));
      }
    });
    this.context = context;
    this.getVideo = options.getVideo;
    this.mediaDirection = mediaDirection;
  }

  override async play(): Promise<void> {
    this.mediaDirection.current = 1;
    const video = this.getVideo?.() ?? videoIn(this.context.from.element);
    video?.pause();
    if (video) {
      video.playbackRate = 1;
    }
    await super.play();
  }

  override jumpToEnd(direction: Direction): void {
    this.mediaDirection.current = direction;
    super.jumpToEnd(direction);
  }

  override async reverse(): Promise<void> {
    this.mediaDirection.current = -1;
    const video = this.getVideo?.() ?? videoIn(this.context.from.element);
    video?.pause();
    if (video) {
      video.playbackRate = 1;
    }
    await super.reverse();
  }

  override dispose(): void {
    super.dispose();
    this.context.from.element?.removeAttribute('data-r3-transition');
    this.context.to.element?.removeAttribute('data-r3-transition');
    this.context.to.element?.removeAttribute('data-aod-method-transition-progress');
    const aodSection = this.context.from.element?.matches('[data-aod-transition]')
      ? this.context.from.element
      : this.context.from.element?.querySelector<HTMLElement>('[data-aod-transition]');
    aodSection?.removeAttribute('data-aod-alpha-composite');
    const video = this.getVideo?.() ?? videoIn(this.context.from.element);
    if (video) {
      disposeTimelineVideoDriver(video);
    }
  }
}

function aodMediaInput(
  context: TransitionContext,
  direction: Direction,
  progress: number
): TimelineVideoDriveInput {
  return {
    runId: context.runId,
    direction,
    progress,
    durationFallbackSeconds: 5.03,
    endEpsilonSeconds: 0.02,
    timelineDurationMs: AOD_METHOD_TOP_DURATION_MS,
    mode: 'timeline',
    reducedMotion: context.prefersReducedMotion
  };
}

export function createAodMethodTopTransition(options: {
  delayMs?: () => number;
  getVideo?: (() => HTMLVideoElement | null) | undefined;
} = {}): TransitionModule {
  return {
    id: 'aod-method-top',
    requiredMilestones: ['targetReady', 'mediaReady', 'buildReady'],
    copyCue: AOD_METHOD_COPY_CUE,
    mediaPlayback: [
      {
        id: 'aod-front-figure',
        media: [AOD_MEDIA_KEY],
        forward: { mode: 'timeline', required: true },
        reverse: { mode: 'timeline', required: true },
        readyMilestones: ['targetReady', 'mediaReady'],
        terminalFallbackScene: 'method-top',
        preparingTimeoutMs: 1800
      }
    ],
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const getVideo = options.getVideo
        ?? (() => videoIn(context.from.element));
      const video = getVideo();
      if (video && !context.prefersReducedMotion) {
        const frame = await prepareTimelineVideoFrame(
          video,
          aodMediaInput(context, context.direction, context.direction === 1 ? 0 : 1)
        );
        if (frame?.status !== 'ready') {
          throw new Error(`AOD ${context.direction === 1 ? 'forward' : 'reverse'} frame preparation became stale`);
        }
      }
      return new AodMethodTopTimeline(context, {
        durationMs: context.prefersReducedMotion ? 0 : AOD_METHOD_TOP_DURATION_MS,
        getVideo
      });
    }
  };
}
