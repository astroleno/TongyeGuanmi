import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const FIGURE3_MEDIA_KEY = 'figure3-alpha-scrub';
export const FIGURE3_VIDEO_SRC = new URL('../../../../assets/figure3-alpha-scrub.webm', import.meta.url).href;
export const FIGURE3_POSTER_SRC = new URL('../../../../assets/figure3-alpha-poster.png', import.meta.url).href;

export type Figure3RenderState = {
  progress: number;
  fillOpacity: number;
  videoOpacity: number;
  videoScale: number;
};

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

function seekVideo(video: HTMLVideoElement | null | undefined, progress: number): void {
  if (!video) {
    return;
  }
  video.loop = false;
  video.pause();
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5.04;
  const targetTime = Math.max(0, Math.min(duration - 0.02, progress * duration));
  if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.016) {
    video.currentTime = targetTime;
  }
}

export function renderFigure3AnimationProgress(root: HTMLElement | null | undefined, rawProgress: number): Figure3RenderState {
  const section = root?.matches('[data-r4-scene="figure3-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="figure3-animation"]') ?? null;
  const progress = acceleratedProgress(rawProgress);
  const fillOpacity = smoothStep(range01(progress, 0.86, 0.995));
  const videoOpacity = 1 - smoothStep(range01(progress, 0.93, 1));
  const backdropSettle = smoothStep(range01(progress, 0.06, 0.84));
  const videoScale = 1.004 + progress * 0.052;

  section?.style.setProperty('--figure3-progress', progress.toFixed(4));
  section?.style.setProperty('--figure3-fill-opacity', fillOpacity.toFixed(4));
  section?.style.setProperty('--figure3-video-opacity', videoOpacity.toFixed(4));
  section?.style.setProperty('--figure3-backdrop-opacity', (1 - backdropSettle * 0.46).toFixed(4));
  section?.style.setProperty('--figure3-backdrop-scale', (1.06 + backdropSettle * 0.08).toFixed(4));
  section?.style.setProperty('--figure3-video-scale', videoScale.toFixed(4));
  section?.setAttribute('data-figure3-progress', progress.toFixed(4));
  seekVideo(section?.querySelector<HTMLVideoElement>('[data-figure3-alpha-video]'), progress);

  return { progress, fillOpacity, videoOpacity, videoScale };
}

function Figure3AnimationScene({ role, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (role === 'current' && rootRef.current) {
      renderFigure3AnimationProgress(rootRef.current, 1);
    }
  }, [role]);

  return (
    <article
      ref={(element) => {
        rootRef.current = element;
        registerHandle?.('field', element);
        if (element && !initializedRef.current) {
          renderFigure3AnimationProgress(element, role === 'current' ? 1 : 0);
          initializedRef.current = true;
        }
      }}
      className="figure3-transition r4-figure3-animation"
      data-r4-scene="figure3-animation"
      data-figure3-transition
      data-figure3-duration="2"
      data-figure3-scroll-vh="20"
      data-figure3-video-duration="5.04"
      aria-label="Figure 3 fabric visual scene"
    >
      <div className="figure3-transition__sticky">
        <div className="figure3-transition__backdrop" aria-hidden="true" />
        <div className="figure3-transition__stage" aria-hidden="true">
          <video
            ref={(element) => registerHandle?.('figure3-video', element)}
            className="figure3-transition__video"
            data-figure3-alpha-video
            data-media-key={FIGURE3_MEDIA_KEY}
            src={FIGURE3_VIDEO_SRC}
            poster={FIGURE3_POSTER_SRC}
            muted
            preload="auto"
            playsInline
          />
          <div className="figure3-transition__fill" data-figure3-fill aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}

export const figure3AnimationScene: SceneModule = {
  id: 'figure3-animation',
  Component: Figure3AnimationScene,
  requiredHandles: ['field', 'figure3-video'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};
