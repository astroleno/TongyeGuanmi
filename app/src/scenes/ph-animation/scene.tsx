import type { SceneComponentProps } from '../../story/types';
import { AlphaVideoSources } from '../../media/alpha-video-sources';

export const PH_MEDIA_KEY = 'ph-figure-motion';
export const PH_BG_SRC = new URL('../../../../assets/ph_background.webp', import.meta.url).href;
export const PH_FRONT_SRC = new URL('../../../../assets/ph_front-alpha.webp', import.meta.url).href;
export const PH_FIGURE_VIDEO_SRC = new URL('../../../../assets/ph-figure-motion.webm', import.meta.url).href;
export const PH_FIGURE_HEVC_ALPHA_SRC = new URL('../../../../assets/ph-figure-motion-hevc-alpha.mp4', import.meta.url).href;
export const PH_FIGURE_END_SECONDS = 1.5;
export const PH_HOLD_PROGRESS = 0;

type PhAnimationSceneProps = SceneComponentProps & Readonly<{
  onRoot?: (element: HTMLElement | null) => void;
  onVideo?: (element: HTMLVideoElement | null) => void;
}>;

export function PhAnimationSceneMarkup({
  registerHandle,
  onRoot,
  onVideo
}: PhAnimationSceneProps) {
  return (
    <article
      ref={(element) => {
        onRoot?.(element);
        registerHandle?.('field', element);
      }}
      className="ph-page r4-ph-animation"
      data-r4-scene="ph-animation"
      data-ph-stage
      aria-label="Pythagoreans Hymn visual scene"
    >
      <div className="ph-scroll">
        <div className="ph-sticky">
          <div className="ph-field">
            <img className="ph-bg" src={PH_BG_SRC} alt="" aria-hidden="true" />
            <div className="ph-paper" aria-hidden="true" />
            <div className="ph-sun-wash" aria-hidden="true" />
            <div className="ph-layer-stack" aria-hidden="true">
              <img className="ph-layer ph-layer--front" src={PH_FRONT_SRC} alt="" />
              <video
                ref={(element) => {
                  onVideo?.(element);
                  registerHandle?.('figure-video', element);
                }}
                className="ph-layer ph-layer--figure"
                data-ph-alpha-video
                data-media-key={PH_MEDIA_KEY}
                muted
                preload="auto"
                playsInline
              >
                <AlphaVideoSources
                  webm={PH_FIGURE_VIDEO_SRC}
                  hevc={PH_FIGURE_HEVC_ALPHA_SRC}
                />
              </video>
            </div>
            <div className="ph-edge-light" aria-hidden="true" />
            <div className="ph-texture" aria-hidden="true" />
            <div className="ph-progress" aria-hidden="true"><span /></div>
          </div>
        </div>
      </div>
    </article>
  );
}
