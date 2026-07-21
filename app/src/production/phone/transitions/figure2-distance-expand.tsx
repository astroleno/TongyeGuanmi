import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import {
  renderFigure2AnimationProgress
} from '../../../scenes/figure2-animation';
import { storyManifest } from '../../../story/manifest';
import type {
  LayerHandle,
  LayerVisibilityState,
  SceneId,
  SegmentRunId,
  SpineSegmentNode,
  StageHandle
} from '../../../story/types';
import {
  createFigure2DistanceExpandTransition,
  FIGURE2_INTRO_END,
  figure2IntroProgress
} from '../../../transitions/figure2-distance-expand';
import type {
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../types';

const PHONE_FIGURE2_RUN = 'phone-grade-a:1' as SegmentRunId;
const PHONE_FIGURE2_PREPARE = 'phone-grade-a:prepare:1' as const;
const PHONE_FIGURE2_SEGMENT = storyManifest.nodes.find(
  (node): node is SpineSegmentNode => (
    node.kind === 'segment' && node.id === 'figure2-distance-expand'
  )
);

if (!PHONE_FIGURE2_SEGMENT) {
  throw new Error('figure2-distance-expand segment missing');
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function applyVisibility(element: HTMLElement, state: LayerVisibilityState): void {
  element.style.visibility = state.visible ? 'visible' : 'hidden';
  element.style.opacity = String(state.opacity);
  element.style.pointerEvents = state.pointerEvents;
  element.inert = state.inert;
}

function phoneLayer(scene: SceneId, element: HTMLElement): LayerHandle {
  const layer: LayerHandle = {
    scene,
    role: 'current',
    element,
    visibility: {
      mounted: true,
      visible: scene === 'figure2-animation',
      inert: true,
      opacity: scene === 'figure2-animation' ? 1 : 0,
      pointerEvents: 'none'
    },
    setVisibility(state) {
      layer.visibility = state;
      applyVisibility(element, state);
    },
    dispose() {}
  };
  applyVisibility(element, layer.visibility);
  return layer;
}

function phoneStage(layers: readonly LayerHandle[]): StageHandle {
  const byScene = new Map(layers.map((layer) => [layer.scene, layer]));
  return {
    getLayer: (scene) => byScene.get(scene),
    ensureLayer(scene) {
      const layer = byScene.get(scene);
      if (!layer) throw new Error(`Phone Grade A layer missing: ${scene}`);
      return layer;
    },
    releaseLayer() {},
    snapshot: () => [...byScene.values()]
  };
}

function fallbackFrame(
  from: HTMLElement,
  to: HTMLElement,
  progress: number,
  reducedMotion: boolean
): void {
  const sampled = reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
  const intro = figure2IntroProgress(sampled);
  const reveal = clamp((sampled - FIGURE2_INTRO_END) / (1 - FIGURE2_INTRO_END));
  renderFigure2AnimationProgress(from, intro, { videoMode: 'none' });
  from.style.visibility = reveal >= 0.999 ? 'hidden' : 'visible';
  to.style.visibility = reveal <= 0.001 ? 'hidden' : 'visible';
  to.style.opacity = reveal.toFixed(4);
}

/**
 * Native-scroll driver for the existing authored Figure2 timeline. The shared
 * timeline still owns camera, depth mask, and Ink; document progress replaces
 * Director time and uses deterministic seek frames in both directions.
 */
export const PhoneFigure2DistanceExpandTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
>(function PhoneFigure2DistanceExpandTransition(
  { host, from, to, reducedMotion, onReady },
  forwardedRef
) {
  const timelineRef = useRef<Awaited<ReturnType<ReturnType<
    typeof createFigure2DistanceExpandTransition
  >['buildTimeline']>> | null>(null);
  const desiredProgressRef = useRef(0);
  const lastProgressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const runRevisionRef = useRef(0);

  const render = (rawProgress: number) => {
    if (!from || !to) return;
    const progress = clamp(rawProgress);
    if (progress > lastProgressRef.current + 0.0001) {
      if (directionRef.current !== 1) runRevisionRef.current += 1;
      directionRef.current = 1;
    } else if (progress < lastProgressRef.current - 0.0001) {
      if (directionRef.current !== -1) runRevisionRef.current += 1;
      directionRef.current = -1;
    }
    lastProgressRef.current = progress;
    desiredProgressRef.current = progress;
    const sampled = reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
    const timeline = timelineRef.current;
    if (!timeline) {
      fallbackFrame(from, to, sampled, reducedMotion);
      return;
    }
    timeline.progress(sampled);
    if (!reducedMotion) {
      renderFigure2AnimationProgress(from, figure2IntroProgress(sampled), {
        videoMode: 'seek',
        mediaRun: {
          runId: `phone-figure2-${directionRef.current}:${runRevisionRef.current}`,
          direction: directionRef.current
        }
      });
    }
  };

  useLayoutEffect(() => {
    if (!host || !from || !to) return;
    const fromLayer = phoneLayer('figure2-animation', from);
    const toLayer = phoneLayer('figure2-proof', to);
    const transition = createFigure2DistanceExpandTransition();
    let disposed = false;
    void Promise.resolve(transition.buildTimeline({
      segment: PHONE_FIGURE2_SEGMENT,
      stage: phoneStage([fromLayer, toLayer]),
      from: fromLayer,
      to: toLayer,
      direction: 1,
      runId: PHONE_FIGURE2_RUN,
      prepareToken: PHONE_FIGURE2_PREPARE,
      prefersReducedMotion: reducedMotion,
      reportMilestone() {}
    })).then((timeline) => {
      if (disposed) {
        timeline.dispose();
        return;
      }
      timelineRef.current = timeline;
      if (!disposed) {
        render(desiredProgressRef.current);
        onReady?.();
      }
    }).catch(() => {
      if (!disposed) {
        fallbackFrame(from, to, desiredProgressRef.current, reducedMotion);
        onReady?.();
      }
    });
    return () => {
      disposed = true;
      timelineRef.current?.dispose();
      timelineRef.current = null;
    };
  }, [from, host, onReady, reducedMotion, to]);

  useImperativeHandle(forwardedRef, () => ({
    render,
    enter() { render(0); },
    leave() { render(1); },
    reverse() { render(0); },
    dispose() {
      timelineRef.current?.dispose();
      timelineRef.current = null;
    }
  }), [from, reducedMotion, to]);

  return null;
});

export default PhoneFigure2DistanceExpandTransition;
