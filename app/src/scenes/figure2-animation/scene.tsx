import type { SceneComponentProps } from '../../story/types';
import { AlphaVideoSources } from '../../media/alpha-video-sources';

export const FIGURE2_MEDIA_KEY = 'figure2-pair-motion';
export const CLOUD_IMAGE = new URL('../../../../assets/figure2-cloud.webp', import.meta.url).href;
export const FAR_ARCH_IMAGE = new URL('../../../../assets/figure2-far-arch.webp', import.meta.url).href;
export const MIDDLE_IMAGE = new URL('../../../../assets/figure2-middle-building.webp', import.meta.url).href;
export const MIDDLE_MASK_IMAGE = new URL('../../../../assets/figure2-middle-window-mask.webp', import.meta.url).href;
export const FIGURE2_VIDEO = new URL('../../../../assets/figure2-pair-motion.webm', import.meta.url).href;
export const FIGURE2_HEVC_ALPHA_VIDEO = new URL('../../../../assets/figure2-pair-motion-hevc-alpha.mp4', import.meta.url).href;

type Figure2AnimationSceneProps = SceneComponentProps & Readonly<{
  onRoot?: (element: HTMLElement | null) => void;
}>;

export function Figure2AnimationSceneMarkup({
  registerHandle,
  onRoot
}: Figure2AnimationSceneProps) {
  return (
    <article
      ref={(element) => onRoot?.(element)}
      className="r4-figure2"
      data-r4-scene="figure2-animation"
    >
      <div
        ref={(element) => registerHandle?.('stage', element)}
        className="r4-figure2__field"
        data-figure2-ownership-surface="true"
      >
        <div className="r4-figure2__depth-field" data-figure2-depth-ranked-field="true">
          <div className="r4-figure2__middle-camera">
            <div className="r4-figure2__window-mask" style={{ WebkitMaskImage: `url(${MIDDLE_MASK_IMAGE})`, maskImage: `url(${MIDDLE_MASK_IMAGE})` }}>
              <img className="r4-figure2__cloud" src={CLOUD_IMAGE} alt="" aria-hidden="true" />
              <div className="r4-figure2__far-arcade" aria-hidden="true">
                <img src={FAR_ARCH_IMAGE} alt="" />
              </div>
            </div>
            <img className="r4-figure2__middle" src={MIDDLE_IMAGE} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="r4-figure2__figure-depth-surface" data-figure2-figure-depth-surface="true">
          <div
            ref={(element) => registerHandle?.('figures', element)}
            className="r4-figure2__figures"
            data-figure2-figure-field="true"
            aria-label="子问老子人物动画"
          >
            <div className="r4-figure2__people-contact-shadow" aria-hidden="true" />
            <figure className="r4-figure2__figure r4-figure2__figure--combined">
              <div className="r4-figure2__media-stack r4-figure2__media-stack--combined">
                <video
                  ref={(element) => registerHandle?.('combined-video', element)}
                  className="r4-figure2__video"
                  data-figure2-video
                  data-figure2-combined-video
                  data-media-key={FIGURE2_MEDIA_KEY}
                  muted
                  playsInline
                  preload="auto"
                  aria-hidden="true"
                >
                  <AlphaVideoSources
                    webm={FIGURE2_VIDEO}
                    hevc={FIGURE2_HEVC_ALPHA_VIDEO}
                  />
                </video>
                <canvas
                  className="r4-figure2__packed-alpha-canvas"
                  data-figure2-packed-alpha-canvas
                  aria-hidden="true"
                />
              </div>
              <figcaption>子问老子</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </article>
  );
}
