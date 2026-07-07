import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';

const CLOUD_IMAGE = new URL('../../../../assets/figure2-cloud-source.png', import.meta.url).href;
const FRONT_WHITE_IMAGE = new URL('../../../../assets/figure2-front-white-source.png', import.meta.url).href;
const FRONT_COLOR_IMAGE = new URL('../../../../assets/figure2-front-color-source.png', import.meta.url).href;
const MIDDLE_IMAGE = new URL('../../../../assets/figure2-middle-fresco-opaque-alpha.png', import.meta.url).href;
const MIDDLE_MASK_IMAGE = new URL('../../../../assets/figure2-middle-window-mask.png', import.meta.url).href;
const NEAR_ARCH_IMAGE = new URL('../../../../assets/arch2d-alpha.png', import.meta.url).href;
const LEFT_VIDEO = new URL('../../../../assets/figure2a-alpha-auto.webm', import.meta.url).href;
const RIGHT_VIDEO = new URL('../../../../assets/figure2b-alpha-auto.webm', import.meta.url).href;
const LEFT_POSTER = new URL('../../../../assets/figure2a-alpha-reverse-lite-poster.png', import.meta.url).href;
const RIGHT_POSTER = new URL('../../../../assets/figure2b-alpha-reverse-lite-poster.png', import.meta.url).href;

export type Figure2AnimationRenderState = {
  progress: number;
  stageOpacity: number;
  figureOpacity: number;
  cameraScale: number;
};

export function renderFigure2AnimationProgress(root: HTMLElement | null, progress: number): Figure2AnimationRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = clamped * clamped * (3 - 2 * clamped);
  const stageOpacity = eased;
  const figureOpacity = Math.min(1, eased * 1.14);
  const cameraScale = 1.04 - eased * 0.04;
  root?.style.setProperty('--r4-figure2-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-figure2-stage-opacity', stageOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-figure-opacity', figureOpacity.toFixed(4));
  root?.style.setProperty('--r4-figure2-camera-scale', cameraScale.toFixed(4));
  root?.setAttribute('data-figure2-progress', clamped.toFixed(4));
  return { progress: clamped, stageOpacity, figureOpacity, cameraScale };
}

function Figure2AnimationScene({ hidden, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const leftVideoRef = useRef<HTMLVideoElement | null>(null);
  const rightVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    renderFigure2AnimationProgress(rootRef.current, hidden ? 0 : 1);
  }, [hidden]);

  useEffect(() => {
    const videos = [leftVideoRef.current, rightVideoRef.current].filter(Boolean) as HTMLVideoElement[];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const video of videos) {
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      if (hidden || reduce) {
        video.pause();
      } else {
        void video.play().catch(() => undefined);
      }
    }
  }, [hidden]);

  return (
    <article ref={rootRef} className="r4-figure2" data-r4-scene="figure2-animation">
      <div ref={(element) => registerHandle?.('stage', element)} className="r4-figure2__field">
        <div className="r4-figure2__middle-camera">
          <div className="r4-figure2__window-mask" style={{ WebkitMaskImage: `url(${MIDDLE_MASK_IMAGE})`, maskImage: `url(${MIDDLE_MASK_IMAGE})` }}>
            <img className="r4-figure2__cloud" src={CLOUD_IMAGE} alt="" aria-hidden="true" />
            <div className="r4-figure2__far-arcade" aria-hidden="true">
              <img src={FRONT_WHITE_IMAGE} alt="" />
              <img src={FRONT_COLOR_IMAGE} alt="" />
            </div>
          </div>
          <img className="r4-figure2__middle" src={MIDDLE_IMAGE} alt="" aria-hidden="true" />
        </div>
        <img className="r4-figure2__near-arch" src={NEAR_ARCH_IMAGE} alt="" aria-hidden="true" />
        <div ref={(element) => registerHandle?.('figures', element)} className="r4-figure2__figures" aria-label="子问老子人物动画">
          <figure className="r4-figure2__figure r4-figure2__figure--left">
            <video ref={leftVideoRef} src={LEFT_VIDEO} poster={LEFT_POSTER} muted playsInline preload="auto" aria-hidden="true" />
            <figcaption>问道者</figcaption>
          </figure>
          <figure className="r4-figure2__figure r4-figure2__figure--right">
            <video ref={rightVideoRef} src={RIGHT_VIDEO} poster={RIGHT_POSTER} muted playsInline preload="auto" aria-hidden="true" />
            <figcaption>老子</figcaption>
          </figure>
        </div>
      </div>
    </article>
  );
}

export const figure2AnimationScene: SceneModule = {
  id: 'figure2-animation',
  Component: Figure2AnimationScene,
  requiredHandles: ['stage', 'figures'],
  preload: () => ({ milestones: ['targetReady'] })
};
