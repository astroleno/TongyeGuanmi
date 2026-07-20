import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { initStarFieldReveal, type StarFieldCamera } from '../../../scenes/star-map/starFieldReveal';
import { BELIEF_COPY, STAR_MAP_TITLE } from '../../../story/copy';
import { phoneMediaUrlFor } from '../phone-media';
import type {
  PhonePatternAdapterProps,
  PhoneSceneAdapterHandle
} from '../types';
import './PhoneStarMap.css';

const STAR_MAP_IMAGE = phoneMediaUrlFor('star-map-source', 'star-map');
const FRAME_INTERVAL_MS = 1000 / 12;
const PHONE_STAR_CAMERA: StarFieldCamera = Object.freeze({ rotationDegrees: -90, zoom: 1 });

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export const PhoneStarMap = forwardRef<PhoneSceneAdapterHandle, PhonePatternAdapterProps>(function PhoneStarMap(
  { active, reducedMotion, motionDriver, onReady },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const washRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  const progressRef = useRef(0);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let readyFrame = 0;
    let liveFrame = 0;
    let firstFramePainted = false;
    let lastPaintedAt = -Infinity;
    let revision = 0;
    let motionActive = activeRef.current && !reducedMotion;
    const reveal = initStarFieldReveal({
      canvas,
      sourceUrl: STAR_MAP_IMAGE,
      autoplay: false,
      viewport: () => {
        const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        return {
          width: (canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth) * scale,
          height: (canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight) * scale
        };
      },
      config: {
        revealDurationMs: 2800,
        loopTransitionMs: 1200,
        noiseMaskWidth: 420,
        highlight: { threshold: 120, gamma: 3.05, softness: 23 },
        glow: {
          wideBlur: 120, mediumBlur: 44, coreBlur: 10, screenBlur: 3,
          wideAlpha: 1.08, mediumAlpha: 0.92, coreAlpha: 0.62, screenAlpha: 0.52
        },
        noise: {
          profile: 'desktop-r5', seed: 42.7, scale: 3.8, warpScale: 2.1, warpAmount: 0.42,
          phaseSpeed: 0.46, driftX: 0.06, driftY: 0.34, warpSpeedX: 0.09, warpSpeedY: 0.08,
          octaves: 4, lacunarity: 2.07, gain: 0.51, ridgeMix: 0.17, thresholdLow: 0.45, thresholdHigh: 0.55
        }
      }
    });
    const paint = (now = performance.now(), force = false) => {
      if (disposed || !reveal.ready || (!force && now - lastPaintedAt < FRAME_INTERVAL_MS)) return false;
      const seconds = now / 1000;
      const pulse = reducedMotion ? 0 : Math.sin(seconds * 0.34) * 0.08 + Math.sin(seconds * 0.17) * 0.05;
      reveal.renderBackground({
        timeSeconds: seconds,
        strength: reducedMotion ? 0.72 : 1.05 + pulse,
        noiseFloor: reducedMotion ? 0.02 : 0.028,
        camera: PHONE_STAR_CAMERA,
        drawSource: true
      });
      firstFramePainted = true;
      lastPaintedAt = now;
      revision += 1;
      canvas.dataset.portraitStarPerlin = 'ready';
      canvas.dataset.portraitStarCamera = 'rotate(-90deg) cover';
      canvas.dataset.portraitStarPerlinRevision = String(revision);
      return true;
    };
    const tick = (time: number) => {
      liveFrame = 0;
      if (!motionActive || reducedMotion) return;
      paint(time);
      liveFrame = window.requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (motionActive && !reducedMotion && !liveFrame && firstFramePainted) {
        liveFrame = window.requestAnimationFrame(tick);
      }
    };
    const markReady = () => {
      readyFrame = 0;
      if (disposed || firstFramePainted) return;
      if (!reveal.ready) {
        readyFrame = window.requestAnimationFrame(markReady);
        return;
      }
      paint(performance.now(), true);
      schedule();
      onReady?.();
    };
    readyFrame = window.requestAnimationFrame(markReady);
    const root = rootRef.current;
    const updateActive = (next: boolean) => {
      motionActive = next && !reducedMotion;
      canvas.dataset.portraitStarPerlinActive = String(motionActive);
      if (!motionActive) {
        window.cancelAnimationFrame(liveFrame);
        liveFrame = 0;
      } else {
        schedule();
      }
    };
    if (root) {
      (root as HTMLElement & { __phoneStarActive?: (next: boolean) => void }).__phoneStarActive = updateActive;
    }
    return () => {
      disposed = true;
      window.cancelAnimationFrame(readyFrame);
      window.cancelAnimationFrame(liveFrame);
      reveal.dispose();
      delete canvas.dataset.portraitStarPerlin;
      delete canvas.dataset.portraitStarCamera;
      delete canvas.dataset.portraitStarPerlinActive;
      delete canvas.dataset.portraitStarPerlinRevision;
      delete canvas.dataset.portraitStarPerlinProgress;
      if (root) delete (root as HTMLElement & { __phoneStarActive?: unknown }).__phoneStarActive;
    };
  }, [onReady, reducedMotion]);

  useImperativeHandle(forwardedRef, () => {
    const setActive = (next: boolean) => {
      const root = rootRef.current as (HTMLElement & { __phoneStarActive?: (active: boolean) => void }) | null;
      root?.__phoneStarActive?.(next);
    };
    return {
      root: () => rootRef.current,
      update(rawProgress) {
        const progress = clamp(rawProgress);
        progressRef.current = progress;
        if (canvasRef.current) {
          canvasRef.current.dataset.portraitStarPerlinProgress = progress.toFixed(4);
        }
        const motion = rootRef.current?.querySelector<HTMLElement>(
          '.portrait-scroll-spike__star-motion'
        );
        if (motion) motionDriver.set(motion, { scale: 1, yPercent: 0 });
        if (washRef.current) motionDriver.set(washRef.current, { opacity: progress });
        if (copyRef.current) {
          motionDriver.set(copyRef.current, {
            y: 18 * (1 - progress),
            opacity: progress
          });
        }
      },
      enter() { setActive(!reducedMotion); },
      leave() { setActive(false); },
      reverse() { setActive(!reducedMotion); },
      dispose() { setActive(false); }
    };
  }, [motionDriver, reducedMotion]);

  return (
    <section
      ref={rootRef}
      className="portrait-scroll-spike__scene portrait-scroll-spike__scene--star"
      aria-labelledby="portrait-spike-star-title"
    >
      <div className="portrait-scroll-spike__star-motion" aria-hidden="true">
        <canvas
          ref={canvasRef}
          className="portrait-scroll-spike__star-perlin"
          data-portrait-star-perlin
          aria-hidden="true"
        />
      </div>
      <div ref={washRef} className="portrait-scroll-spike__star-wash" aria-hidden="true" />
      <div ref={copyRef} className="portrait-scroll-spike__star-copy">
        <h2 id="portrait-spike-star-title">{STAR_MAP_TITLE}</h2>
        <p>{BELIEF_COPY[3]}</p>
      </div>
    </section>
  );
});

export default PhoneStarMap;
