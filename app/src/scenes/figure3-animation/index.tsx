import { useEffect, useRef } from 'react';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput
} from '../../media/timeline-video-driver';
import { AlphaVideoSources, browserPrefersHevcAlpha } from '../../media/alpha-video-sources';
import { FIGURE3_SERVICES_DURATION_MS } from '../../story/timings';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const FIGURE3_MEDIA_KEY = 'figure3-motion';
export const FIGURE3_VIDEO_SRC = new URL('../../../../assets/figure3-motion.webm', import.meta.url).href;
export const FIGURE3_HEVC_ALPHA_SRC = new URL('../../../../assets/figure3-motion-hevc-alpha.mp4', import.meta.url).href;
export const FIGURE3_END_SECONDS = 2.567;

export type Figure3RenderState = {
  progress: number;
  fillOpacity: number;
  videoOpacity: number;
  videoScale: number;
};

export type Figure3MediaRun = Readonly<{
  runId: string;
  direction: 1 | -1;
  reducedMotion?: boolean;
}>;

type Figure3RenderOptions = Readonly<{
  mediaRun?: Figure3MediaRun;
}>;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
};
const range01 = (value: number, start: number, end: number) => clamp((value - start) / Math.max(0.0001, end - start));
const acceleratedProgress = (progress: number) => {
  const p = clamp(progress);
  return clamp(0.78 * p + 0.22 * p * p);
};

export const FIGURE3_HOLD_PROGRESS = 0;

function figure3Section(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="figure3-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="figure3-animation"]') ?? null;
}

function figure3MediaInput(progress: number, mediaRun: Figure3MediaRun): TimelineVideoDriveInput {
  return {
    runId: mediaRun.runId,
    direction: mediaRun.direction,
    progress,
    durationFallbackSeconds: 2.6,
    startSeconds: 0,
    endSeconds: FIGURE3_END_SECONDS,
    timelineDurationMs: FIGURE3_SERVICES_DURATION_MS,
    mode: mediaRun.direction === 1 ? 'native-preferred' : 'timeline',
    nativePlaybackDirection: 1,
    reducedMotion: Boolean(mediaRun.reducedMotion),
    allowSeekedFrameFallback: browserPrefersHevcAlpha()
  };
}

export function renderFigure3AnimationProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  options: Figure3RenderOptions = {}
): Figure3RenderState {
  const section = figure3Section(root);
  const progress = acceleratedProgress(rawProgress);
  const fillOpacity = 0;
  // The segment layer owns the Figure3 fade. Keeping the presented video
  // opaque through its terminal frame avoids a second binary fade at settle.
  const videoOpacity = 1;
  const backdropSettle = smoothStep(range01(progress, 0.06, 0.84));
  const videoScale = 1.004 + progress * 0.052;
  const progressValue = progress.toFixed(4);

  section?.style.setProperty('--figure3-progress', progressValue);
  section?.style.setProperty('--figure3-fill-opacity', fillOpacity.toFixed(4));
  section?.style.setProperty('--figure3-video-opacity', videoOpacity.toFixed(4));
  section?.style.setProperty('--figure3-backdrop-opacity', (1 - backdropSettle * 0.46).toFixed(4));
  section?.style.setProperty('--figure3-backdrop-scale', (1.06 + backdropSettle * 0.08).toFixed(4));
  section?.style.setProperty('--figure3-video-scale', videoScale.toFixed(4));
  section?.setAttribute('data-figure3-progress', progressValue);
  if (options.mediaRun) {
    const video = section?.querySelector<HTMLVideoElement>('[data-figure3-alpha-video]');
    if (video && (
      video.dataset.timelineVideoRun !== options.mediaRun.runId
      || video.dataset.timelineVideoDirection !== String(options.mediaRun.direction)
      || video.dataset.timelineVideoProgress !== progressValue
    )) {
      driveTimelineVideo(video, figure3MediaInput(progress, options.mediaRun));
    }
  }

  return { progress, fillOpacity, videoOpacity, videoScale };
}

export function renderFigure3Hold(root: HTMLElement | null): void {
  renderFigure3AnimationProgress(root, FIGURE3_HOLD_PROGRESS);
}

export function prepareFigure3AnimationFrame(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: Figure3MediaRun
): Promise<void> {
  const video = figure3Section(root)?.querySelector<HTMLVideoElement>('[data-figure3-alpha-video]');
  if (!video) {
    return Promise.reject(new Error('figure3 media unavailable'));
  }
  return prepareTimelineVideoFrame(video, figure3MediaInput(acceleratedProgress(rawProgress), mediaRun)).then((result) => {
    if (result?.status !== 'ready') {
      throw new Error('figure3 frame stale');
    }
  });
}

function Figure3AnimationScene({ registerHandle }: SceneComponentProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => () => {
    if (videoRef.current) {
      disposeTimelineVideoDriver(videoRef.current);
      videoRef.current.pause();
    }
  }, []);

  return (
    <article
      ref={(element) => {
        registerHandle?.('field', element);
      }}
      className="figure3-transition r4-figure3-animation"
      data-r4-scene="figure3-animation"
      data-figure3-transition
      data-figure3-duration="2"
      data-figure3-scroll-vh="20"
      data-figure3-video-duration="2.6"
      aria-label="Figure 3 fabric visual scene"
    >
      <div className="figure3-transition__sticky">
        <div className="figure3-transition__backdrop" aria-hidden="true" />
        <div className="figure3-transition__stage" aria-hidden="true">
          <video
            ref={(element) => {
              videoRef.current = element;
              registerHandle?.('figure3-video', element);
            }}
            className="figure3-transition__video"
            data-figure3-alpha-video
            data-media-key={FIGURE3_MEDIA_KEY}
            muted
            preload="auto"
            playsInline
          >
            <AlphaVideoSources
              webm={FIGURE3_VIDEO_SRC}
              hevc={FIGURE3_HEVC_ALPHA_SRC}
            />
          </video>
          <div className="figure3-transition__fill" data-figure3-fill aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}

export const figure3AnimationScene: SceneModule = {
  id: 'figure3-animation',
  Component: Figure3AnimationScene,
  renderHold: renderFigure3Hold,
  requiredHandles: ['field', 'figure3-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
