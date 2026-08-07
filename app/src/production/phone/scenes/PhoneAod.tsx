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
  type PackedAlphaRenderFailure,
  type PackedAlphaRenderResult,
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
  type PhoneAodAutoplay
} from '../aod-autoplay';
import { phoneMediaUrlFor } from '../phone-media';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneAodFailureReason,
  type PhoneAodExecution,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../phone-story/runtime';
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

type PhoneAodPresentationBinding = {
  token: PresentationToken;
  key: string;
  report: (frame: PhoneRenderedPresentationFrame) => void;
  fail: (reason: PhoneAodFailureReason) => void;
  frameSequence: number;
  reported: boolean;
  paintFrame: number | null;
  proofFrame: number | null;
};

function phoneAodFailureForPackedAlpha(
  failure: PackedAlphaRenderFailure
): PhoneAodFailureReason {
  switch (failure) {
    case 'webgl-unavailable': return 'aod-webgl-unavailable';
    case 'upload-failed': return 'aod-frame-upload-failed';
    case 'draw-failed': return 'aod-frame-draw-failed';
    case 'context-lost': return 'aod-context-lost';
  }
}

function cancelAodPresentationFrames(binding: PhoneAodPresentationBinding): void {
  if (typeof window === 'undefined') return;
  if (binding.paintFrame !== null) window.cancelAnimationFrame(binding.paintFrame);
  if (binding.proofFrame !== null) window.cancelAnimationFrame(binding.proofFrame);
  binding.paintFrame = null;
  binding.proofFrame = null;
}

/** The AOD leaf returns its runner-issued token unchanged after a physical paint. */
export function phoneAodPresentationFrame(
  token: PresentationToken,
  frameSequence: number,
  observedAt: number,
  origin: 'leaf-static-poster' | 'leaf-post-paint' = 'leaf-static-poster'
): PhoneRenderedPresentationFrame {
  return {
    token,
    frameSequence,
    observedAt,
    origin
  };
}

/**
 * Owns AOD's single-source packed-alpha compositor, forward native playback,
 * reverse timeline playback, and every AOD-local visual track. The stage
 * runtime only decides when playback begins and receives canonical progress
 * for the Method handoff.
 */
export const PhoneAod = forwardRef<PhoneAodAdapterHandle, PhoneSceneAdapterProps>(
  function PhoneAod(
    {
      active,
      reducedMotion,
      onReady,
      onAodProgress,
      onAodComplete,
      onAodFrame,
      onAodFailure
    },
    forwardedRef
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const autoplayRef = useRef<PhoneAodAutoplay | undefined>(undefined);
    const compositorRef = useRef<PackedAlphaVideoCompositor | undefined>(undefined);
    const renderRef = useRef<
      (
        progress: number,
        execution?: PhoneAodExecution | null,
        reportProgress?: boolean
      ) => PackedAlphaRenderResult | undefined
    >(undefined);
    const autoplayExecutionRef = useRef<PhoneAodExecution | null>(null);
    const executionFrameSequenceRef = useRef(0);
    const presentationBindingRef = useRef<PhoneAodPresentationBinding | null>(null);
    const renderedFrameRef = useRef(false);
    const progressListenerRef = useRef(onAodProgress);
    const completeListenerRef = useRef(onAodComplete);
    const frameListenerRef = useRef(onAodFrame);
    const failureListenerRef = useRef(onAodFailure);
    const clearAutoplayExecution = useCallback(() => {
      autoplayExecutionRef.current = null;
      executionFrameSequenceRef.current = 0;
      renderedFrameRef.current = false;
    }, []);
    const reportAodFrame = useCallback((execution: PhoneAodExecution) => {
      const root = rootRef.current;
      if (root) {
        // AOD's reverse receiver is also the physical source endpoint for
        // the shared Ink geometry. Its packed canvas draw is the exact
        // admission frame, so release the generic pending receiver veil
        // immediately before forwarding that fact to the runner. The marker
        // is cleared by the next endpoint arm/disposal; it never commits a
        // machine state on its own.
        root.dataset.phoneInkFrame = 'ready';
      }
      frameListenerRef.current?.({
        token: execution[0],
        frameSequence: ++executionFrameSequenceRef.current,
        observedAt: performance.now(),
        origin: 'segment-first-frame'
      }, execution);
    }, []);
    /**
     * Both moving AOD and static/direct AOD admission terminate through the
     * one runtime session. A packed compositor can only report a physical
     * fact; it never resets media, unlocks input, or enters rollback itself.
     */
    const reportAodFailure = useCallback((reason: PhoneAodFailureReason) => {
      const execution = autoplayExecutionRef.current;
      if (execution) {
        failureListenerRef.current?.(execution, reason);
        return;
      }
      presentationBindingRef.current?.fail(reason);
    }, []);
    const requestBoundStaticPresentation = useCallback(() => {
      const binding = presentationBindingRef.current;
      if (
        !binding
        || binding.reported
        || binding.paintFrame !== null
        || binding.proofFrame !== null
        || typeof window === 'undefined'
      ) return;
      // AOD's reduced endpoint is its already-mounted authored DOM scene. It
      // is rendered at the authored hold (zero), then reported in the
      // following frame; no autoplay result or dataset can stand in for this
      // physical static paint.
      binding.paintFrame = window.requestAnimationFrame(() => {
        binding.paintFrame = null;
        if (presentationBindingRef.current !== binding || binding.reported) return;
        renderRef.current?.(0);
        const staticSurface = rootRef.current?.querySelector<HTMLElement>(
          '[data-aod-reveal-surface]'
        );
        if (!staticSurface || presentationBindingRef.current !== binding) return;
        staticSurface.dataset.aodStaticPoster = binding.key;
        binding.proofFrame = window.requestAnimationFrame(() => {
          binding.proofFrame = null;
          if (presentationBindingRef.current !== binding || binding.reported) return;
          binding.reported = true;
          binding.frameSequence += 1;
          binding.report(phoneAodPresentationFrame(
            binding.token,
            binding.frameSequence,
            performance.now()
          ));
        });
      });
    }, []);
    const releaseCompositor = useCallback(() => {
      const compositor = compositorRef.current;
      const canvas = rootRef.current?.querySelector<HTMLCanvasElement>(
        '[data-aod-figure-canvas]'
      );
      const staticSurface = rootRef.current?.querySelector<HTMLElement>(
        '[data-aod-reveal-surface]'
      );
      delete staticSurface?.dataset.aodStaticPoster;
      delete rootRef.current?.dataset.phoneInkFrame;
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
      if (!root || !video || !canvas) return undefined;
      let compositor: PackedAlphaVideoCompositor | undefined;
      compositor = createPackedAlphaVideoCompositor({
        video,
        canvas,
        // AOD keeps its React-owned context warmed across the front/back
        // handoff. Hero is the cold-start owner that retires its context when
        // inactive; making both route anchors hard-lose here would require a
        // second restoration protocol and would reintroduce split ownership.
        releaseContextOnDispose: false,
        onFrame: () => {
          const execution = autoplayExecutionRef.current;
          const rendered = renderedFrameRef.current;
          if (rootRef.current !== root || compositorRef.current !== compositor) {
            return;
          }
          // AOD can also be the receiver of Star → AOD or a direct entry.
          // In full motion its target proof is this actual packed-canvas draw,
          // not a later DOM-only RAF pair.
          if (!execution) {
            const binding = presentationBindingRef.current;
            const staticSurface = root.querySelector<HTMLElement>(
              '[data-aod-reveal-surface]'
            );
            if (!binding || binding.reported || !staticSurface) return;
            // The compositor invokes this only after drawing the packed
            // frame. Defer reducer dispatch by one browser frame so it
            // cannot synchronously re-enter a React layout projection.
            staticSurface.dataset.aodStaticPoster = binding.key;
            binding.reported = true;
            binding.proofFrame = window.requestAnimationFrame(() => {
              binding.proofFrame = null;
              if (presentationBindingRef.current !== binding) return;
              binding.report(phoneAodPresentationFrame(
                binding.token,
                ++binding.frameSequence,
                performance.now(),
                'leaf-post-paint'
              ));
            });
            return;
          }
          if (!rendered) return;
          reportAodFrame(execution);
        },
        onFailure: (failure) => {
          // A retired canvas may dispatch late WebGL events. The current
          // compositor alone may turn them into the current session failure.
          if (
            rootRef.current !== root
            || (compositorRef.current && compositorRef.current !== compositor)
          ) return;
          reportAodFailure(phoneAodFailureForPackedAlpha(failure));
        }
      });
      compositorRef.current = compositor;
      return compositor;
    }, [reducedMotion, reportAodFailure, reportAodFrame]);
    progressListenerRef.current = onAodProgress;
    completeListenerRef.current = onAodComplete;
    frameListenerRef.current = onAodFrame;
    failureListenerRef.current = onAodFailure;

    useEffect(() => {
      const root = rootRef.current;
      const transition = root?.querySelector<HTMLElement>('[data-aod-transition]');
      const video = root?.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
      const canvas = root?.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');
      if (!root || !transition || !video || !canvas) return;

      const onContextLost = () => reportAodFailure('aod-context-lost');
      const onMediaError = () => reportAodFailure('media-failed');
      canvas.addEventListener('webglcontextlost', onContextLost);
      video.addEventListener('error', onMediaError);

      let lastProgress = Number.NaN;
      const render = (
        rawProgress: number,
        execution: PhoneAodExecution | null = null,
        reportProgress = false
      ) => {
        if (execution && execution !== autoplayExecutionRef.current) return;
        const latestProgress = clamp(rawProgress);
        const progress = latestProgress;
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
          transition.style.setProperty(
            '--portrait-aod-figure-cover-scale',
            presentation.figureScale.toFixed(4)
          );
          transition.style.setProperty(
            '--portrait-aod-figure-shift-y',
            `${presentation.figureShiftYVh.toFixed(2)}dvh`
          );
          transition.setAttribute('data-aod-exit-active', 'true');
        }
        if (execution) {
          // This leaf can only report a real canvas draw. The runner asks it
          // to render only after reducer-owned admission accepts the facts;
          // decoder progress itself never gains a visual write here.
          // `render()` may invoke the compositor's onFrame callback
          // synchronously (WebKit does this for an explicit reverse seek).
          // Mark the render attempt before entering the compositor so that
          // that callback cannot lose the exact first-frame fact to a stale
          // false value. A failed/waiting draw clears the marker again; only
          // the compositor's successful draw can publish the frame.
          renderedFrameRef.current = true;
          const result = compositorRef.current?.render();
          if (result !== 'rendered') renderedFrameRef.current = false;
          if (reportProgress) {
            progressListenerRef.current?.(progress, execution);
          }
          return result;
        }
      };
      renderRef.current = render;

      if (reducedMotion) {
        render(0);
        onReady?.();
        return () => {
          canvas.removeEventListener('webglcontextlost', onContextLost);
          video.removeEventListener('error', onMediaError);
          if (presentationBindingRef.current) {
            cancelAodPresentationFrames(presentationBindingRef.current);
          }
          presentationBindingRef.current = null;
          delete root.querySelector<HTMLElement>(
            '[data-aod-reveal-surface]'
          )?.dataset.aodStaticPoster;
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
        onProgress: (progress, execution) => {
          if (!execution || autoplayExecutionRef.current !== execution) return;
          // Native media may report any fact order. This is data only; the
          // AOD runner will issue the sole render command after its reducer
          // has accepted admission and progress for this exact execution.
          progressListenerRef.current?.(clamp(progress), execution);
        },
        onComplete: (execution) => {
          if (!execution || autoplayExecutionRef.current !== execution) return;
          completeListenerRef.current?.(execution);
          if (autoplayExecutionRef.current === execution) {
            clearAutoplayExecution();
          }
        }
      });
      autoplayRef.current = autoplay;
      autoplay.reset();
      onReady?.();

      return () => {
        canvas.removeEventListener('webglcontextlost', onContextLost);
        video.removeEventListener('error', onMediaError);
        clearAutoplayExecution();
        if (presentationBindingRef.current) {
          cancelAodPresentationFrames(presentationBindingRef.current);
        }
        presentationBindingRef.current = null;
        autoplay.dispose();
        releaseCompositor();
        if (autoplayRef.current === autoplay) autoplayRef.current = undefined;
        if (renderRef.current === render) renderRef.current = undefined;
        delete root.dataset.portraitAodAlpha;
        if (import.meta.env.DEV) delete root.dataset.portraitAodProgress;
        delete transition.dataset.portraitAodBackdropProgress;
      };
    }, [clearAutoplayExecution, onReady, reducedMotion, releaseCompositor, reportAodFailure]);

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
      effectRoot: () => rootRef.current?.querySelector<HTMLCanvasElement>(
        '[data-aod-figure-canvas]'
      ) ?? null,
      update(progress) {
        renderRef.current?.(progress);
      },
      startAutoplay(execution) {
        // Reduced motion never starts the media branch. Its sole endpoint
        // evidence is supplied later by `presentPresentation()` under the
        // target static token owned by the runner.
        if (reducedMotion) return Promise.resolve('error');
        const [, direction] = execution;
        autoplayExecutionRef.current = execution;
        renderedFrameRef.current = false;
        executionFrameSequenceRef.current = 0;
        // The execution identity is read from the current runtime refs by
        // the frame callback. Keeping this warmed context avoids Safari
        // allocating a second WebGL canvas during the same AOD handoff.
        const compositor = ensureCompositor();
        if (!compositor) return Promise.resolve('error');
        compositor.setActive(true);
        // This is the authored source-safe paint that may produce the first
        // physical canvas fact. It intentionally cannot forward progress.
        const result = renderRef.current?.(
          direction === 1 ? 0 : .998,
          execution
        );
        if (result !== 'rendered' && result !== 'waiting') {
          return Promise.resolve('error');
        }
        return autoplayRef.current?.start(execution) ?? Promise.resolve('error');
      },
      renderAutoplayProgress(execution, progress) {
        if (autoplayExecutionRef.current !== execution) return;
        renderRef.current?.(progress, execution);
      },
      presentPresentation(token, report, fail) {
        const prior = presentationBindingRef.current;
        if (prior) cancelAodPresentationFrames(prior);
        presentationBindingRef.current = {
          token,
          key: phoneRuntimePresentationTokenKey(token),
          report,
          fail: (reason) => fail?.(reason),
          frameSequence: 0,
          reported: false,
          paintFrame: null,
          proofFrame: null
        };
        renderRef.current?.(0);
        if (reducedMotion) {
          requestBoundStaticPresentation();
          return;
        }
        const compositor = ensureCompositor();
        if (!compositor) {
          reportAodFailure('media-failed');
          return;
        }
        compositor.setActive(true);
        compositor.render();
      },
      disposePresentation(token) {
        const binding = presentationBindingRef.current;
        if (
          binding
          && binding.key === phoneRuntimePresentationTokenKey(token)
        ) {
          cancelAodPresentationFrames(binding);
          presentationBindingRef.current = null;
          const staticSurface = rootRef.current?.querySelector<HTMLElement>(
            '[data-aod-reveal-surface]'
          );
          if (staticSurface?.dataset.aodStaticPoster === binding.key) {
            delete staticSurface.dataset.aodStaticPoster;
          }
        }
      },
      resetAutoplay() {
        clearAutoplayExecution();
        if (reducedMotion) {
          renderRef.current?.(0);
        } else {
          autoplayRef.current?.reset();
        }
      },
      dispose() {
        clearAutoplayExecution();
        if (presentationBindingRef.current) {
          cancelAodPresentationFrames(presentationBindingRef.current);
        }
        presentationBindingRef.current = null;
        autoplayRef.current?.dispose();
        releaseCompositor();
      }
    }), [
      ensureCompositor,
      clearAutoplayExecution,
      reducedMotion,
      releaseCompositor,
      reportAodFrame,
      reportAodFailure,
      requestBoundStaticPresentation
    ]);

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
