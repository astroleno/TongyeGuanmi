import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, hiddenVisibility, range01, smoothStep } from '../../pilot/visibility';
import {
  AOD_MEDIA_KEY,
  beginAodExitMedia,
  disposeAodExitMedia,
  prepareAodAnimationFrame,
  renderAodExitProgress
} from '../../scenes/aod-animation';
import { renderMethodTopEntrance } from '../../scenes/method-top';
import type {
  Direction,
  LayerVisibilityState,
  TransitionContext,
  TransitionModule
} from '../../story/types';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';

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
    to: progress === 0 ? hiddenVisibility() : fadeVisibility(1),
    copyCueActive
  };
}

class AodMethodTopTimeline extends PilotProgressTimeline {
  private readonly context: TransitionContext;
  private readonly getVideo: (() => HTMLVideoElement | null) | undefined;
  private readonly mediaDirection: { current: Direction };
  private readonly sourceElevation: TransitionLayerElevation | null;

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
        renderAodExitProgress(context.from.element, progress, {
          runId: context.runId,
          direction: mediaDirection.current,
          reducedMotion: context.prefersReducedMotion,
          timelineDurationMs: AOD_METHOD_TOP_DURATION_MS,
          video: options.getVideo?.() ?? videoIn(context.from.element)
        });
        renderMethodTopEntrance(context.to.element, progress >= AOD_METHOD_COPY_CUE.atProgress ? 1 : 0);
      }
    });
    this.context = context;
    this.getVideo = options.getVideo;
    this.mediaDirection = mediaDirection;
    this.sourceElevation = context.direction === -1
      ? createTransitionLayerElevation(context.from.element)
      : null;
    this.sourceElevation?.elevate();
  }

  override async play(): Promise<void> {
    this.mediaDirection.current = 1;
    beginAodExitMedia(
      this.context.from.element,
      this.context.runId,
      this.getVideo?.() ?? videoIn(this.context.from.element)
    );
    await super.play();
  }

  override jumpToEnd(direction: Direction): void {
    this.mediaDirection.current = direction;
    super.jumpToEnd(direction);
  }

  override async reverse(): Promise<void> {
    this.mediaDirection.current = -1;
    beginAodExitMedia(
      this.context.from.element,
      this.context.runId,
      this.getVideo?.() ?? videoIn(this.context.from.element)
    );
    await super.reverse();
  }

  override dispose(): void {
    super.dispose();
    this.sourceElevation?.restore();
    const video = this.getVideo?.() ?? videoIn(this.context.from.element);
    disposeAodExitMedia(this.context.from.element, this.context.runId, video);
  }
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
        await prepareAodAnimationFrame(
          context.from.element,
          context.direction === 1 ? 0 : 1,
          {
            runId: context.runId,
            direction: context.direction,
            reducedMotion: context.prefersReducedMotion,
            timelineDurationMs: AOD_METHOD_TOP_DURATION_MS,
            video
          }
        );
      }
      return new AodMethodTopTimeline(context, {
        durationMs: context.prefersReducedMotion ? 0 : AOD_METHOD_TOP_DURATION_MS,
        getVideo
      });
    }
  };
}
