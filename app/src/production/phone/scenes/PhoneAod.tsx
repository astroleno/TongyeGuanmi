import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  AOD_FIGURE_END_SECONDS,
  AOD_PHONE_TIMELINE_ALPHA_END,
  AOD_PHONE_TIMELINE_ALPHA_START,
  aodAnimationScene,
  renderAodTransitionProgress
} from '../../../scenes/aod-animation';
import {
  createPackedAlphaVideoCompositor,
  renewPackedAlphaCanvas,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';
import {
  disposePhoneTimelineVideo,
  drivePhoneTimelineVideo
} from '../phone-timeline-runtime';
import {
  createPhoneAodAutoplay,
  phoneAodBackdropPresentation,
  phoneAodPresentation,
  type PhoneAodAutoplay,
  type PhoneAodPlaybackDirection
} from '../aod-autoplay';
import { phoneMediaUrlFor } from '../phone-media';
import type { PhoneExecutionToken } from '../phone-story-state';
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
    { active, reducedMotion, onReady, onAodProgress, onAodComplete },
    forwardedRef
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const autoplayRef = useRef<PhoneAodAutoplay | undefined>(undefined);
    const compositorRef = useRef<PackedAlphaVideoCompositor | undefined>(undefined);
    const renderRef = useRef<
      (
        progress: number,
        direction?: PhoneAodPlaybackDirection,
        identity?: PhoneExecutionToken | null
      ) => void
    >(undefined);
    const autoplayIdentityRef = useRef<PhoneExecutionToken | null>(null);
    const progressListenerRef = useRef(onAodProgress);
    const completeListenerRef = useRef(onAodComplete);
    const releaseCompositor = useCallback(() => {
      const compositor = compositorRef.current;
      const canvas = rootRef.current?.querySelector<HTMLCanvasElement>(
        '[data-aod-figure-canvas]'
      );
      if (!compositor) return;
      compositor.dispose();
      compositorRef.current = undefined;
      if (canvas) renewPackedAlphaCanvas(canvas);
    }, []);
    const ensureCompositor = useCallback(() => {
      if (reducedMotion) return undefined;
      if (compositorRef.current) return compositorRef.current;
      const root = rootRef.current;
      const video = root?.querySelector<HTMLVideoElement>(
        '[data-aod-figure-video]'
      );
      const canvas = root?.querySelector<HTMLCanvasElement>(
        '[data-aod-figure-canvas]'
      );
      if (!video || !canvas) return undefined;
      const compositor = createPackedAlphaVideoCompositor({ video, canvas });
      compositorRef.current = compositor;
      return compositor;
    }, [reducedMotion]);
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
        direction: PhoneAodPlaybackDirection = 1,
        identity: PhoneExecutionToken | null = null
      ) => {
        const progress = clamp(rawProgress);
        root.dataset.portraitAodAlpha = progress < PHONE_AOD_ALPHA_END_PROGRESS
          ? 'transparent'
          : 'opaque';
        if (import.meta.env.DEV) {
          root.dataset.portraitAodProgress = progress.toFixed(4);
        }
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
        if (identity) {
          progressListenerRef.current?.(progress, direction, identity);
        }
      };
      renderRef.current = render;

      if (reducedMotion) {
        render(0);
        onReady?.();
        return () => {
          if (renderRef.current === render) renderRef.current = undefined;
          delete root.dataset.portraitAodAlpha;
          if (import.meta.env.DEV) delete root.dataset.portraitAodProgress;
          delete transition.dataset.portraitAodBackdropProgress;
        };
      }

      const autoplay = createPhoneAodAutoplay(video, {
        durationSeconds: AOD_FIGURE_END_SECONDS,
        alphaEndProgress: PHONE_AOD_ALPHA_END_PROGRESS,
        sourceUrl: AOD_FIGURE_PACKED_ALPHA_VIDEO,
        driveReverseFrame: (mediaProgress, runId) => {
          drivePhoneTimelineVideo(video, [
            runId,
            -1,
            mediaProgress,
            AOD_FIGURE_END_SECONDS,
            0,
            AOD_FIGURE_END_SECONDS,
            0,
            null,
            'timeline',
            null,
            true,
            null
          ]);
        },
        disposeReverseDriver: () => disposePhoneTimelineVideo(video),
        onProgress: render,
        onComplete: (direction, identity) => {
          if (!identity) return;
          autoplayIdentityRef.current = null;
          completeListenerRef.current?.(direction, identity);
        }
      });
      autoplayRef.current = autoplay;
      autoplay.reset();
      onReady?.();

      return () => {
        autoplayIdentityRef.current = null;
        autoplay.dispose();
        releaseCompositor();
        if (autoplayRef.current === autoplay) autoplayRef.current = undefined;
        if (renderRef.current === render) renderRef.current = undefined;
        delete root.dataset.portraitAodAlpha;
        if (import.meta.env.DEV) delete root.dataset.portraitAodProgress;
        delete transition.dataset.portraitAodBackdropProgress;
      };
    }, [onReady, reducedMotion, releaseCompositor]);

    // `active` is strictly a decoder/compositor lease. Root visibility is
    // assigned synchronously by the story projector's surface role.
    useEffect(() => {
      if (active) {
        ensureCompositor()?.setActive(!reducedMotion);
        return;
      }
      compositorRef.current?.setActive(false);
      releaseCompositor();
    }, [active, ensureCompositor, reducedMotion, releaseCompositor]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      update(progress) {
        renderRef.current?.(progress);
      },
      startAutoplay(direction, identity) {
        autoplayIdentityRef.current = identity;
        if (reducedMotion) {
          renderRef.current?.(direction === 1 ? 1 : 0, direction, identity);
          autoplayIdentityRef.current = null;
          completeListenerRef.current?.(direction, identity);
          return Promise.resolve('playing');
        }
        ensureCompositor()?.setActive(true);
        return autoplayRef.current?.start(direction, identity) ?? Promise.resolve('error');
      },
      resetAutoplay() {
        autoplayIdentityRef.current = null;
        if (reducedMotion) {
          renderRef.current?.(0);
        } else {
          autoplayRef.current?.reset();
        }
      },
      enter() {
        ensureCompositor()?.setActive(true);
      },
      leave() {
        autoplayIdentityRef.current = null;
        releaseCompositor();
      },
      reverse() {},
      dispose() {
        autoplayIdentityRef.current = null;
        autoplayRef.current?.dispose();
        releaseCompositor();
      }
    }), [ensureCompositor, reducedMotion, releaseCompositor]);

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
