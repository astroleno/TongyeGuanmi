import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import { initStarFieldReveal } from './starFieldReveal';

const STAR_MAP_IMAGE = new URL('../../../../assets/back2.png', import.meta.url).href;
const STAR_MAP_FRAME_INTERVAL_MS = 1000 / 12;

export const STAR_MAP_COPY =
  'AI 不是技术专家的玩具。它该帮你省下不该花的钱、多接几个客户，再把臃肿的岗位精简下来——能管好这几件事的，才是真利器。它决定了未来三年你是领跑还是追赶。';

export type StarMapRenderState = {
  progress: number;
  copyOpacity: number;
  canvasStrength: number;
};

type StarMapPaintController = {
  setActive(active: boolean): void;
};

type StarMapRoot = HTMLElement & {
  __r4StarMapPaintController?: StarMapPaintController;
};

export function starMapMotionEnabled(
  hidden: boolean,
  reducedMotion: boolean,
  role: SceneComponentProps['role'] = 'current'
): boolean {
  return !hidden && !reducedMotion && role === 'current';
}

export function renderStarMapProgress(root: HTMLElement | null, progress: number): StarMapRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const copyOpacity = clamped;
  const canvasStrength = 0.88 * clamped;
  root?.style.setProperty('--r3-star-scene-opacity', '1.0000');
  root?.style.setProperty('--r3-star-copy-opacity', copyOpacity.toFixed(4));
  root?.style.setProperty('--r3-star-canvas-opacity', canvasStrength.toFixed(4));
  root?.setAttribute('data-star-map-progress', clamped.toFixed(4));
  return { progress: clamped, copyOpacity, canvasStrength };
}

export function renderStarMapHold(root: HTMLElement | null): void {
  renderStarMapProgress(root, 1);
}

function StarMapScene({ hidden, role, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintControllerRef = useRef<{ setActive(active: boolean): void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let disposed = false;
    let readyFrame = 0;
    let liveFrame = 0;
    let revision = 0;
    let motionActive = false;
    let firstFramePainted = false;
    let lastPaintedAt = -Infinity;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveal = initStarFieldReveal({
      canvas,
      sourceUrl: STAR_MAP_IMAGE,
      autoplay: false,
      config: {
        revealDurationMs: 2800,
        loopTransitionMs: 1200
      }
    });

    const paintBackground = (now = performance.now(), force = false) => {
      if (disposed || !reveal.ready || (!force && now - lastPaintedAt < STAR_MAP_FRAME_INTERVAL_MS)) {
        return false;
      }
      const timeSeconds = now / 1000;
      const pulse = reducedMotion ? 0 : Math.sin(timeSeconds * 0.34) * 0.08 + Math.sin(timeSeconds * 0.17) * 0.05;
      reveal.renderBackground({
        timeSeconds,
        strength: reducedMotion ? 0.72 : 1.05 + pulse,
        noiseFloor: reducedMotion ? 0.02 : 0.028
      });
      firstFramePainted = true;
      lastPaintedAt = now;
      canvas.classList.add('is-ready');
      canvas.dataset.inkTextureReady = 'true';
      revision += 1;
      canvas.dataset.inkTextureRevision = String(revision);
      return true;
    };

    const renderLiveBackground = (now: number) => {
      liveFrame = 0;
      if (!motionActive || reducedMotion) {
        return;
      }
      paintBackground(now);
      liveFrame = requestAnimationFrame(renderLiveBackground);
    };

    const scheduleLiveBackground = () => {
      if (!motionActive || reducedMotion || liveFrame || !firstFramePainted) {
        return;
      }
      liveFrame = requestAnimationFrame(renderLiveBackground);
    };

    const markReady = () => {
      readyFrame = 0;
      if (disposed || firstFramePainted) {
        return;
      }
      if (!reveal.ready) {
        readyFrame = requestAnimationFrame(markReady);
        return;
      }
      paintBackground(performance.now(), true);
      scheduleLiveBackground();
    };

    readyFrame = requestAnimationFrame(markReady);
    const controller: StarMapPaintController = {
      setActive(nextActive) {
        motionActive = nextActive && !reducedMotion;
        canvas.dataset.starMapMotionActive = String(motionActive);
        if (!motionActive) {
          cancelAnimationFrame(liveFrame);
          liveFrame = 0;
          return;
        }
        scheduleLiveBackground();
      }
    };
    paintControllerRef.current = controller;
    const root = rootRef.current as StarMapRoot | null;
    if (root) {
      root.__r4StarMapPaintController = controller;
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(readyFrame);
      cancelAnimationFrame(liveFrame);
      reveal.dispose();
      paintControllerRef.current = null;
      if (root?.__r4StarMapPaintController === controller) {
        delete root.__r4StarMapPaintController;
      }
      canvas.classList.remove('is-ready');
      delete canvas.dataset.inkTextureReady;
      delete canvas.dataset.inkTextureRevision;
      delete canvas.dataset.starMapMotionActive;
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    paintControllerRef.current?.setActive(starMapMotionEnabled(hidden, reducedMotion, role));
  }, [hidden, role]);

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
  renderHold: renderStarMapHold,
  requiredHandles: ['copy', 'star-canvas'],
  staticFallback: {
    sectionIds: ['belief'],
    text: [STAR_MAP_COPY]
  },
  preload: () => ({ milestones: ['targetReady'] })
};
