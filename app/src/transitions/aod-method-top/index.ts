import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, range01, smoothStep } from '../../pilot/visibility';
import { AOD_MEDIA_KEY } from './media';
import { renderAodTransitionProgress } from '../../scenes/aod-animation';
import { methodReadingScrollport, positionMethodReadingAtEdge } from '../../scenes/method-top';
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
  const methodOpacity = copyCueActive ? Math.max(0.02, smoothStep(range01(progress, 0.8, 1))) : 0;
  const aodOpacity = 1 - smoothStep(range01(progress, 0.70, 1));
  return {
    from: fadeVisibility(aodOpacity),
    to: fadeVisibility(methodOpacity),
    copyCueActive
  };
}

class AodMethodTopTimeline extends PilotProgressTimeline {
  private readonly context: TransitionContext;
  private readonly getVideo: (() => HTMLVideoElement | null) | undefined;

  constructor(
    context: TransitionContext,
    options: {
      durationMs: number;
      getVideo?: (() => HTMLVideoElement | null) | undefined;
    }
  ) {
    super({
      from: context.from,
      to: context.to,
      durationMs: options.durationMs,
      direction: context.direction,
      copyCue: AOD_METHOD_COPY_CUE,
      sample: sampleAodMethodTop,
      render: (progress) => {
        if (context.direction === 1 && methodReadingScrollport(context.to.element)) {
          positionMethodReadingAtEdge(context.to.element, 'top');
        }
        renderAodTransitionProgress(context.from.element, progress, { video: options.getVideo?.() });
        context.to.element?.setAttribute('data-r3-transition', 'aod-method-top');
      }
    });
    this.context = context;
    this.getVideo = options.getVideo;
  }

  override async play(): Promise<void> {
    positionMethodReadingAtEdge(this.context.to.element, 'top');
    const video = this.getVideo?.() ?? videoIn(this.context.from.element);
    video?.pause();
    if (video) {
      video.playbackRate = 1;
    }
    await super.play();
    positionMethodReadingAtEdge(this.context.to.element, 'top');
  }

  override jumpToEnd(direction: Direction): void {
    if (direction === 1) {
      positionMethodReadingAtEdge(this.context.to.element, 'top');
    }
    super.jumpToEnd(direction);
  }

  override async reverse(): Promise<void> {
    const video = this.getVideo?.() ?? videoIn(this.context.from.element);
    video?.pause();
    if (video) {
      video.playbackRate = 1;
    }
    await super.reverse();
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
        reverse: { mode: 'static-fallback', required: false },
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
      return new AodMethodTopTimeline(context, {
        durationMs: context.prefersReducedMotion ? 0 : AOD_METHOD_TOP_DURATION_MS,
        getVideo: options.getVideo
      });
    }
  };
}
