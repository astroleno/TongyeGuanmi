import { useEffect, useLayoutEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import { bindSceneMotion, type SceneMotionBinding } from '../../stage/scene-motion';
import {
  PATTERN_BACKGROUND_IMAGE,
  PatternBloomRenderer,
  patternCenterForViewport,
  patternBloomSnapshot,
  preloadPatternAssets
} from './patternBloomRenderer';

export { patternCenterForViewport } from './patternBloomRenderer';

export const PATTERN_COPY = [
  '一句话讲清我们干什么',
  '让 AI 从一场培训，变成账上的数字。',
  '我们不卖课、不卖软件，而是进到你的业务现场，把 AI 做成团队天天在用、月底对得上账的东西。'
] as const;

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
  const renderer = (root as PatternRoot | null)?.__r4PatternRenderer;
  renderer?.setFrameProgress(clamped, rotationProgress);

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
    copyProgress: 0,
    rotationProgress: 0
  });
}

function PatternScene({ hidden, role, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionBindingRef = useRef<SceneMotionBinding | null>(null);

  useEffect(() => {
    const root = rootRef.current as PatternRoot | null;
    const canvas = canvasRef.current;
    if (!root || !canvas) {
      return;
    }
    const renderer = new PatternBloomRenderer(canvas);
    root.__r4PatternRenderer = renderer;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motionBinding = bindSceneMotion(root, (active) => {
      renderer.setRenderActive(active, active && !reducedMotion);
    });
    motionBindingRef.current = motionBinding;
    motionBinding.setBaseActive(!hidden && !reducedMotion && role === 'current');
    let disposed = false;
    void renderer.start().then(() => renderer.prepareStaticFrame()).then(() => {
      if (!disposed) {
        registerHandle?.('pattern-texture', canvas);
      }
    });
    return () => {
      disposed = true;
      motionBinding.dispose();
      if (motionBindingRef.current === motionBinding) {
        motionBindingRef.current = null;
      }
      registerHandle?.('pattern-texture', null);
      renderer.destroy();
      delete canvas.dataset.inkTextureReady;
      if (root.__r4PatternRenderer === renderer) {
        delete root.__r4PatternRenderer;
      }
    };
  }, [registerHandle]);

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    motionBindingRef.current?.setBaseActive(!hidden && !reduceMotion && role === 'current');
  }, [hidden, role]);

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
          <span className="card-label">{PATTERN_COPY[0]}</span>
          <h3>{PATTERN_COPY[1]}</h3>
          <p>{PATTERN_COPY[2]}</p>
        </section>
      </div>
    </article>
  );
}

export const patternScene: SceneModule = {
  id: 'pattern',
  Component: PatternScene,
  renderHold: renderPatternHold,
  requiredHandles: ['copy', 'pattern-texture'],
  staticFallback: {
    sectionIds: ['belief'],
    text: PATTERN_COPY
  },
  preload: async () => {
    await preloadPatternAssets();
    return { milestones: ['targetReady'] };
  }
};
