import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { PatternBloomRenderer } from '../../../scenes/pattern/patternBloomRenderer';
import { BELIEF_COPY } from '../../../story/copy';
import { phoneMediaUrlFor } from '../phone-media';
import type {
  PhonePatternAdapterProps,
  PhoneSceneAdapterHandle
} from '../types';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../phone-story/runtime';
import './PhonePattern.css';

const PATTERN_CENTER = Object.freeze({ x: 0.5, y: 0.28 });
const PATTERN_BACKGROUND_IMAGE = phoneMediaUrlFor('pattern-background', 'pattern');

type PhonePatternPresentationBinding = {
  token: PresentationToken;
  key: string;
  report: (frame: PhoneRenderedPresentationFrame) => void;
  frameSequence: number;
  requested: boolean;
  reported: boolean;
  paintFrame: number | null;
  proofFrame: number | null;
};

function cancelPatternPresentationFrames(binding: PhonePatternPresentationBinding): void {
  if (typeof window === 'undefined') return;
  if (binding.paintFrame !== null) window.cancelAnimationFrame(binding.paintFrame);
  if (binding.proofFrame !== null) window.cancelAnimationFrame(binding.proofFrame);
  binding.paintFrame = null;
  binding.proofFrame = null;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phonePatternFrame(rawProgress: number): Readonly<{
  progress: number;
  copyProgress: number;
  copyY: number;
  washOpacity: number;
}> {
  const progress = clamp(rawProgress);
  const copyProgress = clamp(progress / 0.78);
  return {
    progress,
    copyProgress,
    copyY: 44 * (1 - copyProgress),
    washOpacity: 0.54 + progress * 0.4
  };
}

/** Positional leaf inputs become one immutable raw frame at the module edge. */
export function phonePatternStaticPresentationFrame(
  token: PresentationToken,
  frameSequence: number,
  observedAt: number
): PhoneRenderedPresentationFrame {
  return {
    token,
    frameSequence,
    observedAt,
    origin: 'leaf-static-poster'
  };
}

export const PhonePattern = forwardRef<PhoneSceneAdapterHandle, PhonePatternAdapterProps>(function PhonePattern(
  { active, reducedMotion, motionDriver, onReady },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const washRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PatternBloomRenderer | undefined>(undefined);
  const activeRef = useRef(active);
  const progressRef = useRef(0);
  const presentationBindingRef = useRef<PhonePatternPresentationBinding | null>(null);

  const requestBoundStaticPresentation = useCallback(() => {
    const binding = presentationBindingRef.current;
    const renderer = rendererRef.current;
    if (!binding || !renderer || binding.requested || binding.reported) return;
    binding.requested = true;
    renderer.setFrameProgress(progressRef.current, progressRef.current);
    // prepareStaticFrame waits for texture readiness; renderProgress then
    // forces one concrete canvas draw after this immutable token was armed.
    void renderer.prepareStaticFrame().then(() => {
      if (
        presentationBindingRef.current !== binding
        || rendererRef.current !== renderer
        || binding.reported
      ) return;
      if (typeof window === 'undefined') return;
      // Draw in one frame, then report in the following frame. This keeps the
      // machine candidate visible and proves a browser-composited endpoint,
      // rather than a synchronous canvas method call.
      binding.paintFrame = window.requestAnimationFrame(() => {
        binding.paintFrame = null;
        if (
          presentationBindingRef.current !== binding
          || rendererRef.current !== renderer
          || binding.reported
        ) return;
        renderer.renderProgress(progressRef.current);
        if (presentationBindingRef.current !== binding) return;
        binding.proofFrame = window.requestAnimationFrame(() => {
          binding.proofFrame = null;
          if (
            presentationBindingRef.current !== binding
            || rendererRef.current !== renderer
            || binding.reported
          ) return;
          binding.reported = true;
          binding.frameSequence += 1;
          binding.report(phonePatternStaticPresentationFrame(
            binding.token,
            binding.frameSequence,
            performance.now()
          ));
        });
      });
    }).catch(() => {
      // The machine-owned reduced-proof deadline performs rollback.
    });
  }, []);

  useEffect(() => {
    activeRef.current = active;
    rendererRef.current?.setRenderActive(active && !reducedMotion, active && !reducedMotion);
  }, [active, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const renderer = new PatternBloomRenderer(canvas, {
      centerForViewport: () => PATTERN_CENTER
    });
    rendererRef.current = renderer;
    canvas.dataset.portraitPatternRenderer = 'loading';
    canvas.dataset.portraitPatternCenter = '50%,28%';
    void renderer.start().then(async () => {
      if (disposed) return;
      renderer.setFrameProgress(progressRef.current, progressRef.current);
      renderer.setRenderActive(activeRef.current && !reducedMotion, activeRef.current && !reducedMotion);
      await renderer.prepareStaticFrame();
      if (!disposed) {
        canvas.dataset.portraitPatternRenderer = 'ready';
        onReady?.();
        requestBoundStaticPresentation();
      }
    }).catch(() => {
      if (!disposed) canvas.dataset.portraitPatternRenderer = 'failed';
    });
    return () => {
      disposed = true;
      renderer.destroy();
      if (rendererRef.current === renderer) rendererRef.current = undefined;
      if (presentationBindingRef.current) {
        cancelPatternPresentationFrames(presentationBindingRef.current);
      }
      presentationBindingRef.current = null;
      delete canvas.dataset.portraitPatternRenderer;
      delete canvas.dataset.portraitPatternCenter;
    };
  }, [onReady, reducedMotion, requestBoundStaticPresentation]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(rawProgress) {
      const frame = phonePatternFrame(rawProgress);
      const { progress } = frame;
      progressRef.current = progress;
      rendererRef.current?.setFrameProgress(progress, progress);
      if (copyRef.current) {
        motionDriver.set(copyRef.current, {
          y: frame.copyY,
          opacity: frame.copyProgress
        });
      }
      if (washRef.current) {
        motionDriver.set(washRef.current, { opacity: frame.washOpacity });
      }
    },
    enter() {
      activeRef.current = true;
      rendererRef.current?.setRenderActive(!reducedMotion, !reducedMotion);
    },
    leave() {
      activeRef.current = false;
      rendererRef.current?.setRenderActive(false, false);
    },
    reverse() {
      activeRef.current = true;
      rendererRef.current?.setRenderActive(!reducedMotion, !reducedMotion);
    },
    presentPresentation(token, report) {
      if (presentationBindingRef.current) {
        cancelPatternPresentationFrames(presentationBindingRef.current);
      }
      presentationBindingRef.current = {
        token,
        key: phoneRuntimePresentationTokenKey(token),
        report,
        frameSequence: 0,
        requested: false,
        reported: false,
        paintFrame: null,
        proofFrame: null
      };
      requestBoundStaticPresentation();
    },
    disposePresentation(token) {
      const binding = presentationBindingRef.current;
      if (
        binding
        && binding.key === phoneRuntimePresentationTokenKey(token)
      ) {
        cancelPatternPresentationFrames(binding);
        presentationBindingRef.current = null;
      }
    },
    dispose() {
      activeRef.current = false;
      if (presentationBindingRef.current) {
        cancelPatternPresentationFrames(presentationBindingRef.current);
      }
      presentationBindingRef.current = null;
      rendererRef.current?.destroy();
    }
  }), [motionDriver, reducedMotion, requestBoundStaticPresentation]);

  return (
    <section
      ref={rootRef}
      className="portrait-scroll-spike__scene portrait-scroll-spike__scene--pattern"
      aria-labelledby="portrait-spike-pattern-title"
    >
      <div className="portrait-scroll-spike__pattern-motion" aria-hidden="true">
        <img
          className="portrait-scroll-spike__pattern-image"
          src={PATTERN_BACKGROUND_IMAGE}
          alt=""
        />
        <canvas
          ref={canvasRef}
          className="portrait-scroll-spike__pattern-bloom"
          data-portrait-pattern-bloom
          aria-hidden="true"
        />
        <div
          ref={washRef}
          className="portrait-scroll-spike__pattern-wash"
          aria-hidden="true"
        />
      </div>
      <div ref={copyRef} className="portrait-scroll-spike__pattern-copy">
        <p>{BELIEF_COPY[0]}</p>
        <h2 id="portrait-spike-pattern-title">{BELIEF_COPY[1]}</h2>
        <p>{BELIEF_COPY[2]}</p>
      </div>
    </section>
  );
});

export default PhonePattern;
