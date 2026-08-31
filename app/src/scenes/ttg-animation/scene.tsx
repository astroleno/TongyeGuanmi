import type { SceneComponentProps } from '../../story/types';
import { AlphaVideoSources } from '../../media/alpha-video-sources';

export const TTG_MEDIA_KEY = 'ttg-figure-motion';
export const TTG_BG_SRC = new URL('../../../../assets/ttg-background.webp', import.meta.url).href;
export const TTG_MIDDLE_SRC = new URL('../../../../assets/ttg-middle.webp', import.meta.url).href;
export const TTG_FRONT_SRC = new URL('../../../../assets/ttg-foreground.webp', import.meta.url).href;
export const TTG_FIGURE_VIDEO_SRC = new URL('../../../../assets/ttg-figure-motion.webm', import.meta.url).href;
export const TTG_FIGURE_HEVC_ALPHA_SRC = new URL('../../../../assets/ttg-figure-motion-hevc-alpha.mp4', import.meta.url).href;
export const TTG_FIGURE_END_SECONDS = 2.467;
export const TTG_HOLD_PROGRESS = 0;

type TtgAnimationSceneProps = SceneComponentProps & Readonly<{
  onRoot?: (element: HTMLElement | null) => void;
  onVideo?: (element: HTMLVideoElement | null) => void;
}>;

export function TtgAnimationSceneMarkup({
  registerHandle,
  onRoot,
  onVideo
}: TtgAnimationSceneProps) {
  return (
    <article
      ref={(element) => {
        onRoot?.(element);
        registerHandle?.('field', element);
      }}
      className="ttg-page r4-ttg-animation"
      data-r4-scene="ttg-animation"
      data-ttg-transition
      data-ttg-stage
      data-ttg-duration="2.5"
      data-ttg-scroll-vh="153"
      data-ttg-video-duration="2.5"
      data-ttg-bg-travel-vh="14.3"
      data-ttg-middle-travel-vh="23.5"
      data-ttg-front-y-vh="29.2"
      data-ttg-front-travel-vh="13.1"
      data-ttg-figure-scale="0.80"
      data-ttg-figure-y-vh="-8.5"
      data-ttg-figure-travel-vh="16.5"
      aria-label="Talk to the God visual scene"
    >
      <div className="ttg-scroll">
        <div className="ttg-sticky">
          <div className="ttg-field">
            <div className="ttg-layer-stack" aria-hidden="true">
              <img className="ttg-layer ttg-layer--bg" src={TTG_BG_SRC} alt="" />
              <img className="ttg-layer ttg-layer--middle" src={TTG_MIDDLE_SRC} alt="" />
              <img className="ttg-layer ttg-layer--front" src={TTG_FRONT_SRC} alt="" />
              <video
                ref={(element) => {
                  onVideo?.(element);
                  registerHandle?.('figure-video', element);
                }}
                className="ttg-layer ttg-layer--figure"
                data-ttg-figure-video
                data-media-key={TTG_MEDIA_KEY}
                width="720"
                height="1280"
                muted
                preload="metadata"
                playsInline
              >
                <AlphaVideoSources
                  webm={TTG_FIGURE_VIDEO_SRC}
                  hevc={TTG_FIGURE_HEVC_ALPHA_SRC}
                />
              </video>
            </div>
            <div className="ttg-progress" aria-hidden="true"><span /></div>
          </div>
        </div>
      </div>
    </article>
  );
}
