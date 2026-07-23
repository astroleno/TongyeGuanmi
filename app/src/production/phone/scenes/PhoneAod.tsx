import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  AOD_FIGURE_END_SECONDS,
  AOD_PHONE_TIMELINE_ALPHA_END,
  AOD_PHONE_TIMELINE_ALPHA_START,
  aodAnimationScene,
  renderAodTransitionProgress
} from '../../../scenes/aod-animation';
import {
  createPackedAlphaVideoCompositor,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';
import {
  disposeTimelineVideoDriver,
  driveTimelineVideo
} from '../../../media/timeline-video-driver';
import {
  createPhoneAodAutoplay,
  phoneAodBackdropPresentation,
  phoneAodPresentation,
  type PhoneAodAutoplay,
  type PhoneAodPlaybackDirection
} from '../aod-autoplay';
import { phoneMediaUrlFor } from '../phone-media';
import type { PhoneAodAdapterHandle, PhoneSceneAdapterProps } from '../types';
import './PhoneAod.css';

const AOD_FIGURE_PACKED_ALPHA_VIDEO = phoneMediaUrlFor(
  'aod-figure-packed',
  'aod-animation'
);
const AodScene = aodAnimationScene.Component;
export const PHONE_AOD_ALPHA_END_PROGRESS = AOD_PHONE_TIMELINE_ALPHA_END;
export const PHONE_AOD_ALPHA_START_PROGRESS = AOD_PHONE_TIMELINE_ALPHA_START;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Owns AOD's single-source packed-alpha compositor, forward native playback,
 * reverse timeline playback, and every AOD-local visual track. The stage
 * runtime only decides when playback begins and receives canonical progress
 * for the Method handoff.
 */
export const PhoneAod = forwardRef<PhoneAodAdapterHandle, PhoneSceneAdapterProps>(
  function PhoneAod(
    { reducedMotion, onReady, onAodProgress, onAodComplete },
    forwardedRef
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const autoplayRef = useRef<PhoneAodAutoplay | undefined>(undefined);
    const compositorRef = useRef<PackedAlphaVideoCompositor | undefined>(undefined);
    const renderRef = useRef<
      ((progress: number, direction?: PhoneAodPlaybackDirection) => void) | undefined
    >(undefined);
    const progressListenerRef = useRef(onAodProgress);
    const completeListenerRef = useRef(onAodComplete);
    progressListenerRef.current = onAodProgress;
    completeListenerRef.current = onAodComplete;

    useEffect(() => {
      const root = rootRef.current;
      const transition = root?.querySelector<HTMLElement>('[data-aod-transition]');
      const video = root?.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
      const canvas = root?.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');
      if (!root || !transition || !video || !canvas) return;

      let lastProgress = Number.NaN;
      const render = (
        rawProgress: number,
        direction: PhoneAodPlaybackDirection = 1
      ) => {
        const progress = clamp(rawProgress);
        root.dataset.portraitAodAlpha = progress < PHONE_AOD_ALPHA_END_PROGRESS
          ? 'transparent'
          : 'opaque';
        root.dataset.portraitAodProgress = progress.toFixed(4);
        const shouldRenderPresentation = !Number.isFinite(lastProgress)
          || Math.abs(progress - lastProgress) >= 0.004
          || progress === 0
          || progress === 1;
        if (shouldRenderPresentation) {
          lastProgress = progress;
          renderAodTransitionProgress(
            root,
            progress,
            PHONE_AOD_ALPHA_END_PROGRESS,
            PHONE_AOD_ALPHA_START_PROGRESS
          );
          const presentation = phoneAodPresentation(progress);
          const backdropPresentation = phoneAodBackdropPresentation(progress);
          transition.style.setProperty(
            '--aod-transition-sun-y',
            `${backdropPresentation.sunYVh.toFixed(2)}dvh`
          );
          transition.style.setProperty(
            '--aod-transition-cloud-y',
            `${backdropPresentation.cloudYVh.toFixed(2)}dvh`
          );
          transition.dataset.portraitAodBackdropProgress = progress.toFixed(4);
          const canonicalMistOpacity = Number.parseFloat(
            transition.style.getPropertyValue('--aod-transition-bottom-mist-opacity')
          ) || 0;
          transition.style.setProperty(
            '--portrait-aod-figure-cover-scale',
            presentation.figureScale.toFixed(4)
          );
          transition.style.setProperty(
            '--portrait-aod-figure-shift-y',
            `${presentation.figureShiftYVh.toFixed(2)}dvh`
          );
          transition.style.setProperty(
            '--aod-transition-bottom-mist-opacity',
            Math.max(
              canonicalMistOpacity,
              presentation.bottomMistOpacity
            ).toFixed(4)
          );
          transition.setAttribute('data-aod-exit-active', 'true');
        }
        progressListenerRef.current?.(progress, direction);
      };
      renderRef.current = render;

      if (reducedMotion) {
        render(0);
        onReady?.();
        return () => {
          if (renderRef.current === render) renderRef.current = undefined;
          delete root.dataset.portraitAodAlpha;
          delete root.dataset.portraitAodProgress;
          delete transition.dataset.portraitAodBackdropProgress;
        };
      }

      const compositor = createPackedAlphaVideoCompositor({ video, canvas });
      const autoplay = createPhoneAodAutoplay(video, {
        durationSeconds: AOD_FIGURE_END_SECONDS,
        alphaEndProgress: PHONE_AOD_ALPHA_END_PROGRESS,
        sourceUrl: AOD_FIGURE_PACKED_ALPHA_VIDEO,
        driveReverseFrame: (mediaProgress, runId) => {
          driveTimelineVideo(video, {
            runId,
            direction: -1,
            progress: mediaProgress,
            durationFallbackSeconds: AOD_FIGURE_END_SECONDS,
            startSeconds: 0,
            endSeconds: AOD_FIGURE_END_SECONDS,
            endEpsilonSeconds: 0,
            mode: 'timeline',
            allowSeekedFrameFallback: true
          });
        },
        disposeReverseDriver: () => disposeTimelineVideoDriver(video),
        onProgress: render,
        onComplete: (direction) => completeListenerRef.current?.(direction)
      });
      compositorRef.current = compositor;
      autoplayRef.current = autoplay;
      autoplay.reset();
      compositor.setActive(false);
      onReady?.();

      return () => {
        autoplay.dispose();
        compositor.dispose();
        if (autoplayRef.current === autoplay) autoplayRef.current = undefined;
        if (compositorRef.current === compositor) compositorRef.current = undefined;
        if (renderRef.current === render) renderRef.current = undefined;
        delete root.dataset.portraitAodAlpha;
        delete root.dataset.portraitAodProgress;
        delete transition.dataset.portraitAodBackdropProgress;
      };
    }, [onReady, reducedMotion]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      update(progress) {
        renderRef.current?.(progress);
      },
      startAutoplay(direction) {
        if (reducedMotion) {
          renderRef.current?.(direction === 1 ? 1 : 0, direction);
          completeListenerRef.current?.(direction);
          return;
        }
        compositorRef.current?.setActive(true);
        autoplayRef.current?.start(direction);
      },
      resetAutoplay() {
        if (reducedMotion) {
          renderRef.current?.(0);
        } else {
          autoplayRef.current?.reset();
        }
      },
      enter() {
        compositorRef.current?.setActive(true);
      },
      leave() {
        compositorRef.current?.setActive(false);
      },
      reverse() {},
      dispose() {
        autoplayRef.current?.dispose();
        compositorRef.current?.dispose();
      }
    }), [reducedMotion]);

    return (
      <div
        ref={rootRef}
        className="portrait-scroll-spike__scene portrait-scroll-spike__scene--aod"
        aria-hidden="true"
      >
        <AodScene scene="aod-animation" hidden={false} />
      </div>
    );
  }
);

export default PhoneAod;
