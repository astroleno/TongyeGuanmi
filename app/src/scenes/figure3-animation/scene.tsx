import type { SceneComponentProps } from '../../story/types';
import { AlphaVideoSources } from '../../media/alpha-video-sources';

export const FIGURE3_MEDIA_KEY = 'figure3-motion';
export const FIGURE3_VIDEO_SRC = new URL('../../../../assets/figure3-motion.webm', import.meta.url).href;
export const FIGURE3_HEVC_ALPHA_SRC = new URL('../../../../assets/figure3-motion-hevc-alpha.mp4', import.meta.url).href;
export const FIGURE3_END_SECONDS = 2.567;

type Figure3AnimationSceneProps = SceneComponentProps & Readonly<{
  onRoot?: (element: HTMLElement | null) => void;
}>;

export function Figure3AnimationSceneMarkup({
  registerHandle,
  onRoot
}: Figure3AnimationSceneProps) {
  return (
    <article
      ref={(element) => {
        onRoot?.(element);
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
            ref={(element) => registerHandle?.('figure3-video', element)}
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
