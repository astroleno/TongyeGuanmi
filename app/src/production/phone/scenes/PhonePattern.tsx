import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { PatternBloomRenderer } from '../../../scenes/pattern/patternBloomRenderer';
import { BELIEF_COPY } from '../../../story/copy';
import { phoneMediaUrlFor } from '../phone-media';
import type {
  PhonePatternAdapterProps,
  PhoneSceneAdapterHandle
} from '../types';
import './PhonePattern.css';

const PATTERN_CENTER = Object.freeze({ x: 0.5, y: 0.28 });
const PATTERN_BACKGROUND_IMAGE = phoneMediaUrlFor('pattern-background', 'pattern');

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
      }
    }).catch(() => {
      if (!disposed) canvas.dataset.portraitPatternRenderer = 'failed';
    });
    return () => {
      disposed = true;
      renderer.destroy();
      if (rendererRef.current === renderer) rendererRef.current = undefined;
      delete canvas.dataset.portraitPatternRenderer;
      delete canvas.dataset.portraitPatternCenter;
    };
  }, [onReady, reducedMotion]);

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
    dispose() {
      activeRef.current = false;
      rendererRef.current?.destroy();
    }
  }), [motionDriver, reducedMotion]);

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
