import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, range01, smoothStep } from '../../pilot/visibility';
import { AOD_MEDIA_KEY } from './media';
import { methodReadingScrollport, positionMethodReadingAtEdge } from '../../scenes/method-top';
import type {
  Direction,
  LayerVisibilityState,
  TransitionContext,
  TransitionModule
} from '../../story/types';

export const AOD_METHOD_TOP_DURATION_MS = 2600;
export const AOD_METHOD_COPY_CUE = { targetScene: 'method-top', atProgress: 0.8 } as const;

type AodTransitionConfig = {
  durationSeconds: number;
  videoDurationFallback: number;
  fullscreenStartSeconds: number;
  fullscreenEndSeconds: number;
  backdropExitStartSeconds: number;
  backdropExitEndSeconds: number;
  figureStartScale: number;
  figureStartYVh: number;
};

const HOMEPAGE_AOD_CONFIG: AodTransitionConfig = {
  durationSeconds: 2,
  videoDurationFallback: 5.03,
  fullscreenStartSeconds: 0,
  fullscreenEndSeconds: 0.85,
  backdropExitStartSeconds: 0.18,
  backdropExitEndSeconds: 1.55,
  figureStartScale: 1,
  figureStartYVh: 10.5
};

function viewportHeight(): number {
  return typeof window === 'undefined' ? 800 : window.innerHeight;
}

function acceleratedProgress(rawProgress: number): number {
  const t = Math.min(1, Math.max(0, rawProgress));
  return Math.min(1, Math.max(0, 0.78 * t + 0.22 * t * t));
}

function secondsRange(progress: number, startSeconds: number, endSeconds: number, durationSeconds: number): number {
  return range01(progress, startSeconds / durationSeconds, endSeconds / durationSeconds);
}

function formatPx(value: number): string {
  return `${value.toFixed(2)}px`;
}

function aodSection(root: HTMLElement | null | undefined): HTMLElement | null {
  if (!root) {
    return null;
  }
  return root.matches('[data-aod-transition]')
    ? root
    : root.querySelector<HTMLElement>('[data-aod-transition]');
}

function videoIn(root: HTMLElement | null | undefined): HTMLVideoElement | null {
  return root?.querySelector<HTMLVideoElement>('[data-aod-figure-video]') ?? null;
}

export function renderAodTransitionProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  options: { video?: HTMLVideoElement | null | undefined } = {}
): void {
  const section = aodSection(root);
  if (!section) {
    return;
  }

  const p = acceleratedProgress(rawProgress);
  const config = HOMEPAGE_AOD_CONFIG;
  const backdropExit = smoothStep(secondsRange(
    p,
    config.backdropExitStartSeconds,
    config.backdropExitEndSeconds,
    config.durationSeconds
  ));
  const fullscreen = smoothStep(secondsRange(
    p,
    config.fullscreenStartSeconds,
    config.fullscreenEndSeconds,
    config.durationSeconds
  ));
  const upExitY = viewportHeight() * -1.08;
  const backgroundFade = 1 - backdropExit;
  const paperWash = smoothStep(range01(p, 0.42, 0.86));
  const bottomMist = smoothStep(range01(p, 0.56, 1));
  const paperSolid = smoothStep(range01(p, 0.70, 1));
  const methodEnter = smoothStep(range01(p, 0.44, 0.86));
  const figureScale = config.figureStartScale + fullscreen * (1 - config.figureStartScale);
  const figureY = (1 - fullscreen) * viewportHeight() * (config.figureStartYVh / 100);

  section.style.setProperty('--aod-transition-progress', p.toFixed(4));
  section.style.setProperty('--aod-transition-sun-x', '0px');
  section.style.setProperty('--aod-transition-sun-y', formatPx(backdropExit * upExitY * 1.02));
  section.style.setProperty('--aod-transition-sun-opacity', (0.96 * backgroundFade).toFixed(4));
  section.style.setProperty('--aod-transition-sun-scale', (1 + backdropExit * 0.025).toFixed(4));
  section.style.setProperty('--aod-transition-cloud-x', '0px');
  section.style.setProperty('--aod-transition-cloud-y', formatPx(backdropExit * upExitY * 1.16));
  section.style.setProperty('--aod-transition-cloud-opacity', (0.98 * backgroundFade).toFixed(4));
  section.style.setProperty('--aod-transition-cloud-scale', (1 + backdropExit * 0.025).toFixed(4));
  section.style.setProperty('--aod-transition-figure-y', formatPx(figureY));
  section.style.setProperty('--aod-transition-figure-scale', figureScale.toFixed(4));
  section.style.setProperty('--aod-transition-paper-wash-opacity', (paperWash * 0.92).toFixed(4));
  section.style.setProperty('--aod-transition-bottom-mist-opacity', (bottomMist * 0.96).toFixed(4));
  section.style.setProperty('--aod-transition-bottom-mist-y', formatPx((1 - bottomMist) * 18));
  section.style.setProperty('--aod-transition-paper-solid-opacity', paperSolid.toFixed(4));
  section.style.setProperty('--aod-transition-method-progress', methodEnter.toFixed(4));
  section.style.setProperty('--aod-transition-method-y', formatPx((1 - methodEnter) * 26));
  section.style.setProperty('--aod-transition-method-blur', `${((1 - methodEnter) * 9).toFixed(2)}px`);

  for (let index = 0; index < 9; index += 1) {
    const itemProgress = smoothStep(range01(p, 0.40 + index * 0.03, 0.58 + index * 0.03));
    section.style.setProperty(`--aod-method-item-${index}`, itemProgress.toFixed(4));
    section.style.setProperty(`--aod-method-y-${index}`, formatPx((1 - itemProgress) * 18));
  }

  const video = options.video ?? videoIn(section);
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    const targetTime = Math.max(0, Math.min(video.duration - 0.02, p * video.duration));
    if (Math.abs(video.currentTime - targetTime) > 0.016) {
      video.currentTime = targetTime;
    }
  }
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
