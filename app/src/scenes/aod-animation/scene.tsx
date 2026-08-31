import type { SceneComponentProps } from '../../story/types';
import { AlphaVideoSources } from '../../media/alpha-video-sources';

export const AOD_CLOUD_SRC = new URL('../../../../assets/aod_cloud-alpha.webp', import.meta.url).href;
export const AOD_SUN_SRC = new URL('../../../../assets/aod_sun-alpha.webp', import.meta.url).href;
export const AOD_FIGURE_VIDEO_SRC = new URL('../../../../assets/aod-figure-motion.webm', import.meta.url).href;
export const AOD_FIGURE_HEVC_ALPHA_SRC = new URL('../../../../assets/aod-figure-motion-hevc-alpha.mp4', import.meta.url).href;
export const AOD_MEDIA_KEY = 'aod-figure-motion';
export const AOD_FIGURE_END_SECONDS = 2.567;

export function AodAnimationScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      className="aod-transition r3-aod-animation"
      data-r3-scene="aod-animation"
      data-aod-transition
      data-aod-duration="2"
      data-aod-scroll-vh="20"
      data-aod-video-duration="2.6"
      data-aod-fullscreen-start="0"
      data-aod-fullscreen-end="0.85"
      data-aod-backdrop-exit-start="0.18"
      data-aod-backdrop-exit-end="1.55"
      data-aod-figure-start-scale="1"
      data-aod-figure-start-y-vh="10.5"
      data-phone-landing="aod-semantic-edge"
      aria-label="The Ancient of Days visual scene"
    >
      <div className="aod-transition__sticky">
        <div ref={(element) => registerHandle?.('field', element)} className="aod-transition__field">
          <div className="aod-transition__reveal-surface" data-aod-reveal-surface data-transition-clip>
            <div className="aod-transition__layer-stack" data-transition-ghost="aod-field" aria-hidden="true">
              <img
                ref={(element) => registerHandle?.('cloud', element)}
                className="aod-transition__layer aod-transition__layer--cloud"
                data-aod-cloud-layer
                src={AOD_CLOUD_SRC}
                alt=""
              />
              <img
                ref={(element) => registerHandle?.('sun', element)}
                className="aod-transition__layer aod-transition__layer--sun"
                data-aod-sun-layer
                src={AOD_SUN_SRC}
                alt=""
              />
            </div>

            <video
              ref={(element) => registerHandle?.('figure-video', element)}
              className="aod-transition__figure-video"
              data-aod-figure-video
              data-media-key={AOD_MEDIA_KEY}
              muted
              preload="auto"
              playsInline
            >
              <AlphaVideoSources
                webm={AOD_FIGURE_VIDEO_SRC}
                hevc={AOD_FIGURE_HEVC_ALPHA_SRC}
              />
            </video>
            <canvas
              className="aod-transition__figure-canvas"
              data-aod-figure-canvas
              aria-hidden="true"
            />
            <div className="aod-transition__paper-solid" aria-hidden="true" />
            <div className="aod-transition__progress" aria-hidden="true"><span /></div>
          </div>
          <canvas className="aod-transition__ink" data-aod-ink-canvas aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}
