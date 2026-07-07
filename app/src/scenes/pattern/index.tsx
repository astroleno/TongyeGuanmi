import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import { STAR_MAP_COPY } from '../star-map';
import { PatternBloomRenderer, patternBloomSnapshot } from './patternBloomRenderer';

export const PATTERN_COPY = [STAR_MAP_COPY] as const;

export type PatternRenderState = {
  progress: number;
  opacity: number;
  centerXRatio: number;
  centerYRatio: number;
  fieldRotationDegrees: number;
  largestRingScale: number;
  compactRingScale: number;
  washOpacity: number;
};

export type PatternRenderOptions = {
  visible?: boolean;
};

type PatternRoot = HTMLElement & {
  __r4PatternRenderer?: PatternBloomRenderer;
};

function isInkTransitionActive(root: HTMLElement | null): boolean {
  return root?.closest<HTMLElement>('[data-stage-layer]')?.dataset.r4InkActive === 'true';
}

export function renderPatternProgress(root: HTMLElement | null, progress: number, options: PatternRenderOptions = {}): PatternRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const snapshot = patternBloomSnapshot(clamped);
  const opacity = (options.visible ?? clamped > 0.001) ? 1 : 0;
  const washOpacity = 0.58 + clamped * 0.28;

  root?.style.setProperty('--r4-pattern-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-pattern-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-pattern-field-rotation', `${snapshot.fieldRotationDegrees.toFixed(2)}deg`);
  root?.style.setProperty('--r4-pattern-largest-ring-scale', snapshot.largestRingScale.toFixed(4));
  root?.style.setProperty('--r4-pattern-compact-ring-scale', snapshot.compactRingScale.toFixed(4));
  root?.style.setProperty('--r4-pattern-wash-opacity', washOpacity.toFixed(4));
  root?.setAttribute('data-pattern-progress', clamped.toFixed(4));
  (root as PatternRoot | null)?.__r4PatternRenderer?.setProgress(clamped);

  return {
    progress: clamped,
    opacity,
    centerXRatio: snapshot.centerXRatio,
    centerYRatio: snapshot.centerYRatio,
    fieldRotationDegrees: snapshot.fieldRotationDegrees,
    largestRingScale: snapshot.largestRingScale,
    compactRingScale: snapshot.compactRingScale,
    washOpacity
  };
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
      if (root.__r4PatternRenderer === renderer) {
        delete root.__r4PatternRenderer;
      }
    };
  }, []);

  useEffect(() => {
    if (isInkTransitionActive(rootRef.current)) {
      return;
    }
    renderPatternProgress(rootRef.current, hidden ? 0 : 1);
  }, [hidden]);

  return (
    <article ref={rootRef} className="r4-pattern-scene" data-r4-scene="pattern">
      <canvas ref={canvasRef} className="r4-pattern-scene__canvas" data-pattern-canvas aria-hidden="true" />
      <div className="r4-pattern-scene__wash" aria-hidden="true" />
      <p ref={(element) => registerHandle?.('copy', element)} className="r4-visually-hidden">
        {PATTERN_COPY[0]}
      </p>
    </article>
  );
}

export const patternScene: SceneModule = {
  id: 'pattern',
  Component: PatternScene,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['belief'],
    text: PATTERN_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
