import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import { initStarFieldReveal } from './starFieldReveal';

const STAR_MAP_IMAGE = new URL('../../../../assets/back2.png', import.meta.url).href;

export const STAR_MAP_COPY =
  'AI 不是技术专家的玩具。它该帮你省下不该花的钱、多接几个客户，再把臃肿的岗位精简下来——能管好这几件事的，才是真利器。它决定了未来三年你是领跑还是追赶。';

export type StarMapRenderState = {
  progress: number;
  copyOpacity: number;
  canvasStrength: number;
};

export function renderStarMapProgress(root: HTMLElement | null, progress: number): StarMapRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const copyOpacity = 0.72 * clamped;
  const canvasStrength = 0.88 * clamped;
  root?.style.setProperty('--r3-star-scene-opacity', '1.0000');
  root?.style.setProperty('--r3-star-copy-opacity', copyOpacity.toFixed(4));
  root?.style.setProperty('--r3-star-canvas-opacity', canvasStrength.toFixed(4));
  root?.setAttribute('data-star-map-progress', clamped.toFixed(4));
  return { progress: clamped, copyOpacity, canvasStrength };
}

function StarMapScene({ hidden, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    renderStarMapProgress(root, hidden ? 0 : 1);
  }, [hidden]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let disposed = false;
    let animationFrame = 0;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveal = initStarFieldReveal({
      canvas,
      sourceUrl: STAR_MAP_IMAGE,
      autoplay: false,
      config: {
        revealDurationMs: 2800,
        loopTransitionMs: 1200
      }
    });

    const renderLiveBackground = (now = performance.now()) => {
      if (disposed || !reveal.ready) {
        return;
      }
      const timeSeconds = now / 1000;
      const pulse = reduceMotion ? 0 : (Math.sin(timeSeconds * 0.34) * 0.08 + Math.sin(timeSeconds * 0.17) * 0.05);
      reveal.renderBackground({
        timeSeconds,
        strength: reduceMotion ? 0.72 : 1.05 + pulse,
        noiseFloor: reduceMotion ? 0.02 : 0.028
      });
      canvas.classList.add('is-ready');
      canvas.dataset.inkTextureReady = 'true';
      if (!reduceMotion) {
        animationFrame = requestAnimationFrame(renderLiveBackground);
      }
    };

    const markReady = () => {
      if (disposed) {
        return;
      }
      if (!reveal.ready) {
        animationFrame = requestAnimationFrame(markReady);
        return;
      }
      renderLiveBackground();
    };

    markReady();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      reveal.dispose();
      canvas.classList.remove('is-ready');
      delete canvas.dataset.inkTextureReady;
    };
  }, []);

  return (
    <article ref={rootRef} className="r3-star-map" data-r3-scene="star-map">
      <canvas
        ref={(element) => {
          canvasRef.current = element;
          registerHandle?.('star-canvas', element);
        }}
        className="belief-star-field r3-star-map__canvas"
        data-belief-star-field
        aria-hidden="true"
      />
      <div className="belief-star-wash r3-star-map__wash" aria-hidden="true" />
      <div className="belief-copy-wrap r3-star-map__copy">
        <p ref={(element) => registerHandle?.('copy', element)} className="large-copy large-copy--standalone">
          {STAR_MAP_COPY}
        </p>
      </div>
    </article>
  );
}

export const starMapScene: SceneModule = {
  id: 'star-map',
  Component: StarMapScene,
  requiredHandles: ['copy', 'star-canvas'],
  staticFallback: {
    sectionIds: ['belief'],
    text: [STAR_MAP_COPY]
  },
  preload: () => ({ milestones: ['targetReady'] })
};
