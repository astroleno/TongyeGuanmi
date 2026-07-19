import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  AOD_FIGURE_END_SECONDS,
  AOD_TIMELINE_ALPHA_END,
  aodAnimationScene,
  renderAodTransitionProgress
} from '../../../scenes/aod-animation';
import {
  createPackedAlphaVideoCompositor,
  type PackedAlphaVideoCompositor
} from '../../../media/packed-alpha-video';
import {
  createPhoneAodAutoplay,
  phoneAodBackdropPresentation,
  phoneAodPresentation,
  type PhoneAodAutoplay
} from '../aod-autoplay';
import { phoneMediaUrlFor } from '../phone-media';
import type { PhoneAodAdapterHandle, PhoneSceneAdapterProps } from '../types';
import './PhoneAod.css';

const AOD_FIGURE_PACKED_ALPHA_VIDEO = phoneMediaUrlFor('aod-figure-packed-forward', 'aod-animation');
const AOD_FIGURE_PACKED_ALPHA_REVERSE_VIDEO = phoneMediaUrlFor('aod-figure-packed-reverse', 'aod-animation');
const AodScene = aodAnimationScene.Component;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export const PhoneAod = forwardRef<PhoneAodAdapterHandle, PhoneSceneAdapterProps>(function PhoneAod(
  { reducedMotion, onReady, onAodProgress, onAodComplete },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const autoplayRef = useRef<PhoneAodAutoplay | undefined>(undefined);
  const compositorRef = useRef<PackedAlphaVideoCompositor | undefined>(undefined);
  const lastProgressRef = useRef(Number.NaN);
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
    const compositor = createPackedAlphaVideoCompositor({ video, canvas });
    const render = (rawProgress: number, direction: 1 | -1 = 1) => {
      const progress = clamp(rawProgress);
      if (Math.abs(progress - lastProgressRef.current) >= 0.0005) {
        lastProgressRef.current = progress;
        renderAodTransitionProgress(transition, progress);
        const presentation = phoneAodPresentation(progress);
        const backdrop = phoneAodBackdropPresentation(progress);
        transition.style.setProperty('--phone-aod-figure-cover-scale', presentation.figureScale.toFixed(4));
        transition.style.setProperty('--phone-aod-figure-shift-y', `${presentation.figureShiftYVh.toFixed(2)}dvh`);
        transition.style.setProperty('--aod-transition-sun-y', `${backdrop.sunYVh.toFixed(2)}dvh`);
        transition.style.setProperty('--aod-transition-cloud-y', `${backdrop.cloudYVh.toFixed(2)}dvh`);
        const canonicalMist = Number.parseFloat(transition.style.getPropertyValue('--aod-transition-bottom-mist-opacity')) || 0;
        transition.style.setProperty('--aod-transition-bottom-mist-opacity', Math.max(canonicalMist, presentation.bottomMistOpacity).toFixed(4));
        transition.dataset.phoneAodBackdropProgress = progress.toFixed(4);
        transition.dataset.phoneAodAlpha = progress < AOD_TIMELINE_ALPHA_END ? 'transparent' : 'opaque';
      }
      root.dataset.phoneAodProgress = progress.toFixed(4);
      progressListenerRef.current?.(progress, direction);
    };
    const autoplay = createPhoneAodAutoplay(video, {
      durationSeconds: AOD_FIGURE_END_SECONDS,
      forwardSourceUrl: AOD_FIGURE_PACKED_ALPHA_VIDEO,
      reverseSourceUrl: AOD_FIGURE_PACKED_ALPHA_REVERSE_VIDEO,
      onProgress: render,
      onComplete: (direction) => completeListenerRef.current?.(direction)
    });
    compositorRef.current = compositor;
    autoplayRef.current = autoplay;
    autoplay.reset();
    render(0);
    onReady?.();
    return () => {
      autoplay.dispose();
      compositor.dispose();
      if (autoplayRef.current === autoplay) autoplayRef.current = undefined;
      if (compositorRef.current === compositor) compositorRef.current = undefined;
      delete root.dataset.phoneAodProgress;
      delete transition.dataset.phoneAodBackdropProgress;
      delete transition.dataset.phoneAodAlpha;
    };
  }, [onReady]);

  useImperativeHandle(forwardedRef, () => {
    const renderStatic = (rawProgress: number) => {
      const progress = clamp(rawProgress);
      const root = rootRef.current;
      const transition = root?.querySelector<HTMLElement>('[data-aod-transition]');
      if (!root || !transition) return;
      renderAodTransitionProgress(transition, progress);
      const presentation = phoneAodPresentation(progress);
      const backdrop = phoneAodBackdropPresentation(progress);
      transition.style.setProperty('--phone-aod-figure-cover-scale', presentation.figureScale.toFixed(4));
      transition.style.setProperty('--phone-aod-figure-shift-y', `${presentation.figureShiftYVh.toFixed(2)}dvh`);
      transition.style.setProperty('--aod-transition-sun-y', `${backdrop.sunYVh.toFixed(2)}dvh`);
      transition.style.setProperty('--aod-transition-cloud-y', `${backdrop.cloudYVh.toFixed(2)}dvh`);
      transition.dataset.phoneAodAlpha = progress < AOD_TIMELINE_ALPHA_END ? 'transparent' : 'opaque';
      root.dataset.phoneAodProgress = progress.toFixed(4);
      progressListenerRef.current?.(progress, 1);
    };
    return {
    root: () => rootRef.current,
    update(rawProgress) {
      renderStatic(rawProgress);
    },
    startAutoplay(direction) {
      if (reducedMotion) {
        renderStatic(direction === 1 ? 1 : 0);
        completeListenerRef.current?.(direction);
        return;
      }
      autoplayRef.current?.start(direction);
    },
    resetAutoplay() { autoplayRef.current?.reset(); },
    enter() {},
    leave() {},
    reverse() {},
    dispose() {
      autoplayRef.current?.dispose();
      compositorRef.current?.dispose();
    }
    };
  }, [reducedMotion]);

  return (
    <section ref={rootRef} className="phone-scene phone-scene--aod" aria-label="The Ancient of Days visual scene">
      <AodScene scene="aod-animation" hidden={false} />
    </section>
  );
});

export default PhoneAod;
