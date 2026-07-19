import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  PatternBloomRenderer
} from '../../../scenes/pattern/patternBloomRenderer';
import { BELIEF_COPY } from '../../../story/copy';
import { phoneMediaUrlFor } from '../phone-media';
import type { PhoneSceneAdapterHandle, PhoneSceneAdapterProps } from '../types';
import './PhonePattern.css';

const PATTERN_CENTER = Object.freeze({ x: 0.5, y: 0.28 });
const PATTERN_BACKGROUND_IMAGE = phoneMediaUrlFor('pattern-background', 'pattern');

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export const PhonePattern = forwardRef<PhoneSceneAdapterHandle, PhoneSceneAdapterProps>(function PhonePattern(
  { active, reducedMotion, onReady },
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
    canvas.dataset.phonePatternRenderer = 'loading';
    canvas.dataset.phonePatternCenter = '50%,28%';
    void renderer.start().then(async () => {
      if (disposed) return;
      renderer.setFrameProgress(progressRef.current, progressRef.current);
      renderer.setRenderActive(activeRef.current && !reducedMotion, activeRef.current && !reducedMotion);
      await renderer.prepareStaticFrame();
      if (!disposed) {
        canvas.dataset.phonePatternRenderer = 'ready';
        onReady?.();
      }
    }).catch(() => {
      if (!disposed) canvas.dataset.phonePatternRenderer = 'failed';
    });
    return () => {
      disposed = true;
      renderer.destroy();
      if (rendererRef.current === renderer) rendererRef.current = undefined;
      delete canvas.dataset.phonePatternRenderer;
      delete canvas.dataset.phonePatternCenter;
    };
  }, [onReady, reducedMotion]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(rawProgress) {
      const progress = clamp(rawProgress);
      progressRef.current = progress;
      rendererRef.current?.setFrameProgress(progress, progress);
      const copyProgress = clamp(progress / 0.78);
      if (copyRef.current) {
        copyRef.current.style.transform = `translate3d(0, ${(44 * (1 - copyProgress)).toFixed(2)}px, 0)`;
        copyRef.current.style.opacity = String(copyProgress);
      }
      if (washRef.current) washRef.current.style.opacity = String(0.54 + progress * 0.4);
    },
    enter() { rendererRef.current?.setRenderActive(!reducedMotion, !reducedMotion); },
    leave() { rendererRef.current?.setRenderActive(false, false); },
    reverse() { rendererRef.current?.setRenderActive(!reducedMotion, !reducedMotion); },
    dispose() { rendererRef.current?.destroy(); }
  }), [reducedMotion]);

  return (
    <section ref={rootRef} className="phone-scene phone-scene--pattern" aria-labelledby="phone-pattern-title">
      <div className="phone-pattern__motion" aria-hidden="true">
        <img className="phone-pattern__image" src={PATTERN_BACKGROUND_IMAGE} alt="" />
      </div>
      <canvas ref={canvasRef} className="phone-pattern__bloom" aria-hidden="true" />
      <div ref={washRef} className="phone-pattern__wash" aria-hidden="true" />
      <div ref={copyRef} className="phone-pattern__copy">
        <p>{BELIEF_COPY[0]}</p>
        <h2 id="phone-pattern-title">{BELIEF_COPY[1]}</h2>
        <p>{BELIEF_COPY[2]}</p>
      </div>
    </section>
  );
});

export default PhonePattern;
