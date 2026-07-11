import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import { STAR_MAP_COPY } from '../star-map';
import {
  PATTERN_BACKGROUND_IMAGE,
  PatternBloomRenderer,
  patternCenterForViewport,
  patternBloomSnapshot
} from './patternBloomRenderer';

export { patternCenterForViewport } from './patternBloomRenderer';

export const PATTERN_COPY = [STAR_MAP_COPY] as const;

export type PatternRenderState = {
  progress: number;
  opacity: number;
  copyOpacity: number;
  centerXRatio: number;
  centerYRatio: number;
  mobileCenterXRatio: number;
  mobileCenterYRatio: number;
  rotationProgress: number;
  fieldRotationDegrees: number;
  largestRingScale: number;
  compactRingScale: number;
  washOpacity: number;
};

export type PatternRenderOptions = {
  visible?: boolean;
  opacity?: number;
  copyProgress?: number;
  rotationProgress?: number;
};

type PatternRoot = HTMLElement & {
  __r4PatternRenderer?: PatternBloomRenderer;
};

function patternViewportWidth(root: HTMLElement | null): number {
  const rectWidth = root?.getBoundingClientRect?.().width ?? 0;
  if (rectWidth > 0) {
    return rectWidth;
  }
  if ((root?.clientWidth ?? 0) > 0) {
    return root?.clientWidth ?? 1440;
  }
  return typeof window === 'undefined' ? 1440 : window.innerWidth || 1440;
}

export function readPatternCenter(root: HTMLElement | null): Readonly<{ x: number; y: number }> {
  const serialized = root?.dataset?.patternCenter
    ?? root?.getAttribute?.('data-pattern-center')
    ?? '';
  const [x, y] = serialized.split(',').map(Number);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { x: x ?? 0.24, y: y ?? 0.55 };
  }
  return patternCenterForViewport(patternViewportWidth(root));
}

export function renderPatternProgress(root: HTMLElement | null, progress: number, options: PatternRenderOptions = {}): PatternRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const rotationProgress = Math.min(1, Math.max(0, options.rotationProgress ?? clamped));
  const copyProgress = Math.min(1, Math.max(0, options.copyProgress ?? clamped));
  const copyReveal = copyProgress * copyProgress * (3 - 2 * copyProgress);
  const snapshot = patternBloomSnapshot(clamped, rotationProgress);
  const center = patternCenterForViewport(patternViewportWidth(root));
  const opacity = (options.visible ?? clamped > 0.001) ? Math.min(1, Math.max(0, options.opacity ?? 1)) : 0;
  const copyOpacity = Math.min(0.96, Math.max(0, (options.opacity ?? 1) * copyReveal * 0.96));
  const washOpacity = 0.58 + clamped * 0.28;

  root?.style.setProperty('--r4-pattern-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-pattern-scene-opacity', '1.0000');
  root?.style.setProperty('--r4-pattern-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-pattern-copy-opacity', copyOpacity.toFixed(4));
  root?.style.setProperty('--r4-pattern-field-rotation', `${snapshot.fieldRotationDegrees.toFixed(2)}deg`);
  root?.style.setProperty('--r4-pattern-largest-ring-scale', snapshot.largestRingScale.toFixed(4));
  root?.style.setProperty('--r4-pattern-compact-ring-scale', snapshot.compactRingScale.toFixed(4));
  root?.style.setProperty('--r4-pattern-wash-opacity', washOpacity.toFixed(4));
  root?.style.setProperty('--r4-pattern-wash-visible-opacity', (washOpacity * opacity).toFixed(4));
  root?.style.setProperty('--r4-pattern-center-x', `${(center.x * 100).toFixed(3)}%`);
  root?.style.setProperty('--r4-pattern-center-y', `${(center.y * 100).toFixed(3)}%`);
  root?.setAttribute('data-pattern-progress', clamped.toFixed(4));
  root?.setAttribute('data-pattern-center', `${center.x.toFixed(4)},${center.y.toFixed(4)}`);
  (root as PatternRoot | null)?.__r4PatternRenderer?.setFrameProgress(clamped, rotationProgress);

  return {
    progress: clamped,
    opacity,
    copyOpacity,
    centerXRatio: center.x,
    centerYRatio: center.y,
    mobileCenterXRatio: snapshot.mobileCenterXRatio,
    mobileCenterYRatio: snapshot.mobileCenterYRatio,
    rotationProgress,
    fieldRotationDegrees: snapshot.fieldRotationDegrees,
    largestRingScale: snapshot.largestRingScale,
    compactRingScale: snapshot.compactRingScale,
    washOpacity
  };
}

export function renderPatternHold(root: HTMLElement | null): PatternRenderState {
  return renderPatternProgress(root, 0, {
    visible: true,
    copyProgress: 1,
    rotationProgress: 0
  });
}

function PatternScene({ hidden, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const root = rootRef.current as PatternRoot | null;
    const canvas = canvasRef.current;
    if (!root || !canvas) {
      return;
    }
    const renderer = new PatternBloomRenderer(canvas);
    root.__r4PatternRenderer = renderer;
    void renderer.start();
    return () => {
      renderer.destroy();
      delete canvas.dataset.inkTextureReady;
      if (root.__r4PatternRenderer === renderer) {
        delete root.__r4PatternRenderer;
      }
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current as PatternRoot | null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root?.__r4PatternRenderer?.setRenderActive(!hidden, !hidden && !reduceMotion);
  }, [hidden]);

  return (
    <article ref={rootRef} className="r4-pattern-scene" data-r4-scene="pattern">
      <div
        className="r4-pattern-scene__ground"
        data-pattern-ground
        style={{ backgroundImage: `url(${PATTERN_BACKGROUND_IMAGE})` }}
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="r4-pattern-scene__canvas" data-pattern-canvas aria-hidden="true" />
      <div className="r4-pattern-scene__wash" aria-hidden="true" />
      <div className="r4-pattern-scene__copy">
        <section ref={(element) => registerHandle?.('copy', element)} className="r4-pattern-scene__statement">
          <p className="large-copy large-copy--standalone">{PATTERN_COPY[0]}</p>
        </section>
      </div>
    </article>
  );
}

export const patternScene: SceneModule = {
  id: 'pattern',
  Component: PatternScene,
  renderHold: renderPatternHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['belief'],
    text: PATTERN_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
